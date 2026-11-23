'use strict';
/** Analyse photo en mémoire seulement, exclusivement pour la mission EP1 A_FAIRE de son titulaire. */
const express=require('express');
const {TENANT}=require('./energy-case-domain');
const {UUID}=require('./energy-meter-domain');
const {formatImage,MAX_BYTES}=require('./equipment-photo-vault');
const {candidate}=require('./energy-meter-photo-domain');
function creerEnergyMeterPhotoRouter({router,listerOrganisations,store,ocr,origineAutorisee,tenantAutorise}){
 if(!router?.use||!router?.post||!router?.get||typeof store?.autoriser!=='function'||typeof ocr?.recognize!=='function'||typeof listerOrganisations!=='function')throw TypeError('DEPENDANCES_PHOTO_INDEX');
 const fail=(res,n,s)=>res.status(n).json({statut:s});
 const calls=new Map();
 router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');res.set('X-Content-Type-Options','nosniff');res.set('Referrer-Policy','no-referrer');next();});
 async function guard(req,res,write){
  const actor=Number(req.auth?.personneId),tenant=req.query?.tenant;
  if(!Number.isSafeInteger(actor)||actor<=0)return fail(res,401,'SESSION_REQUISE'),null;
  if(typeof tenant!=='string'||!TENANT.test(tenant))return fail(res,400,'TENANT_INVALIDE'),null;
  if(tenant!==tenantAutorise||!TENANT.test(tenantAutorise||''))return fail(res,403,'OCR_INDEX_NON_ACTIF'),null;
  if(write&&req.get('Origin')!==origineAutorisee)return fail(res,403,'ORIGINE_REFUSEE'),null;
  const orgs=await listerOrganisations(actor,tenant);
  if(!Array.isArray(orgs)||!orgs.some(o=>o.tenant_code===tenant))return fail(res,403,'TENANT_NON_AUTORISE'),null;
  return {tenant,actor};
 }
 router.get('/capacite',async(req,res)=>{
  try{const a=await guard(req,res,false);if(!a)return;return res.json({statut:'OCR_LOCAL_DISPONIBLE',aucuneEcriture:true});}
  catch(e){console.error('EMeter2:',e?.code||e?.name);return fail(res,503,'OCR_INDEX_INDISPONIBLE');}
 });
 router.post('/missions/:missionId/analyser',express.raw({type:'application/octet-stream',inflate:false,limit:'3mb'}),async(req,res)=>{
  try{
   const a=await guard(req,res,true);if(!a)return;
   if(!UUID.test(req.params?.missionId||''))return fail(res,400,'MISSION_INVALIDE');
   // Refus avant tout accès au moteur OCR : aucun droit dérivé de la page ou du client.
   const authorized=await store.autoriser({...a,missionId:req.params.missionId});
   if(!authorized)return fail(res,404,'MISSION_NON_AUTORISEE');
   if(req.get('Content-Type')!=='application/octet-stream'||!Buffer.isBuffer(req.body)||req.body.length>MAX_BYTES||formatImage(req.body)!=='image/png')return fail(res,415,'PHOTO_PNG_INVALIDE');
   // Limite mémoire locale; ce n'est pas un quota distribué pour la production.
   const k=a.tenant+':'+a.actor,now=Date.now(),v=calls.get(k)||[];
   const recent=v.filter(x=>now-x<600000);
   if(recent.length>=10)return fail(res,429,'OCR_TROP_DE_TENTATIVES');
   recent.push(now);calls.set(k,recent);
   if(calls.size>1000){for(const [id,arr] of calls)if(!arr.some(x=>now-x<600000))calls.delete(id);}
   const lines=await ocr.recognize(req.body,'image/png');
   // Revérifier les droits après l'OCR (révocation ou changement d'état concurrent).
   const again=await store.autoriser({...a,missionId:req.params.missionId});
   if(!again||again.unite!==authorized.unite)return fail(res,404,'MISSION_NON_AUTORISEE');
   const result=candidate(lines,again.unite);
   return res.json({...result,confirmationHumaineObligatoire:true,photoConservee:false});
  }catch(e){console.error('EMeter2:',e?.code||e?.name||'ERREUR');return fail(res,503,'OCR_INDEX_INDISPONIBLE');}
 });
 return router;
}
module.exports={creerEnergyMeterPhotoRouter};
