'use strict';
/** E-METER-1C1 : Core Auth/tenant/proprietaire; GET historique et POST rectification versionnee. */
const {UUID}=require('./energy-meter-domain');
const {TENANT}=require('./energy-case-domain');
const {rectification}=require('./energy-billing-revision-domain');
function creerEnergyBillingRevisionRouter({router,listerOrganisations,store,origineAutorisee,tenantAutorise}){
 if(!router?.use||!router?.get||!router?.post||typeof listerOrganisations!=='function'||
    !store||!['get','creer','lister'].every(k=>typeof store[k]==='function'))throw TypeError('DEPENDANCES_RECTIFICATION');
 const refuse=(res,s,m)=>res.status(s).json({statut:m});
 router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');
  res.set('X-Content-Type-Options','nosniff');res.set('Referrer-Policy','no-referrer');next();});
 const guard=fn=>async(req,res)=>{try{
  const actor=Number(req.auth?.personneId),tenant=req.query?.tenant;
  if(!Number.isSafeInteger(actor)||actor<=0)return refuse(res,401,'SESSION_REQUISE');
  if(typeof tenant!=='string'||!TENANT.test(tenant))return refuse(res,400,'TENANT_INVALIDE');
  if(!TENANT.test(tenantAutorise||'')||tenant!==tenantAutorise)return refuse(res,403,'RECTIFICATION_NON_ACTIVE');
  if(req.method!=='GET'&&req.get?.('Origin')!==origineAutorisee)return refuse(res,403,'ORIGINE_REFUSEE');
  const orgs=await listerOrganisations(actor,tenant);
  if(!Array.isArray(orgs)||!orgs.some(o=>o.tenant_code===tenant))return refuse(res,403,'TENANT_NON_AUTORISE');
  if(!UUID.test(req.params?.siteId||'')||!UUID.test(req.params?.declarationId||''))return refuse(res,400,'IDENTIFIANT_INVALIDE');
  return await fn(req,res,{tenant,actor,siteId:req.params.siteId,declarationId:req.params.declarationId});
 }catch(e){console.error('EnergyBillingRevision:',e?.code||e?.name||'ERREUR');return refuse(res,503,'RECTIFICATION_INDISPONIBLE');}};
 router.get('/sites/:siteId/rectifications',async(req,res)=>{try{
  const actor=Number(req.auth?.personneId),tenant=req.query?.tenant;
  if(!Number.isSafeInteger(actor)||actor<=0)return refuse(res,401,'SESSION_REQUISE');
  if(typeof tenant!=='string'||!TENANT.test(tenant))return refuse(res,400,'TENANT_INVALIDE');
  if(!TENANT.test(tenantAutorise||'')||tenant!==tenantAutorise)return refuse(res,403,'RECTIFICATION_NON_ACTIVE');
  const orgs=await listerOrganisations(actor,tenant);
  if(!Array.isArray(orgs)||!orgs.some(o=>o.tenant_code===tenant))return refuse(res,403,'TENANT_NON_AUTORISE');
  if(!UUID.test(req.params?.siteId||''))return refuse(res,400,'IDENTIFIANT_INVALIDE');
  const raw=req.query?.offset,offset=raw===undefined?0:Number(raw);
  if(!Number.isSafeInteger(offset)||offset<0||offset>10000)return refuse(res,400,'PAGINATION_INVALIDE');
  const r=await store.lister({actor,tenant,siteId:req.params.siteId,offset});
  return r?res.json({statut:'DECLARATIONS_REVISEES_PRIVEES',...r}):refuse(res,404,'SITE_NON_AUTORISE');
 }catch(e){console.error('EnergyBillingRevision:',e?.code||e?.name||'ERREUR');return refuse(res,503,'RECTIFICATION_INDISPONIBLE');}});
 const route='/sites/:siteId/declarations/:declarationId/rectifications';
 router.get(route,guard(async(req,res,s)=>{
  const v=await store.get(s);return v?res.json({statut:'HISTORIQUE_RECTIFICATIONS_PRIVE',...v}):refuse(res,404,'DECLARATION_NON_AUTORISEE');
 }));
 router.post(route,guard(async(req,res,s)=>{
  const data=rectification(req.body);if(!data)return refuse(res,400,'RECTIFICATION_INVALIDE');
  const key=req.get?.('Idempotency-Key');if(!UUID.test(key||''))return refuse(res,400,'CLE_IDEMPOTENCE_REQUISE');
  const v=await store.creer({...s,requestKey:key,data});
  if(v?.code==='OK')return res.status(v.nouveau?201:200).json({statut:'RECTIFICATION_DECLAREE_NON_VERIFIEE',...v});
  return refuse(res,['SITE_NON_AUTORISE','DECLARATION_NON_AUTORISEE','POINT_NON_AUTORISE','COMPTEUR_NON_AUTORISE'].includes(v?.code)?404:409,v?.code||'RECTIFICATION_INDISPONIBLE');
 }));
 return router;
}
module.exports={creerEnergyBillingRevisionRouter};
