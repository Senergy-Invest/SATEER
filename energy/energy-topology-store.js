'use strict';
/** C4A : propriétaire Core seulement, carte physique C1, machines 051, réseau électrique déclaré.
 * Ni B1, ni OCR, ni passeports, ni photos/QR, ni estimation de consommations.
 */
const crypto=require('node:crypto');
const id=()=>crypto.randomUUID();
const hash=o=>crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex');
function creerEnergyTopologyStore({obtenirClient}){
 if(typeof obtenirClient!=='function')throw TypeError('POSTGRES_CLIENT_REQUIS');
 async function using(fn){const c=await obtenirClient();try{return await fn(c);}finally{c.release();}}
 async function tx(fn){return using(async c=>{let open=false;try{await c.query('BEGIN');open=true;const r=await fn(c);await c.query('COMMIT');open=false;return r;}catch(e){if(open)await c.query('ROLLBACK').catch(()=>{});throw e;}});}
 async function site(c,{tenant,actor,siteId},lock=false){
  const r=await c.query(`SELECT s.id,s.public_id,s.tenant_id,s.owner_personne_id,s.nom,s.type_site
   FROM energy_inventory_sites s JOIN tenants t ON t.id=s.tenant_id AND t.actif=TRUE
   WHERE t.code=$1 AND s.public_id=$2::uuid AND s.owner_personne_id=$3
   LIMIT 1 ${lock?'FOR UPDATE OF s':''}`,[tenant,siteId,actor]);return r.rows[0]||null;
 }
 async function event(c,s,actor,action,entityId,details={}){
  await c.query(`INSERT INTO energy_topology_events(site_id,tenant_id,owner_personne_id,acteur_personne_id,action,entity_id,details)
    VALUES($1,$2,$3,$4,$5,$6::uuid,$7::jsonb)`,[s.id,s.tenant_id,s.owner_personne_id,actor,action,entityId,JSON.stringify(details)]);
 }
 async function sites({tenant,actor}){return using(async c=>{
  const r=await c.query(`SELECT s.public_id,s.nom,s.type_site FROM energy_inventory_sites s
    JOIN tenants t ON t.id=s.tenant_id AND t.actif=TRUE WHERE t.code=$1 AND s.owner_personne_id=$2
    ORDER BY s.id LIMIT 101`,[tenant,actor]);
  return {sites:r.rows.slice(0,100).map(x=>({id:String(x.public_id),nom:x.nom,typeSite:x.type_site})),listePartielle:r.rows.length>100};
 });}
 const page=(r,fn)=>({items:r.rows.slice(0,100).map(fn),partiel:r.rows.length>100});
 async function carte({tenant,actor,siteId,offset}){return using(async c=>{
  const s=await site(c,{tenant,actor,siteId});if(!s)return null;
  const [physical,assets,links,equipments,usages]=await Promise.all([
   c.query(`SELECT id,parent_id,nom,type_noeud FROM energy_scope_nodes WHERE site_id=$1 AND tenant_id=$2
     AND owner_personne_id=$3 ORDER BY date_creation,id LIMIT 101 OFFSET $4`,[s.id,s.tenant_id,s.owner_personne_id,offset]),
   c.query(`SELECT id,nom,type_noeud,repere,scope_node_id,fiabilite FROM energy_topology_assets
     WHERE site_id=$1 AND tenant_id=$2 AND owner_personne_id=$3 ORDER BY date_creation,id LIMIT 101 OFFSET $4`,[s.id,s.tenant_id,s.owner_personne_id,offset]),
   c.query(`SELECT l.id,l.source_asset_id,l.target_asset_id,l.target_scope_node_id,l.type_lien,l.actif,l.fiabilite,e.public_id AS equipment_public_id
     FROM energy_topology_links l LEFT JOIN energy_inventory_equipements e ON e.id=l.target_equipment_id
     AND e.site_id=l.site_id AND e.tenant_id=l.tenant_id AND e.owner_personne_id=l.owner_personne_id
     WHERE l.site_id=$1 AND l.tenant_id=$2 AND l.owner_personne_id=$3
     ORDER BY l.date_creation,l.id LIMIT 101 OFFSET $4`,[s.id,s.tenant_id,s.owner_personne_id,offset]),
   c.query(`SELECT e.public_id,e.nom,e.famille,z.nom AS zone_nom,loc.scope_node_id
     FROM energy_inventory_equipements e JOIN energy_inventory_zones z ON z.id=e.zone_id
     LEFT JOIN energy_scope_equipment_locations loc ON loc.equipment_id=e.id AND loc.site_id=e.site_id
     WHERE e.site_id=$1 AND e.tenant_id=$2 AND e.owner_personne_id=$3
     ORDER BY e.id LIMIT 101 OFFSET $4`,[s.id,s.tenant_id,s.owner_personne_id,offset]),
   c.query(`SELECT u.id,e.public_id AS equipment_public_id,u.usage,u.commentaire FROM energy_topology_usages u
     JOIN energy_inventory_equipements e ON e.id=u.equipment_id AND e.site_id=u.site_id
     WHERE u.site_id=$1 AND u.tenant_id=$2 AND u.owner_personne_id=$3
     ORDER BY u.date_creation,u.id LIMIT 101 OFFSET $4`,[s.id,s.tenant_id,s.owner_personne_id,offset])
  ]);
  const ps=page(physical,x=>({id:String(x.id),parentId:x.parent_id?String(x.parent_id):null,nom:x.nom,type:x.type_noeud}));
  const ea=page(assets,x=>({id:String(x.id),nom:x.nom,type:x.type_noeud,repere:x.repere,scopeNodeId:x.scope_node_id?String(x.scope_node_id):null,fiabilite:x.fiabilite}));
  const li=page(links,x=>({id:String(x.id),sourceAssetId:String(x.source_asset_id),targetAssetId:x.target_asset_id?String(x.target_asset_id):null,targetScopeNodeId:x.target_scope_node_id?String(x.target_scope_node_id):null,targetEquipmentId:x.equipment_public_id?String(x.equipment_public_id):null,typeLien:x.type_lien,actif:x.actif,fiabilite:x.fiabilite}));
  const eq=page(equipments,x=>({id:String(x.public_id),nom:x.nom,famille:x.famille,zone:x.zone_nom,scopeNodeId:x.scope_node_id?String(x.scope_node_id):null}));
  const us=page(usages,x=>({id:String(x.id),equipmentId:String(x.equipment_public_id),usage:x.usage,commentaire:x.commentaire}));
  return {site:{id:String(s.public_id),nom:s.nom,typeSite:s.type_site},offset,limite:100,
   lieux:ps.items,appareillages:ea.items,liens:li.items,equipements:eq.items,usages:us.items,
   suivant:ps.partiel||ea.partiel||li.partiel||eq.partiel||us.partiel,
   statuts:{lu:'DECLARE_A_VERIFIER',verification:'HORS_PERIMETRE_C4A'}};
 });}
 async function newAsset({tenant,actor,siteId,requestKey,data}){return tx(async c=>{
  const s=await site(c,{tenant,actor,siteId},true);if(!s)return {code:'SITE_NON_AUTORISE'};
  if(data.scopeNodeId){const scope=await c.query(`SELECT 1 FROM energy_scope_nodes WHERE id=$1::uuid AND site_id=$2 AND tenant_id=$3 AND owner_personne_id=$4`,
   [data.scopeNodeId,s.id,s.tenant_id,s.owner_personne_id]);if(!scope.rows.length)return {code:'LIEU_NON_AUTORISE'};}
  const newId=id(),digest=hash(data);
  const r=await c.query(`INSERT INTO energy_topology_assets
    (id,site_id,tenant_id,owner_personne_id,type_noeud,nom,repere,scope_node_id,request_key,content_hash,auteur_personne_id)
    VALUES($1::uuid,$2,$3,$4,$5,$6,$7,$8::uuid,$9::uuid,$10,$11)
    ON CONFLICT DO NOTHING RETURNING id`,[newId,s.id,s.tenant_id,s.owner_personne_id,data.typeNoeud,data.nom,data.repere,data.scopeNodeId,requestKey,digest,actor]);
  if(!r.rows.length){const old=await c.query(`SELECT id,content_hash FROM energy_topology_assets WHERE site_id=$1 AND owner_personne_id=$2 AND request_key=$3::uuid`,[s.id,actor,requestKey]);
   return old.rows.length&&old.rows[0].content_hash===digest?{code:'OK',id:String(old.rows[0].id),nouveau:false}:{code:'CLE_REUTILISEE'};}
  await event(c,s,actor,'TopologyAssetCreated.v1',newId,{type:data.typeNoeud,lieu:data.scopeNodeId});
  return {code:'OK',id:newId,nouveau:true};
 });}
 async function newLink({tenant,actor,siteId,requestKey,data}){try{return await tx(async c=>{
  const s=await site(c,{tenant,actor,siteId},true);if(!s)return {code:'SITE_NON_AUTORISE'};
  const source=await c.query(`SELECT type_noeud FROM energy_topology_assets WHERE id=$1::uuid AND site_id=$2
   AND tenant_id=$3 AND owner_personne_id=$4`,[data.sourceAssetId,s.id,s.tenant_id,s.owner_personne_id]);
  if(!source.rows.length)return {code:'SOURCE_NON_AUTORISEE'};
  if(data.typeLien==='MESURE'&&source.rows[0].type_noeud!=='COMPTEUR')return {code:'COMPTEUR_REQUIS'};
  if(data.typeLien==='DESSERT'&&!['SOURCE','TABLEAU','CIRCUIT','DEPART'].includes(source.rows[0].type_noeud))return {code:'TABLEAU_REQUIS'};
  let targetId=null;
  if(data.targetAssetId){const r=await c.query(`SELECT id FROM energy_topology_assets WHERE id=$1::uuid AND site_id=$2
    AND tenant_id=$3 AND owner_personne_id=$4`,[data.targetAssetId,s.id,s.tenant_id,s.owner_personne_id]);if(!r.rows.length)return {code:'CIBLE_NON_AUTORISEE'};targetId=r.rows[0].id;}
  if(data.targetScopeNodeId){const r=await c.query(`SELECT id FROM energy_scope_nodes WHERE id=$1::uuid AND site_id=$2
    AND tenant_id=$3 AND owner_personne_id=$4`,[data.targetScopeNodeId,s.id,s.tenant_id,s.owner_personne_id]);if(!r.rows.length)return {code:'CIBLE_NON_AUTORISEE'};targetId=r.rows[0].id;}
  if(data.targetEquipmentId){const r=await c.query(`SELECT id FROM energy_inventory_equipements WHERE public_id=$1::uuid AND site_id=$2
    AND tenant_id=$3 AND owner_personne_id=$4`,[data.targetEquipmentId,s.id,s.tenant_id,s.owner_personne_id]);if(!r.rows.length)return {code:'CIBLE_NON_AUTORISEE'};targetId=r.rows[0].id;}
  // Saisie serialisee par site : deux responsables ne peuvent créer des cycles simultanément.
  // Le trigger PostgreSQL 059 interdit aussi les cycles même hors cette API.
  const newId=id(),digest=hash(data);
  const r=await c.query(`INSERT INTO energy_topology_links(id,site_id,tenant_id,owner_personne_id,
   source_asset_id,target_asset_id,target_scope_node_id,target_equipment_id,type_lien,request_key,content_hash,auteur_personne_id)
   VALUES($1::uuid,$2,$3,$4,$5::uuid,$6::uuid,$7::uuid,$8,$9,$10::uuid,$11,$12)
   ON CONFLICT DO NOTHING RETURNING id`,[newId,s.id,s.tenant_id,s.owner_personne_id,data.sourceAssetId,
     data.targetAssetId,data.targetScopeNodeId,data.targetEquipmentId?targetId:null,data.typeLien,requestKey,digest,actor]);
   if(!r.rows.length){const old=await c.query(`SELECT id,content_hash FROM energy_topology_links WHERE site_id=$1 AND owner_personne_id=$2 AND request_key=$3::uuid`,[s.id,actor,requestKey]);
    return old.rows.length&&old.rows[0].content_hash===digest?{code:'OK',id:String(old.rows[0].id),nouveau:false}:{code:'LIEN_DEJA_EXISTANT_OU_CLE_REUTILISEE'};}
   await event(c,s,actor,'TopologyLinkDeclared.v1',newId,{source:data.sourceAssetId,cible:targetId,type:data.typeLien,verification:'A_VERIFIER'});
   return {code:'OK',id:newId,nouveau:true};
 });}catch(e){if(String(e.message).includes('ENERGY_C4A_BOUCLE_ALIMENTATION'))return {code:'BOUCLE_ALIMENTATION_REFUSEE'};throw e;}}
 async function newUsage({tenant,actor,siteId,requestKey,data}){return tx(async c=>{
  const s=await site(c,{tenant,actor,siteId},true);if(!s)return {code:'SITE_NON_AUTORISE'};
  const eq=await c.query(`SELECT id FROM energy_inventory_equipements WHERE public_id=$1::uuid AND site_id=$2
    AND tenant_id=$3 AND owner_personne_id=$4`,[data.equipmentId,s.id,s.tenant_id,s.owner_personne_id]);
  if(!eq.rows.length)return {code:'EQUIPEMENT_NON_AUTORISE'};
  const newId=id(),digest=hash(data);
  const r=await c.query(`INSERT INTO energy_topology_usages(id,site_id,tenant_id,owner_personne_id,equipment_id,usage,commentaire,request_key,content_hash,auteur_personne_id)
     VALUES($1::uuid,$2,$3,$4,$5,$6,$7,$8::uuid,$9,$10) ON CONFLICT DO NOTHING RETURNING id`,
    [newId,s.id,s.tenant_id,s.owner_personne_id,eq.rows[0].id,data.usage,data.commentaire,requestKey,digest,actor]);
  if(!r.rows.length){const old=await c.query(`SELECT id,content_hash FROM energy_topology_usages WHERE site_id=$1 AND owner_personne_id=$2 AND request_key=$3::uuid`,[s.id,actor,requestKey]);
   return old.rows.length&&old.rows[0].content_hash===digest?{code:'OK',id:String(old.rows[0].id),nouveau:false}:{code:'USAGE_DEJA_DECLARE_OU_CLE_REUTILISEE'};}
  await event(c,s,actor,'TopologyUsageDeclared.v1',newId,{equipment:data.equipmentId,usage:data.usage});
  return {code:'OK',id:newId,nouveau:true};
 });}
 async function withdraw({tenant,actor,siteId,linkId}){return tx(async c=>{
  const s=await site(c,{tenant,actor,siteId},true);if(!s)return {code:'SITE_NON_AUTORISE'};
  const r=await c.query(`SELECT id,actif FROM energy_topology_links WHERE id=$1::uuid AND site_id=$2
    AND tenant_id=$3 AND owner_personne_id=$4 FOR UPDATE`,[linkId,s.id,s.tenant_id,s.owner_personne_id]);
  if(!r.rows.length)return {code:'LIEN_NON_AUTORISE'};
  if(!r.rows[0].actif)return {code:'LIEN_DEJA_RETIRE'};
  await c.query(`UPDATE energy_topology_links SET actif=FALSE,date_retrait=NOW(),retire_par=$2 WHERE id=$1::uuid`,[linkId,actor]);
  await event(c,s,actor,'TopologyLinkWithdrawn.v1',linkId,{origine:'CORRECTION_MANUELLE'});
  return {code:'OK',retire:true};
 });}
 return {sites,carte,newAsset,newLink,newUsage,withdraw};
}
module.exports={creerEnergyTopologyStore};
