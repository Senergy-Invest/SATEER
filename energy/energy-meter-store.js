'use strict';
/** E-METER-1A : point != appareil != registre != relevé. Site possédé uniquement. */
const crypto=require('node:crypto');
const uuid=()=>crypto.randomUUID();
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function creerEnergyMeterStore({obtenirClient}){
 if(typeof obtenirClient!=='function')throw TypeError('POSTGRES_CLIENT_REQUIS');
 async function using(fn){const c=await obtenirClient();try{return await fn(c);}finally{c.release();}}
 async function tx(fn){return using(async c=>{let opened=false;try{await c.query('BEGIN');opened=true;const out=await fn(c);await c.query('COMMIT');opened=false;return out;}catch(e){if(opened)await c.query('ROLLBACK').catch(()=>{});throw e;}});}
 async function site(c,{tenant,actor,siteId},lock=false){
  const r=await c.query(`SELECT s.id,s.public_id,s.nom,s.pays,s.tenant_id,s.owner_personne_id
    FROM energy_inventory_sites s JOIN tenants t ON t.id=s.tenant_id AND t.actif=TRUE
    WHERE t.code=$1 AND s.public_id=$2::uuid AND s.owner_personne_id=$3
    LIMIT 1 ${lock?'FOR UPDATE OF s':''}`,[tenant,siteId,actor]);
  return r.rows[0]||null;
 }
 const params=s=>[s.id,s.tenant_id,s.owner_personne_id];
 async function point(c,s,pointId){const r=await c.query(`SELECT * FROM energy_meter_points
  WHERE id=$1::uuid AND site_id=$2 AND tenant_id=$3 AND owner_personne_id=$4`,[pointId,...params(s)]);return r.rows[0]||null;}
 async function meter(c,s,meterId){const r=await c.query(`SELECT d.* FROM energy_meter_devices d
  WHERE d.id=$1::uuid AND d.site_id=$2 AND d.tenant_id=$3 AND d.owner_personne_id=$4`,[meterId,...params(s)]);return r.rows[0]||null;}
 async function register(c,s,id){const r=await c.query(`SELECT r.*,d.actif FROM energy_meter_registers r
  JOIN energy_meter_devices d ON d.id=r.meter_id AND d.point_id=r.point_id
   AND d.site_id=r.site_id AND d.tenant_id=r.tenant_id AND d.owner_personne_id=r.owner_personne_id
  WHERE r.id=$1::uuid AND r.site_id=$2 AND r.tenant_id=$3 AND r.owner_personne_id=$4`,[id,...params(s)]);return r.rows[0]||null;}
 async function event(c,s,actor,action,entityId,details={}){
  await c.query(`INSERT INTO energy_meter_events(site_id,tenant_id,owner_personne_id,acteur_personne_id,action,entity_id,details)
    VALUES($1,$2,$3,$4,$5,$6::uuid,$7::jsonb)`,[...params(s),actor,action,entityId,JSON.stringify(details)]);
 }
 function replay(r,d){return r.rows.length?(r.rows[0].content_hash===d?{code:'OK',id:String(r.rows[0].id),nouveau:false}:{code:'CLE_REUTILISEE'}):null;}
 async function sites({tenant,actor}){return using(async c=>{
  const r=await c.query(`SELECT s.public_id,s.nom,s.pays FROM energy_inventory_sites s
   JOIN tenants t ON t.id=s.tenant_id AND t.actif=TRUE WHERE t.code=$1 AND s.owner_personne_id=$2
   ORDER BY s.id LIMIT 51`,[tenant,actor]);
  return {sites:r.rows.slice(0,50).map(x=>({id:String(x.public_id),nom:x.nom,pays:x.pays})),suivant:r.rows.length>50};
 });}
 async function creerPoint({tenant,actor,siteId,requestKey,data}){return tx(async c=>{
  const s=await site(c,{tenant,actor,siteId},true);if(!s)return {code:'SITE_NON_AUTORISE'};
  const hash=digest(data),id=uuid();
  const r=await c.query(`INSERT INTO energy_meter_points(id,site_id,tenant_id,owner_personne_id,nom,energie,type_point,request_key,content_hash)
   VALUES($1::uuid,$2,$3,$4,$5,$6,$7,$8::uuid,$9) ON CONFLICT DO NOTHING RETURNING id`,
   [id,...params(s),data.nom,data.energie,data.typePoint,requestKey,hash]);
  if(!r.rows.length){const old=await c.query(`SELECT id,content_hash FROM energy_meter_points WHERE site_id=$1 AND owner_personne_id=$2 AND request_key=$3::uuid`,[s.id,s.owner_personne_id,requestKey]);return replay(old,hash)||{code:'CONFLIT_POINT'};}
  await event(c,s,actor,'MeterPointDeclared.v1',id,{type:data.typePoint,energie:data.energie});return {code:'OK',id,nouveau:true};
 });}
 async function creerCompteur({tenant,actor,siteId,pointId,requestKey,data}){return tx(async c=>{
  const s=await site(c,{tenant,actor,siteId},true);if(!s)return {code:'SITE_NON_AUTORISE'};
  const p=await point(c,s,pointId);if(!p)return {code:'POINT_NON_AUTORISE'};
  const hash=digest({pointId,...data});const old=await c.query(`SELECT id,content_hash FROM energy_meter_devices WHERE site_id=$1 AND owner_personne_id=$2 AND request_key=$3::uuid`,[s.id,s.owner_personne_id,requestKey]);
  if(old.rows.length){const v=replay(old,hash);if(v.code==='OK'){const rr=await c.query('SELECT id FROM energy_meter_registers WHERE meter_id=$1::uuid AND code=$2',[v.id,data.registreCode]);return {...v,registreId:rr.rows[0]?.id||null};}return v;}
  const active=await c.query('SELECT 1 FROM energy_meter_devices WHERE point_id=$1::uuid AND actif=TRUE',[pointId]);
  if(active.rows.length)return {code:'POINT_DEJA_EQUIPE'};
  const id=uuid(),registreId=uuid();
  const r=await c.query(`INSERT INTO energy_meter_devices(id,point_id,site_id,tenant_id,owner_personne_id,nom,technologie,mode_commercial,numero_serie,request_key,content_hash)
   VALUES($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10::uuid,$11) ON CONFLICT DO NOTHING RETURNING id`,
   [id,pointId,...params(s),data.nom,data.technologie,data.modeCommercial,data.numeroSerie,requestKey,hash]);
  if(!r.rows.length)return {code:'CONFLIT_COMPTEUR'};
  await c.query(`INSERT INTO energy_meter_registers(id,meter_id,point_id,site_id,tenant_id,owner_personne_id,code,unite,request_key,content_hash)
    VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8,$9::uuid,$10)`,
   [registreId,id,pointId,...params(s),data.registreCode,data.registreUnite,requestKey,digest({code:data.registreCode,unite:data.registreUnite})]);
  await event(c,s,actor,'MeterDeviceDeclared.v1',id,{pointId,technologie:data.technologie,mode:data.modeCommercial});
  await event(c,s,actor,'MeterRegisterDeclared.v1',registreId,{meterId:id,code:data.registreCode,unite:data.registreUnite});
  return {code:'OK',id,registreId,nouveau:true};
 });}
 async function creerRegistre({tenant,actor,siteId,meterId,requestKey,data}){return tx(async c=>{
  const s=await site(c,{tenant,actor,siteId},true);if(!s)return {code:'SITE_NON_AUTORISE'};
  const m=await meter(c,s,meterId);if(!m||!m.actif)return {code:'COMPTEUR_NON_AUTORISE'};
  const hash=digest({meterId,...data});const old=await c.query(`SELECT id,content_hash FROM energy_meter_registers WHERE site_id=$1 AND owner_personne_id=$2 AND request_key=$3::uuid`,[s.id,s.owner_personne_id,requestKey]);
  if(old.rows.length)return replay(old,hash);
  const found=await c.query('SELECT 1 FROM energy_meter_registers WHERE meter_id=$1::uuid AND code=$2',[meterId,data.code]);if(found.rows.length)return {code:'REGISTRE_EXISTANT'};
  const id=uuid(),r=await c.query(`INSERT INTO energy_meter_registers(id,meter_id,point_id,site_id,tenant_id,owner_personne_id,code,unite,request_key,content_hash)
    VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8,$9::uuid,$10) ON CONFLICT DO NOTHING RETURNING id`,
    [id,meterId,m.point_id,...params(s),data.code,data.unite,requestKey,hash]);
  if(!r.rows.length)return {code:'CONFLIT_REGISTRE'};
  await event(c,s,actor,'MeterRegisterDeclared.v1',id,{meterId,code:data.code,unite:data.unite});return {code:'OK',id,nouveau:true};
 });}
 async function creerReleve({tenant,actor,siteId,registerId,requestKey,data}){return tx(async c=>{
  const s=await site(c,{tenant,actor,siteId},true);if(!s)return {code:'SITE_NON_AUTORISE'};
  const reg=await register(c,s,registerId);if(!reg||!reg.actif)return {code:'REGISTRE_NON_AUTORISE'};
  const hash=digest({registerId,...data});const old=await c.query(`SELECT id,content_hash FROM energy_meter_readings WHERE site_id=$1 AND owner_personne_id=$2 AND request_key=$3::uuid`,[s.id,s.owner_personne_id,requestKey]);
  if(old.rows.length)return replay(old,hash);
  const id=uuid();const r=await c.query(`INSERT INTO energy_meter_readings(id,register_id,meter_id,point_id,site_id,tenant_id,owner_personne_id,
    valeur_index,unite_snapshot,releve_le,observation,auteur_personne_id,request_key,content_hash)
    VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7,$8::numeric,$9,$10::timestamptz,$11,$12,$13::uuid,$14)
    ON CONFLICT DO NOTHING RETURNING id`,[id,registerId,reg.meter_id,reg.point_id,...params(s),data.valeur,reg.unite,data.releveLe,data.observation,actor,requestKey,hash]);
  if(!r.rows.length)return {code:'RELEVE_MOMENT_DEJA_SAISI'};
  await event(c,s,actor,'MeterReadingDeclared.v1',id,{registerId,unite:reg.unite,releveLe:data.releveLe,qualification:'DECLARE_A_VERIFIER'});
  return {code:'OK',id,nouveau:true,qualification:'DECLARE_A_VERIFIER'};
 });}
 async function lister({tenant,actor,siteId}){return using(async c=>{
  const s=await site(c,{tenant,actor,siteId});if(!s)return null;
  const pp=await c.query(`SELECT id,nom,energie,type_point FROM energy_meter_points
   WHERE site_id=$1 AND tenant_id=$2 AND owner_personne_id=$3 ORDER BY date_creation,id LIMIT 51`,params(s));
  const points=pp.rows.slice(0,50).map(p=>({id:String(p.id),nom:p.nom,energie:p.energie,typePoint:p.type_point,compteurs:[]}));
  if(points.length){const ids=points.map(p=>p.id);const mm=await c.query(`SELECT id,point_id,nom,technologie,mode_commercial,actif FROM energy_meter_devices
     WHERE point_id=ANY($1::uuid[]) AND site_id=$2 AND tenant_id=$3 AND owner_personne_id=$4 ORDER BY date_installation,id`,[ids,...params(s)]);
   const byPoint=new Map(points.map(x=>[x.id,x]));const byMeter=new Map();
   for(const m of mm.rows){const x={id:String(m.id),nom:m.nom,technologie:m.technologie,modeCommercial:m.mode_commercial,actif:m.actif,registres:[]};byPoint.get(String(m.point_id))?.compteurs.push(x);byMeter.set(x.id,x);}
   if(byMeter.size){const rr=await c.query(`SELECT id,meter_id,code,unite FROM energy_meter_registers
    WHERE meter_id=ANY($1::uuid[]) AND site_id=$2 AND tenant_id=$3 AND owner_personne_id=$4 ORDER BY code,id`,[[...byMeter.keys()],...params(s)]);
    for(const r of rr.rows)byMeter.get(String(r.meter_id))?.registres.push({id:String(r.id),code:r.code,unite:r.unite});}
  }
  return {site:{id:String(s.public_id),nom:s.nom,pays:s.pays},points,suivant:pp.rows.length>50,
   fiabilite:'INDEX_DECLARATIFS_NON_VERIFIES',calculsDisponibles:false};
 });}
 async function historique({tenant,actor,siteId,registerId,offset=0}){return using(async c=>{
  const s=await site(c,{tenant,actor,siteId});if(!s)return null;
  const reg=await register(c,s,registerId);if(!reg)return null;
  const rr=await c.query(`SELECT id,valeur_index::text AS valeur,unite_snapshot,releve_le,provenance,qualification,observation
   FROM energy_meter_readings WHERE register_id=$1::uuid AND site_id=$2 AND tenant_id=$3 AND owner_personne_id=$4
   ORDER BY releve_le DESC,id LIMIT 51 OFFSET $5`,[registerId,...params(s),offset]);
  return {registre:{id:registerId,code:reg.code,unite:reg.unite},releves:rr.rows.slice(0,50).map(x=>({id:String(x.id),valeur:x.valeur,unite:x.unite_snapshot,releveLe:x.releve_le,provenance:x.provenance,qualification:x.qualification,observation:x.observation})),offset,suivant:rr.rows.length>50,calculsDisponibles:false};
 });}
 return {sites,lister,creerPoint,creerCompteur,creerRegistre,creerReleve,historique};
}
module.exports={creerEnergyMeterStore};
