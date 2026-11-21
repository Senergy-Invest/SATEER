'use strict';
/** E-METER-1A : API stricte, même session Core et même périmètre propriétaire que MVP02. */
const {TENANT}=require('./energy-case-domain');
const {UUID,point,appareil,registre,indexManuel}=require('./energy-meter-domain');
function creerEnergyMeterRouter({router,listerOrganisations,store,origineAutorisee,tenantAutorise}){
 const methods=['sites','lister','creerPoint','creerCompteur','creerRegistre','creerReleve','historique'];
 if(!router?.use||!router?.get||!router?.post||typeof listerOrganisations!=='function'||!store||methods.some(x=>typeof store[x]!=='function'))throw TypeError('DEPENDANCES_E_METER');
 const fail=(res,n,c)=>res.status(n).json({statut:c});
 router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');res.set('X-Content-Type-Options','nosniff');res.set('Referrer-Policy','no-referrer');next();});
 const guard=fn=>async(req,res)=>{try{
   const actor=Number(req.auth?.personneId),tenant=req.query?.tenant;
   if(!Number.isSafeInteger(actor)||actor<=0)return fail(res,401,'SESSION_REQUISE');
   if(typeof tenant!=='string'||!TENANT.test(tenant))return fail(res,400,'TENANT_INVALIDE');
   if(!TENANT.test(tenantAutorise||'')||tenant!==tenantAutorise)return fail(res,403,'E_METER_NON_ACTIF');
   if(req.method!=='GET'&&req.get?.('Origin')!==origineAutorisee)return fail(res,403,'ORIGINE_REFUSEE');
   const orgs=await listerOrganisations(actor,tenant);
   if(!Array.isArray(orgs)||!orgs.some(o=>o.tenant_code===tenant))return fail(res,403,'TENANT_NON_AUTORISE');
   return fn(req,res,{actor,tenant});
  }catch(e){console.error('EMeter1A:',e?.code||e?.name||'ERREUR');return fail(res,503,'E_METER_INDISPONIBLE');}};
 const key=(req,res)=>{const k=req.get?.('Idempotency-Key');if(!UUID.test(k||'')){fail(res,400,'CLE_IDEMPOTENCE_REQUISE');return null;}return k;};
 const valid=(req,res,...names)=>names.every(n=>UUID.test(req.params?.[n]||''))||!!fail(res,400,'IDENTIFIANT_INVALIDE')&&false;
 const result=(res,r,success)=>r?.code==='OK'?res.status(r.nouveau?201:200).json({statut:success,...r}):fail(res,
  ['SITE_NON_AUTORISE','POINT_NON_AUTORISE','COMPTEUR_NON_AUTORISE','REGISTRE_NON_AUTORISE'].includes(r?.code)?404:409,r?.code||'E_METER_INDISPONIBLE');
 router.get('/sites',guard(async(_q,res,s)=>res.json({statut:'SITES_PRIVES',...await store.sites(s)})));
 router.get('/sites/:siteId/points',guard(async(req,res,s)=>{
  if(!valid(req,res,'siteId'))return;
  const v=await store.lister({...s,siteId:req.params.siteId});return v?res.json({statut:'POINTS_DE_MESURE_PRIVES',...v}):fail(res,404,'SITE_NON_AUTORISE');
 }));
 router.post('/sites/:siteId/points',guard(async(req,res,s)=>{
  if(!valid(req,res,'siteId'))return;const d=point(req.body);if(!d)return fail(res,400,'POINT_INVALIDE');const k=key(req,res);if(!k)return;
  return result(res,await store.creerPoint({...s,siteId:req.params.siteId,requestKey:k,data:d}),'POINT_DECLARE');
 }));
 router.post('/sites/:siteId/points/:pointId/compteurs',guard(async(req,res,s)=>{
  if(!valid(req,res,'siteId','pointId'))return;const d=appareil(req.body);if(!d)return fail(res,400,'COMPTEUR_INVALIDE');const k=key(req,res);if(!k)return;
  return result(res,await store.creerCompteur({...s,siteId:req.params.siteId,pointId:req.params.pointId,requestKey:k,data:d}),'COMPTEUR_DECLARE');
 }));
 router.post('/sites/:siteId/compteurs/:meterId/registres',guard(async(req,res,s)=>{
  if(!valid(req,res,'siteId','meterId'))return;const d=registre(req.body);if(!d)return fail(res,400,'REGISTRE_INVALIDE');const k=key(req,res);if(!k)return;
  return result(res,await store.creerRegistre({...s,siteId:req.params.siteId,meterId:req.params.meterId,requestKey:k,data:d}),'REGISTRE_DECLARE');
 }));
 router.post('/sites/:siteId/registres/:registerId/releves',guard(async(req,res,s)=>{
  if(!valid(req,res,'siteId','registerId'))return;const d=indexManuel(req.body);if(!d)return fail(res,400,'RELEVE_INVALIDE');const k=key(req,res);if(!k)return;
  return result(res,await store.creerReleve({...s,siteId:req.params.siteId,registerId:req.params.registerId,requestKey:k,data:d}),'INDEX_DECLARE_NON_VERIFIE');
 }));
 router.get('/sites/:siteId/registres/:registerId/releves',guard(async(req,res,s)=>{
  if(!valid(req,res,'siteId','registerId'))return;
  const offset=req.query?.offset===undefined?0:Number(req.query.offset);
  if(!Number.isSafeInteger(offset)||offset<0||offset>10000)return fail(res,400,'PAGINATION_INVALIDE');
  const v=await store.historique({...s,siteId:req.params.siteId,registerId:req.params.registerId,offset});
  return v?res.json({statut:'HISTORIQUE_INDEX_DECLARES',...v}):fail(res,404,'REGISTRE_NON_AUTORISE');
 }));
 return router;
}
module.exports={creerEnergyMeterRouter};
