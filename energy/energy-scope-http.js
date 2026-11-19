'use strict';
const {TENANT}=require('./energy-case-domain');
const {UUID,node,invitation,revocation}=require('./energy-scope-domain');
function creerEnergyScopeRouter({router,listerOrganisations,store,origineAutorisee,tenantAutorise}){
 const functions=['initialise','createNode','issue','inbox','accept','mine','tree','revoke','revokeInvitation','sentInvitations','subordinates'];
 if(!router||typeof router.use!=='function'||typeof listerOrganisations!=='function'||!store||functions.some(x=>typeof store[x]!=='function'))throw TypeError('DEPENDANCES_SCOPE');
 router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');res.set('X-Content-Type-Options','nosniff');res.set('Referrer-Policy','no-referrer');next();});
 const bad=(res,n,code)=>res.status(n).json({statut:code});
 function getId(req,res,name){if(!UUID.test(req.params?.[name]||'')){bad(res,400,'IDENTIFIANT_INVALIDE');return null;}return req.params[name];}
 const empty=o=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===0;
 async function guard(req,res,fn){try{
  const actor=Number(req.auth?.personneId),tenant=req.query?.tenant;
  if(!Number.isSafeInteger(actor)||actor<=0)return bad(res,401,'SESSION_REQUISE');
  if(typeof tenant!=='string'||!TENANT.test(tenant))return bad(res,400,'TENANT_INVALIDE');
  if(tenant!==tenantAutorise||!TENANT.test(tenantAutorise||''))return bad(res,403,'EXPERIENCE_ENERGY_NON_ACTIVEE');
  const orgs=await listerOrganisations(actor,tenant);
  if(!Array.isArray(orgs)||!orgs.some(x=>x.tenant_code===tenant))return bad(res,403,'TENANT_NON_AUTORISE');
  if(req.method!=='GET'&&req.get('Origin')!==origineAutorisee)return bad(res,403,'ORIGINE_REFUSEE');
  return await fn({tenant,actor});
 }catch(e){console.error('EnergyScope:',e?.code||e?.name||'ERREUR');return bad(res,503,'PERIMETRE_INDISPONIBLE');}}
 const route=fn=>async(req,res)=>guard(req,res,s=>fn(req,res,s));
 const respond=(res,r,ok='OK',success=200)=>r?.code==='OK'?res.status(success).json({statut:ok,...r}):
  bad(res,['PERIMETRE_NON_AUTORISE','SITE_NON_AUTORISE','INVITATION_NON_AUTORISEE'].includes(r?.code)?404:409,r?.code||'ACTION_NON_AUTORISEE');
 router.post('/sites/:siteId/initialiser',route(async(req,res,s)=>{
  const siteId=getId(req,res,'siteId');if(!siteId)return;
  if(!empty(req.body))return bad(res,400,'CORPS_INVALIDE');
  return respond(res,await store.initialise({...s,siteId}),'SITE_ORGANISE');
 }));
 router.get('/mes-responsabilites',route(async(_req,res,s)=>res.json({statut:'MES_RESPONSABILITES',...await store.mine(s)})));
 router.get('/mes-invitations',route(async(_req,res,s)=>res.json({statut:'MES_INVITATIONS_CIBLEES',...await store.inbox(s)})));
 router.post('/invitations/:invitationId/accepter',route(async(req,res,s)=>{
  const inviteId=getId(req,res,'invitationId');if(!inviteId)return;
  if(!empty(req.body))return bad(res,400,'CORPS_INVALIDE');
  return respond(res,await store.accept({...s,inviteId}),'INVITATION_ACCEPTEE');
 }));
 router.post('/invitations/:invitationId/revoquer',route(async(req,res,s)=>{
  const inviteId=getId(req,res,'invitationId');if(!inviteId)return;
  if(!empty(req.body))return bad(res,400,'CORPS_INVALIDE');
  return respond(res,await store.revokeInvitation({...s,inviteId}),'INVITATION_REVOQUEE');
 }));
 router.get('/sites/:siteId/arbre',route(async(req,res,s)=>{
  const siteId=getId(req,res,'siteId');if(!siteId)return;
  if(!UUID.test(req.query?.grantId||''))return bad(res,400,'AFFECTATION_INVALIDE');
  const offset=req.query?.offset===undefined?0:Number(req.query.offset);
  if(!Number.isSafeInteger(offset)||offset<0)return bad(res,400,'PAGINATION_INVALIDE');
  const result=await store.tree({...s,siteId,grantId:req.query.grantId,offset});
  return result?res.json({statut:'ARBRE_AUTORISE',...result}):bad(res,404,'PERIMETRE_NON_AUTORISE');
 }));
 router.get('/sites/:siteId/invitations',route(async(req,res,s)=>{
  const siteId=getId(req,res,'siteId');if(!siteId)return;
  if(!UUID.test(req.query?.grantId||''))return bad(res,400,'AFFECTATION_INVALIDE');
  const r=await store.sentInvitations({...s,siteId,sourceGrantId:req.query.grantId});
  return r?res.json({statut:'INVITATIONS_DU_RESPONSABLE',...r}):bad(res,404,'PERIMETRE_NON_AUTORISE');
 }));
 router.get('/sites/:siteId/responsabilites',route(async(req,res,s)=>{
  const siteId=getId(req,res,'siteId');if(!siteId)return;
  if(!UUID.test(req.query?.grantId||''))return bad(res,400,'AFFECTATION_INVALIDE');
  const r=await store.subordinates({...s,siteId,sourceGrantId:req.query.grantId});
  return r?res.json({statut:'RESPONSABILITES_DELEGUEES',...r}):bad(res,404,'PERIMETRE_NON_AUTORISE');
 }));
 router.post('/sites/:siteId/unites',route(async(req,res,s)=>{
  const siteId=getId(req,res,'siteId');if(!siteId)return;
  const data=node(req.body);if(!data)return bad(res,400,'UNITE_INVALIDE');
  const requestKey=req.get('Idempotency-Key');if(!UUID.test(requestKey||''))return bad(res,400,'CLE_IDEMPOTENCE_REQUISE');
  return respond(res,await store.createNode({...s,siteId,requestKey,data}),'UNITE_CREEE',201);
 }));
 router.post('/sites/:siteId/invitations',route(async(req,res,s)=>{
  const siteId=getId(req,res,'siteId');if(!siteId)return;
  const data=invitation(req.body);if(!data)return bad(res,400,'INVITATION_INVALIDE');
  const requestKey=req.get('Idempotency-Key');if(!UUID.test(requestKey||''))return bad(res,400,'CLE_IDEMPOTENCE_REQUISE');
  // C1 : seul un compte Core deja membre du tenant peut etre cible.
  // L'onboarding des personnes externes viendra par Communication et Core, jamais par une permission Energy implicite.
  const cible=await listerOrganisations(data.targetPersonneId,s.tenant);
  if(!Array.isArray(cible)||!cible.some(x=>x.tenant_code===s.tenant))return bad(res,404,'COMPTE_CIBLE_NON_AUTORISE');
  return respond(res,await store.issue({...s,siteId,requestKey,data}),'INVITATION_CIBLEE_CREEE',201);
 }));
 router.post('/sites/:siteId/responsabilites/:targetGrantId/revoquer',route(async(req,res,s)=>{
  const siteId=getId(req,res,'siteId'),targetGrantId=getId(req,res,'targetGrantId');if(!siteId||!targetGrantId)return;
  const data=revocation(req.body);if(!data)return bad(res,400,'REVOCATION_INVALIDE');
  return respond(res,await store.revoke({...s,siteId,targetGrantId,...data}),'RESPONSABILITES_REVOQUEES');
 }));
 return router;
}
module.exports={creerEnergyScopeRouter};
