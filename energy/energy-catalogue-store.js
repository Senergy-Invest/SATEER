'use strict';
/** Catalogue local C3. Les photos, OCR et QR demeurent dans les moteurs A1/A2 privés. */
const crypto=require('node:crypto');
const {identity,canonical,contentHash}=require('./energy-catalogue-domain');
const uuid=()=>crypto.randomUUID();
function creerEnergyCatalogueStore({obtenirClient}){
 if(typeof obtenirClient!=='function')throw TypeError('CLIENT_POSTGRES_REQUIS');
 async function use(fn){const c=await obtenirClient();try{return await fn(c);}finally{c.release();}}
 async function tx(fn){return use(async c=>{let begun=false;try{await c.query('BEGIN');begun=true;const value=await fn(c);await c.query('COMMIT');begun=false;return value;}
  catch(e){if(begun)await c.query('ROLLBACK').catch(()=>{});throw e;}});}
 async function ownSite(c,{tenant,actor,siteId}){
  const q=await c.query(`SELECT s.id,s.public_id,s.tenant_id,s.owner_personne_id,s.nom
    FROM energy_inventory_sites s JOIN tenants t ON t.id=s.tenant_id AND t.actif=TRUE
    WHERE t.code=$1 AND s.public_id=$2::uuid AND s.owner_personne_id=$3 LIMIT 1`,[tenant,siteId,actor]);
  return q.rows[0]||null;
 }
 async function passport(c,s,passportId){
  const q=await c.query(`SELECT p.id,p.public_id,e.famille,e.nom,e.public_id AS inventory_id
    FROM energy_equipment_passports p JOIN energy_inventory_equipements e ON e.id=p.inventaire_equipement_id
      AND e.site_id=p.site_id AND e.tenant_id=p.tenant_id AND e.owner_personne_id=p.owner_personne_id
    WHERE p.public_id=$1::uuid AND p.site_id=$2 AND p.tenant_id=$3 AND p.owner_personne_id=$4 LIMIT 1`,
    [passportId,s.id,s.tenant_id,s.owner_personne_id]);
  return q.rows[0]||null;
 }
 async function labels(c,s,p){
  const q=await c.query(`SELECT DISTINCT ON (v.champ) v.champ,v.valeur,v.provenance,v.revision
    FROM energy_equipment_label_versions v
    WHERE v.passeport_id=$1 AND v.tenant_id=$2 AND v.owner_personne_id=$3
    ORDER BY v.champ,v.revision DESC`,[p.id,s.tenant_id,s.owner_personne_id]);
  return Object.fromEntries(q.rows.map(x=>[x.champ,{valeur:x.valeur,provenance:x.provenance,revision:Number(x.revision)}]));
 }
 function matches(details,fields){
  for(const [col,label] of [['marque','MARQUE'],['modele','MODELE']])
   if(details[label]&&fields[col]&&canonical(details[label].valeur)!==canonical(fields[col]))return false;
  return true;
 }
 async function event(c,s,actor,action,referenceId,details={}){
  await c.query(`INSERT INTO energy_catalog_events
   (site_id,tenant_id,owner_personne_id,actor_personne_id,action,reference_id,details)
   VALUES($1,$2,$3,$4,$5,$6::uuid,$7::jsonb)`,
   [s.id,s.tenant_id,s.owner_personne_id,actor,action,referenceId,JSON.stringify(details)]);
 }
 function dto(r){return {id:String(r.id),famille:r.famille,sousFamille:r.sous_famille,designation:r.designation,
  marque:r.marque,modele:r.modele,puissanceNominaleW:r.puissance_nominale_w,tensionV:r.tension_v,
  statut:r.statut,sourcePassportId:r.source_public_id?String(r.source_public_id):null,
  nombreAppareils:Number(r.nombre_appareils||0),dateCreation:r.date_creation,dateDecision:r.date_decision};}
 async function list({tenant,actor,siteId}){return use(async c=>{
  const s=await ownSite(c,{tenant,actor,siteId});if(!s)return null;
  const q=await c.query(`SELECT r.*,p.public_id AS source_public_id,
    (SELECT COUNT(*)::int FROM energy_catalog_passport_links l WHERE l.reference_id=r.id) AS nombre_appareils
    FROM energy_catalog_references r LEFT JOIN energy_equipment_passports p ON p.id=r.source_passport_id
    WHERE r.site_id=$1 AND r.tenant_id=$2 AND r.owner_personne_id=$3
    ORDER BY r.date_creation DESC,r.id DESC LIMIT 101`,[s.id,s.tenant_id,actor]);
  return {references:q.rows.slice(0,100).map(dto),listePartielle:q.rows.length>100};
 });}
 async function source({tenant,actor,siteId,passportId}){return use(async c=>{
  const s=await ownSite(c,{tenant,actor,siteId});if(!s)return null;
  const p=await passport(c,s,passportId);if(!p)return null;
  const provenances=await labels(c,s,p);
  const photos=await c.query(`SELECT type_photo,COUNT(*)::int AS n FROM energy_equipment_photos
     WHERE passeport_id=$1 AND tenant_id=$2 AND owner_personne_id=$3 AND date_suppression IS NULL GROUP BY type_photo`,[p.id,s.tenant_id,actor]);
  const linked=await c.query(`SELECT l.reference_id FROM energy_catalog_passport_links l WHERE l.passport_id=$1`,[p.id]);
  return {passportId:String(p.public_id),inventaireId:String(p.inventory_id),famille:p.famille,nom:p.nom,
   valeursDeclarees:provenances,photosDisponibles:Object.fromEntries(photos.rows.map(x=>[x.type_photo,Number(x.n)])),
   modeleAssocie:linked.rows[0]?.reference_id?String(linked.rows[0].reference_id):null};
 });}
 async function create({tenant,actor,siteId,requestKey,data}){return tx(async c=>{
  const s=await ownSite(c,{tenant,actor,siteId});if(!s)return {code:'SITE_INACCESSIBLE'};
  const existing=await c.query(`SELECT id,content_hash FROM energy_catalog_references
    WHERE site_id=$1 AND owner_personne_id=$2 AND request_key=$3::uuid`,[s.id,actor,requestKey]);
  const hash=contentHash(data);
  if(existing.rows.length)return existing.rows[0].content_hash===hash?
   {code:'OK',id:String(existing.rows[0].id),nouvelle:false}:{code:'CLE_REUTILISEE'};
  let sourceId=null;
  if(data.sourcePassportId){const p=await passport(c,s,data.sourcePassportId);
   if(!p)return {code:'PASSEPORT_INACCESSIBLE'};
   if(p.famille!==data.famille)return {code:'FAMILLE_DIVERGENTE'};
   const declared=await labels(c,s,p);if(!matches(declared,data))return {code:'VALEURS_PLAQUE_DIVERGENTES'};
   sourceId=p.id;
  }
  const id=uuid();const q=await c.query(`INSERT INTO energy_catalog_references
    (id,site_id,tenant_id,owner_personne_id,source_passport_id,request_key,content_hash,
     famille,sous_famille,designation,marque,modele,puissance_nominale_w,tension_v,empreinte)
    VALUES($1,$2,$3,$4,$5,$6::uuid,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    ON CONFLICT (site_id,owner_personne_id,request_key) DO NOTHING RETURNING id`,
    [id,s.id,s.tenant_id,actor,sourceId,requestKey,hash,data.famille,data.sousFamille,
     data.designation,data.marque,data.modele,data.puissanceNominaleW,data.tensionV,identity(data)]);
  if(!q.rows.length){const old=await c.query(`SELECT id,content_hash FROM energy_catalog_references WHERE site_id=$1 AND owner_personne_id=$2 AND request_key=$3::uuid`,[s.id,actor,requestKey]);
   return old.rows.length&&old.rows[0].content_hash===hash?{code:'OK',id:String(old.rows[0].id),nouvelle:false}:{code:'CLE_REUTILISEE'};
  }
  await event(c,s,actor,'CatalogueCandidateCreated.v1',id,{famille:data.famille,sourcePasseport:Boolean(sourceId),validation:'NON_VERIFIEE'});
  return {code:'OK',id,nouvelle:true};
 });}
 async function decide({tenant,actor,siteId,refId,decision}){return tx(async c=>{
  const s=await ownSite(c,{tenant,actor,siteId});if(!s)return {code:'SITE_INACCESSIBLE'};
  // Sérialisation des validations concurrentes, en plus de l'unicité SQL partielle.
  await c.query('SELECT id FROM energy_inventory_sites WHERE id=$1 FOR UPDATE',[s.id]);
  const q=await c.query(`SELECT * FROM energy_catalog_references
    WHERE id=$1::uuid AND site_id=$2 AND tenant_id=$3 AND owner_personne_id=$4 FOR UPDATE`,[refId,s.id,s.tenant_id,actor]);
  if(!q.rows.length)return {code:'REFERENCE_INTROUVABLE'};
  const r=q.rows[0];if(r.statut!=='CANDIDATE')return {code:'REFERENCE_DEJA_TRAITEE'};
  if(decision==='REFERENCER'){
   const key=identity({famille:r.famille,sousFamille:r.sous_famille,marque:r.marque,modele:r.modele});
   if(!key)return {code:'IDENTITE_MODELE_INCOMPLETE'};
   const d=await c.query(`SELECT id FROM energy_catalog_references
    WHERE site_id=$1 AND owner_personne_id=$2 AND empreinte=$3 AND statut='REFERENCE_INTERNE' LIMIT 1`,[s.id,actor,key]);
   if(d.rows.length)return {code:'MODELE_DEJA_REFERENCE',id:String(d.rows[0].id)};
   await c.query(`UPDATE energy_catalog_references SET statut='REFERENCE_INTERNE',empreinte=$1,
    date_decision=NOW() WHERE id=$2::uuid`,[key,refId]);
   await event(c,s,actor,'CatalogueReferenceReviewed.v1',refId,{statut:'REFERENCE_INTERNE',certifiee:false});
   return {code:'OK',id:refId,statut:'REFERENCE_INTERNE'};
  }
  await c.query(`UPDATE energy_catalog_references SET statut='REJETEE',date_decision=NOW() WHERE id=$1::uuid`,[refId]);
  await event(c,s,actor,'CatalogueReferenceRejected.v1',refId,{motif:'REVUE_INTERNE_SANS_CERTIFICATION'});
  return {code:'OK',id:refId,statut:'REJETEE'};
 });}
 async function link({tenant,actor,siteId,refId,passportId}){return tx(async c=>{
  const s=await ownSite(c,{tenant,actor,siteId});if(!s)return {code:'SITE_INACCESSIBLE'};
  const r=await c.query(`SELECT id,famille,marque,modele,statut FROM energy_catalog_references
    WHERE id=$1::uuid AND site_id=$2 AND tenant_id=$3 AND owner_personne_id=$4`,[refId,s.id,s.tenant_id,actor]);
  if(!r.rows.length||r.rows[0].statut!=='REFERENCE_INTERNE')return {code:'REFERENCE_NON_VALIDEE'};
  const p=await passport(c,s,passportId);if(!p)return {code:'PASSEPORT_INACCESSIBLE'};
  if(p.famille!==r.rows[0].famille)return {code:'FAMILLE_DIVERGENTE'};
  if(!matches(await labels(c,s,p),r.rows[0]))return {code:'VALEURS_PLAQUE_DIVERGENTES'};
  const ins=await c.query(`INSERT INTO energy_catalog_passport_links
   (passport_id,reference_id,site_id,tenant_id,owner_personne_id) VALUES($1,$2::uuid,$3,$4,$5)
   ON CONFLICT(passport_id) DO NOTHING RETURNING passport_id`,[p.id,refId,s.id,s.tenant_id,actor]);
  if(!ins.rows.length){const existing=await c.query(`SELECT reference_id FROM energy_catalog_passport_links WHERE passport_id=$1`,[p.id]);
   return existing.rows[0]?.reference_id===refId?{code:'OK',nouveau:false}:{code:'PASSEPORT_DEJA_LIE'};}
  await event(c,s,actor,'CataloguePassportLinked.v1',refId,{passeportId:passportId,statut:'ASSOCIATION_DECLAREE'});
  return {code:'OK',nouveau:true};
 });}
 return {list,source,create,decide,link};
}
module.exports={creerEnergyCatalogueStore};
