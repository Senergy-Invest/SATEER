'use strict';
/** Projection et ajout prive de factures/recharges declarees; aucun lien de mesure infere. */
const crypto=require('node:crypto');
const uuid=()=>crypto.randomUUID();
const digest=d=>crypto.createHash('sha256').update(JSON.stringify(d)).digest('hex');
function creerEnergyBillingStore({obtenirClient}){
 if(typeof obtenirClient!=='function')throw TypeError('CLIENT_PG_REQUIS');
 async function using(fn){const c=await obtenirClient();try{return await fn(c);}finally{c.release();}}
 async function tx(fn){return using(async c=>{let active=false;try{await c.query('BEGIN');active=true;const x=await fn(c);await c.query('COMMIT');active=false;return x;}catch(e){if(active)await c.query('ROLLBACK').catch(()=>{});throw e;}});}
 async function site(c,{tenant,actor,siteId},lock=false){
  const r=await c.query(`SELECT s.id,s.public_id,s.nom,s.pays,s.tenant_id,s.owner_personne_id
   FROM energy_inventory_sites s JOIN tenants t ON t.id=s.tenant_id AND t.actif=TRUE
   WHERE t.code=$1 AND s.public_id=$2::uuid AND s.owner_personne_id=$3 LIMIT 1 ${lock?'FOR UPDATE OF s':''}`,[tenant,siteId,actor]);
  return r.rows[0]||null;
 }
 const sc=s=>[s.id,s.tenant_id,s.owner_personne_id];
 async function sites({tenant,actor}){return using(async c=>{
  const r=await c.query(`SELECT s.public_id,s.nom,s.pays FROM energy_inventory_sites s
   JOIN tenants t ON t.id=s.tenant_id AND t.actif=TRUE WHERE t.code=$1 AND s.owner_personne_id=$2
   ORDER BY s.id LIMIT 51`,[tenant,actor]);
  return {sites:r.rows.slice(0,50).map(x=>({id:String(x.public_id),nom:x.nom,pays:x.pays})),suivant:r.rows.length>50};
 });}
 async function creer({tenant,actor,siteId,requestKey,data}){return tx(async c=>{
  const s=await site(c,{tenant,actor,siteId},true);if(!s)return {code:'SITE_NON_AUTORISE'};
  const hash=digest(data);
  const old=await c.query(`SELECT id,content_hash FROM energy_billing_declarations
   WHERE site_id=$1 AND owner_personne_id=$2 AND request_key=$3::uuid`,[s.id,s.owner_personne_id,requestKey]);
  if(old.rows.length)return old.rows[0].content_hash===hash?{code:'OK',id:String(old.rows[0].id),nouveau:false}:{code:'CLE_REUTILISEE'};
  if(data.pointId){const p=await c.query(`SELECT energie FROM energy_meter_points
    WHERE id=$1::uuid AND site_id=$2 AND tenant_id=$3 AND owner_personne_id=$4`,[data.pointId,...sc(s)]);
   if(!p.rows.length)return {code:'POINT_NON_AUTORISE'};
   if(p.rows[0].energie!==data.energie)return {code:'ENERGIE_POINT_DIFFERENTE'};}
  if(data.meterId){const m=await c.query(`SELECT 1 FROM energy_meter_devices
    WHERE id=$1::uuid AND point_id=$2::uuid AND site_id=$3 AND tenant_id=$4 AND owner_personne_id=$5`,[data.meterId,data.pointId,...sc(s)]);
   if(!m.rows.length)return {code:'COMPTEUR_NON_AUTORISE'};}
  const id=uuid();const r=await c.query(`INSERT INTO energy_billing_declarations
   (id,site_id,tenant_id,owner_personne_id,point_id,meter_id,nature,energie,date_document,periode_debut,periode_fin,
    devise,montant,reference_document,reference_justificatif,auteur_personne_id,request_key,content_hash)
   VALUES($1::uuid,$2,$3,$4,$5::uuid,$6::uuid,$7,$8,$9::date,$10::date,$11::date,$12,$13::numeric,$14,$15,$16,$17::uuid,$18)
   ON CONFLICT DO NOTHING RETURNING id`,
   [id,...sc(s),data.pointId,data.meterId,data.nature,data.energie,data.dateDocument,data.periodeDebut,data.periodeFin,
    data.devise,data.montant,data.referenceDocument,data.referenceJustificatif,actor,requestKey,hash]);
  if(!r.rows.length){const replay=await c.query(`SELECT id,content_hash FROM energy_billing_declarations
   WHERE site_id=$1 AND owner_personne_id=$2 AND request_key=$3::uuid`,[s.id,s.owner_personne_id,requestKey]);
   return replay.rows.length&&replay.rows[0].content_hash===hash?{code:'OK',id:String(replay.rows[0].id),nouveau:false}:{code:'DECLARATION_EXISTANTE_OU_CONFLIT'};}
  await c.query(`INSERT INTO energy_billing_events(site_id,tenant_id,owner_personne_id,acteur_personne_id,action,entity_id,details)
   VALUES($1,$2,$3,$4,'BillingDeclarationRecorded.v1',$5::uuid,$6::jsonb)`,[...sc(s),actor,id,JSON.stringify({nature:data.nature,pointLie:Boolean(data.pointId),compteurLie:Boolean(data.meterId)})]);
  return {code:'OK',id,nouveau:true,qualification:'DECLARE_A_VERIFIER'};
 });}
 async function lister({tenant,actor,siteId,offset=0}){return using(async c=>{
  const s=await site(c,{tenant,actor,siteId});if(!s)return null;
  const r=await c.query(`SELECT id,nature,energie,to_char(date_document,'YYYY-MM-DD') AS date_document,
   to_char(periode_debut,'YYYY-MM-DD') AS periode_debut,to_char(periode_fin,'YYYY-MM-DD') AS periode_fin,
   devise,montant::text AS montant,
   point_id,meter_id,reference_document,reference_justificatif,provenance,qualification,date_creation
   FROM energy_billing_declarations WHERE site_id=$1 AND tenant_id=$2 AND owner_personne_id=$3
   ORDER BY date_document DESC,id LIMIT 51 OFFSET $4`,[...sc(s),offset]);
  const declarations=r.rows.slice(0,50).map(x=>({id:String(x.id),nature:x.nature,energie:x.energie,
   dateDocument:x.date_document,
   periodeDebut:x.periode_debut||null,
   periodeFin:x.periode_fin||null,
   devise:x.devise.trim(),montant:x.montant,pointId:x.point_id?String(x.point_id):null,
   meterId:x.meter_id?String(x.meter_id):null,referenceDocument:x.reference_document,
   referenceJustificatif:x.reference_justificatif,provenance:x.provenance,qualification:x.qualification}));
  return {site:{id:String(s.public_id),nom:s.nom,pays:s.pays},declarations,offset,limite:50,suivant:r.rows.length>50,
   preuveFichierDisponible:false,calculsDisponibles:false,tarifsCertifies:false};
 });}
 return {sites,lister,creer};
}
module.exports={creerEnergyBillingStore};
