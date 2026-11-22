'use strict';
/** E-METER-1C3 : routes GET privées uniquement ; Core/tenant/site propriétaire. */
const {TENANT}=require('./energy-case-domain');
const {UUID}=require('./energy-meter-domain');
const {pagination}=require('./energy-meter-proximity-domain');
function creerEnergyMeterProximityRouter({router,listerOrganisations,store,tenantAutorise}){
 if(!router?.get||!router?.use||typeof listerOrganisations!=='function'||
   !store||!['sites','releves'].every(k=>typeof store[k]==='function'))throw TypeError('DEPENDANCES_PROXIMITE');
 const refuse=(res,n,code)=>res.status(n).json({statut:code});
 router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');
  res.set('X-Content-Type-Options','nosniff');res.set('Referrer-Policy','no-referrer');next();});
 const guard=fn=>async(req,res)=>{try{
  const actor=Number(req.auth?.personneId),tenant=req.query?.tenant;
  if(!Number.isSafeInteger(actor)||actor<=0)return refuse(res,401,'SESSION_REQUISE');
  if(typeof tenant!=='string'||!TENANT.test(tenant))return refuse(res,400,'TENANT_INVALIDE');
  if(!TENANT.test(tenantAutorise||'')||tenant!==tenantAutorise)return refuse(res,403,'PROXIMITE_NON_ACTIVE');
  const orgs=await listerOrganisations(actor,tenant);
  if(!Array.isArray(orgs)||!orgs.some(x=>x.tenant_code===tenant))return refuse(res,403,'TENANT_NON_AUTORISE');
  return fn(req,res,{actor,tenant});
 }catch(e){console.error('EMeter1C3:',e?.code||e?.name||'ERREUR');return refuse(res,503,'PROXIMITE_INDISPONIBLE');}};
 router.get('/sites',guard(async(_req,res,s)=>res.json({statut:'SITES_PROXIMITE_PRIVES',...await store.sites(s)})));
 router.get('/sites/:siteId/signaux',guard(async(req,res,s)=>{
  if(!UUID.test(req.params?.siteId||''))return refuse(res,400,'SITE_INVALIDE');
  const offset=pagination(req.query?.offset);
  if(offset===null)return refuse(res,400,'PAGINATION_INVALIDE');
  const out=await store.releves({...s,siteId:req.params.siteId,offset});
  return out?res.json({statut:'SIGNAUX_PROXIMITE_PRIVES_NON_CERTIFIES',...out}):refuse(res,404,'SITE_NON_AUTORISE');
 }));
 return router;
}
module.exports={creerEnergyMeterProximityRouter};
