'use strict';
/** EP1 : route isolée Core Auth + tenant, aucune extension des droits du routeur propriétaire E-METER. */
const {TENANT}=require('./energy-case-domain');
const {UUID,liaison,attribution,soumission,revue}=require('./energy-meter-participation-domain');
function creerEnergyMeterParticipationRouter({router,listerOrganisations,store,origineAutorisee,tenantAutorise}){
 if(!router?.use||!router?.get||!router?.post||typeof listerOrganisations!=='function'||!store)throw TypeError('DEPENDANCES_EP1');
 const fail=(res,code,statut)=>res.status(code).json({statut});
 router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');res.set('X-Content-Type-Options','nosniff');res.set('Referrer-Policy','no-referrer');next();});
 const guard=fn=>async(req,res)=>{try{
  const actor=Number(req.auth?.personneId),tenant=req.query?.tenant;
  if(!Number.isSafeInteger(actor)||actor<1)return fail(res,401,'SESSION_REQUISE');
  if(typeof tenant!=='string'||!TENANT.test(tenant))return fail(res,400,'TENANT_INVALIDE');
  if(tenant!==tenantAutorise||!TENANT.test(tenantAutorise||''))return fail(res,403,'EP1_NON_ACTIVE');
  if(req.method!=='GET'&&req.get('Origin')!==origineAutorisee)return fail(res,403,'ORIGINE_REFUSEE');
  const orgs=await listerOrganisations(actor,tenant);
  if(!Array.isArray(orgs)||!orgs.some(o=>o.tenant_code===tenant))return fail(res,403,'TENANT_NON_AUTORISE');
  return fn(req,res,{actor,tenant});
 }catch(e){console.error('EP1:',e?.code||e?.name||'ERREUR');return fail(res,503,'PARTICIPATION_INDISPONIBLE');}};
 const id=(req,res,k)=>UUID.test(req.params?.[k]||'')?true:(fail(res,400,'IDENTIFIANT_INVALIDE'),false);
 const key=(req,res)=>UUID.test(req.get('Idempotency-Key')||'')?req.get('Idempotency-Key'):(fail(res,400,'CLE_IDEMPOTENCE_REQUISE'),null);
 const output=(res,r,success)=>r?.code==='OK'?res.status(r.nouveau?201:200).json({statut:success,...r}):fail(res,
  ['SITE_NON_AUTORISE','MISSION_NON_AUTORISEE','PERIMETRE_NON_AUTORISE','REGISTRE_NON_AUTORISE','POINT_NON_AUTORISE'].includes(r?.code)?404:409,r?.code||'ACTION_REFUSEE');
 router.get('/sites/:siteId/contexte',guard(async(req,res,s)=>{
  if(!id(req,res,'siteId'))return;
  const r=await store.contexte({...s,siteId:req.params.siteId});return r?res.json({statut:'CONTEXTE_PROPRIETAIRE',...r}):fail(res,404,'SITE_NON_AUTORISE');
 }));
 router.post('/sites/:siteId/points/:pointId/liaison',guard(async(req,res,s)=>{
  if(!id(req,res,'siteId')||!id(req,res,'pointId'))return;
  const d=liaison(req.body);if(!d)return fail(res,400,'LIAISON_INVALIDE');const k=key(req,res);if(!k)return;
  return output(res,await store.lier({...s,siteId:req.params.siteId,pointId:req.params.pointId,requestKey:k,data:d}),'POINT_LIE_A_UN_PERIMETRE');
 }));
 router.post('/sites/:siteId/missions',guard(async(req,res,s)=>{
  if(!id(req,res,'siteId'))return;const d=attribution(req.body);if(!d)return fail(res,400,'MISSION_INVALIDE');
  const k=key(req,res);if(!k)return;
  return output(res,await store.attribuer({...s,siteId:req.params.siteId,requestKey:k,data:d}),'MISSION_ATTRIBUEE');
 }));
 router.get('/mes-missions',guard(async(_req,res,s)=>res.json({statut:'MISSIONS_PRIVEES',...await store.mesMissions(s)})));
 router.post('/missions/:missionId/soumettre',guard(async(req,res,s)=>{
  if(!id(req,res,'missionId'))return;const d=soumission(req.body);if(!d)return fail(res,400,'INDEX_INVALIDE');
  const k=key(req,res);if(!k)return;
  return output(res,await store.soumettre({...s,missionId:req.params.missionId,requestKey:k,data:d}),'DECLARATION_EN_REVUE');
 }));
 router.post('/missions/:missionId/decision',guard(async(req,res,s)=>{
  if(!id(req,res,'missionId'))return;const d=revue(req.body);if(!d)return fail(res,400,'DECISION_INVALIDE');
  const k=key(req,res);if(!k)return;
  return output(res,await store.decider({...s,missionId:req.params.missionId,requestKey:k,data:d}),'MISSION_EXAMINEE');
 }));
 return router;
}
module.exports={creerEnergyMeterParticipationRouter};
