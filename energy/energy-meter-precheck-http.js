'use strict';
/** Route GET uniquement ; la décision et les écritures demeurent dans E-PARTICIPATION-1. */
const {TENANT}=require('./energy-case-domain');
const {UUID}=require('./energy-meter-domain');
function creerEnergyMeterPrecheckRouter({router,listerOrganisations,store,tenantAutorise}){
 if(!router?.use||!router?.get||typeof router.post!=='function'||typeof listerOrganisations!=='function'||typeof store?.apercu!=='function')throw TypeError('DEPENDANCES_PRECONTROLE');
 const fail=(res,n,code)=>res.status(n).json({statut:code});
 router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');res.set('Referrer-Policy','no-referrer');res.set('X-Content-Type-Options','nosniff');next();});
 router.get('/missions/:missionId/apercu',async(req,res)=>{
  try{
   const actor=Number(req.auth?.personneId),tenant=req.query?.tenant,missionId=req.params?.missionId;
   if(!Number.isSafeInteger(actor)||actor<1)return fail(res,401,'SESSION_REQUISE');
   if(typeof tenant!=='string'||!TENANT.test(tenant))return fail(res,400,'TENANT_INVALIDE');
   if(tenant!==tenantAutorise||!TENANT.test(tenantAutorise||''))return fail(res,403,'PRECONTROLE_NON_ACTIF');
   if(!UUID.test(missionId||''))return fail(res,400,'MISSION_INVALIDE');
   const orgs=await listerOrganisations(actor,tenant);
   if(!Array.isArray(orgs)||!orgs.some(o=>o.tenant_code===tenant))return fail(res,403,'TENANT_NON_AUTORISE');
   const result=await store.apercu({tenant,actor,missionId});
   return result?res.json({statut:'PRECONTROLE_INDICATIF',...result}):fail(res,404,'MISSION_NON_AUTORISEE_OU_NON_REVISABLE');
  }catch(e){console.error('EMeter3:',e?.code||e?.name||'ERREUR');return fail(res,503,'PRECONTROLE_INDISPONIBLE');}
 });
 return router;
}
module.exports={creerEnergyMeterPrecheckRouter};
