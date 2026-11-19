'use strict';
/** SUNU Courant MVP02-C1: un seul dossier/site, espaces physiques et responsabilites distincts.
 * AUCUN acces indirect aux inventaires, photos, QR ou labels par ces API.
 */
const crypto=require('node:crypto');
const uuid=()=>crypto.randomUUID();
const sha=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
function creerEnergyScopeStore({obtenirClient}){
 if(typeof obtenirClient!=='function')throw TypeError('POSTGRES_CLIENT_REQUIS');
 async function using(fn){const c=await obtenirClient();try{return await fn(c);}finally{c.release();}}
 async function tx(fn){return using(async c=>{let on=false;try{await c.query('BEGIN');on=true;const result=await fn(c);await c.query('COMMIT');on=false;return result;}catch(e){if(on)await c.query('ROLLBACK').catch(()=>{});throw e;}});}
 async function event(c,site,actor,action,id,details={}){
  await c.query(`INSERT INTO energy_scope_events (site_id,tenant_id,owner_personne_id,acteur_personne_id,action,entity_id,details)
  VALUES ($1,$2,$3,$4,$5,$6::uuid,$7::jsonb)`,[site.id,site.tenant_id,site.owner_personne_id,actor,action,id,JSON.stringify(details)]);
 }
 async function site(c,{tenant,siteId}){
  const r=await c.query(`SELECT s.id,s.public_id,s.nom,s.type_site,s.tenant_id,s.owner_personne_id FROM energy_inventory_sites s
    JOIN tenants t ON t.id=s.tenant_id AND t.actif=TRUE WHERE t.code=$1 AND s.public_id=$2::uuid LIMIT 1`,[tenant,siteId]);
  return r.rows[0]||null;
 }
 async function grant(c,{site,actor,grantId,lock=false}){
  const r=await c.query(`SELECT g.id,g.node_id,g.site_id,g.tenant_id,g.owner_personne_id,g.personne_id,g.parent_grant_id,
    g.role_scope,g.statut,n.nom AS node_nom,n.type_noeud
    FROM energy_scope_grants g JOIN energy_scope_nodes n ON n.id=g.node_id AND n.site_id=g.site_id
    WHERE g.id=$1::uuid AND g.site_id=$2 AND g.tenant_id=$3 AND g.owner_personne_id=$4
     AND g.personne_id=$5 AND g.statut='ACTIF' LIMIT 1 ${lock?'FOR UPDATE OF g':''}`,
   [grantId,site.id,site.tenant_id,site.owner_personne_id,actor]);return r.rows[0]||null;
 }
 async function below(c,site,ancestor,subject){
  const r=await c.query(`WITH RECURSIVE anc(id,parent_id) AS (
    SELECT id,parent_id FROM energy_scope_nodes WHERE id=$1::uuid AND site_id=$2 AND tenant_id=$3 AND owner_personne_id=$4
    UNION ALL SELECT p.id,p.parent_id FROM energy_scope_nodes p JOIN anc a ON p.id=a.parent_id
      WHERE p.site_id=$2 AND p.tenant_id=$3 AND p.owner_personne_id=$4
  ) SELECT EXISTS(SELECT 1 FROM anc WHERE id=$5::uuid) AS ok`,[subject,site.id,site.tenant_id,site.owner_personne_id,ancestor]);
  return r.rows[0]?.ok===true;
 }
 async function initialise({tenant,actor,siteId}){return tx(async c=>{
  const s=await site(c,{tenant,siteId});if(!s||Number(s.owner_personne_id)!==actor)return {code:'SITE_NON_AUTORISE'};
  await c.query('SELECT id FROM energy_inventory_sites WHERE id=$1 FOR UPDATE',[s.id]);
  let r=await c.query('SELECT id FROM energy_scope_nodes WHERE site_id=$1 AND parent_id IS NULL LIMIT 1',[s.id]);
  let root=r.rows[0]?.id;
  if(!root){root=uuid();await c.query(`INSERT INTO energy_scope_nodes
    (id,site_id,tenant_id,owner_personne_id,parent_id,type_noeud,nom,request_key,content_hash,created_by)
    VALUES($1,$2,$3,$4,NULL,'SITE',$5,$6,$7,$8)`,[root,s.id,s.tenant_id,actor,s.nom,uuid(),sha({type:'SITE',siteId}),actor]);
   await event(c,s,actor,'ScopeRootCreated.v1',root,{source:'SITE_EXISTANT'});}
  r=await c.query(`SELECT id FROM energy_scope_grants WHERE site_id=$1 AND role_scope='COORDINATEUR' LIMIT 1`,[s.id]);
  let grantId=r.rows[0]?.id;
  if(!grantId){grantId=uuid();await c.query(`INSERT INTO energy_scope_grants
    (id,site_id,tenant_id,owner_personne_id,node_id,personne_id,parent_grant_id,role_scope)
    VALUES($1,$2,$3,$4,$5,$6,NULL,'COORDINATEUR')`,[grantId,s.id,s.tenant_id,actor,root,actor]);}
  return {code:'OK',rootNodeId:String(root),sourceGrantId:String(grantId)};
 });}
 async function createNode({tenant,actor,siteId,requestKey,data}){return tx(async c=>{
  const s=await site(c,{tenant,siteId});if(!s)return {code:'PERIMETRE_NON_AUTORISE'};
  const g=await grant(c,{site:s,actor,grantId:data.sourceGrantId,lock:true});
  if(!g||g.role_scope==='OCCUPANT'||!await below(c,s,g.node_id,data.parentNodeId))return {code:'PERIMETRE_NON_AUTORISE'};
  const digest=sha(data),id=uuid();
  const r=await c.query(`INSERT INTO energy_scope_nodes
    (id,site_id,tenant_id,owner_personne_id,parent_id,type_noeud,nom,request_key,content_hash,created_by)
    VALUES ($1,$2,$3,$4,$5::uuid,$6,$7,$8::uuid,$9,$10)
    ON CONFLICT DO NOTHING RETURNING id`,
    [id,s.id,s.tenant_id,s.owner_personne_id,data.parentNodeId,data.typeNoeud,data.nom,requestKey,digest,actor]);
  let resultId=r.rows[0]?.id,newly=Boolean(resultId);
  if(!resultId){const prior=await c.query('SELECT id,content_hash FROM energy_scope_nodes WHERE site_id=$1 AND owner_personne_id=$2 AND request_key=$3::uuid',[s.id,s.owner_personne_id,requestKey]);
   if(prior.rows.length===1){if(prior.rows[0].content_hash!==digest)return {code:'CLE_DE_REQUETE_REUTILISEE'};resultId=prior.rows[0].id;}
   else {const sibling=await c.query(`SELECT 1 FROM energy_scope_nodes WHERE site_id=$1 AND parent_id=$2::uuid AND lower(btrim(nom))=lower(btrim($3)) LIMIT 1`,[s.id,data.parentNodeId,data.nom]);
    return {code:sibling.rows.length?'UNITE_DEJA_EXISTANTE':'UNITE_CONFLIT'};}
  }
  if(newly)await event(c,s,actor,'ScopeNodeCreated.v1',resultId,{typeNoeud:data.typeNoeud,parentId:data.parentNodeId});
  return {code:'OK',id:String(resultId),nouveau:newly};
 });}
 async function issue({tenant,actor,siteId,requestKey,data}){return tx(async c=>{
  const s=await site(c,{tenant,siteId});if(!s)return {code:'PERIMETRE_NON_AUTORISE'};
  const g=await grant(c,{site:s,actor,grantId:data.sourceGrantId,lock:true});
  if(!g||g.role_scope==='OCCUPANT'||!await below(c,s,g.node_id,data.targetNodeId))return {code:'PERIMETRE_NON_AUTORISE'};
  if(data.targetPersonneId===actor)return {code:'AUTO_INVITATION_REFUSEE'};
  // Interdit egalement les boucles de personnes A -> B -> A dans la tutelle.
  const lineage=await c.query(`WITH RECURSIVE asc_grants(id,personne_id,parent_grant_id) AS (
    SELECT id,personne_id,parent_grant_id FROM energy_scope_grants WHERE id=$1::uuid AND site_id=$2
    UNION ALL SELECT p.id,p.personne_id,p.parent_grant_id FROM energy_scope_grants p JOIN asc_grants a ON p.id=a.parent_grant_id
      WHERE p.site_id=$2
  ) SELECT EXISTS(SELECT 1 FROM asc_grants WHERE personne_id=$3) AS present`,[g.id,s.id,data.targetPersonneId]);
  if(lineage.rows[0]?.present===true)return {code:'BOUCLE_DE_TUTELLE_REFUSEE'};
  const exists=await c.query('SELECT id FROM personnes WHERE id=$1 LIMIT 1',[data.targetPersonneId]);
  if(exists.rows.length!==1)return {code:'COMPTE_CIBLE_INCONNU'};
  const digest=sha(data),id=uuid();
  const r=await c.query(`INSERT INTO energy_scope_invitations
    (id,site_id,tenant_id,owner_personne_id,issuer_grant_id,target_node_id,target_personne_id,role_scope,request_key,content_hash,expires_at)
    VALUES($1,$2,$3,$4,$5::uuid,$6::uuid,$7,$8,$9::uuid,$10,NOW()+INTERVAL '48 hours')
    ON CONFLICT(issuer_grant_id,request_key) DO NOTHING RETURNING id`,
    [id,s.id,s.tenant_id,s.owner_personne_id,g.id,data.targetNodeId,data.targetPersonneId,data.role,requestKey,digest]);
  let rid=r.rows[0]?.id,newly=Boolean(rid);
  if(!rid){const old=await c.query('SELECT id,content_hash FROM energy_scope_invitations WHERE issuer_grant_id=$1 AND request_key=$2::uuid',[g.id,requestKey]);
    if(old.rows.length!==1||old.rows[0].content_hash!==digest)return {code:'CLE_DE_REQUETE_REUTILISEE'};rid=old.rows[0].id;}
  if(newly)await event(c,s,actor,'ScopeInviteSent.v1',rid,{cible:data.targetPersonneId,role:data.role,nodeId:data.targetNodeId});
  return {code:'OK',id:String(rid),nouvelle:newly};
 });}
 async function inbox({tenant,actor}){return using(async c=>{
  const r=await c.query(`SELECT i.id,i.role_scope,i.expires_at,n.nom AS perimetre,s.nom AS site_nom,s.public_id AS site_public_id
    FROM energy_scope_invitations i JOIN energy_scope_nodes n ON n.id=i.target_node_id
    JOIN energy_inventory_sites s ON s.id=i.site_id JOIN tenants t ON t.id=i.tenant_id AND t.actif=TRUE
    WHERE t.code=$1 AND i.target_personne_id=$2 AND i.statut='EN_ATTENTE' AND i.expires_at>NOW()
    ORDER BY i.date_creation DESC LIMIT 100`,[tenant,actor]);
  return {invitations:r.rows.map(i=>({id:String(i.id),role:i.role_scope,perimetre:i.perimetre,site:i.site_nom,siteId:String(i.site_public_id),expireLe:i.expires_at}))};
 });}
 async function accept({tenant,actor,inviteId}){return tx(async c=>{
  const r=await c.query(`SELECT i.*,s.public_id AS site_public_id FROM energy_scope_invitations i
    JOIN energy_inventory_sites s ON s.id=i.site_id JOIN tenants t ON t.id=i.tenant_id AND t.actif=TRUE
    WHERE i.id=$1::uuid AND t.code=$2 AND i.target_personne_id=$3 FOR UPDATE OF i`,[inviteId,tenant,actor]);
  if(!r.rows.length)return {code:'INVITATION_NON_AUTORISEE'};const i=r.rows[0];
  if(i.statut==='ACCEPTEE'){
   const active=await c.query(`SELECT statut FROM energy_scope_grants WHERE id=$1::uuid`,[i.accepted_grant_id]);
   return active.rows[0]?.statut==='ACTIF'?{code:'OK',nouvelle:false,grantId:String(i.accepted_grant_id)}:{code:'DELEGATION_REVOQUEE'};
  }
  if(i.statut!=='EN_ATTENTE'||new Date(i.expires_at).getTime()<=Date.now())return {code:'INVITATION_EXPIREE_OU_REVOQUEE'};
  const parent=await c.query(`SELECT id,statut,role_scope,node_id FROM energy_scope_grants
    WHERE id=$1::uuid AND site_id=$2 FOR UPDATE`,[i.issuer_grant_id,i.site_id]);
  if(parent.rows.length!==1||parent.rows[0].statut!=='ACTIF'||parent.rows[0].role_scope==='OCCUPANT')return {code:'DELEGATION_NON_ACTIVE'};
  const s={id:i.site_id,tenant_id:i.tenant_id,owner_personne_id:i.owner_personne_id};
  if(!await below(c,s,parent.rows[0].node_id,i.target_node_id))return {code:'PERIMETRE_NON_AUTORISE'};
  const id=uuid();
  const ins=await c.query(`INSERT INTO energy_scope_grants
    (id,site_id,tenant_id,owner_personne_id,node_id,personne_id,parent_grant_id,role_scope)
    VALUES($1,$2,$3,$4,$5::uuid,$6,$7::uuid,$8) RETURNING id`,
    [id,i.site_id,i.tenant_id,i.owner_personne_id,i.target_node_id,actor,i.issuer_grant_id,i.role_scope]);
  await c.query(`UPDATE energy_scope_invitations SET statut='ACCEPTEE',accepted_grant_id=$1,date_reponse=NOW() WHERE id=$2`,[ins.rows[0].id,inviteId]);
  await event(c,s,actor,'ScopeInviteAccepted.v1',inviteId,{grantId:id});
  return {code:'OK',nouvelle:true,grantId:String(id)};
 });}
 async function mine({tenant,actor}){return using(async c=>{
  const r=await c.query(`SELECT g.id,g.role_scope,g.node_id,g.parent_grant_id,n.nom AS perimetre,n.type_noeud,
    s.public_id AS site_public_id,s.nom AS site_nom FROM energy_scope_grants g
    JOIN energy_scope_nodes n ON n.id=g.node_id JOIN energy_inventory_sites s ON s.id=g.site_id
    JOIN tenants t ON t.id=g.tenant_id AND t.actif=TRUE
    WHERE t.code=$1 AND g.personne_id=$2 AND g.statut='ACTIF' ORDER BY g.date_creation DESC LIMIT 101`,[tenant,actor]);
  return {responsabilites:r.rows.slice(0,100).map(x=>({id:String(x.id),role:x.role_scope,nodeId:String(x.node_id),perimetre:x.perimetre,typeNoeud:x.type_noeud,site:x.site_nom,siteId:String(x.site_public_id),parentGrantId:x.parent_grant_id?String(x.parent_grant_id):null})),listePartielle:r.rows.length>100};
 });}
 async function tree({tenant,actor,siteId,grantId,offset=0}){return using(async c=>{
  const s=await site(c,{tenant,siteId});if(!s)return null;const g=await grant(c,{site:s,actor,grantId});if(!g)return null;
  const r=await c.query(`WITH RECURSIVE scope(id,parent_id,type_noeud,nom) AS (
    SELECT id,parent_id,type_noeud,nom FROM energy_scope_nodes WHERE id=$1::uuid AND site_id=$2
    UNION ALL SELECT n.id,n.parent_id,n.type_noeud,n.nom FROM energy_scope_nodes n JOIN scope s ON n.parent_id=s.id
      WHERE n.site_id=$2 AND n.tenant_id=$3 AND n.owner_personne_id=$4
  ) SELECT id,parent_id,type_noeud,nom FROM scope ORDER BY nom,id LIMIT 101 OFFSET $5`,
    [g.node_id,s.id,s.tenant_id,s.owner_personne_id,offset]);
  return {sourceGrantId:String(g.id),perimetre:g.node_nom,role:g.role_scope,
    unites:r.rows.slice(0,100).map(x=>({id:String(x.id),parentId:x.parent_id?String(x.parent_id):null,typeNoeud:x.type_noeud,nom:x.nom})),
    autrePage:r.rows.length>100,prochainOffset:r.rows.length>100?offset+100:null};
 });}
 async function sentInvitations({tenant,actor,siteId,sourceGrantId}){return using(async c=>{
  const s=await site(c,{tenant,siteId});if(!s)return null;const g=await grant(c,{site:s,actor,grantId:sourceGrantId});if(!g)return null;
  const r=await c.query(`SELECT id,target_personne_id,role_scope,statut,expires_at
   FROM energy_scope_invitations WHERE issuer_grant_id=$1 AND site_id=$2 ORDER BY date_creation DESC LIMIT 101`,[g.id,s.id]);
  return {invitations:r.rows.slice(0,100).map(x=>({id:String(x.id),destinataire:Number(x.target_personne_id),role:x.role_scope,statut:x.statut,expireLe:x.expires_at})),listePartielle:r.rows.length>100};
 });}
 async function subordinates({tenant,actor,siteId,sourceGrantId}){return using(async c=>{
  const s=await site(c,{tenant,siteId});if(!s)return null;const g=await grant(c,{site:s,actor,grantId:sourceGrantId});if(!g)return null;
  const r=await c.query(`WITH RECURSIVE dependants(id,parent_grant_id,personne_id,role_scope,statut,node_id) AS (
    SELECT id,parent_grant_id,personne_id,role_scope,statut,node_id FROM energy_scope_grants WHERE parent_grant_id=$1::uuid AND site_id=$2
    UNION ALL SELECT child.id,child.parent_grant_id,child.personne_id,child.role_scope,child.statut,child.node_id
     FROM energy_scope_grants child JOIN dependants d ON child.parent_grant_id=d.id WHERE child.site_id=$2
  ) SELECT d.*,n.nom AS perimetre FROM dependants d JOIN energy_scope_nodes n ON n.id=d.node_id ORDER BY n.nom,d.id LIMIT 101`,[g.id,s.id]);
  return {responsabilites:r.rows.slice(0,100).map(x=>({id:String(x.id),parentGrantId:x.parent_grant_id?String(x.parent_grant_id):null,personneId:Number(x.personne_id),role:x.role_scope,statut:x.statut,perimetre:x.perimetre})),listePartielle:r.rows.length>100};
 });}
 async function revokeInvitation({tenant,actor,inviteId}){return tx(async c=>{
  const q=await c.query(`SELECT i.id,i.site_id,i.tenant_id,i.owner_personne_id,i.issuer_grant_id,i.statut,
    g.personne_id,g.statut AS grant_statut FROM energy_scope_invitations i
    JOIN energy_scope_grants g ON g.id=i.issuer_grant_id
    JOIN tenants t ON t.id=i.tenant_id AND t.actif=TRUE
    WHERE i.id=$1::uuid AND t.code=$2 FOR UPDATE OF i`,[inviteId,tenant]);
  if(q.rows.length!==1||Number(q.rows[0].personne_id)!==actor)return {code:'INVITATION_NON_AUTORISEE'};
  const i=q.rows[0];if(i.statut!=='EN_ATTENTE')return {code:'INVITATION_DEJA_TRAITEE'};
  await c.query(`UPDATE energy_scope_invitations SET statut='REVOQUEE',date_reponse=NOW() WHERE id=$1`,[inviteId]);
  await event(c,{id:i.site_id,tenant_id:i.tenant_id,owner_personne_id:i.owner_personne_id},actor,'ScopeInviteRevoked.v1',inviteId,{});
  return {code:'OK'};
 });}
 async function revoke({tenant,actor,siteId,targetGrantId,sourceGrantId}){return tx(async c=>{
  const s=await site(c,{tenant,siteId});if(!s)return {code:'PERIMETRE_NON_AUTORISE'};
  const issuer=await grant(c,{site:s,actor,grantId:sourceGrantId,lock:true});
  if(!issuer||issuer.role_scope==='OCCUPANT'||issuer.id===targetGrantId)return {code:'PERIMETRE_NON_AUTORISE'};
  // Autorise uniquement un descendant dans la chaîne d'attributions, jamais une branche sœur.
  const check=await c.query(`WITH RECURSIVE parents(id,parent_grant_id) AS (
    SELECT id,parent_grant_id FROM energy_scope_grants WHERE id=$1::uuid AND site_id=$2
    UNION ALL SELECT p.id,p.parent_grant_id FROM energy_scope_grants p JOIN parents a ON p.id=a.parent_grant_id WHERE p.site_id=$2
  ) SELECT EXISTS(SELECT 1 FROM parents WHERE id=$3::uuid) AS permitted`,[targetGrantId,s.id,sourceGrantId]);
  if(check.rows[0]?.permitted!==true)return {code:'PERIMETRE_NON_AUTORISE'};
  const r=await c.query(`WITH RECURSIVE children(id) AS (
    SELECT id FROM energy_scope_grants WHERE id=$1::uuid AND site_id=$2
    UNION ALL SELECT c.id FROM energy_scope_grants c JOIN children d ON c.parent_grant_id=d.id WHERE c.site_id=$2
  ) UPDATE energy_scope_grants SET statut='REVOQUE',date_revocation=COALESCE(date_revocation,NOW())
     WHERE id IN (SELECT id FROM children) AND statut='ACTIF' RETURNING id`,[targetGrantId,s.id]);
  if(r.rows.length)await event(c,s,actor,'ScopeGrantRevoked.v1',targetGrantId,{nombreAffectations:r.rows.length});
  return {code:'OK',nombreRevoquees:r.rows.length};
 });}
 return {initialise,createNode,issue,inbox,accept,mine,tree,revoke,revokeInvitation,sentInvitations,subordinates};
}
module.exports={creerEnergyScopeStore};
