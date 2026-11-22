'use strict';
/** E-METER-1E1 : seule la personne Core proprietaire peut confirmer un remplacement. */
const {TENANT}=require('./energy-case-domain');
const {UUID,analyserRemplacement}=require('./energy-meter-replacement-domain');
function creerEnergyMeterReplacementRouter({router,listerOrganisations,store,origineAutorisee,tenantAutorise}){
 if(!router?.use||!router?.get||!router?.post||typeof listerOrganisations!=='function'||typeof store?.sites!=='function'||typeof store?.remplacer!=='function')throw TypeError('DEPENDANCES_REMPLACEMENT');
 const fail=(res,status,code)=>res.status(status).json({statut:code});
 router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');res.set('X-Content-Type-Options','nosniff');res.set('Referrer-Policy','no-referrer');next();});
 router.get('/sites',async(req,res)=>{
  try{
   const actor=Number(req.auth?.personneId),tenant=req.query?.tenant;
   if(!Number.isSafeInteger(actor)||actor<=0)return fail(res,401,'SESSION_REQUISE');
   if(typeof tenant!=='string'||!TENANT.test(tenant))return fail(res,400,'TENANT_INVALIDE');
   if(!TENANT.test(tenantAutorise||'')||tenant!==tenantAutorise)return fail(res,403,'REMPLACEMENT_NON_ACTIF');
   const orgs=await listerOrganisations(actor,tenant);
   if(!Array.isArray(orgs)||!orgs.some(o=>o.tenant_code===tenant))return fail(res,403,'TENANT_NON_AUTORISE');
   const data=await store.sites({tenant,actor});return res.json({statut:'SITES_PRIVES',...data});
  }catch(e){console.error('EMeter1E1:',e?.code||e?.name||'ERREUR');return fail(res,503,'REMPLACEMENT_INDISPONIBLE');}
 });
 router.post('/sites/:siteId/points/:pointId/compteurs/:meterId/remplacer',async(req,res)=>{
  try{
   const actor=Number(req.auth?.personneId),tenant=req.query?.tenant;
   if(!Number.isSafeInteger(actor)||actor<=0)return fail(res,401,'SESSION_REQUISE');
   if(typeof tenant!=='string'||!TENANT.test(tenant))return fail(res,400,'TENANT_INVALIDE');
   if(!TENANT.test(tenantAutorise||'')||tenant!==tenantAutorise)return fail(res,403,'REMPLACEMENT_NON_ACTIF');
   if(req.get?.('Origin')!==origineAutorisee)return fail(res,403,'ORIGINE_REFUSEE');
   for(const name of ['siteId','pointId','meterId'])if(!UUID.test(req.params?.[name]||''))return fail(res,400,'IDENTIFIANT_INVALIDE');
   const requestKey=req.get?.('Idempotency-Key');if(!UUID.test(requestKey||''))return fail(res,400,'CLE_IDEMPOTENCE_REQUISE');
   const data=analyserRemplacement(req.body);if(!data)return fail(res,400,'REMPLACEMENT_INVALIDE');
   const orgs=await listerOrganisations(actor,tenant);
   if(!Array.isArray(orgs)||!orgs.some(o=>o.tenant_code===tenant))return fail(res,403,'TENANT_NON_AUTORISE');
   const result=await store.remplacer({actor,tenant,siteId:req.params.siteId,pointId:req.params.pointId,
     meterId:req.params.meterId,requestKey,data});
   if(result.code==='OK')return res.status(result.nouveau?201:200).json({statut:'COMPTEUR_REMPLACE',...result});
   if(['SITE_NON_AUTORISE','POINT_NON_AUTORISE','COMPTEUR_NON_AUTORISE'].includes(result.code))return fail(res,404,result.code);
   return fail(res,409,result.code||'REMPLACEMENT_REFUSE');
  }catch(e){console.error('EMeter1E1:',e?.code||e?.name||'ERREUR');return fail(res,503,'REMPLACEMENT_INDISPONIBLE');}
 });
 return router;
}
module.exports={creerEnergyMeterReplacementRouter};
