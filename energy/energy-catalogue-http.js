'use strict';
const {TENANT}=require('./energy-case-domain');
const {UUID,ref}=require('./energy-catalogue-domain');
function creerEnergyCatalogueRouter({router,listerOrganisations,store,origineAutorisee,tenantAutorise}){
 if(!router||typeof router.use!=='function'||typeof listerOrganisations!=='function'||!store||
  ['list','source','create','decide','link'].some(x=>typeof store[x]!=='function'))throw TypeError('DEPENDANCES_CATALOGUE');
 router.use((req,res,next)=>{res.set('Cache-Control','private, no-store');res.set('Referrer-Policy','no-referrer');res.set('X-Content-Type-Options','nosniff');next();});
 const bad=(res,status,code)=>res.status(status).json({statut:code});
 const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===keys.length&&keys.every(k=>Object.prototype.hasOwnProperty.call(o,k));
 const id=(req,res,name)=>{if(!UUID.test(req.params?.[name]||'')){bad(res,400,'IDENTIFIANT_INVALIDE');return false;}return true;};
 const respond=(res,r,statut,success=200)=>{
  if(r?.code==='OK'){const {code,...body}=r;return res.status(success).json({statut,...body});}
  const code=r?.code||'CATALOGUE_INDISPONIBLE';
  return bad(res,['SITE_INACCESSIBLE','REFERENCE_INTROUVABLE','PASSEPORT_INACCESSIBLE'].includes(code)?404:409,code);
 };
 const route=fn=>async(req,res)=>{try{
  const actor=Number(req.auth?.personneId),tenant=req.query?.tenant;
  if(!Number.isSafeInteger(actor)||actor<=0)return bad(res,401,'SESSION_REQUISE');
  if(typeof tenant!=='string'||!TENANT.test(tenant))return bad(res,400,'TENANT_INVALIDE');
  if(tenant!==tenantAutorise||!TENANT.test(tenantAutorise||''))return bad(res,403,'CATALOGUE_NON_ACTIVE');
  const org=await listerOrganisations(actor,tenant);
  if(!Array.isArray(org)||!org.some(x=>x.tenant_code===tenant))return bad(res,403,'TENANT_NON_AUTORISE');
  if(req.method!=='GET'&&req.get('Origin')!==origineAutorisee)return bad(res,403,'ORIGINE_REFUSEE');
  return await fn(req,res,{tenant,actor});
 }catch(err){console.error('EnergyCatalogueC3:',err?.code||err?.name||'ERREUR');return bad(res,503,'CATALOGUE_INDISPONIBLE');}};
 router.get('/sites/:siteId/references',route(async(req,res,s)=>{
  if(!id(req,res,'siteId'))return;
  const r=await store.list({...s,siteId:req.params.siteId});
  return r?res.json({statut:'REFERENCES_PRIVEES',...r}):bad(res,404,'SITE_INACCESSIBLE');
 }));
 router.get('/sites/:siteId/sources/:passportId',route(async(req,res,s)=>{
  if(!id(req,res,'siteId')||!id(req,res,'passportId'))return;
  const r=await store.source({...s,siteId:req.params.siteId,passportId:req.params.passportId});
  return r?res.json({statut:'SOURCE_PRIVEE',...r}):bad(res,404,'PASSEPORT_INACCESSIBLE');
 }));
 router.post('/sites/:siteId/references',route(async(req,res,s)=>{
  if(!id(req,res,'siteId'))return;
  const key=req.get('Idempotency-Key');if(!UUID.test(key||''))return bad(res,400,'CLE_IDEMPOTENCE_REQUISE');
  const data=ref(req.body);if(!data)return bad(res,400,'REFERENCE_INVALIDE');
  const r=await store.create({...s,siteId:req.params.siteId,requestKey:key,data});
  return respond(res,r,'CANDIDATE_ENREGISTREE',r.nouvelle?201:200);
 }));
 router.post('/sites/:siteId/references/:refId/decision',route(async(req,res,s)=>{
  if(!id(req,res,'siteId')||!id(req,res,'refId'))return;
  if(!exact(req.body,['decision'])||!['REFERENCER','REJETER'].includes(req.body.decision))return bad(res,400,'DECISION_INVALIDE');
  return respond(res,await store.decide({...s,siteId:req.params.siteId,refId:req.params.refId,decision:req.body.decision}),'DECISION_ENREGISTREE');
 }));
 router.post('/sites/:siteId/references/:refId/associer',route(async(req,res,s)=>{
  if(!id(req,res,'siteId')||!id(req,res,'refId'))return;
  if(!exact(req.body,['passportId'])||!UUID.test(req.body.passportId||''))return bad(res,400,'PASSEPORT_INVALIDE');
  return respond(res,await store.link({...s,siteId:req.params.siteId,refId:req.params.refId,passportId:req.body.passportId}),'PASSEPORT_ASSOCIE');
 }));
 return router;
}
module.exports={creerEnergyCatalogueRouter};
