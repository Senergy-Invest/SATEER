'use strict';
const {UUID,TENANT}=require('./energy-case-domain');
const {VIEWS,position}=require('./energy-sketch-domain');
function creerEnergySketchRouter({router,listerOrganisations,store,origineAutorisee,tenantAutorise}){
 if(!router?.use||!listerOrganisations||!store?.list||!store?.save)throw TypeError('DEPENDANCES_C4B');
 const fail=(res,n,code)=>res.status(n).json({statut:code});
 router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');res.set('X-Content-Type-Options','nosniff');res.set('Referrer-Policy','no-referrer');next();});
 const guard=fn=>async(req,res)=>{try{
  const actor=Number(req.auth?.personneId),tenant=req.query?.tenant;
  if(!Number.isSafeInteger(actor)||actor<=0)return fail(res,401,'SESSION_REQUISE');
  if(typeof tenant!=='string'||!TENANT.test(tenant))return fail(res,400,'TENANT_INVALIDE');
  if(tenant!==tenantAutorise||!TENANT.test(tenantAutorise||''))return fail(res,403,'C4B_NON_ACTIF');
  if(req.method!=='GET'&&req.get('Origin')!==origineAutorisee)return fail(res,403,'ORIGINE_REFUSEE');
  const org=await listerOrganisations(actor,tenant);
  if(!Array.isArray(org)||!org.some(o=>o.tenant_code===tenant))return fail(res,403,'TENANT_NON_AUTORISE');
  if(!UUID.test(req.params?.siteId||''))return fail(res,400,'SITE_INVALIDE');
  return await fn(req,res,{actor,tenant,siteId:req.params.siteId});
 }catch(e){console.error('EnergySketchC4B:',e?.code||e?.name||'ERREUR');return fail(res,503,'ESQUISSE_INDISPONIBLE');}};
 router.get('/sites/:siteId/positions',guard(async(req,res,s)=>{
  const vue=req.query?.vue,offset=req.query?.offset===undefined?0:Number(req.query.offset);
  if(!VIEWS.includes(vue)||!Number.isSafeInteger(offset)||offset<0||offset>10000)return fail(res,400,'LECTURE_INVALIDE');
  const d=await store.list({...s,vue,offset});return d?res.json({statut:'POSITIONS_PRIVEES',...d}):fail(res,404,'SITE_NON_AUTORISE');
 }));
 router.post('/sites/:siteId/positions',guard(async(req,res,s)=>{
  const data=position(req.body);if(!data)return fail(res,400,'POSITION_INVALIDE');
  const key=req.get('Idempotency-Key');if(!UUID.test(key||''))return fail(res,400,'CLE_IDEMPOTENCE_REQUISE');
  const r=await store.save({...s,data,requestKey:key});
  return r.code==='OK'?res.json({statut:'POSITION_ENREGISTREE',...r}):fail(res,['SITE_NON_AUTORISE','ELEMENT_NON_AUTORISE'].includes(r.code)?404:409,r.code);
 }));
 return router;
}
module.exports={creerEnergySketchRouter};
