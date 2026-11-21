'use strict';
/** Lectures canoniques 061/062/063/064, transactions PostgreSQL READ ONLY. */
const {LIMIT,signauxReleve,signauxDocument,statut}=require('./energy-meter-quality-domain');
function creerEnergyMeterQualityStore({obtenirClient}){
 if(typeof obtenirClient!=='function')throw TypeError('CLIENT_PG_REQUIS');
 async function read(fn){
  const c=await obtenirClient();let started=false;
  try{await c.query('BEGIN READ ONLY');started=true;const result=await fn(c);await c.query('COMMIT');started=false;return result;}
  catch(e){if(started)await c.query('ROLLBACK').catch(()=>{});throw e;}
  finally{c.release();}
 }
 async function site(c,{tenant,actor,siteId}){
  const r=await c.query(`SELECT s.id,s.public_id,s.nom,s.tenant_id,s.owner_personne_id
   FROM energy_inventory_sites s JOIN tenants t ON t.id=s.tenant_id AND t.actif=TRUE
   WHERE t.code=$1 AND s.public_id=$2::uuid AND s.owner_personne_id=$3 LIMIT 1`,[tenant,siteId,actor]);
  return r.rows[0]||null;
 }
 const scope=s=>[s.id,s.tenant_id,s.owner_personne_id];
 async function sites({tenant,actor}){return read(async c=>{
  const r=await c.query(`SELECT s.public_id,s.nom FROM energy_inventory_sites s
   JOIN tenants t ON t.id=s.tenant_id AND t.actif=TRUE
   WHERE t.code=$1 AND s.owner_personne_id=$2 ORDER BY s.id LIMIT 51`,[tenant,actor]);
  return {sites:r.rows.slice(0,LIMIT).map(x=>({id:String(x.public_id),nom:x.nom})),suivant:r.rows.length>LIMIT};
 });}
 async function releves({tenant,actor,siteId,offset=0}){return read(async c=>{
  const s=await site(c,{tenant,actor,siteId});if(!s)return null;
  const r=await c.query(`SELECT r.id,r.register_id,r.valeur_index::text AS valeur,
      to_char(r.releve_le AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS releve_le,
      reg.code AS registre_code,reg.unite,d.nom AS compteur_nom,p.nom AS point_nom,
      precedent.valeur_index::text AS precedente
   FROM energy_meter_readings r
   JOIN energy_meter_registers reg ON reg.id=r.register_id AND reg.site_id=r.site_id
     AND reg.tenant_id=r.tenant_id AND reg.owner_personne_id=r.owner_personne_id
   JOIN energy_meter_devices d ON d.id=reg.meter_id AND d.site_id=reg.site_id
     AND d.tenant_id=reg.tenant_id AND d.owner_personne_id=reg.owner_personne_id
   JOIN energy_meter_points p ON p.id=reg.point_id AND p.site_id=reg.site_id
     AND p.tenant_id=reg.tenant_id AND p.owner_personne_id=reg.owner_personne_id
   LEFT JOIN LATERAL (SELECT ant.valeur_index FROM energy_meter_readings ant
      WHERE ant.register_id=r.register_id AND ant.site_id=r.site_id
        AND ant.tenant_id=r.tenant_id AND ant.owner_personne_id=r.owner_personne_id
        AND ant.releve_le<r.releve_le ORDER BY ant.releve_le DESC,ant.id DESC LIMIT 1) precedent ON TRUE
   WHERE r.site_id=$1 AND r.tenant_id=$2 AND r.owner_personne_id=$3
   ORDER BY r.releve_le DESC,r.id DESC LIMIT 51 OFFSET $4`,[...scope(s),offset]);
  return {site:{id:String(s.public_id),nom:s.nom},source:'RELEVES',offset,limite:LIMIT,suivant:r.rows.length>LIMIT,
   items:r.rows.slice(0,LIMIT).map(x=>{
    const signaux=signauxReleve({valeur:x.valeur,precedente:x.precedente});
    return {id:String(x.id),registerId:String(x.register_id),date:x.releve_le,
     point:x.point_nom,compteur:x.compteur_nom,registre:x.registre_code,unite:x.unite,
     valeur:x.valeur,precedente:x.precedente??null,signaux,statut:statut(signaux)};
   }),qualification:'INDICES_DECLARES_NON_CERTIFIES',aucunCalculConsommation:true};
 });}
 // Uniquement les racines des documents 1C1 et leurs versions courantes, jamais les versions historiques comme doublons.
 // Sans filtre de reference, une declaration sans compteurs reste valide.
 const currentSql=`WITH roots AS (
    SELECT d.id,d.site_id,d.tenant_id,d.owner_personne_id FROM energy_billing_declarations d
    WHERE d.site_id=$1 AND d.tenant_id=$2 AND d.owner_personne_id=$3
      AND NOT EXISTS (SELECT 1 FROM energy_billing_rectifications child
        WHERE child.corrected_declaration_id=d.id AND child.site_id=d.site_id
          AND child.tenant_id=d.tenant_id AND child.owner_personne_id=d.owner_personne_id)
   ), current_docs AS (
    SELECT root.id AS original_id,cur.id AS actuel_id,cur.nature,cur.energie,to_char(cur.date_document,'YYYY-MM-DD') AS date_document,
      cur.reference_document,cur.montant::text AS montant,cur.devise
    FROM roots root
    LEFT JOIN LATERAL (SELECT corrected_declaration_id FROM energy_billing_rectifications x
      WHERE x.original_declaration_id=root.id AND x.site_id=$1 AND x.tenant_id=$2
        AND x.owner_personne_id=$3 ORDER BY revision DESC LIMIT 1) rev ON TRUE
    JOIN energy_billing_declarations cur ON cur.id=COALESCE(rev.corrected_declaration_id,root.id)
      AND cur.site_id=$1 AND cur.tenant_id=$2 AND cur.owner_personne_id=$3
   ), page AS (SELECT * FROM current_docs ORDER BY date_document DESC,original_id LIMIT 51 OFFSET $4)
   SELECT page.*,
      EXISTS (SELECT 1 FROM current_docs same WHERE same.original_id<>page.original_id
        AND same.nature=page.nature AND same.energie=page.energie
        AND same.reference_document=page.reference_document) AS reference_doublon,
      EXISTS (SELECT 1 FROM energy_billing_attachments a WHERE a.declaration_id=page.actuel_id
        AND a.site_id=$1 AND a.tenant_id=$2 AND a.owner_personne_id=$3) AS preuve_version_courante
   FROM page ORDER BY date_document DESC,original_id`;
 async function documents({tenant,actor,siteId,offset=0}){return read(async c=>{
  const s=await site(c,{tenant,actor,siteId});if(!s)return null;
  const r=await c.query(currentSql,[...scope(s),offset]);
  return {site:{id:String(s.public_id),nom:s.nom},source:'DOCUMENTS',offset,limite:LIMIT,suivant:r.rows.length>LIMIT,
   items:r.rows.slice(0,LIMIT).map(x=>{
    const signaux=signauxDocument({referenceDoublon:Boolean(x.reference_document&&x.reference_doublon),
     preuveVersionCourante:Boolean(x.preuve_version_courante)});
    return {id:String(x.original_id),actuelId:String(x.actuel_id),date:x.date_document instanceof Date?
      x.date_document.toISOString().slice(0,10):String(x.date_document).slice(0,10),nature:x.nature,energie:x.energie,
     montant:x.montant,devise:x.devise?.trim(),reference:x.reference_document||null,
     pieceVersionCourante:Boolean(x.preuve_version_courante),signaux,statut:statut(signaux)};
   }),qualification:'DECLARATIONS_NON_CERTIFIEES',aucunCalculConsommation:true,
   avertissement:'PIECE_ABSENTE_INFORMATION_SEULEMENT'};
 });}
 return {sites,releves,documents};
}
module.exports={creerEnergyMeterQualityStore};
