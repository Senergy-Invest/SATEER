'use strict';
const crypto=require('node:crypto');
const {parentAdmis}=require('./energy-inventory-domain');
const hash=o=>crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex');
const uuid=()=>crypto.randomUUID();
function creerEnergyInventoryStore({obtenirClient}){
 if(typeof obtenirClient!=='function')throw new TypeError('CLIENT_POSTGRES_REQUIS');
 async function withClient(fn){const c=await obtenirClient();try{return await fn(c);}finally{c.release();}}
 async function withTx(fn){return withClient(async c=>{let begun=false;try{
   await c.query('BEGIN');begun=true;const result=await fn(c);await c.query('COMMIT');begun=false;return result;
  }catch(e){if(begun)try{await c.query('ROLLBACK');}catch(_){}throw e;}});}
 async function siteScope(c,{tenant,owner,siteId}){
  const q=await c.query(`SELECT s.id,s.public_id,s.tenant_id,s.owner_personne_id,s.nom,s.pays,s.type_site,
    ec.public_id AS case_public_id FROM energy_inventory_sites s
    JOIN tenants t ON t.id=s.tenant_id AND t.actif=TRUE
    JOIN energy_cases ec ON ec.id=s.energy_case_id
    WHERE t.code=$1 AND s.owner_personne_id=$2 AND s.public_id=$3::uuid LIMIT 1`,[tenant,owner,siteId]);
  return q.rows[0]||null;
 }
 function projectSite(r){return {id:String(r.public_id),energyCaseId:String(r.case_public_id),nom:r.nom,pays:r.pays,typeSite:r.type_site};}
 function projectZone(r){return {id:String(r.public_id),parentId:r.parent_public_id==null?null:String(r.parent_public_id),nom:r.nom,typeZone:r.type_zone,provenance:r.provenance};}
 function projectEq(r){return {id:String(r.public_id),zoneId:String(r.zone_public_id),nom:r.nom,famille:r.famille,quantite:r.quantite,puissanceUnitaireW:r.puissance_unitaire_w,provenance:r.provenance};}
 async function enregistrer(c,site,actor,type,entity,payload){
  await c.query(`INSERT INTO energy_inventory_events(site_id,tenant_id,actor_personne_id,entity_public_id,event_type,payload)
     VALUES ($1,$2,$3,$4::uuid,$5,$6::jsonb)`,[site.id,site.tenant_id,actor,entity,type,JSON.stringify(payload)]);
 }
 async function creerSite({tenant,owner,energyCaseId}){return withTx(async c=>{
  const {rows:cases}=await c.query(`SELECT ec.id,ec.nom_site,ec.pays,ec.type_site,ec.tenant_id,ec.owner_personne_id
   FROM energy_cases ec JOIN tenants t ON t.id=ec.tenant_id AND t.actif=TRUE
   WHERE t.code=$1 AND ec.owner_personne_id=$2 AND ec.public_id=$3::uuid LIMIT 1`,[tenant,owner,energyCaseId]);
  if(cases.length!==1)return {code:'DOSSIER_INACCESSIBLE'};
  const d=cases[0];const {rows:r}=await c.query(`INSERT INTO energy_inventory_sites
   (public_id,tenant_id,owner_personne_id,energy_case_id,nom,pays,type_site)
   VALUES ($1,$2,$3,$4,$5,$6,$7)
   ON CONFLICT(energy_case_id) DO NOTHING RETURNING id,public_id,tenant_id,nom,pays,type_site`,
    [uuid(),d.tenant_id,owner,d.id,d.nom_site,d.pays,d.type_site]);
  const fresh=r.length===1;let row=r[0];
  if(!row){const {rows:existing}=await c.query(`SELECT s.id,s.public_id,s.tenant_id,s.nom,s.pays,s.type_site
    FROM energy_inventory_sites s WHERE s.energy_case_id=$1 AND s.tenant_id=$2 AND s.owner_personne_id=$3 LIMIT 1`,[d.id,d.tenant_id,owner]);
    if(existing.length!==1)return {code:'INVENTAIRE_CONFLIT'};row=existing[0];}
  if(fresh)await enregistrer(c,row,owner,'InventorySiteCreated.v1',row.public_id,{source:'ENERGY_CASE',energyCaseId});
  return {code:'OK',nouveau:fresh,site:{id:String(row.public_id),energyCaseId,nom:row.nom,pays:row.pays,typeSite:row.type_site}};
 });}
 async function listerSites({tenant,owner}){return withClient(async c=>{
  const {rows}=await c.query(`SELECT s.public_id,s.nom,s.pays,s.type_site,ec.public_id AS case_public_id
   FROM energy_inventory_sites s JOIN tenants t ON t.id=s.tenant_id AND t.actif=TRUE
   JOIN energy_cases ec ON ec.id=s.energy_case_id
   WHERE t.code=$1 AND s.owner_personne_id=$2 ORDER BY s.date_creation DESC,s.id DESC LIMIT 51`,[tenant,owner]);
  return {sites:rows.slice(0,50).map(projectSite),autresDisponibles:rows.length>50};
 });}
 async function obtenirSite({tenant,owner,siteId}){return withClient(async c=>{
  const site=await siteScope(c,{tenant,owner,siteId});if(!site)return null;
  const {rows:zones}=await c.query(`SELECT z.public_id,z.type_zone,z.nom,z.provenance,p.public_id AS parent_public_id
     FROM energy_inventory_zones z LEFT JOIN energy_inventory_zones p ON p.id=z.parent_id
     WHERE z.site_id=$1 AND z.tenant_id=$2 AND z.owner_personne_id=$3 ORDER BY z.id LIMIT 501`,[site.id,site.tenant_id,owner]);
  const {rows:items}=await c.query(`SELECT e.public_id,e.nom,e.famille,e.quantite,e.puissance_unitaire_w,e.provenance,z.public_id AS zone_public_id
     FROM energy_inventory_equipements e JOIN energy_inventory_zones z ON z.id=e.zone_id
     WHERE e.site_id=$1 AND e.tenant_id=$2 AND e.owner_personne_id=$3 ORDER BY e.id LIMIT 501`,[site.id,site.tenant_id,owner]);
  return {site:projectSite(site),zones:zones.slice(0,500).map(projectZone),equipements:items.slice(0,500).map(projectEq),
    listePartielle:zones.length>500||items.length>500};
 });}
 async function creerZone({tenant,owner,siteId,requestKey,saisie}){return withTx(async c=>{
  const site=await siteScope(c,{tenant,owner,siteId});if(!site)return {code:'SITE_INACCESSIBLE'};
  let parentId=null;
  if(saisie.parentId!==null){const {rows:parents}=await c.query(`SELECT id,type_zone FROM energy_inventory_zones
   WHERE public_id=$1::uuid AND site_id=$2 AND tenant_id=$3 AND owner_personne_id=$4 LIMIT 1`,
    [saisie.parentId,site.id,site.tenant_id,owner]);
   if(parents.length!==1)return {code:'PARENT_INVALIDE'};
   if(!parentAdmis(saisie.typeZone,parents[0].type_zone))return {code:'HIERARCHIE_INVALIDE'};
   parentId=parents[0].id;
  }
  const digest=hash(saisie);
  const {rows:newRows}=await c.query(`INSERT INTO energy_inventory_zones
   (public_id,site_id,tenant_id,owner_personne_id,parent_id,request_key,content_hash,type_zone,nom)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
   ON CONFLICT(site_id,owner_personne_id,request_key) DO NOTHING
   RETURNING public_id`,[uuid(),site.id,site.tenant_id,owner,parentId,requestKey,digest,saisie.typeZone,saisie.nom]);
  let row=newRows[0],nouveau=!!row;
  if(!row){const {rows:existing}=await c.query(`SELECT public_id,content_hash FROM energy_inventory_zones
   WHERE site_id=$1 AND owner_personne_id=$2 AND request_key=$3`,[site.id,owner,requestKey]);
   if(existing.length!==1||existing[0].content_hash!==digest)return {code:'CLE_REUTILISEE_POUR_AUTRE_SAISIE'};
   row=existing[0];}
  if(nouveau)await enregistrer(c,site,owner,'InventoryZoneDeclared.v1',row.public_id,
   {typeZone:saisie.typeZone,nom:saisie.nom,parentId:saisie.parentId,provenance:'DECLAREE'});
  return {code:'OK',nouveau,id:String(row.public_id)};
 });}
 async function creerEquipement({tenant,owner,siteId,requestKey,saisie}){return withTx(async c=>{
  const site=await siteScope(c,{tenant,owner,siteId});if(!site)return {code:'SITE_INACCESSIBLE'};
  const {rows:zones}=await c.query(`SELECT id FROM energy_inventory_zones
   WHERE public_id=$1::uuid AND site_id=$2 AND tenant_id=$3 AND owner_personne_id=$4 LIMIT 1`,
   [saisie.zoneId,site.id,site.tenant_id,owner]);
  if(zones.length!==1)return {code:'ZONE_INVALIDE'};
  const digest=hash(saisie);
  const {rows:newRows}=await c.query(`INSERT INTO energy_inventory_equipements
   (public_id,site_id,zone_id,tenant_id,owner_personne_id,request_key,content_hash,nom,famille,quantite,puissance_unitaire_w)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
   ON CONFLICT(site_id,owner_personne_id,request_key) DO NOTHING RETURNING public_id`,
   [uuid(),site.id,zones[0].id,site.tenant_id,owner,requestKey,digest,saisie.nom,saisie.famille,saisie.quantite,saisie.puissanceUnitaireW]);
  let row=newRows[0],nouveau=!!row;
  if(!row){const {rows:existing}=await c.query(`SELECT public_id,content_hash FROM energy_inventory_equipements
    WHERE site_id=$1 AND owner_personne_id=$2 AND request_key=$3`,[site.id,owner,requestKey]);
   if(existing.length!==1||existing[0].content_hash!==digest)return {code:'CLE_REUTILISEE_POUR_AUTRE_SAISIE'};
   row=existing[0];}
  if(nouveau)await enregistrer(c,site,owner,'InventoryEquipmentDeclared.v1',row.public_id,
   {zoneId:saisie.zoneId,famille:saisie.famille,quantite:saisie.quantite,puissanceUnitaireW:saisie.puissanceUnitaireW,provenance:'DECLAREE'});
  return {code:'OK',nouveau,id:String(row.public_id)};
 });}
 return {creerSite,listerSites,obtenirSite,creerZone,creerEquipement};
}
module.exports={creerEnergyInventoryStore};
