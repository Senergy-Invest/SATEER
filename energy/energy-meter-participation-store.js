'use strict';
/**
 * E-PARTICIPATION-1 : missions d'index déclaratifs, branchées sur le Core C1 et
 * les tables CANONIQUES E-METER. Pas de second registre de relevés.
 * Les soumissions restent EN_REVUE tant que le propriétaire ne les intègre pas.
 */
const crypto=require('node:crypto');
const {chaineValide}=require('./energy-meter-participation-domain');
const uuid=()=>crypto.randomUUID();
const digest=data=>crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
function creerEnergyMeterParticipationStore({obtenirClient}){
 if(typeof obtenirClient!=='function')throw TypeError('CLIENT_POSTGRES_REQUIS');
 async function using(fn){const c=await obtenirClient();try{return await fn(c);}finally{c.release();}}
 async function tx(fn){return using(async c=>{let opened=false;try{
  await c.query('BEGIN');opened=true;const out=await fn(c);await c.query('COMMIT');opened=false;return out;
 }catch(e){if(opened)await c.query('ROLLBACK').catch(()=>{});throw e;}});}
 const scope=s=>[s.site_id??s.id,s.tenant_id,s.owner_personne_id];
 async function site(c,tenant,siteId){
  const q=await c.query(`SELECT s.id,s.public_id,s.nom,s.tenant_id,s.owner_personne_id FROM energy_inventory_sites s
   JOIN tenants t ON t.id=s.tenant_id AND t.actif=TRUE
   WHERE t.code=$1 AND s.public_id=$2::uuid LIMIT 1`,[tenant,siteId]);return q.rows[0]||null;
 }
 async function lockSite(c,s){await c.query('SELECT id FROM energy_inventory_sites WHERE id=$1 AND tenant_id=$2 AND owner_personne_id=$3 FOR UPDATE',scope(s));}
 async function audit(c,s,actor,action,entityId,details={}){
  await c.query(`INSERT INTO energy_meter_participation_events(site_id,tenant_id,owner_personne_id,actor_personne_id,action,entity_id,details)
   VALUES ($1,$2,$3,$4,$5,$6::uuid,$7::jsonb)`,[...scope(s),actor,action,entityId,JSON.stringify(details)]);
 }
 async function chain(c,s,grantId,actor){
  // Un chemin C1 est immuable ; détection de cycle et verrou des grants contre les révocations concurrentes.
  const q=await c.query(`WITH RECURSIVE parents AS (
    SELECT id,parent_grant_id,personne_id,role_scope,statut,ARRAY[id] AS path,0 AS depth FROM energy_scope_grants
     WHERE id=$1::uuid AND site_id=$2 AND tenant_id=$3 AND owner_personne_id=$4
    UNION ALL
    SELECT p.id,p.parent_grant_id,p.personne_id,p.role_scope,p.statut,x.path||p.id,x.depth+1
     FROM energy_scope_grants p JOIN parents x ON p.id=x.parent_grant_id
     WHERE p.site_id=$2 AND p.tenant_id=$3 AND p.owner_personne_id=$4 AND NOT p.id=ANY(x.path)
   ) SELECT id,parent_grant_id,personne_id,role_scope,statut FROM parents ORDER BY depth`,[grantId,...scope(s)]);
  const rows=q.rows.map(x=>({...x,id:String(x.id),parent_grant_id:x.parent_grant_id?String(x.parent_grant_id):null}));
  if(!chaineValide(rows,actor))return false;
  const ids=rows.map(g=>g.id).sort();
  const locked=await c.query(`SELECT id,statut FROM energy_scope_grants WHERE id=ANY($1::uuid[])
    AND site_id=$2 AND tenant_id=$3 AND owner_personne_id=$4 ORDER BY id FOR SHARE`,[ids,...scope(s)]);
  return locked.rows.length===rows.length&&locked.rows.every(g=>g.statut==='ACTIF');
 }
 async function contexte({tenant,actor,siteId}){return using(async c=>{
  const s=await site(c,tenant,siteId);if(!s||Number(s.owner_personne_id)!==actor)return null;
  const [nodes,grants,points]=await Promise.all([
   c.query(`SELECT id,nom,type_noeud FROM energy_scope_nodes WHERE site_id=$1 AND tenant_id=$2 AND owner_personne_id=$3
    ORDER BY nom,id LIMIT 101`,scope(s)),
   c.query(`SELECT g.id,g.node_id,g.role_scope,n.nom AS perimetre FROM energy_scope_grants g
    JOIN energy_scope_nodes n ON n.id=g.node_id AND n.site_id=g.site_id
    WHERE g.site_id=$1 AND g.tenant_id=$2 AND g.owner_personne_id=$3 AND g.statut='ACTIF' AND g.role_scope<>'COORDINATEUR'
    ORDER BY n.nom,g.id LIMIT 101`,scope(s)),
   c.query(`SELECT p.id,p.nom,l.scope_node_id,reg.id AS registre_id,reg.code,reg.unite,
     d.nom AS compteur,d.id AS meter_id,d.actif FROM energy_meter_points p
    LEFT JOIN energy_meter_participation_links l ON l.point_id=p.id AND l.site_id=p.site_id
    LEFT JOIN energy_meter_devices d ON d.point_id=p.id AND d.site_id=p.site_id AND d.actif=TRUE
    LEFT JOIN energy_meter_registers reg ON reg.meter_id=d.id AND reg.site_id=p.site_id
    WHERE p.site_id=$1 AND p.tenant_id=$2 AND p.owner_personne_id=$3
    ORDER BY p.id,reg.code,reg.id LIMIT 101`,scope(s))
  ]);
  return {site:{id:String(s.public_id),nom:s.nom},
   unites:nodes.rows.slice(0,100).map(n=>({id:String(n.id),nom:n.nom,type:n.type_noeud})),
   responsabilites:grants.rows.slice(0,100).map(g=>({id:String(g.id),nodeId:String(g.node_id),role:g.role_scope,perimetre:g.perimetre})),
   registres:points.rows.slice(0,100).map(p=>({pointId:String(p.id),pointNom:p.nom,scopeNodeId:p.scope_node_id?String(p.scope_node_id):null,
    registerId:p.registre_id?String(p.registre_id):null,code:p.code||null,unite:p.unite||null,compteur:p.compteur||null,meterId:p.meter_id?String(p.meter_id):null})),
   listePartielle:[nodes,grants,points].some(q=>q.rows.length>100)};
 });}
 async function lier({tenant,actor,siteId,pointId,requestKey,data}){return tx(async c=>{
  const s=await site(c,tenant,siteId);if(!s||Number(s.owner_personne_id)!==actor)return {code:'SITE_NON_AUTORISE'};
  await lockSite(c,s);
  const p=await c.query(`SELECT id FROM energy_meter_points WHERE id=$1::uuid AND site_id=$2 AND tenant_id=$3 AND owner_personne_id=$4`,[pointId,...scope(s)]);
  if(!p.rows.length)return {code:'POINT_NON_AUTORISE'};
  const n=await c.query(`SELECT id FROM energy_scope_nodes WHERE id=$1::uuid AND site_id=$2 AND tenant_id=$3 AND owner_personne_id=$4`,[data.scopeNodeId,...scope(s)]);
  if(!n.rows.length)return {code:'PERIMETRE_NON_AUTORISE'};
  const hash=digest({pointId,scopeNodeId:data.scopeNodeId});
  const prior=await c.query(`SELECT point_id,scope_node_id,request_key,content_hash FROM energy_meter_participation_links
    WHERE point_id=$1::uuid OR (site_id=$2 AND owner_personne_id=$3 AND request_key=$4::uuid)`,[pointId,s.id,s.owner_personne_id,requestKey]);
  if(prior.rows.length){const x=prior.rows[0];return String(x.point_id)===pointId&&String(x.request_key)===requestKey&&x.content_hash===hash?
   {code:'OK',nouveau:false,pointId}:{code:'POINT_DEJA_LIE_OU_CLE_REUTILISEE'};}
  await c.query(`INSERT INTO energy_meter_participation_links(point_id,site_id,tenant_id,owner_personne_id,scope_node_id,created_by,request_key,content_hash)
   VALUES($1::uuid,$2,$3,$4,$5::uuid,$6,$7::uuid,$8)`,[pointId,...scope(s),data.scopeNodeId,actor,requestKey,hash]);
  await audit(c,s,actor,'MeterPointScoped.v1',pointId,{scopeNodeId:data.scopeNodeId});
  return {code:'OK',nouveau:true,pointId};
 });}
 async function attribuer({tenant,actor,siteId,requestKey,data}){return tx(async c=>{
  const s=await site(c,tenant,siteId);if(!s||Number(s.owner_personne_id)!==actor)return {code:'SITE_NON_AUTORISE'};
  await lockSite(c,s);
  const hash=digest(data);
  const existing=await c.query(`SELECT id,content_hash FROM energy_meter_participation_missions
   WHERE site_id=$1 AND owner_personne_id=$2 AND request_key=$3::uuid`,[s.id,s.owner_personne_id,requestKey]);
  if(existing.rows.length)return existing.rows[0].content_hash===hash?
   {code:'OK',nouveau:false,missionId:String(existing.rows[0].id)}:{code:'CLE_REUTILISEE'};
  const reg=await c.query(`SELECT r.id,r.meter_id,r.point_id,d.actif,l.scope_node_id FROM energy_meter_registers r
   JOIN energy_meter_devices d ON d.id=r.meter_id AND d.point_id=r.point_id AND d.site_id=r.site_id
   JOIN energy_meter_participation_links l ON l.point_id=r.point_id AND l.site_id=r.site_id
   WHERE r.id=$1::uuid AND r.site_id=$2 AND r.tenant_id=$3 AND r.owner_personne_id=$4`,[data.registerId,...scope(s)]);
  if(reg.rows.length!==1||reg.rows[0].actif!==true)return {code:'REGISTRE_NON_AUTORISE'};
  const g=await c.query(`SELECT id,node_id,personne_id,role_scope,statut FROM energy_scope_grants
   WHERE id=$1::uuid AND site_id=$2 AND tenant_id=$3 AND owner_personne_id=$4`,[data.grantId,...scope(s)]);
  if(g.rows.length!==1||g.rows[0].statut!=='ACTIF'||g.rows[0].role_scope==='COORDINATEUR'||Number(g.rows[0].personne_id)===actor||
    String(g.rows[0].node_id)!==String(reg.rows[0].scope_node_id))return {code:'PERIMETRE_NON_AUTORISE'};
  if(!await chain(c,s,data.grantId,Number(g.rows[0].personne_id)))return {code:'TUTELLE_INACTIVE'};
  const id=uuid();
  const result=await c.query(`INSERT INTO energy_meter_participation_missions
   (id,site_id,tenant_id,owner_personne_id,point_id,meter_id,register_id,assignee_grant_id,assigned_by,request_key,content_hash)
   VALUES($1::uuid,$2,$3,$4,$5::uuid,$6::uuid,$7::uuid,$8::uuid,$9,$10::uuid,$11)
   ON CONFLICT DO NOTHING RETURNING id`,[id,...scope(s),reg.rows[0].point_id,reg.rows[0].meter_id,data.registerId,data.grantId,actor,requestKey,hash]);
  if(!result.rows.length)return {code:'MISSION_DEJA_ACTIVE_OU_CONFLIT'};
  await audit(c,s,actor,'MeterMissionAssigned.v1',id,{registerId:data.registerId,grantId:data.grantId});
  return {code:'OK',nouveau:true,missionId:id};
 });}
 async function mesMissions({tenant,actor}){return using(async c=>{
  const q=await c.query(`SELECT m.id,m.statut,m.register_id,m.created_at,m.releve_le,m.valeur_index::text AS valeur,
   p.nom AS point_nom,reg.code,reg.unite,s.nom AS site_nom,g.personne_id AS assignee_id,g.id AS grant_id,n.nom AS perimetre,
   s.owner_personne_id AS owner_id FROM energy_meter_participation_missions m
   JOIN energy_inventory_sites s ON s.id=m.site_id AND s.tenant_id=m.tenant_id
   JOIN tenants t ON t.id=m.tenant_id AND t.actif=TRUE
   JOIN energy_scope_grants g ON g.id=m.assignee_grant_id AND g.site_id=m.site_id
   JOIN energy_scope_nodes n ON n.id=g.node_id AND n.site_id=g.site_id
   JOIN energy_meter_points p ON p.id=m.point_id AND p.site_id=m.site_id
   JOIN energy_meter_registers reg ON reg.id=m.register_id AND reg.site_id=m.site_id
   WHERE t.code=$1 AND (m.owner_personne_id=$2 OR (g.personne_id=$2 AND g.statut='ACTIF'))
   ORDER BY m.created_at DESC,m.id DESC LIMIT 51`,[tenant,actor]);
  return {missions:q.rows.slice(0,50).map(m=>({id:String(m.id),statut:m.statut,point:m.point_nom,registre:m.code,unite:m.unite,
   site:m.site_nom,perimetre:m.perimetre,grantId:String(m.grant_id),releveLe:m.releve_le,valeur:m.valeur,attributaire:actor===Number(m.assignee_id),
   coordinateur:actor===Number(m.owner_id),creeLe:m.created_at})),listePartielle:q.rows.length>50};
 });}
 async function mission(c,tenant,actor,id,lock=false){
  const q=await c.query(`SELECT m.*,s.public_id,g.personne_id AS assign_actor,g.statut AS grant_statut FROM energy_meter_participation_missions m
   JOIN energy_inventory_sites s ON s.id=m.site_id AND s.tenant_id=m.tenant_id
   JOIN tenants t ON t.id=m.tenant_id AND t.actif=TRUE
   JOIN energy_scope_grants g ON g.id=m.assignee_grant_id AND g.site_id=m.site_id
   WHERE m.id=$1::uuid AND t.code=$2 AND (m.owner_personne_id=$3 OR (g.personne_id=$3 AND g.statut='ACTIF'))
   LIMIT 1 ${lock?'FOR UPDATE OF m':''}`,[id,tenant,actor]);return q.rows[0]||null;
 }
 async function lockForMission(c,tenant,actor,id){
  // Ordre fixe : site, puis mission, puis grants. E-METER 1A/1E1 verrouille le site.
  const initial=await mission(c,tenant,actor,id);if(!initial)return null;
  await lockSite(c,initial);
  return mission(c,tenant,actor,id,true);
 }
 async function compteurActif(c,m){
  const q=await c.query(`SELECT d.actif,d.date_installation,r.unite FROM energy_meter_registers r
   JOIN energy_meter_devices d ON d.id=r.meter_id AND d.point_id=r.point_id AND d.site_id=r.site_id
   WHERE r.id=$1::uuid AND r.meter_id=$2::uuid AND r.point_id=$3::uuid
    AND r.site_id=$4 AND r.tenant_id=$5 AND r.owner_personne_id=$6`,[m.register_id,m.meter_id,m.point_id,...scope(m)]);
  return q.rows[0]||null;
 }
 async function soumettre({tenant,actor,missionId,requestKey,data}){return tx(async c=>{
  const m=await lockForMission(c,tenant,actor,missionId);if(!m||Number(m.assign_actor)!==actor)return {code:'MISSION_NON_AUTORISEE'};
  const hash=digest(data);
  if(m.statut!=='A_FAIRE')return m.statut==='A_REVOIR'&&String(m.submit_key)===requestKey&&m.submit_hash===hash?
   {code:'OK',nouveau:false,missionId}:{code:'MISSION_DEJA_TRAITEE'};
  if(!await chain(c,m,m.assignee_grant_id,actor))return {code:'TUTELLE_INACTIVE'};
  const r=await compteurActif(c,m);
  if(!r||r.actif!==true)return {code:'COMPTEUR_REMPLACE_MISSION_OBSOLETE'};
  if(new Date(data.releveLe).getTime()<new Date(r.date_installation).getTime())return {code:'RELEVE_AVANT_INSTALLATION'};
  await c.query(`UPDATE energy_meter_participation_missions SET statut='A_REVOIR',valeur_index=$1::numeric,
   releve_le=$2::timestamptz,observation=$3,submit_key=$4::uuid,submit_hash=$5,submitted_at=NOW()
   WHERE id=$6::uuid`,[data.valeur,data.releveLe,data.observation,requestKey,hash,missionId]);
  await audit(c,m,actor,'MeterMissionSubmitted.v1',missionId,{registerId:String(m.register_id),qualification:'EN_ATTENTE_DE_REVUE'});
  return {code:'OK',nouveau:true,missionId};
 });}
 async function decider({tenant,actor,missionId,requestKey,data}){return tx(async c=>{
  const m=await lockForMission(c,tenant,actor,missionId);
  if(!m||Number(m.owner_personne_id)!==actor)return {code:'MISSION_NON_AUTORISEE'};
  const hash=digest(data);
  if(m.statut==='INTEGREE'||m.statut==='REFUSEE')return String(m.review_key)===requestKey&&m.review_hash===hash?
   {code:'OK',nouveau:false,missionId,statut:m.statut}:{code:'MISSION_DEJA_CLOTUREE'};
  if(m.statut!=='A_REVOIR')return {code:'DECLARATION_NON_SOUMISE'};
  if(data.decision==='REFUSER'){
   await c.query(`UPDATE energy_meter_participation_missions SET statut='REFUSEE',review_key=$1::uuid,
    review_hash=$2,reviewed_at=NOW() WHERE id=$3::uuid`,[requestKey,hash,missionId]);
   await audit(c,m,actor,'MeterMissionRefused.v1',missionId,{motif:'REJET_DE_LA_DECLARATION_SANS_EFFACEMENT'});
   return {code:'OK',nouveau:true,missionId,statut:'REFUSEE'};
  }
  if(!await chain(c,m,m.assignee_grant_id,Number(m.assign_actor)))return {code:'TUTELLE_INACTIVE'};
  const reg=await compteurActif(c,m);
  if(!reg||reg.actif!==true)return {code:'COMPTEUR_REMPLACE_MISSION_OBSOLETE'};
  if(new Date(m.releve_le).getTime()<new Date(reg.date_installation).getTime())return {code:'RELEVE_AVANT_INSTALLATION'};
  const id=uuid();
  const bodyHash=digest({missionId,registerId:String(m.register_id),valeur:String(m.valeur_index),releveLe:new Date(m.releve_le).toISOString(),observation:m.observation,mode:'EP1_V1'});
  const r=await c.query(`INSERT INTO energy_meter_readings
   (id,register_id,meter_id,point_id,site_id,tenant_id,owner_personne_id,valeur_index,unite_snapshot,
    releve_le,observation,auteur_personne_id,request_key,content_hash)
   VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7,$8::numeric,$9,$10::timestamptz,$11,$12,$13::uuid,$14)
   ON CONFLICT DO NOTHING RETURNING id`,[id,m.register_id,m.meter_id,m.point_id,...scope(m),m.valeur_index,reg.unite,m.releve_le,m.observation,m.assign_actor,missionId,bodyHash]);
  if(r.rows.length!==1)return {code:'RELEVE_DEJA_PRESENT_OU_CONFLIT'};
  await c.query(`INSERT INTO energy_meter_events(site_id,tenant_id,owner_personne_id,acteur_personne_id,action,entity_id,details)
   VALUES($1,$2,$3,$4,'MeterReadingDeclared.v1',$5::uuid,$6::jsonb)`,[...scope(m),actor,id,JSON.stringify({registerId:String(m.register_id),modeSaisie:'DELEGATION_EP1_V1',missionId,declarePar:Number(m.assign_actor),integrePar:actor,qualification:'DECLARE_A_VERIFIER'})]);
  await c.query(`UPDATE energy_meter_participation_missions SET statut='INTEGREE',review_key=$1::uuid,review_hash=$2,
   canonical_reading_id=$3::uuid,reviewed_at=NOW() WHERE id=$4::uuid`,[requestKey,hash,id,missionId]);
  await audit(c,m,actor,'MeterMissionIntegrated.v1',missionId,{canonicalReadingId:id,qualification:'DECLARE_A_VERIFIER'});
  return {code:'OK',nouveau:true,missionId,statut:'INTEGREE',readingId:id,qualification:'DECLARE_A_VERIFIER'};
 });}
 return {contexte,lier,attribuer,mesMissions,soumettre,decider};
}
module.exports={creerEnergyMeterParticipationStore};
