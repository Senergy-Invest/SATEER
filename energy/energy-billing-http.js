'use strict';
/** E-METER-1B1 : origine exacte et autorisation Core + tenant + site propriétaire. */
const {TENANT}=require('./energy-case-domain');
const {UUID}=require('./energy-meter-domain');
const {declaration}=require('./energy-billing-domain');
function creerEnergyBillingRouter({router,listerOrganisations,store,origineAutorisee,tenantAutorise}){
 if(!router?.use||!router?.get||!router?.post||typeof listerOrganisations!=='function'||!store||
   ['sites','lister','creer'].some(n=>typeof store[n]!=='function'))throw TypeError('DEPENDANCES_BILLING');
 const fail=(res,n,c)=>res.status(n).json({statut:c});
 router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');res.set('X-Content-Type-Options','nosniff');res.set('Referrer-Policy','no-referrer');next();});
 const guard=fn=>async(req,res)=>{try{
  const actor=Number(req.auth?.personneId),tenant=req.query?.tenant;
  if(!Number.isSafeInteger(actor)||actor<=0)return fail(res,401,'SESSION_REQUISE');
  if(typeof tenant!=='string'||!TENANT.test(tenant))return fail(res,400,'TENANT_INVALIDE');
  if(!TENANT.test(tenantAutorise||'')||tenant!==tenantAutorise)return fail(res,403,'E_BILLING_NON_ACTIF');
  if(req.method!=='GET'&&req.get?.('Origin')!==origineAutorisee)return fail(res,403,'ORIGINE_REFUSEE');
  const orgs=await listerOrganisations(actor,tenant);
  if(!Array.isArray(orgs)||!orgs.some(o=>o.tenant_code===tenant))return fail(res,403,'TENANT_NON_AUTORISE');
  return await fn(req,res,{actor,tenant});
 }catch(e){console.error('EMeter1B1:',e?.code||e?.name||'ERREUR');return fail(res,503,'E_BILLING_INDISPONIBLE');}};
 router.get('/sites',guard(async(_req,res,s)=>res.json({statut:'SITES_BILLING_PRIVES',...await store.sites(s)})));
 const checkId=(req,res)=>UUID.test(req.params?.siteId||'')?true:(fail(res,400,'SITE_INVALIDE'),false);
 router.get('/sites/:siteId/declarations',guard(async(req,res,s)=>{
  if(!checkId(req,res))return;
  const offset=req.query?.offset===undefined?0:Number(req.query.offset);
  if(!Number.isSafeInteger(offset)||offset<0||offset>10000)return fail(res,400,'PAGINATION_INVALIDE');
  const r=await store.lister({...s,siteId:req.params.siteId,offset});
  return r?res.json({statut:'DECLARATIONS_BILLING_PRIVEES',...r}):fail(res,404,'SITE_NON_AUTORISE');
 }));
 router.post('/sites/:siteId/declarations',guard(async(req,res,s)=>{
  if(!checkId(req,res))return;
  const d=declaration(req.body);if(!d)return fail(res,400,'DECLARATION_INVALIDE');
  const k=req.get?.('Idempotency-Key');if(!UUID.test(k||''))return fail(res,400,'CLE_IDEMPOTENCE_REQUISE');
  const r=await store.creer({...s,siteId:req.params.siteId,requestKey:k,data:d});
  return r?.code==='OK'?res.status(r.nouveau?201:200).json({statut:'DOCUMENT_DECLARE_NON_VERIFIE',...r}):
   fail(res,['SITE_NON_AUTORISE','POINT_NON_AUTORISE','COMPTEUR_NON_AUTORISE'].includes(r?.code)?404:409,r?.code||'E_BILLING_INDISPONIBLE');
 }));
 return router;
}
module.exports={creerEnergyBillingRouter};
