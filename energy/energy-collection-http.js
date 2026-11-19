'use strict';
/** Façade C2 : Core Auth injecté, Scope C1, origine stricte, aucune API passeport/photo. */
const {UUID,data,revise,decision}=require('./energy-collection-domain');
const {TENANT}=require('./energy-case-domain');
function creerEnergyCollectionRouter({router,listerOrganisations,store,origineAutorisee,tenantAutorise}){
 const required=['submit','my','queue','review','correct','history'];
 if(!router||typeof router.use!=='function'||typeof listerOrganisations!=='function'||!store||required.some(k=>typeof store[k]!=='function'))throw TypeError('DEPENDANCES_COLLECTION_C2');
 router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');res.set('X-Content-Type-Options','nosniff');res.set('Referrer-Policy','no-referrer');next();});
 const fail=(res,status,code)=>res.status(status).json({statut:code});
 const output=(res,result,success,created=false)=>result?.code==='OK'?res.status(created?201:200).json({statut:success,...result}):
   fail(res,['PERIMETRE_NON_AUTORISE','PROPOSITION_NON_AUTORISEE','REVUE_NON_AUTORISEE','HISTORIQUE_NON_AUTORISE'].includes(result?.code)?404:409,result?.code||'ACTION_REFUSEE');
 const id=(req,res,name)=>{if(UUID.test(req.params?.[name]||''))return true;fail(res,400,'IDENTIFIANT_INVALIDE');return false;};
 const guard=fn=>async(req,res)=>{try{
  const actor=Number(req.auth?.personneId),tenant=req.query?.tenant;
  if(!Number.isSafeInteger(actor)||actor<=0)return fail(res,401,'SESSION_REQUISE');
  if(typeof tenant!=='string'||!TENANT.test(tenant))return fail(res,400,'TENANT_INVALIDE');
  if(tenant!==tenantAutorise||!TENANT.test(tenantAutorise||''))return fail(res,403,'ENERGY_C2_NON_ACTIVE');
  if(req.method!=='GET'&&req.get('Origin')!==origineAutorisee)return fail(res,403,'ORIGINE_REFUSEE');
  const orgs=await listerOrganisations(actor,tenant);
  if(!Array.isArray(orgs)||!orgs.some(o=>o.tenant_code===tenant))return fail(res,403,'TENANT_NON_AUTORISE');
  return await fn(req,res,{tenant,actor});
 }catch(e){console.error('EnergyCollecteC2:',e?.code||e?.name||'ERREUR');return fail(res,503,'COLLECTE_INDISPONIBLE');}};
 router.post('/sites/:siteId/propositions',guard(async(req,res,s)=>{
  if(!id(req,res,'siteId'))return;
  const body=data(req.body);if(!body)return fail(res,400,'SAISIE_INVALIDE');
  const key=req.get('Idempotency-Key');if(!UUID.test(key||''))return fail(res,400,'CLE_IDEMPOTENCE_REQUISE');
  return output(res,await store.submit({...s,siteId:req.params.siteId,requestKey:key,data:body}),'PROPOSITION_SOUMISE',true);
 }));
 router.get('/mes-propositions',guard(async(_req,res,s)=>res.json({statut:'MES_PROPOSITIONS',...await store.my(s)})));
 router.get('/sites/:siteId/a-verifier',guard(async(req,res,s)=>{
  if(!id(req,res,'siteId'))return;
  const grantId=req.query?.grantId;if(!UUID.test(grantId||''))return fail(res,400,'RESPONSABILITE_INVALIDE');
  return output(res,await store.queue({...s,siteId:req.params.siteId,grantId}),'PROPOSITIONS_A_VERIFIER');
 }));
 router.post('/sites/:siteId/propositions/:proposalId/decision',guard(async(req,res,s)=>{
  if(!id(req,res,'siteId')||!id(req,res,'proposalId'))return;
  const d=decision(req.body);if(!d)return fail(res,400,'DECISION_INVALIDE');
  return output(res,await store.review({...s,siteId:req.params.siteId,proposalId:req.params.proposalId,data:d}),'DECISION_ENREGISTREE');
 }));
 router.post('/sites/:siteId/propositions/:proposalId/corriger',guard(async(req,res,s)=>{
  if(!id(req,res,'siteId')||!id(req,res,'proposalId'))return;
  const d=revise(req.body);if(!d)return fail(res,400,'CORRECTION_INVALIDE');
  return output(res,await store.correct({...s,siteId:req.params.siteId,proposalId:req.params.proposalId,data:d}),'CORRECTION_SOUMISE');
 }));
 router.get('/propositions/:proposalId/historique',guard(async(req,res,s)=>{
  if(!id(req,res,'proposalId'))return;
  return output(res,await store.history({...s,proposalId:req.params.proposalId}),'HISTORIQUE_PRIVE');
 }));
 return router;
}
module.exports={creerEnergyCollectionRouter};
