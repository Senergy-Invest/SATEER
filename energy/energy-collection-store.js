'use strict';
/** SUNU Courant C2 : propositions isolées, workflow strict par parent_grant_id C1.
 * Réutilise energy_inventory_equipements 051 uniquement après revue du coordinateur.
 * Aucun accès aux photos/QR et aucune donnée d'économie calculée.
 */
const crypto=require('node:crypto');
const {cheminValide}=require('./energy-collection-domain');
const uuid=()=>crypto.randomUUID();
const digest=o=>crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex');
// Cast explicite : VARCHAR(16) sur chacune des utilisations de $1.
// Evite PostgreSQL 42P08 lors des decisions REFUSER et A_CORRIGER.
// Le test PostgreSQL rollback execute cette requete exacte.
const DECISION_NON_APPROUVEE_SQL=`UPDATE energy_scope_proposals
    SET statut=$1::varchar(16),reviewer_grant_id=NULL,date_modification=NOW(),
    date_cloture=CASE WHEN $1::varchar(16)='REFUSEE' THEN NOW() ELSE NULL END
    WHERE id=$2::uuid RETURNING statut,date_cloture`;

function creerEnergyCollectionStore({obtenirClient}){
 if(typeof obtenirClient!=='function')throw TypeError('POSTGRES_REQUIS');
 async function using(fn){const c=await obtenirClient();try{return await fn(c);}finally{c.release();}}
 async function tx(fn){return using(async c=>{let open=false;try{await c.query('BEGIN');open=true;const r=await fn(c);await c.query('COMMIT');open=false;return r;}catch(e){if(open)await c.query('ROLLBACK').catch(()=>{});throw e;}});}
 async function site(c,tenant,siteId){const r=await c.query(`SELECT s.id,s.public_id,s.nom,s.type_site,s.tenant_id,s.owner_personne_id
 FROM energy_inventory_sites s JOIN tenants t ON t.id=s.tenant_id AND t.actif=TRUE WHERE t.code=$1 AND s.public_id=$2::uuid LIMIT 1`,[tenant,siteId]);return r.rows[0]||null;}
 async function source(c,s,grantId){const r=await c.query(`SELECT g.id,g.personne_id,g.node_id,g.parent_grant_id,g.role_scope,g.statut
 FROM energy_scope_grants g WHERE g.id=$1::uuid AND g.site_id=$2 AND g.tenant_id=$3 AND g.owner_personne_id=$4 LIMIT 1`,[grantId,s.id,s.tenant_id,s.owner_personne_id]);return r.rows[0]||null;}
 async function ancestry(c,s,grantId){const r=await c.query(`WITH RECURSIVE chaine(id,parent_grant_id,personne_id,node_id,role_scope,statut,depth) AS (
 SELECT id,parent_grant_id,personne_id,node_id,role_scope,statut,0 FROM energy_scope_grants
 WHERE id=$1::uuid AND site_id=$2 AND tenant_id=$3 AND owner_personne_id=$4
 UNION ALL SELECT parent.id,parent.parent_grant_id,parent.personne_id,parent.node_id,parent.role_scope,parent.statut,ch.depth+1
 FROM energy_scope_grants parent JOIN chaine ch ON ch.parent_grant_id=parent.id
 WHERE parent.site_id=$2 AND parent.tenant_id=$3 AND parent.owner_personne_id=$4
 ) SELECT * FROM chaine ORDER BY depth`,[grantId,s.id,s.tenant_id,s.owner_personne_id]);return r.rows;}
 async function authorisedNode(c,s,nodeId,ancestorId){const r=await c.query(`WITH RECURSIVE parents(id,parent_id) AS (
 SELECT id,parent_id FROM energy_scope_nodes WHERE id=$1::uuid AND site_id=$2 AND tenant_id=$3 AND owner_personne_id=$4
 UNION ALL SELECT n.id,n.parent_id FROM energy_scope_nodes n JOIN parents p ON n.id=p.parent_id
 WHERE n.site_id=$2 AND n.tenant_id=$3 AND n.owner_personne_id=$4
 ) SELECT EXISTS(SELECT 1 FROM parents WHERE id=$5::uuid) AS ok`,[nodeId,s.id,s.tenant_id,s.owner_personne_id,ancestorId]);return r.rows[0]?.ok===true;}
 async function lockChain(c,chain){const ids=chain.map(g=>g.id);
  const locked=await c.query('SELECT id,statut FROM energy_scope_grants WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE',[ids]);
  return locked.rows.length===ids.length&&locked.rows.every(x=>x.statut==='ACTIF');}
 async function audit(c,p,actor,grantId,action,detail={}){await c.query(`INSERT INTO energy_scope_proposal_events
 (proposal_id,site_id,tenant_id,acteur_personne_id,acteur_grant_id,version,action,details)
 VALUES ($1::uuid,$2,$3,$4,$5::uuid,$6,$7,$8::jsonb)`,[p.id,p.site_id,p.tenant_id,actor,grantId,p.version,action,JSON.stringify(detail)]);}
 function dto(p){return {id:String(p.id),siteId:String(p.site_public_id||''),sourceGrantId:String(p.source_grant_id),scopeNodeId:String(p.scope_node_id),
  nom:p.nom,famille:p.famille,quantite:Number(p.quantite),puissanceUnitaireW:p.puissance_unitaire_w,
  version:Number(p.version),statut:p.statut,reviewerGrantId:p.reviewer_grant_id?String(p.reviewer_grant_id):null,
  equipmentId:p.equipment_id?String(p.equipment_public_id||''):null,dateCreation:p.date_creation,dateModification:p.date_modification};}
 async function submit({tenant,actor,siteId,requestKey,data}){return tx(async c=>{
  const s=await site(c,tenant,siteId);if(!s)return {code:'PERIMETRE_NON_AUTORISE'};
  const g=await source(c,s,data.sourceGrantId);
  if(!g||Number(g.personne_id)!==actor||g.statut!=='ACTIF'||!g.parent_grant_id)return {code:'PERIMETRE_NON_AUTORISE'};
  if(!await authorisedNode(c,s,data.scopeNodeId,g.node_id))return {code:'PERIMETRE_NON_AUTORISE'};
  if(g.role_scope==='OCCUPANT'&&String(g.node_id)!==data.scopeNodeId)return {code:'PERIMETRE_NON_AUTORISE'};
  const chain=await ancestry(c,s,g.id);
  if(!cheminValide(chain,actor)||!await lockChain(c,chain))return {code:'TUTELLE_NON_ACTIVE'};
  const d=digest(data);const existing=await c.query(`SELECT id,content_hash FROM energy_scope_proposals
   WHERE site_id=$1 AND source_grant_id=$2::uuid AND request_key=$3::uuid`,[s.id,g.id,requestKey]);
  if(existing.rows.length)return existing.rows[0].content_hash===d?{code:'OK',id:String(existing.rows[0].id),nouvelle:false}:{code:'CLE_REUTILISEE'};
  const id=uuid();const r=await c.query(`INSERT INTO energy_scope_proposals
 (id,site_id,tenant_id,owner_personne_id,source_grant_id,scope_node_id,auteur_personne_id,reviewer_grant_id,
 request_key,content_hash,nom,famille,quantite,puissance_unitaire_w)
 VALUES($1,$2,$3,$4,$5::uuid,$6::uuid,$7,$8::uuid,$9::uuid,$10,$11,$12,$13,$14)
 ON CONFLICT(site_id,source_grant_id,request_key) DO NOTHING RETURNING id`,
 [id,s.id,s.tenant_id,s.owner_personne_id,g.id,data.scopeNodeId,actor,chain[1].id,requestKey,d,data.nom,data.famille,data.quantite,data.puissanceUnitaireW]);
  if(!r.rows.length){const old=await c.query(`SELECT id,content_hash FROM energy_scope_proposals
   WHERE site_id=$1 AND source_grant_id=$2::uuid AND request_key=$3::uuid`,[s.id,g.id,requestKey]);
   return old.rows.length===1&&old.rows[0].content_hash===d?{code:'OK',id:String(old.rows[0].id),nouvelle:false}:{code:'CLE_REUTILISEE'};}
  await audit(c,{id,site_id:s.id,tenant_id:s.tenant_id,version:1},actor,g.id,'SOUMISE',{scopeNodeId:data.scopeNodeId,nom:data.nom,famille:data.famille,quantite:data.quantite,puissanceUnitaireW:data.puissanceUnitaireW,reviewerGrantId:chain[1].id,origine:'DECLAREE_NON_MESUREE'});
  return {code:'OK',id,nouvelle:true,statut:'EN_REVUE'};
 });}
 async function my({tenant,actor}){return using(async c=>{
  const r=await c.query(`SELECT p.*,s.public_id AS site_public_id,e.public_id AS equipment_public_id
   FROM energy_scope_proposals p JOIN tenants t ON t.id=p.tenant_id AND t.actif=TRUE
   JOIN energy_inventory_sites s ON s.id=p.site_id LEFT JOIN energy_inventory_equipements e ON e.id=p.equipment_id
   WHERE t.code=$1 AND p.auteur_personne_id=$2 ORDER BY p.date_creation DESC,p.id DESC LIMIT 101`,[tenant,actor]);
  return {propositions:r.rows.slice(0,100).map(dto),listePartielle:r.rows.length>100};
 });}
 async function queue({tenant,actor,siteId,grantId}){return using(async c=>{
  const s=await site(c,tenant,siteId);if(!s)return {code:'PERIMETRE_NON_AUTORISE'};
  const g=await source(c,s,grantId);if(!g||Number(g.personne_id)!==actor||g.statut!=='ACTIF'||g.role_scope==='OCCUPANT')return {code:'PERIMETRE_NON_AUTORISE'};
  const r=await c.query(`SELECT p.*,s.public_id AS site_public_id,e.public_id AS equipment_public_id
    FROM energy_scope_proposals p JOIN energy_inventory_sites s ON s.id=p.site_id
    LEFT JOIN energy_inventory_equipements e ON e.id=p.equipment_id
    WHERE p.site_id=$1 AND p.tenant_id=$2 AND p.reviewer_grant_id=$3::uuid AND p.statut='EN_REVUE'
    ORDER BY p.date_creation,p.id LIMIT 101`,[s.id,s.tenant_id,g.id]);
  return {code:'OK',propositions:r.rows.slice(0,100).map(dto),listePartielle:r.rows.length>100};
 });}
 async function mainZone(c,s){const r=await c.query(`SELECT id FROM energy_inventory_zones WHERE site_id=$1 AND tenant_id=$2 AND owner_personne_id=$3
 ORDER BY CASE WHEN type_zone='BATIMENT' THEN 0 WHEN type_zone='EXTERIEUR' THEN 1 ELSE 2 END,id LIMIT 1`,[s.id,s.tenant_id,s.owner_personne_id]);
 if(r.rows.length)return r.rows[0].id;
 const type=s.type_site==='EXPLOITATION_AGRICOLE'?'EXTERIEUR':'BATIMENT';
 const nom=type==='BATIMENT'?'Emplacement principal (à préciser)':'Zone principale (à préciser)';
 const bytes=crypto.createHash('sha256').update('SATEER-C2-ZONE-v1:'+s.public_id).digest('hex');
 const key=bytes.slice(0,8)+'-'+bytes.slice(8,12)+'-4'+bytes.slice(13,16)+'-8'+bytes.slice(17,20)+'-'+bytes.slice(20,32);
 const h=digest({typeZone:type,nom,parentId:null});const id=uuid();
 const z=await c.query(`INSERT INTO energy_inventory_zones(public_id,site_id,tenant_id,owner_personne_id,parent_id,request_key,content_hash,type_zone,nom)
 VALUES($1,$2,$3,$4,NULL,$5::uuid,$6,$7,$8) ON CONFLICT(site_id,owner_personne_id,request_key) DO NOTHING RETURNING id,public_id`,
 [id,s.id,s.tenant_id,s.owner_personne_id,key,h,type,nom]);
 if(z.rows.length){await c.query(`INSERT INTO energy_inventory_events
 (site_id,tenant_id,actor_personne_id,entity_public_id,event_type,payload)
 VALUES($1,$2,$3,$4::uuid,'InventoryZoneDeclared.v1',$5::jsonb)`,[s.id,s.tenant_id,s.owner_personne_id,id,JSON.stringify({origine:'C2_ZONE_TECHNIQUE',nom,type})]);return z.rows[0].id;}
 const old=await c.query(`SELECT id,content_hash FROM energy_inventory_zones WHERE site_id=$1 AND owner_personne_id=$2 AND request_key=$3::uuid`,[s.id,s.owner_personne_id,key]);
 if(old.rows.length!==1||old.rows[0].content_hash!==h)throw Error('ZONE_C2_CONFLIT');return old.rows[0].id;
 }
 async function canonical(c,s,p){const zoneId=await mainZone(c,s);const payload={zoneId,nom:p.nom,famille:p.famille,quantite:Number(p.quantite),puissanceUnitaireW:p.puissance_unitaire_w};
 const h=digest(payload),pub=uuid();const r=await c.query(`INSERT INTO energy_inventory_equipements
 (public_id,site_id,zone_id,tenant_id,owner_personne_id,request_key,content_hash,nom,famille,quantite,puissance_unitaire_w)
 VALUES($1,$2,$3,$4,$5,$6::uuid,$7,$8,$9,$10,$11)
 ON CONFLICT(site_id,owner_personne_id,request_key) DO NOTHING RETURNING id,public_id`,
 [pub,s.id,zoneId,s.tenant_id,s.owner_personne_id,p.id,h,p.nom,p.famille,p.quantite,p.puissance_unitaire_w]);
 let item=r.rows[0];if(!item){const prior=await c.query(`SELECT id,public_id,content_hash FROM energy_inventory_equipements
 WHERE site_id=$1 AND owner_personne_id=$2 AND request_key=$3::uuid`,[s.id,s.owner_personne_id,p.id]);
 if(prior.rows.length!==1||prior.rows[0].content_hash!==h)throw Error('C2_CANONIQUE_CONFLIT');item=prior.rows[0];}
 if(r.rows.length)await c.query(`INSERT INTO energy_inventory_events(site_id,tenant_id,actor_personne_id,entity_public_id,event_type,payload)
 VALUES ($1,$2,$3,$4,'InventoryEquipmentDeclared.v1',$5::jsonb)`,[s.id,s.tenant_id,s.owner_personne_id,item.public_id,JSON.stringify({origine:'C2_VALIDATION_ASCENDANTE',propositionId:p.id,scopeNodeId:p.scope_node_id,auteurPersonneId:p.auteur_personne_id,verification:'DECLAREE_NON_MESUREE'})]);
 await c.query(`INSERT INTO energy_scope_equipment_locations
 (equipment_id,site_id,tenant_id,owner_personne_id,scope_node_id,proposal_id)
 VALUES($1,$2,$3,$4,$5::uuid,$6::uuid) ON CONFLICT(equipment_id) DO NOTHING`,[item.id,s.id,s.tenant_id,s.owner_personne_id,p.scope_node_id,p.id]);
 return item;
 }
 async function review({tenant,actor,siteId,proposalId,data}){return tx(async c=>{
  const s=await site(c,tenant,siteId);if(!s)return {code:'REVUE_NON_AUTORISEE'};
  // Contrôle de l'affectation AVANT de consulter la proposition : pas d'oracle sur les UUID d'autres équipes.
  const acting=await source(c,s,data.reviewerGrantId);
  if(!acting||Number(acting.personne_id)!==actor||acting.statut!=='ACTIF'||acting.role_scope==='OCCUPANT')return {code:'REVUE_NON_AUTORISEE'};
  const r=await c.query(`SELECT * FROM energy_scope_proposals WHERE id=$1::uuid AND site_id=$2
    AND tenant_id=$3 AND owner_personne_id=$4 AND reviewer_grant_id=$5::uuid AND statut='EN_REVUE' FOR UPDATE`,
  [proposalId,s.id,s.tenant_id,s.owner_personne_id,data.reviewerGrantId]);
  if(r.rows.length!==1)return {code:'REVUE_NON_AUTORISEE'};
  const p=r.rows[0];if(Number(p.version)!==data.version)return {code:'VERSION_OBSOLETE'};
  const chain=await ancestry(c,s,p.source_grant_id);
  if(!cheminValide(chain,Number(p.auteur_personne_id))||!await lockChain(c,chain))return {code:'TUTELLE_NON_ACTIVE'};
  const index=chain.findIndex(g=>g.id===p.reviewer_grant_id);if(index<1)return {code:'REVUE_NON_AUTORISEE'};
  const reviewer=chain[index];if(Number(reviewer.personne_id)!==actor||reviewer.role_scope==='OCCUPANT'||actor===Number(p.auteur_personne_id))return {code:'REVUE_NON_AUTORISEE'};
  if(!await authorisedNode(c,s,p.scope_node_id,reviewer.node_id))return {code:'REVUE_NON_AUTORISEE'};
  if(data.decision==='REFUSER'||data.decision==='A_CORRIGER'){
   const state=data.decision==='REFUSER'?'REFUSEE':'A_CORRIGER';
   await c.query(DECISION_NON_APPROUVEE_SQL,[state,p.id]);
   await audit(c,p,actor,reviewer.id,state,{depuisGrantId:reviewer.id,version:p.version});
   return {code:'OK',statut:state};
  }
  if(index<chain.length-1){const next=chain[index+1];await c.query(`UPDATE energy_scope_proposals
    SET reviewer_grant_id=$1::uuid,date_modification=NOW() WHERE id=$2::uuid`,[next.id,p.id]);
   await audit(c,p,actor,reviewer.id,'TRANSMISE',{versGrantId:next.id,version:p.version});
   return {code:'OK',statut:'EN_REVUE',transmise:true};}
  // Coordinateur : fin de la chaine de tutelle = seule insertion dans l'inventaire existant.
  if(reviewer.role_scope!=='COORDINATEUR'||Number(s.owner_personne_id)!==actor)return {code:'REVUE_NON_AUTORISEE'};
  // Verrou de site : deux validations terminales simultanées ne peuvent contourner le contrôle de doublon.
  await c.query('SELECT id FROM energy_inventory_sites WHERE id=$1 FOR UPDATE',[s.id]);
  // Barriere de qualite : doublon textuel sur le MEME bureau C2.
  // Ne prétend pas identifier à coup sûr deux machines physiques identiques ; demander correction/qualification.
  const possible=await c.query(`SELECT 1 FROM energy_scope_equipment_locations l
    JOIN energy_inventory_equipements e ON e.id=l.equipment_id AND e.site_id=l.site_id
    WHERE l.site_id=$1 AND l.tenant_id=$2 AND l.scope_node_id=$3::uuid
      AND e.famille=$4 AND lower(btrim(e.nom))=lower(btrim($5)) LIMIT 1`,
    [s.id,s.tenant_id,p.scope_node_id,p.famille,p.nom]);
  if(possible.rows.length)return {code:'DOUBLON_POTENTIEL_A_QUALIFIER'};
  const item=await canonical(c,s,p);
  await c.query(`UPDATE energy_scope_proposals SET statut='INTEGREE',reviewer_grant_id=NULL,
    equipment_id=$1,date_modification=NOW(),date_cloture=NOW() WHERE id=$2::uuid`,[item.id,p.id]);
  await audit(c,p,actor,reviewer.id,'INTEGREE',{equipmentId:String(item.public_id),scopeNodeId:p.scope_node_id,provenance:'DECLAREE_NON_MESUREE'});
  return {code:'OK',statut:'INTEGREE',equipmentId:String(item.public_id)};
 });}
 async function correct({tenant,actor,siteId,proposalId,data}){return tx(async c=>{
  const s=await site(c,tenant,siteId);if(!s)return {code:'PROPOSITION_NON_AUTORISEE'};
  const q=await c.query(`SELECT * FROM energy_scope_proposals WHERE id=$1::uuid AND site_id=$2 AND tenant_id=$3 FOR UPDATE`,[proposalId,s.id,s.tenant_id]);
  if(q.rows.length!==1)return {code:'PROPOSITION_NON_AUTORISEE'};const p=q.rows[0];
  if(Number(p.auteur_personne_id)!==actor||p.statut!=='A_CORRIGER')return {code:'PROPOSITION_NON_CORRIGEABLE'};
  if(p.version!==data.version)return {code:'VERSION_OBSOLETE'};
  if(p.source_grant_id!==data.sourceGrantId||p.scope_node_id!==data.scopeNodeId)return {code:'PERIMETRE_IMMUABLE'};
  const chain=await ancestry(c,s,p.source_grant_id);
  if(!cheminValide(chain,actor)||!await lockChain(c,chain)||!await authorisedNode(c,s,p.scope_node_id,chain[0].node_id))return {code:'TUTELLE_NON_ACTIVE'};
  const h=digest({...data,version:undefined});
  await c.query(`UPDATE energy_scope_proposals SET nom=$1,famille=$2,quantite=$3,puissance_unitaire_w=$4,
    content_hash=$5,version=version+1,statut='EN_REVUE',reviewer_grant_id=$6::uuid,date_modification=NOW()
    WHERE id=$7::uuid`,[data.nom,data.famille,data.quantite,data.puissanceUnitaireW,h,chain[1].id,p.id]);
  await audit(c,{...p,version:p.version+1},actor,p.source_grant_id,'CORRIGEE',{nom:data.nom,famille:data.famille,quantite:data.quantite,puissanceUnitaireW:data.puissanceUnitaireW,reviewerGrantId:chain[1].id});
  return {code:'OK',statut:'EN_REVUE',version:p.version+1};
 });}
 async function history({tenant,actor,proposalId}){return using(async c=>{
  const r=await c.query(`SELECT p.*,s.public_id AS site_public_id,e.public_id AS equipment_public_id
 FROM energy_scope_proposals p JOIN tenants t ON t.id=p.tenant_id AND t.actif=TRUE
 JOIN energy_inventory_sites s ON s.id=p.site_id LEFT JOIN energy_inventory_equipements e ON e.id=p.equipment_id
 WHERE p.id=$1::uuid AND t.code=$2`,[proposalId,tenant]);if(r.rows.length!==1)return {code:'HISTORIQUE_NON_AUTORISE'};
  const p=r.rows[0],s=await site(c,tenant,p.site_public_id);
  if(Number(p.auteur_personne_id)!==actor){const chain=await ancestry(c,s,p.source_grant_id);
   if(!chain.some(g=>g.personne_id===actor&&g.statut==='ACTIF'&&g.role_scope!=='OCCUPANT'))return {code:'HISTORIQUE_NON_AUTORISE'};}
  const ev=await c.query(`SELECT version,action,acteur_personne_id,date_evenement,details FROM energy_scope_proposal_events
 WHERE proposal_id=$1::uuid ORDER BY id LIMIT 101`,[p.id]);
  return {code:'OK',proposition:dto(p),evenements:ev.rows.slice(0,100).map(x=>({version:x.version,action:x.action,acteurPersonneId:Number(x.acteur_personne_id),date:x.date_evenement,details:x.details})),listePartielle:ev.rows.length>100};
 });}
 return {submit,my,queue,review,correct,history};
}
module.exports={creerEnergyCollectionStore,DECISION_NON_APPROUVEE_SQL};
