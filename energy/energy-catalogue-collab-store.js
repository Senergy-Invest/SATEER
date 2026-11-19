'use strict';
/** C3B : qualification technique C2 sans accès aux passeports, photos, QR ni données tierces. */
const crypto=require('node:crypto');
const {identity,contentHash,cheminValide}=require('./energy-catalogue-collab-domain');
const uuid=()=>crypto.randomUUID();
function creerEnergyCatalogueCollabStore({obtenirClient}){
 if(typeof obtenirClient!=='function')throw TypeError('CLIENT_POSTGRES_REQUIS_C3B');
 async function use(fn){const c=await obtenirClient();try{return await fn(c);}finally{c.release();}}
 async function tx(fn){return use(async c=>{let begun=false;try{await c.query('BEGIN');begun=true;const r=await fn(c);await c.query('COMMIT');begun=false;return r;}catch(e){if(begun)await c.query('ROLLBACK').catch(()=>{});throw e;}});}
 async function site(c,tenant,siteId){const r=await c.query(`SELECT s.id,s.public_id,s.nom,s.tenant_id,s.owner_personne_id
   FROM energy_inventory_sites s JOIN tenants t ON t.id=s.tenant_id AND t.actif=TRUE
   WHERE t.code=$1 AND s.public_id=$2::uuid LIMIT 1`,[tenant,siteId]);return r.rows[0]||null;}
 async function grant(c,s,id){const r=await c.query(`SELECT id,node_id,personne_id,parent_grant_id,role_scope,statut
   FROM energy_scope_grants WHERE id=$1::uuid AND site_id=$2 AND tenant_id=$3 AND owner_personne_id=$4`,[id,s.id,s.tenant_id,s.owner_personne_id]);return r.rows[0]||null;}
 async function chain(c,s,grantId){const r=await c.query(`WITH RECURSIVE a(id,parent_grant_id,personne_id,node_id,role_scope,statut,depth) AS (
   SELECT id,parent_grant_id,personne_id,node_id,role_scope,statut,0 FROM energy_scope_grants
   WHERE id=$1::uuid AND site_id=$2 AND tenant_id=$3 AND owner_personne_id=$4
   UNION ALL SELECT g.id,g.parent_grant_id,g.personne_id,g.node_id,g.role_scope,g.statut,a.depth+1
   FROM energy_scope_grants g JOIN a ON g.id=a.parent_grant_id
   WHERE g.site_id=$2 AND g.tenant_id=$3 AND g.owner_personne_id=$4
   ) SELECT * FROM a ORDER BY depth`,[grantId,s.id,s.tenant_id,s.owner_personne_id]);return r.rows;}
 async function active(c,cs){const ids=cs.map(g=>g.id);const r=await c.query(`SELECT id,statut FROM energy_scope_grants WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE`,[ids]);return r.rows.length===ids.length&&r.rows.every(x=>x.statut==='ACTIF');}
 async function event(c,p,actor,grantId,action,details={}){await c.query(`INSERT INTO energy_catalog_collab_events
   (proposal_id,site_id,tenant_id,acteur_personne_id,acteur_grant_id,version,action,details)
   VALUES($1::uuid,$2,$3,$4,$5::uuid,$6,$7,$8::jsonb)`,[p.id,p.site_id,p.tenant_id,actor,grantId,p.version,action,JSON.stringify(details)]);}
 function dto(p){return {id:String(p.id),siteId:p.site_public_id?String(p.site_public_id):null,
   sourceGrantId:String(p.source_grant_id),scopeNodeId:String(p.scope_node_id),c2ProposalId:String(p.c2_proposal_id),
   famille:p.famille,sousFamille:p.sous_famille,designation:p.designation,marque:p.marque,modele:p.modele,
   puissanceNominaleW:p.puissance_nominale_w,tensionV:p.tension_v,
   version:Number(p.version),statut:p.statut,reviewerGrantId:p.reviewer_grant_id?String(p.reviewer_grant_id):null,
   referenceId:p.catalogue_reference_id?String(p.catalogue_reference_id):null,dateCreation:p.date_creation};}
 const selectCols=`p.*,s.public_id AS site_public_id`;
 async function integrated({tenant,actor}){return use(async c=>{
  const q=await c.query(`SELECT p.id,p.source_grant_id,p.scope_node_id,p.famille,p.nom,s.public_id AS site_public_id
  FROM energy_scope_proposals p JOIN tenants t ON t.id=p.tenant_id AND t.actif=TRUE
  JOIN energy_inventory_sites s ON s.id=p.site_id
  JOIN energy_scope_grants g ON g.id=p.source_grant_id AND g.statut='ACTIF'
  WHERE t.code=$1 AND p.auteur_personne_id=$2 AND p.statut='INTEGREE' AND p.equipment_id IS NOT NULL
  ORDER BY p.date_creation DESC,p.id DESC LIMIT 101`,[tenant,actor]);
  return {equipements:q.rows.slice(0,100).map(p=>({c2ProposalId:String(p.id),siteId:String(p.site_public_id),
   sourceGrantId:String(p.source_grant_id),scopeNodeId:String(p.scope_node_id),famille:p.famille,nom:p.nom})),listePartielle:q.rows.length>100};
 });}
 async function submit({tenant,actor,siteId,requestKey,data}){return tx(async c=>{
  const s=await site(c,tenant,siteId);if(!s)return {code:'PERIMETRE_NON_AUTORISE'};
  // Une fiche technique ne peut venir que d'une proposition C2 réellement intégrée PAR LE MÊME AUTEUR.
  const q=await c.query(`SELECT id,source_grant_id,scope_node_id,famille,auteur_personne_id
   FROM energy_scope_proposals WHERE id=$1::uuid AND site_id=$2 AND tenant_id=$3
   AND owner_personne_id=$4 AND statut='INTEGREE' AND equipment_id IS NOT NULL`,
   [data.c2ProposalId,s.id,s.tenant_id,s.owner_personne_id]);
  if(q.rows.length!==1||Number(q.rows[0].auteur_personne_id)!==actor||q.rows[0].source_grant_id!==data.sourceGrantId)return {code:'SOURCE_C2_NON_AUTORISEE'};
  const p=q.rows[0];if(p.famille!==data.famille)return {code:'FAMILLE_DIVERGENTE'};
  const cs=await chain(c,s,data.sourceGrantId);
  if(!cheminValide(cs,actor)||!await active(c,cs))return {code:'TUTELLE_NON_ACTIVE'};
  if(cs[0].node_id!==p.scope_node_id&&!(await c.query(`WITH RECURSIVE an(id,parent_id) AS (
    SELECT id,parent_id FROM energy_scope_nodes WHERE id=$1::uuid AND site_id=$2
    UNION ALL SELECT n.id,n.parent_id FROM energy_scope_nodes n JOIN an a ON n.id=a.parent_id WHERE n.site_id=$2
   ) SELECT EXISTS(SELECT 1 FROM an WHERE id=$3::uuid) AS ok`,[p.scope_node_id,s.id,cs[0].node_id])).rows[0]?.ok)return {code:'PERIMETRE_NON_AUTORISE'};
  if(cs[0].role_scope==='OCCUPANT'&&cs[0].node_id!==p.scope_node_id)return {code:'PERIMETRE_NON_AUTORISE'};
  const hash=contentHash(data);
  const e=await c.query(`SELECT id,content_hash FROM energy_catalog_collab_proposals WHERE site_id=$1 AND source_grant_id=$2::uuid AND request_key=$3::uuid`,[s.id,data.sourceGrantId,requestKey]);
  if(e.rows.length)return e.rows[0].content_hash===hash?{code:'OK',id:String(e.rows[0].id),nouvelle:false}:{code:'CLE_REUTILISEE'};
  const id=uuid();const a=await c.query(`INSERT INTO energy_catalog_collab_proposals
    (id,site_id,tenant_id,owner_personne_id,source_grant_id,scope_node_id,c2_proposal_id,auteur_personne_id,reviewer_grant_id,request_key,content_hash,
     famille,sous_famille,designation,marque,modele,puissance_nominale_w,tension_v)
    VALUES($1,$2,$3,$4,$5::uuid,$6::uuid,$7::uuid,$8,$9::uuid,$10::uuid,$11,$12,$13,$14,$15,$16,$17,$18)
    ON CONFLICT(site_id,source_grant_id,request_key) DO NOTHING RETURNING id`,
   [id,s.id,s.tenant_id,s.owner_personne_id,p.source_grant_id,p.scope_node_id,p.id,actor,cs[1].id,requestKey,hash,
    data.famille,data.sousFamille,data.designation,data.marque,data.modele,data.puissanceNominaleW,data.tensionV]);
  if(!a.rows.length){const old=await c.query(`SELECT id,content_hash FROM energy_catalog_collab_proposals WHERE site_id=$1 AND source_grant_id=$2::uuid AND request_key=$3::uuid`,[s.id,data.sourceGrantId,requestKey]);
   return old.rows.length===1&&old.rows[0].content_hash===hash?{code:'OK',id:String(old.rows[0].id),nouvelle:false}:{code:'CLE_REUTILISEE'};}
  await event(c,{id,site_id:s.id,tenant_id:s.tenant_id,version:1},actor,p.source_grant_id,'SOUMISE',{c2ProposalId:p.id,scopeNodeId:p.scope_node_id,provenance:'COLLABORATEUR_NON_VERIFIEE'});
  return {code:'OK',id,nouvelle:true,statut:'EN_REVUE'};
 });}
 async function my({tenant,actor}){return use(async c=>{const q=await c.query(`SELECT ${selectCols} FROM energy_catalog_collab_proposals p
  JOIN tenants t ON t.id=p.tenant_id AND t.actif=TRUE JOIN energy_inventory_sites s ON s.id=p.site_id
  WHERE t.code=$1 AND p.auteur_personne_id=$2 ORDER BY p.date_creation DESC,p.id DESC LIMIT 101`,[tenant,actor]);
  return {propositions:q.rows.slice(0,100).map(dto),listePartielle:q.rows.length>100};});}
 async function queue({tenant,actor,siteId,grantId}){return use(async c=>{const s=await site(c,tenant,siteId);if(!s)return {code:'REVUE_NON_AUTORISEE'};
  const g=await grant(c,s,grantId);if(!g||Number(g.personne_id)!==actor||g.statut!=='ACTIF'||g.role_scope==='OCCUPANT')return {code:'REVUE_NON_AUTORISEE'};
  const q=await c.query(`SELECT ${selectCols} FROM energy_catalog_collab_proposals p JOIN energy_inventory_sites s ON s.id=p.site_id
   JOIN energy_scope_grants source ON source.id=p.source_grant_id AND source.statut='ACTIF'
   WHERE p.site_id=$1 AND p.tenant_id=$2 AND p.reviewer_grant_id=$3::uuid AND p.statut='EN_REVUE'
   ORDER BY p.date_creation,p.id LIMIT 101`,[s.id,s.tenant_id,grantId]);
  return {code:'OK',propositions:q.rows.slice(0,100).map(dto),listePartielle:q.rows.length>100};});}
 async function review({tenant,actor,siteId,proposalId,data}){return tx(async c=>{
  const s=await site(c,tenant,siteId);if(!s)return {code:'REVUE_NON_AUTORISEE'};
  const acting=await grant(c,s,data.reviewerGrantId);if(!acting||Number(acting.personne_id)!==actor||acting.statut!=='ACTIF'||acting.role_scope==='OCCUPANT')return {code:'REVUE_NON_AUTORISEE'};
  const q=await c.query(`SELECT * FROM energy_catalog_collab_proposals WHERE id=$1::uuid AND site_id=$2 AND tenant_id=$3
    AND owner_personne_id=$4 AND reviewer_grant_id=$5::uuid AND statut='EN_REVUE' FOR UPDATE`,
   [proposalId,s.id,s.tenant_id,s.owner_personne_id,data.reviewerGrantId]);
  if(q.rows.length!==1)return {code:'REVUE_NON_AUTORISEE'};const p=q.rows[0];
  if(Number(p.version)!==data.version)return {code:'VERSION_OBSOLETE'};
  const cs=await chain(c,s,p.source_grant_id);
  if(!cheminValide(cs,Number(p.auteur_personne_id))||!await active(c,cs))return {code:'TUTELLE_NON_ACTIVE'};
  const idx=cs.findIndex(g=>g.id===p.reviewer_grant_id);
  if(idx<1||Number(cs[idx].personne_id)!==actor||actor===Number(p.auteur_personne_id))return {code:'REVUE_NON_AUTORISEE'};
  if(data.decision==='REFUSER'||data.decision==='A_CORRIGER'){
   const state=data.decision==='REFUSER'?'REFUSEE':'A_CORRIGER';
   await c.query(`UPDATE energy_catalog_collab_proposals SET statut=$1::varchar,reviewer_grant_id=NULL,
    date_modification=NOW(),date_cloture=CASE WHEN $1::varchar='REFUSEE' THEN NOW() ELSE NULL END WHERE id=$2::uuid`,[state,p.id]);
   await event(c,p,actor,cs[idx].id,state,{decision:'REVUE_INTERNE',version:p.version});
   return {code:'OK',statut:state};
  }
  if(idx<cs.length-1){if(data.decision!=='APPROUVER')return {code:'REVUE_NON_AUTORISEE'};
   await c.query(`UPDATE energy_catalog_collab_proposals SET reviewer_grant_id=$1::uuid,date_modification=NOW() WHERE id=$2::uuid`,[cs[idx+1].id,p.id]);
   await event(c,p,actor,cs[idx].id,'TRANSMISE',{versGrantId:cs[idx+1].id});
   return {code:'OK',statut:'EN_REVUE',transmise:true};}
  if(cs[idx].role_scope!=='COORDINATEUR'||Number(s.owner_personne_id)!==actor)return {code:'REVUE_NON_AUTORISEE'};
  await c.query('SELECT id FROM energy_inventory_sites WHERE id=$1 FOR UPDATE',[s.id]);
  const technical={famille:p.famille,sousFamille:p.sous_famille,designation:p.designation,marque:p.marque,modele:p.modele,
   puissanceNominaleW:p.puissance_nominale_w,tensionV:p.tension_v,sourcePassportId:null};
  const finger=identity(technical);
  if(data.decision==='RAPPROCHER'){
   if(!finger)return {code:'MODELE_INCOMPLET'};
   const r=await c.query(`SELECT id FROM energy_catalog_references WHERE id=$1::uuid AND site_id=$2 AND tenant_id=$3
    AND owner_personne_id=$4 AND statut='REFERENCE_INTERNE' AND empreinte=$5`,[data.referenceId,s.id,s.tenant_id,s.owner_personne_id,finger]);
   if(r.rows.length!==1)return {code:'REFERENCE_EXISTANTE_NON_IDENTIQUE'};
   await c.query(`UPDATE energy_catalog_collab_proposals SET statut='RAPPROCHEE',reviewer_grant_id=NULL,
    catalogue_reference_id=$1::uuid,date_cloture=NOW(),date_modification=NOW() WHERE id=$2::uuid`,[data.referenceId,p.id]);
   await event(c,p,actor,cs[idx].id,'RAPPROCHEE',{referenceId:data.referenceId,aucunPasseportAssocie:true});
   return {code:'OK',statut:'RAPPROCHEE',referenceId:data.referenceId};
  }
  if(data.decision!=='APPROUVER')return {code:'REVUE_NON_AUTORISEE'};
  if(finger){const duplicate=await c.query(`SELECT id FROM energy_catalog_references WHERE site_id=$1 AND tenant_id=$2 AND owner_personne_id=$3
    AND empreinte=$4 AND statut='REFERENCE_INTERNE' LIMIT 1`,[s.id,s.tenant_id,s.owner_personne_id,finger]);
   if(duplicate.rows.length)return {code:'MODELE_EXISTANT_A_RAPPROCHER',referenceId:String(duplicate.rows[0].id)};}
  // Seul le coordinateur insère une CANDIDATE dans C3A. Le référencement interne reste une deuxième décision humaine.
  const refId=uuid();const hash=contentHash(technical);
  const res=await c.query(`INSERT INTO energy_catalog_references
   (id,site_id,tenant_id,owner_personne_id,source_passport_id,request_key,content_hash,
    famille,sous_famille,designation,marque,modele,puissance_nominale_w,tension_v,empreinte)
   VALUES($1,$2,$3,$4,NULL,$5::uuid,$6,$7,$8,$9,$10,$11,$12,$13,$14)
   ON CONFLICT(site_id,owner_personne_id,request_key) DO NOTHING RETURNING id`,
   [refId,s.id,s.tenant_id,s.owner_personne_id,p.id,hash,p.famille,p.sous_famille,p.designation,p.marque,p.modele,p.puissance_nominale_w,p.tension_v,finger]);
  let saved=res.rows[0]?.id;
  if(!saved){const old=await c.query(`SELECT id,content_hash FROM energy_catalog_references
   WHERE site_id=$1 AND owner_personne_id=$2 AND request_key=$3::uuid`,[s.id,s.owner_personne_id,p.id]);
   if(old.rows.length!==1||old.rows[0].content_hash!==hash)throw Error('C3B_CANDIDATE_CONFLIT');saved=old.rows[0].id;}
  if(res.rows.length)await c.query(`INSERT INTO energy_catalog_events
   (site_id,tenant_id,owner_personne_id,actor_personne_id,action,reference_id,details)
   VALUES($1,$2,$3,$4,'CatalogueCandidateCreated.v1',$5::uuid,$6::jsonb)`,
    [s.id,s.tenant_id,s.owner_personne_id,actor,saved,JSON.stringify({origine:'C3B_PROPOSITION_INTERNE',proposalId:p.id,nonCertifiee:true})]);
  await c.query(`UPDATE energy_catalog_collab_proposals SET statut='EN_CATALOGUE',reviewer_grant_id=NULL,
   catalogue_reference_id=$1::uuid,date_cloture=NOW(),date_modification=NOW() WHERE id=$2::uuid`,[saved,p.id]);
  await event(c,p,actor,cs[idx].id,'EN_CATALOGUE',{referenceId:String(saved),statutCatalogue:'CANDIDATE',aucunPasseportAssocie:true});
  return {code:'OK',statut:'EN_CATALOGUE',referenceId:String(saved)};
 });}
 async function correct({tenant,actor,siteId,proposalId,data}){return tx(async c=>{
  const s=await site(c,tenant,siteId);if(!s)return {code:'PROPOSITION_NON_AUTORISEE'};
  const q=await c.query(`SELECT * FROM energy_catalog_collab_proposals WHERE id=$1::uuid AND site_id=$2
   AND tenant_id=$3 AND owner_personne_id=$4 FOR UPDATE`,[proposalId,s.id,s.tenant_id,s.owner_personne_id]);
  if(q.rows.length!==1)return {code:'PROPOSITION_NON_AUTORISEE'};const p=q.rows[0];
  if(Number(p.auteur_personne_id)!==actor||p.statut!=='A_CORRIGER')return {code:'PROPOSITION_NON_CORRIGEABLE'};
  if(Number(p.version)!==data.version)return {code:'VERSION_OBSOLETE'};
  if(data.famille!==p.famille)return {code:'FAMILLE_DIVERGENTE'};
  const cs=await chain(c,s,p.source_grant_id);
  if(!cheminValide(cs,actor)||!await active(c,cs))return {code:'TUTELLE_NON_ACTIVE'};
  const upd={famille:p.famille,sousFamille:data.sousFamille,designation:data.designation,marque:data.marque,modele:data.modele,
   puissanceNominaleW:data.puissanceNominaleW,tensionV:data.tensionV,sourcePassportId:null};
  await c.query(`UPDATE energy_catalog_collab_proposals SET sous_famille=$1,designation=$2,marque=$3,modele=$4,
   puissance_nominale_w=$5,tension_v=$6,content_hash=$7,version=version+1,statut='EN_REVUE',reviewer_grant_id=$8::uuid,
   date_modification=NOW() WHERE id=$9::uuid`,[upd.sousFamille,upd.designation,upd.marque,upd.modele,upd.puissanceNominaleW,
   upd.tensionV,contentHash(upd),cs[1].id,p.id]);
  await event(c,{...p,version:Number(p.version)+1},actor,p.source_grant_id,'CORRIGEE',{version:Number(p.version)+1,reviewerGrantId:cs[1].id});
  return {code:'OK',statut:'EN_REVUE',version:Number(p.version)+1};
 });}
 async function history({tenant,actor,proposalId}){return use(async c=>{
  const q=await c.query(`SELECT ${selectCols} FROM energy_catalog_collab_proposals p
   JOIN energy_inventory_sites s ON s.id=p.site_id JOIN tenants t ON t.id=p.tenant_id AND t.actif=TRUE
   WHERE p.id=$1::uuid AND t.code=$2`,[proposalId,tenant]);
  if(q.rows.length!==1)return {code:'HISTORIQUE_NON_AUTORISE'};const p=q.rows[0];
  if(Number(p.auteur_personne_id)!==actor){const s=await site(c,tenant,p.site_public_id),cs=await chain(c,s,p.source_grant_id);
   if(!cs.some(g=>Number(g.personne_id)===actor&&g.statut==='ACTIF'&&g.role_scope!=='OCCUPANT'))return {code:'HISTORIQUE_NON_AUTORISE'};}
  const r=await c.query(`SELECT version,action,acteur_personne_id,date_evenement,details
   FROM energy_catalog_collab_events WHERE proposal_id=$1::uuid ORDER BY id LIMIT 101`,[p.id]);
  return {code:'OK',proposition:dto(p),evenements:r.rows.slice(0,100).map(x=>({version:Number(x.version),action:x.action,acteurPersonneId:Number(x.acteur_personne_id),date:x.date_evenement,details:x.details})),listePartielle:r.rows.length>100};
 });}
 return {integrated,submit,my,queue,review,correct,history};
}
module.exports={creerEnergyCatalogueCollabStore};
