'use strict';
/** E-METER-1C2 — lecture seule. Autorité = session Core + tenant + propriétaire SQL. */
const {TENANT}=require('./energy-case-domain');
const {UUID}=require('./energy-meter-domain');
const {SOURCES,pagination}=require('./energy-meter-quality-domain');
function creerEnergyMeterQualityRouter({router,listerOrganisations,store,tenantAutorise}){
 if(!router?.use||!router?.get||typeof listerOrganisations!=='function'||
  !store||!['sites','releves','documents'].every(x=>typeof store[x]==='function'))throw TypeError('DEPENDANCES_QUALITE');
 const refuse=(res,n,c)=>res.status(n).json({statut:c});
 router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');
  res.set('X-Content-Type-Options','nosniff');res.set('Referrer-Policy','no-referrer');next();});
 const guard=fn=>async(req,res)=>{try{
  const actor=Number(req.auth?.personneId),tenant=req.query?.tenant;
  if(!Number.isSafeInteger(actor)||actor<=0)return refuse(res,401,'SESSION_REQUISE');
  if(typeof tenant!=='string'||!TENANT.test(tenant))return refuse(res,400,'TENANT_INVALIDE');
  if(!TENANT.test(tenantAutorise||'')||tenant!==tenantAutorise)return refuse(res,403,'CONTROLES_NON_ACTIFS');
  const organisations=await listerOrganisations(actor,tenant);
  if(!Array.isArray(organisations)||!organisations.some(x=>x.tenant_code===tenant))return refuse(res,403,'TENANT_NON_AUTORISE');
  return await fn(req,res,{actor,tenant});
 }catch(e){console.error('EMeter1C2:',e?.code||e?.name||'ERREUR');return refuse(res,503,'CONTROLES_INDISPONIBLES');}};
 router.get('/sites',guard(async(_req,res,s)=>res.json({statut:'SITES_QUALITE_PRIVES',...await store.sites(s)})));
 router.get('/sites/:siteId/signaux',guard(async(req,res,s)=>{
  if(!UUID.test(req.params?.siteId||''))return refuse(res,400,'SITE_INVALIDE');
  const offset=pagination(req.query?.offset);if(offset===null)return refuse(res,400,'PAGINATION_INVALIDE');
  const source=req.query?.source??'RELEVES';if(!SOURCES.includes(source))return refuse(res,400,'SOURCE_INVALIDE');
  const fn=source==='RELEVES'?store.releves:store.documents;
  const result=await fn({...s,siteId:req.params.siteId,offset});
  return result?res.json({statut:'SIGNAUX_PRIVES_NON_CERTIFIES',...result}):refuse(res,404,'SITE_NON_AUTORISE');
 }));
 return router;
}
module.exports={creerEnergyMeterQualityRouter};
