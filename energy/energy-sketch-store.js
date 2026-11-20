'use strict';
/** C4B: coordonnées dessin privées. Ni droits C1, ni topology C4A, ni identités d'appareils modifiés. */
const crypto=require('node:crypto');const {UUID}=require('./energy-case-domain');
const uid=()=>crypto.randomUUID();const hash=d=>crypto.createHash('sha256').update(JSON.stringify(d)).digest('hex');
function creerEnergySketchStore({obtenirClient}){
 if(typeof obtenirClient!=='function')throw TypeError('POSTGRES_CLIENT_REQUIS');
 async function using(fn){const c=await obtenirClient();try{return await fn(c);}finally{c.release();}}
 async function transaction(fn){return using(async c=>{let begun=false;try{await c.query('BEGIN');begun=true;const r=await fn(c);await c.query('COMMIT');begun=false;return r;}catch(e){if(begun)await c.query('ROLLBACK').catch(()=>{});throw e;}});}
 async function site(c,tenant,actor,siteId,lock=false){const q=await c.query(`SELECT s.id,s.public_id,s.tenant_id,s.owner_personne_id FROM energy_inventory_sites s JOIN tenants t ON t.id=s.tenant_id AND t.actif=TRUE
   WHERE t.code=$1 AND s.public_id=$2::uuid AND s.owner_personne_id=$3 LIMIT 1 ${lock?'FOR UPDATE OF s':''}`,[tenant,siteId,actor]);return q.rows[0]||null;}
 async function resolve(c,s,data){
  const names={LIEU:['energy_scope_nodes','id'],ELECTRIQUE:['energy_topology_assets','id'],EQUIPEMENT:['energy_inventory_equipements','public_id']};const [table,col]=names[data.type];
  const r=await c.query(`SELECT id FROM ${table} WHERE ${col}=$1::uuid AND site_id=$2 AND tenant_id=$3 AND owner_personne_id=$4 LIMIT 1`,[data.refId,s.id,s.tenant_id,s.owner_personne_id]);
  return r.rows[0]?.id??null;
 }
 function field(type){return {LIEU:'scope_node_id',ELECTRIQUE:'asset_id',EQUIPEMENT:'equipment_id'}[type];}
 async function list({tenant,actor,siteId,vue,offset}){return using(async c=>{
  const s=await site(c,tenant,actor,siteId);if(!s)return null;
  const q=await c.query(`SELECT p.id,p.vue,p.x,p.y,p.revision,p.scope_node_id,p.asset_id,e.public_id AS equipment_public_id
   FROM energy_sketch_positions p LEFT JOIN energy_inventory_equipements e ON e.id=p.equipment_id AND e.site_id=p.site_id
   WHERE p.site_id=$1 AND p.tenant_id=$2 AND p.owner_personne_id=$3 AND p.vue=$4
   ORDER BY p.id LIMIT 101 OFFSET $5`,[s.id,s.tenant_id,s.owner_personne_id,vue,offset]);
  return {positions:q.rows.slice(0,100).map(p=>({id:String(p.id),vue:p.vue,x:p.x,y:p.y,revision:p.revision,
   type:p.scope_node_id?'LIEU':p.asset_id?'ELECTRIQUE':'EQUIPEMENT',refId:String(p.scope_node_id||p.asset_id||p.equipment_public_id)})),suivant:q.rows.length>100};
 });}
 async function save({tenant,actor,siteId,requestKey,data}){return transaction(async c=>{
  const s=await site(c,tenant,actor,siteId,true);if(!s)return {code:'SITE_NON_AUTORISE'};
  const digest=hash(data);const prior=await c.query(`SELECT position_id,revision,content_hash FROM energy_sketch_events
   WHERE site_id=$1 AND owner_personne_id=$2 AND request_key=$3::uuid`,[s.id,s.owner_personne_id,requestKey]);
  if(prior.rows.length){const old=prior.rows[0];return old.content_hash===digest?{code:'OK',id:String(old.position_id),revision:Number(old.revision),nouvelle:false}:{code:'CLE_DE_REQUETE_REUTILISEE'};}
  const target=await resolve(c,s,data);if(target===null)return {code:'ELEMENT_NON_AUTORISE'};
  const f=field(data.type);
  const q=await c.query(`SELECT id,x,y,revision FROM energy_sketch_positions WHERE site_id=$1 AND vue=$2 AND ${f}=$3 LIMIT 1 FOR UPDATE`,[s.id,data.vue,target]);
  let id,newRev;
  if(q.rows.length){const old=q.rows[0];if(Number(old.revision)!==data.expectedRevision)return {code:'VERSION_OBSOLETE'};
   if(Number(old.x)===data.x&&Number(old.y)===data.y)return {code:'OK',id:String(old.id),revision:Number(old.revision),nouvelle:false};
   id=old.id;newRev=Number(old.revision)+1;
   await c.query('UPDATE energy_sketch_positions SET x=$1,y=$2,revision=$3,updated_by=$4,date_modification=NOW() WHERE id=$5',[data.x,data.y,newRev,actor,id]);
  }else{
   if(data.expectedRevision!==0)return {code:'VERSION_OBSOLETE'};
   id=uid();newRev=1;
   const fields=['scope_node_id','asset_id','equipment_id'];const vals=fields.map(k=>k===f?target:null);
   await c.query(`INSERT INTO energy_sketch_positions
    (id,site_id,tenant_id,owner_personne_id,vue,scope_node_id,asset_id,equipment_id,x,y,revision,updated_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1,$11)`,[id,s.id,s.tenant_id,s.owner_personne_id,data.vue,...vals,data.x,data.y,actor]);
  }
  await c.query(`INSERT INTO energy_sketch_events
   (site_id,tenant_id,owner_personne_id,acteur_personne_id,position_id,vue,request_key,content_hash,revision,x,y)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[s.id,s.tenant_id,s.owner_personne_id,actor,id,data.vue,requestKey,digest,newRev,data.x,data.y]);
  return {code:'OK',id:String(id),revision:newRev,nouvelle:true};
 });}
 return {list,save};
}
module.exports={creerEnergySketchStore};
