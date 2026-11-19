'use strict';
/** Façade HTTP privée MVP02-B1 : contrôle Core+tenant avant chaque action, origin POST/DELETE strict. */
const {TENANT}=require('./energy-case-domain');
const {UUID,CODE,proposition,revue}=require('./energy-collaboration-domain');
function creerEnergyCollaborationRouter({router,listerOrganisations,store,origineAutorisee,tenantAutorise}){
 if(!router||typeof router.use!=='function'||typeof router.post!=='function'||
    typeof listerOrganisations!=='function'||!store||
    ['createInvite','listOwnerInvites','acceptInvite','revokeInvite','listParticipations','submit',
     'listOwnProposals','listOwnerProposals','review'].some(m=>typeof store[m]!=='function'))throw TypeError('DEPENDANCES_COLLAB');
 router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');res.set('X-Content-Type-Options','nosniff');
   res.set('Referrer-Policy','no-referrer');next();});
 const fail=(res,http,code)=>res.status(http).json({statut:code});
 async function scope(req,res){
  const actor=Number(req.auth?.personneId),tenant=req.query?.tenant;
  if(!Number.isSafeInteger(actor)||actor<=0)return fail(res,401,'SESSION_REQUISE'),null;
  if(typeof tenant!=='string'||!TENANT.test(tenant))return fail(res,400,'TENANT_INVALIDE'),null;
  if(tenant!==tenantAutorise||!TENANT.test(tenantAutorise||''))return fail(res,403,'COLLAB_ENERGY_NON_ACTIVEE'),null;
  const org=await listerOrganisations(actor,tenant);
  if(!Array.isArray(org)||!org.some(o=>o.tenant_code===tenant))return fail(res,403,'TENANT_NON_AUTORISE'),null;
  return {tenant,actor};
 }
 const originOK=req=>req.get('Origin')===origineAutorisee;
 const json=(res,r,ok='OK',status=200)=>{
  if(r?.code==='OK'){const {code,statut:decision,...data}=r;return res.status(status).json({statut:ok,...data,...(decision?{decision}:{})});}
  return fail(res,['SITE_INACCESSIBLE','PROPOSITION_INTROUVABLE','INVITATION_INTROUVABLE','CONTRIBUTION_NON_AUTORISEE','INVITATION_INVALIDE'].includes(r?.code)?404:409,r?.code||'NON_AUTORISE');
 };
 function id(req,res,name){if(!UUID.test(req.params?.[name]||'')){fail(res,400,'IDENTIFIANT_INVALIDE');return false;}return true;}
 const guarded=fn=>async(req,res)=>{try{
  const context=await scope(req,res);if(!context)return;
  if(req.method!=='GET'&&!originOK(req))return fail(res,403,'ORIGINE_REFUSEE');
  return await fn(req,res,context);
 }catch(e){console.error('Energy Collaboration:',e?.code||e?.name||'ERREUR');return fail(res,503,'COLLAB_INDISPONIBLE');}};
 router.post('/sites/:siteId/invitations',guarded(async(req,res,s)=>{
  if(!id(req,res,'siteId'))return;
  if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||Object.keys(req.body).length!==0)return fail(res,400,'SAISIE_INVALIDE');
  const r=await store.createInvite({...s,siteId:req.params.siteId});return json(res,r,'INVITATION_CREEE',201);
 }));
 router.get('/sites/:siteId/invitations',guarded(async(req,res,s)=>{
  if(!id(req,res,'siteId'))return;
  const r=await store.listOwnerInvites({...s,siteId:req.params.siteId});
  return r?res.json({statut:'MES_INVITATIONS',...r}):fail(res,404,'SITE_INACCESSIBLE');
 }));
 router.post('/sites/:siteId/invitations/:invitationId/revoquer',guarded(async(req,res,s)=>{
  if(!id(req,res,'siteId')||!id(req,res,'invitationId'))return;
  if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||Object.keys(req.body).length!==0)return fail(res,400,'SAISIE_INVALIDE');
  const r=await store.revokeInvite({...s,siteId:req.params.siteId,invitationId:req.params.invitationId});
  return json(res,r,'INVITATION_REVOQUEE');
 }));
 router.post('/invitations/accepter',guarded(async(req,res,s)=>{
  if(!req.body||Object.keys(req.body).length!==1||!CODE.test(req.body.codeInvitation||''))return fail(res,400,'CODE_INVALIDE');
  const r=await store.acceptInvite({...s,codeInvitation:req.body.codeInvitation});
  return json(res,r,'INVITATION_ACCEPTEE');
 }));
 router.get('/mes-participations',guarded(async(req,res,s)=>{
  const r=await store.listParticipations(s);return res.json({statut:'MES_PARTICIPATIONS',...r});
 }));
 router.get('/participations/:invitationId/contributions',guarded(async(req,res,s)=>{
  if(!id(req,res,'invitationId'))return;
  const r=await store.listOwnProposals({...s,invitationId:req.params.invitationId});
  return res.json({statut:'MES_PROPOSITIONS',...r});
 }));
 router.post('/participations/:invitationId/contributions',guarded(async(req,res,s)=>{
  if(!id(req,res,'invitationId'))return;
  const key=req.get('Idempotency-Key');if(!UUID.test(key||''))return fail(res,400,'CLE_IDEMPOTENCE_REQUISE');
  const saisie=proposition(req.body);if(!saisie)return fail(res,400,'PROPOSITION_INVALIDE');
  const r=await store.submit({...s,invitationId:req.params.invitationId,requestKey:key,saisie});
  return json(res,r,'PROPOSITION_EN_ATTENTE',r.nouvelle?201:200);
 }));
 router.get('/sites/:siteId/contributions',guarded(async(req,res,s)=>{
  if(!id(req,res,'siteId'))return;
  const r=await store.listOwnerProposals({...s,siteId:req.params.siteId});
  return r?res.json({statut:'PROPOSITIONS_A_ARBITRER',...r}):fail(res,404,'SITE_INACCESSIBLE');
 }));
 router.post('/sites/:siteId/contributions/:contributionId/decision',guarded(async(req,res,s)=>{
  if(!id(req,res,'siteId')||!id(req,res,'contributionId'))return;
  const decision=revue(req.body);if(!decision)return fail(res,400,'DECISION_INVALIDE');
  const r=await store.review({...s,siteId:req.params.siteId,contributionId:req.params.contributionId,decision});
  return json(res,r,'PROPOSITION_ARBITREE');
 }));
 return router;
}
module.exports={creerEnergyCollaborationRouter};
