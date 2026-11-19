'use strict';
/** API C3B : aucune route passeport/photo/OCR, ni permission depuis des champs client. */
const {TENANT}=require('./energy-case-domain');
const {UUID,submit,correct,decide}=require('./energy-catalogue-collab-domain');
function creerEnergyCatalogueCollabRouter({router,listerOrganisations,store,origineAutorisee,tenantAutorise}){
 const methods=['integrated','submit','my','queue','review','correct','history'];
 if(!router||typeof router.use!=='function'||typeof listerOrganisations!=='function'||!store||methods.some(x=>typeof store[x]!=='function'))throw TypeError('DEPENDANCES_C3B');
 router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');res.set('X-Content-Type-Options','nosniff');res.set('Referrer-Policy','no-referrer');next();});
 const fail=(res,status,code)=>res.status(status).json({statut:code});
 const id=(req,res,key)=>UUID.test(req.params?.[key]||'')?true:(fail(res,400,'IDENTIFIANT_INVALIDE'),false);
 const out=(res,r,name,created=false)=>r?.code==='OK'?res.status(created?201:200).json({statut:name,...r}):
  fail(res,['PERIMETRE_NON_AUTORISE','SOURCE_C2_NON_AUTORISEE','REVUE_NON_AUTORISEE','PROPOSITION_NON_AUTORISEE','HISTORIQUE_NON_AUTORISE'].includes(r?.code)?404:409,r?.code||'ACTION_REFUSEE');
 const guard=fn=>async(req,res)=>{try{
  const actor=Number(req.auth?.personneId),tenant=req.query?.tenant;
  if(!Number.isSafeInteger(actor)||actor<=0)return fail(res,401,'SESSION_REQUISE');
  if(typeof tenant!=='string'||!TENANT.test(tenant))return fail(res,400,'TENANT_INVALIDE');
  if(tenant!==tenantAutorise||!TENANT.test(tenantAutorise||''))return fail(res,403,'ENERGY_C3B_NON_ACTIVE');
  if(req.method!=='GET'&&req.get('Origin')!==origineAutorisee)return fail(res,403,'ORIGINE_REFUSEE');
  const orgs=await listerOrganisations(actor,tenant);
  if(!Array.isArray(orgs)||!orgs.some(o=>o.tenant_code===tenant))return fail(res,403,'TENANT_NON_AUTORISE');
  return await fn(req,res,{tenant,actor});
 }catch(e){console.error('EnergyCatalogueC3B:',e?.code||e?.name||'ERREUR');return fail(res,503,'CATALOGUE_COLLABORATIF_INDISPONIBLE');}};
 router.get('/mes-equipements-c2',guard(async(_req,res,s)=>res.json({statut:'MES_EQUIPEMENTS_INTEGRES_C2',...await store.integrated(s)})));
 router.get('/mes-propositions',guard(async(_req,res,s)=>res.json({statut:'MES_PROPOSITIONS_C3B',...await store.my(s)})));
 router.post('/sites/:siteId/propositions',guard(async(req,res,s)=>{
  if(!id(req,res,'siteId'))return;const data=submit(req.body);if(!data)return fail(res,400,'SAISIE_INVALIDE');
  const key=req.get('Idempotency-Key');if(!UUID.test(key||''))return fail(res,400,'CLE_IDEMPOTENCE_REQUISE');
  return out(res,await store.submit({...s,siteId:req.params.siteId,requestKey:key,data}),'CANDIDATE_COLLABORATIVE_SOUMISE',true);
 }));
 router.get('/sites/:siteId/a-verifier',guard(async(req,res,s)=>{
  if(!id(req,res,'siteId'))return;
  const grantId=req.query?.grantId;if(!UUID.test(grantId||''))return fail(res,400,'AFFECTATION_INVALIDE');
  return out(res,await store.queue({...s,siteId:req.params.siteId,grantId}),'REFERENCES_A_VERIFIER');
 }));
 router.post('/sites/:siteId/propositions/:proposalId/decision',guard(async(req,res,s)=>{
  if(!id(req,res,'siteId')||!id(req,res,'proposalId'))return;
  const data=decide(req.body);if(!data)return fail(res,400,'DECISION_INVALIDE');
  return out(res,await store.review({...s,siteId:req.params.siteId,proposalId:req.params.proposalId,data}),'DECISION_ENREGISTREE');
 }));
 router.post('/sites/:siteId/propositions/:proposalId/corriger',guard(async(req,res,s)=>{
  if(!id(req,res,'siteId')||!id(req,res,'proposalId'))return;
  const data=correct(req.body);if(!data)return fail(res,400,'CORRECTION_INVALIDE');
  return out(res,await store.correct({...s,siteId:req.params.siteId,proposalId:req.params.proposalId,data}),'CORRECTION_SOUMISE');
 }));
 router.get('/propositions/:proposalId/historique',guard(async(req,res,s)=>{
  if(!id(req,res,'proposalId'))return;
  return out(res,await store.history({...s,proposalId:req.params.proposalId}),'HISTORIQUE_C3B_PRIVE');
 }));
 return router;
}
module.exports={creerEnergyCatalogueCollabRouter};
