'use strict';
const {UUID,TENANT}=require('./energy-case-domain');
const {asset,link,usage}=require('./energy-topology-domain');
function creerEnergyTopologyRouter({router,listerOrganisations,store,origineAutorisee,tenantAutorise}){
 const names=['sites','carte','newAsset','newLink','newUsage','withdraw'];
 if(!router||typeof router.use!=='function'||!store||names.some(n=>typeof store[n]!=='function')||typeof listerOrganisations!=='function')throw TypeError('DEPENDANCES_C4A');
 router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');res.set('X-Content-Type-Options','nosniff');res.set('Referrer-Policy','no-referrer');next();});
 const fail=(res,status,code)=>res.status(status).json({statut:code});
 const respond=(res,v,ok,created=false)=>v?.code==='OK'?res.status(created?201:200).json({statut:ok,...v}):
  fail(res,['SITE_NON_AUTORISE','SOURCE_NON_AUTORISEE','CIBLE_NON_AUTORISEE','LIEU_NON_AUTORISE','EQUIPEMENT_NON_AUTORISE','LIEN_NON_AUTORISE'].includes(v?.code)?404:409,v?.code||'CARTE_INDISPONIBLE');
 const valid=(req,res,key)=>UUID.test(req.params?.[key]||'')?true:(fail(res,400,'IDENTIFIANT_INVALIDE'),false);
 const guard=fn=>async(req,res)=>{try{
  const actor=Number(req.auth?.personneId),tenant=req.query?.tenant;
  if(!Number.isSafeInteger(actor)||actor<=0)return fail(res,401,'SESSION_REQUISE');
  if(typeof tenant!=='string'||!TENANT.test(tenant))return fail(res,400,'TENANT_INVALIDE');
  if(tenant!==tenantAutorise||!TENANT.test(tenantAutorise||''))return fail(res,403,'C4A_NON_ACTIF');
  if(req.method!=='GET'&&req.get('Origin')!==origineAutorisee)return fail(res,403,'ORIGINE_REFUSEE');
  const orgs=await listerOrganisations(actor,tenant);
  if(!Array.isArray(orgs)||!orgs.some(x=>x.tenant_code===tenant))return fail(res,403,'TENANT_NON_AUTORISE');
  return await fn(req,res,{actor,tenant});
 }catch(e){console.error('EnergyTopologyC4A:',e?.code||e?.name||'ERREUR');return fail(res,503,'CARTE_TECHNIQUE_INDISPONIBLE');}};
 router.get('/sites',guard(async(_req,res,s)=>res.json({statut:'SITES_PRIVES',...await store.sites(s)})));
 router.get('/sites/:siteId/carte',guard(async(req,res,s)=>{
  if(!valid(req,res,'siteId'))return;
  const raw=req.query?.offset;const offset=raw===undefined?0:Number(raw);
  if(!Number.isSafeInteger(offset)||offset<0||offset>10000)return fail(res,400,'PAGINATION_INVALIDE');
  const v=await store.carte({...s,siteId:req.params.siteId,offset});return v?res.json({statut:'CARTE_PRIVEE_DECLARATIVE',...v}):fail(res,404,'SITE_NON_AUTORISE');
 }));
 router.post('/sites/:siteId/appareillages',guard(async(req,res,s)=>{
  if(!valid(req,res,'siteId'))return;const d=asset(req.body);if(!d)return fail(res,400,'APPAREILLAGE_INVALIDE');
  const k=req.get('Idempotency-Key');if(!UUID.test(k||''))return fail(res,400,'CLE_IDEMPOTENCE_REQUISE');
  return respond(res,await store.newAsset({...s,siteId:req.params.siteId,requestKey:k,data:d}),'APPAREILLAGE_DECLARÉ',true);
 }));
 router.post('/sites/:siteId/liens',guard(async(req,res,s)=>{
  if(!valid(req,res,'siteId'))return;const d=link(req.body);if(!d)return fail(res,400,'LIEN_INVALIDE');
  const k=req.get('Idempotency-Key');if(!UUID.test(k||''))return fail(res,400,'CLE_IDEMPOTENCE_REQUISE');
  return respond(res,await store.newLink({...s,siteId:req.params.siteId,requestKey:k,data:d}),'LIEN_DECLARÉ',true);
 }));
 router.post('/sites/:siteId/usages',guard(async(req,res,s)=>{
  if(!valid(req,res,'siteId'))return;const d=usage(req.body);if(!d)return fail(res,400,'USAGE_INVALIDE');
  const k=req.get('Idempotency-Key');if(!UUID.test(k||''))return fail(res,400,'CLE_IDEMPOTENCE_REQUISE');
  return respond(res,await store.newUsage({...s,siteId:req.params.siteId,requestKey:k,data:d}),'USAGE_DECLARÉ',true);
 }));
 router.post('/sites/:siteId/liens/:linkId/retirer',guard(async(req,res,s)=>{
  if(!valid(req,res,'siteId')||!valid(req,res,'linkId'))return;
  if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||Object.keys(req.body).length)return fail(res,400,'CORPS_INVALIDE');
  return respond(res,await store.withdraw({...s,siteId:req.params.siteId,linkId:req.params.linkId}),'LIEN_RETIRÉ');
 }));
 return router;
}
module.exports={creerEnergyTopologyRouter};
