'use strict';
// SATEER P6: rules are organisation-scoped, citizen form category only, no email/AI classification.
const { executerRequete, obtenirClientDatabase } = require('./database');
const { obtenirPermissionsEffectivesDatabase } = require('./services-database');

const CATEGORY = /^[A-Z][A-Z0-9_]{2,79}$/;
const CHANNEL = 'MON_CONSULAT';
const FALLBACK = '__DEFAULT__';
const p6TestDatabase = () => process.env.PGDATABASE === 'sateer_test';
function key(value) {
  if (typeof value !== 'string') return null;
  const s = value.trim().toUpperCase();
  return s === FALLBACK || CATEGORY.test(s) ? s : null;
}
function validId(value) { const n = Number(value); return Number.isSafeInteger(n) && n > 0 ? n : null; }
function validTenant(value) { return typeof value === 'string' && /^[A-Za-z0-9_-]{1,50}$/.test(value) ? value : null; }
function sameOrigin(req) {
  const actual = req.get('origin');
  if (!actual) return false;
  try {
    const o = new URL(actual);
    if (!['http:', 'https:'].includes(o.protocol) || o.username || o.password || o.pathname !== '/') return false;
    const expected = process.env.SATEER_PUBLIC_ORIGIN;
    if (expected) return o.origin === new URL(expected).origin;
    return o.host === req.get('host'); // only for local test; production requires configured public origin
  } catch { return false; }
}
async function permitted(req, orgId, tenant, write) {
  const rights = await obtenirPermissionsEffectivesDatabase(req.auth.personneId, orgId, tenant);
  if (!rights || !rights.succes) return false;
  const rightsOrg = rights.permissionsOrganisation || [];
  return write ? rightsOrg.includes('CREATE_UNIT') :
    (rightsOrg.includes('VIEW_ORGANISATION') || rightsOrg.includes('CREATE_UNIT') || rightsOrg.includes('VIEW_OPERATIONAL_DASHBOARD'));
}
async function activeUnit(client, orgId, tenant, unitId) {
  const x = await client.query(`SELECT u.id, u.nom FROM organisation_units u
    JOIN organisations o ON o.id=u.organisation_id
    JOIN tenants t ON t.id=o.tenant_id
    WHERE u.id=$1 AND u.organisation_id=$2 AND t.code=$3 AND u.actif=TRUE
    AND EXISTS(SELECT 1 FROM organisation_unit_capabilities uc JOIN capabilities c ON c.id=uc.capability_id
      WHERE uc.organisation_unit_id=u.id AND uc.actif=TRUE AND c.actif=TRUE AND c.code='RECEIVE_INCOMING')
    AND EXISTS(SELECT 1 FROM organisation_unit_capabilities uc JOIN capabilities c ON c.id=uc.capability_id
      WHERE uc.organisation_unit_id=u.id AND uc.actif=TRUE AND c.actif=TRUE AND c.code='VIEW_INBOX')`,
    [unitId, orgId, tenant]);
  return x.rows[0] || null;
}
function installRoutingRoutes(app, exigerSession) {
  const base = '/api/organisations/:organisationId/routing-rules';
  app.get(base, exigerSession, async (req,res) => {
    if (!p6TestDatabase()) return res.status(503).json({statut:'P6_RESERVE_BASE_TEST'});
    try {
      const org = validId(req.params.organisationId), tenant = validTenant(req.query.tenant);
      if (!org || !tenant) return res.status(400).json({statut:'CONTEXTE_INVALIDE'});
      if (!await permitted(req,org,tenant,false)) return res.status(403).json({statut:'ACCES_REFUSE'});
      const data = await executerRequete(`SELECT r.category_key AS "categorie",r.destination_unit_id AS "destinationUnitId",
        u.nom AS "bureau",r.actif, (u.actif AND EXISTS(SELECT 1 FROM organisation_unit_capabilities uc JOIN capabilities c ON c.id=uc.capability_id WHERE uc.organisation_unit_id=u.id AND uc.actif=TRUE AND c.actif=TRUE AND c.code='RECEIVE_INCOMING') AND EXISTS(SELECT 1 FROM organisation_unit_capabilities uc JOIN capabilities c ON c.id=uc.capability_id WHERE uc.organisation_unit_id=u.id AND uc.actif=TRUE AND c.actif=TRUE AND c.code='VIEW_INBOX')) AS "destinationValide"
        FROM organisation_routing_rules r JOIN organisation_units u ON u.id=r.destination_unit_id
        JOIN organisations o ON o.id=r.organisation_id AND o.id=u.organisation_id
        JOIN tenants t ON t.id=o.tenant_id AND t.id=r.tenant_id
        WHERE r.organisation_id=$1 AND t.code=$2 AND r.source=$3 ORDER BY r.category_key`,[org,tenant,CHANNEL]);
      return res.set('Cache-Control','no-store').json({statut:'REGLES_CHARGEES',regles:data.rows});
    } catch(e){ console.error('P6 listing',e);return res.status(500).json({statut:'ERREUR_REGLES'}); }
  });
  app.put(base, exigerSession, async (req,res) => {
    if (!p6TestDatabase()) return res.status(503).json({statut:'P6_RESERVE_BASE_TEST'});
    if (!sameOrigin(req)) return res.status(403).json({statut:'ORIGINE_NON_AUTORISEE'});
    const org=validId(req.params.organisationId), tenant=validTenant(req.body?.tenantCode);
    const cat=key(req.body?.categorie), dest=validId(req.body?.destinationUnitId);
    if(!org||!tenant||!cat||!dest) return res.status(400).json({statut:'REGLE_INVALIDE'});
    let client;
    try {
      if(!await permitted(req,org,tenant,true)) return res.status(403).json({statut:'PERMISSION_CONFIGURATION_REQUISE'});
      client=await obtenirClientDatabase();await client.query('BEGIN');
      const unit=await activeUnit(client,org,tenant,dest);
      if(!unit){await client.query('ROLLBACK');return res.status(409).json({statut:'BUREAU_NON_HABILITE_A_RECEVOIR',aide:'Activer Réception et Boîte de réception dans Qui fait quoi ?'});}
      const result=await client.query(`INSERT INTO organisation_routing_rules(tenant_id,organisation_id,source,category_key,destination_unit_id,created_by,updated_by)
        SELECT t.id, o.id, $3,$4,$5,$6,$6 FROM organisations o JOIN tenants t ON t.id=o.tenant_id
        WHERE o.id=$1 AND t.code=$2
        ON CONFLICT(organisation_id,source,category_key) DO UPDATE SET destination_unit_id=EXCLUDED.destination_unit_id,actif=TRUE,updated_by=EXCLUDED.updated_by,updated_at=now()
        RETURNING id,category_key,destination_unit_id`,[org,tenant,CHANNEL,cat,dest,req.auth.personneId]);
      if(!result.rowCount){await client.query('ROLLBACK');return res.status(404).json({statut:'ORGANISATION_INTROUVABLE'});}
      await client.query(`INSERT INTO organisation_routing_rule_audit(organisation_id,tenant_id,rule_id,action,category_key,destination_unit_id,acteur_personne_id)
        SELECT r.organisation_id,r.tenant_id,r.id,'UPSERT',r.category_key,r.destination_unit_id,$2 FROM organisation_routing_rules r WHERE r.id=$1`,[result.rows[0].id,req.auth.personneId]);
      await client.query('COMMIT');return res.status(200).json({statut:'REGLE_ENREGISTREE',regle:{categorie:cat,destinationUnitId:dest,bureau:unit.nom}});
    }catch(e){if(client)await client.query('ROLLBACK').catch(()=>{});console.error('P6 save',e);return res.status(500).json({statut:'ERREUR_ENREGISTREMENT_REGLE'});} finally{if(client)client.release();}
  });
  app.delete(base+'/:categorie', exigerSession, async(req,res)=>{
    if (!p6TestDatabase()) return res.status(503).json({statut:'P6_RESERVE_BASE_TEST'});
    if(!sameOrigin(req))return res.status(403).json({statut:'ORIGINE_NON_AUTORISEE'});
    const org=validId(req.params.organisationId),tenant=validTenant(req.query.tenant),cat=key(req.params.categorie);
    if(!org||!tenant||!cat)return res.status(400).json({statut:'REGLE_INVALIDE'});
    let client;
    try{
      if(!await permitted(req,org,tenant,true))return res.status(403).json({statut:'PERMISSION_CONFIGURATION_REQUISE'});
      client=await obtenirClientDatabase();await client.query('BEGIN');
      const out=await client.query(`UPDATE organisation_routing_rules r SET actif=FALSE,updated_at=now(),updated_by=$4
        FROM organisations o,tenants t WHERE r.organisation_id=$1 AND r.category_key=$3 AND r.source='MON_CONSULAT' AND r.actif=TRUE
        AND o.id=r.organisation_id AND o.tenant_id=t.id AND t.id=r.tenant_id AND t.code=$2 RETURNING r.id,r.organisation_id,r.tenant_id,r.category_key,r.destination_unit_id`,[org,tenant,cat,req.auth.personneId]);
      if(!out.rowCount){await client.query('ROLLBACK');return res.status(404).json({statut:'REGLE_INTROUVABLE'});}
      const r=out.rows[0];await client.query(`INSERT INTO organisation_routing_rule_audit(organisation_id,tenant_id,rule_id,action,category_key,destination_unit_id,acteur_personne_id)
        VALUES($1,$2,$3,'DISABLE',$4,$5,$6)`,[r.organisation_id,r.tenant_id,r.id,r.category_key,r.destination_unit_id,req.auth.personneId]);
      await client.query('COMMIT');return res.json({statut:'REGLE_DESACTIVEE'});
    }catch(e){if(client)await client.query('ROLLBACK').catch(()=>{});console.error('P6 disable',e);return res.status(500).json({statut:'ERREUR_DESACTIVATION_REGLE'});}finally{if(client)client.release();}
  });
}
// Called just after creation of the citizen request, only for MON_CONSULAT.
// The new request is NOT lost if a rule is unavailable. Unassigned requests remain in authorized intake.
async function routeNewCitizenCase({ demandeId, organisationId, tenantCode, categorie, canal }) {
  if (!p6TestDatabase()) return {statut:'P6_RESERVE_BASE_TEST'};
  // A8 : une question de citoyen à l'Ambassade exige une qualification de l'intention.
  // Aucune règle P6 de MON_CONSULAT ne peut orienter automatiquement cette demande.
  if (canal === 'MON_AMBASSADE') return {statut:'QUALIFICATION_MANUELLE_REQUISE',
    motif:'INTENTION_AVANT_THEME',execution:false};
  if (canal !== 'MON_CONSULAT')return {statut:'CANAL_NON_COUVERT'};
  const cat=key(categorie),id=validId(demandeId),org=validId(organisationId),tenant=validTenant(tenantCode);
  if(!cat||!id||!org||!tenant)return {statut:'AUCUNE_REGLE'};
  const client=await obtenirClientDatabase();
  try{
    await client.query('BEGIN');
    const d=await client.query(`SELECT d.id,d.tenant_id,d.statut,d.destination_unit_id
      FROM demandes d JOIN organisations o ON o.id=d.organisation_id AND o.tenant_id=d.tenant_id
      JOIN tenants t ON t.id=o.tenant_id WHERE d.id=$1 AND d.organisation_id=$2 AND t.code=$3 FOR UPDATE`,[id,org,tenant]);
    if(!d.rowCount||d.rows[0].destination_unit_id!==null){await client.query('ROLLBACK');return {statut:'DOSSIER_NON_ORIENTABLE'};}
    const possible=await client.query(`SELECT r.id AS rule_id,r.category_key,r.destination_unit_id,u.nom AS bureau
      FROM organisation_routing_rules r JOIN organisation_units u ON u.id=r.destination_unit_id AND u.organisation_id=r.organisation_id
      JOIN organisations o ON o.id=r.organisation_id AND o.tenant_id=r.tenant_id JOIN tenants t ON t.id=r.tenant_id
      WHERE r.organisation_id=$1 AND t.code=$2 AND r.source='MON_CONSULAT' AND r.actif=TRUE
        AND r.category_key IN ($3,$4)
        AND u.actif=TRUE
        AND EXISTS(SELECT 1 FROM organisation_unit_capabilities uc JOIN capabilities c ON c.id=uc.capability_id WHERE uc.organisation_unit_id=u.id AND uc.actif=TRUE AND c.actif=TRUE AND c.code='RECEIVE_INCOMING')
        AND EXISTS(SELECT 1 FROM organisation_unit_capabilities uc JOIN capabilities c ON c.id=uc.capability_id WHERE uc.organisation_unit_id=u.id AND uc.actif=TRUE AND c.actif=TRUE AND c.code='VIEW_INBOX')
      ORDER BY CASE WHEN r.category_key=$3 THEN 0 ELSE 1 END LIMIT 1`,[org,tenant,cat,FALLBACK]);
    if(!possible.rowCount){await client.query('ROLLBACK');return {statut:'AUCUNE_DESTINATION_HABILITEE'};}
    const r=possible.rows[0];
    const updated=await client.query(`UPDATE demandes SET destination_unit_id=$1,orientee_par=NULL,
      motif_orientation=$2,date_orientation=now(),date_modification=now()
      WHERE id=$3 AND organisation_id=$4 AND destination_unit_id IS NULL RETURNING id`,[r.destination_unit_id,'Orientation automatique par catégorie ('+r.category_key+')',id,org]);
    if(!updated.rowCount){await client.query('ROLLBACK');return {statut:'DOSSIER_DEJA_AFFECTE'};}
    await client.query(`INSERT INTO demande_orientations(demande_id,ancienne_unit_id,nouvelle_unit_id,orientee_par,motif,metadata)
      VALUES($1,NULL,$2,NULL,'Orientation automatique par règle',jsonb_build_object('automatique',true,'ruleId',$3::bigint,'categorie',$4::text))`,[id,r.destination_unit_id,r.rule_id,cat]);
    await client.query(`INSERT INTO demande_history(tenant_id,demande_id,auteur_personne_id,ancien_statut,nouveau_statut,action,commentaire,metadata)
      VALUES($1,$2,NULL,$3,$3,'ORIENTATION_AUTOMATIQUE','Demande dirigée vers un bureau configuré.',jsonb_build_object('ruleId',$4::bigint,'destinationUnitId',$5::integer))`,[d.rows[0].tenant_id,id,d.rows[0].statut,r.rule_id,r.destination_unit_id]);
    await client.query('COMMIT');return {statut:'ORIENTEE',destinationUnitId:r.destination_unit_id,bureau:r.bureau};
  }catch(e){await client.query('ROLLBACK').catch(()=>{});console.error('P6 auto routing failure',e);return {statut:'ORIENTATION_EN_ATTENTE'};}finally{client.release();}
}
module.exports={installRoutingRoutes,routeNewCitizenCase,key,validId,validTenant};
