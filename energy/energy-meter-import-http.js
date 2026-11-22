'use strict';
/** Routes E-METER-1D1 : session Core, propriétaire, tenant, Origin, aucune session ad hoc. */
const {TENANT}=require('./energy-case-domain');
const {UUID}=require('./energy-meter-domain');
const {CsvInvalide,analyserCsv}=require('./energy-meter-import-domain');
function creerEnergyMeterImportRouter({router,listerOrganisations,store,origineAutorisee,tenantAutorise}){
 if(!router?.use||!router?.get||!router?.post||typeof listerOrganisations!=='function'||
    !store||!['sites','apercu','importer'].every(k=>typeof store[k]==='function'))
  throw TypeError('DEPENDANCES_IMPORT_E_METER');
 const fail=(res,status,code,numero)=>res.status(status).json({statut:code,...(numero?{ligne:numero}:{})});
 router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');
   res.set('X-Content-Type-Options','nosniff');res.set('Referrer-Policy','no-referrer');next();});
 const guard=fn=>async(req,res)=>{
  try{
   const actor=Number(req.auth?.personneId),tenant=req.query?.tenant;
   if(!Number.isSafeInteger(actor)||actor<=0)return fail(res,401,'SESSION_REQUISE');
   if(typeof tenant!=='string'||!TENANT.test(tenant))return fail(res,400,'TENANT_INVALIDE');
   if(!TENANT.test(tenantAutorise||'')||tenant!==tenantAutorise)return fail(res,403,'IMPORT_NON_ACTIF');
   if(req.method!=='GET'&&req.get?.('Origin')!==origineAutorisee)return fail(res,403,'ORIGINE_REFUSEE');
   const orgs=await listerOrganisations(actor,tenant);
   if(!Array.isArray(orgs)||!orgs.some(x=>x.tenant_code===tenant))return fail(res,403,'TENANT_NON_AUTORISE');
   return await fn(req,res,{actor,tenant});
  }catch(e){
   if(e instanceof CsvInvalide)return fail(res,400,e.code,e.numero);
   if(e?.code==='IMPORT_CONFLIT_TRANSACTION'||e?.code==='23505')return fail(res,409,'IMPORT_CONFLIT_TRANSACTION');
   console.error('EMeter1D1:',e?.code||e?.name||'ERREUR');
   return fail(res,503,'IMPORT_INDISPONIBLE');
  }
 };
 const file=(req,res)=>{
  const data=req.body;
  if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(k=>!['csv','confirmation'].includes(k))||
    typeof data.csv!=='string'){
   fail(res,400,'CORPS_CSV_INVALIDE');return null;
  }
  return analyserCsv(data.csv);
 };
 router.get('/sites',guard(async(_req,res,s)=>res.json({statut:'SITES_IMPORT_PRIVES',...await store.sites(s)})));
 router.post('/sites/:siteId/apercu',guard(async(req,res,s)=>{
  if(!UUID.test(req.params?.siteId||''))return fail(res,400,'SITE_INVALIDE');
  const lot=file(req,res);if(!lot)return;
  const v=await store.apercu({...s,siteId:req.params.siteId,lot});
  return v?res.json({statut:'APERCU_CSV_NON_CERTIFIE',...v}):fail(res,404,'SITE_NON_AUTORISE');
 }));
 router.post('/sites/:siteId/valider',guard(async(req,res,s)=>{
  if(!UUID.test(req.params?.siteId||''))return fail(res,400,'SITE_INVALIDE');
  if(req.body?.confirmation!=='CONFIRMER_IMPORT')return fail(res,400,'CONFIRMATION_IMPORT_REQUISE');
  const requestKey=req.get?.('Idempotency-Key');
  if(!UUID.test(requestKey||''))return fail(res,400,'CLE_IDEMPOTENCE_REQUISE');
  const lot=file(req,res);if(!lot)return;
  const v=await store.importer({...s,siteId:req.params.siteId,lot,requestKey});
  if(v?.code==='SITE_NON_AUTORISE')return fail(res,404,'SITE_NON_AUTORISE');
  if(v?.code==='CLE_REUTILISEE')return fail(res,409,'CLE_REUTILISEE');
  if(v?.code==='LOT_NON_IMPORTABLE')return res.status(409).json({statut:'LOT_NON_IMPORTABLE',
    lignes:v.lignes.map(x=>({numero:x.numero,statut:x.statut,motif:x.motif}))});
  if(v?.code!=='OK')return fail(res,503,'IMPORT_INDISPONIBLE');
  return res.status(v.nouveau?201:200).json({statut:'IMPORT_DECLARE_NON_VERIFIE',...v,
    aucunCalculConsommation:true});
 }));
 return router;
}
module.exports={creerEnergyMeterImportRouter};
