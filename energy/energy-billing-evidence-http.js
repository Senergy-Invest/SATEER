'use strict';
/** E-METER-1B2 : fichiers opaques, téléchargeables uniquement par le propriétaire Core. */
const express=require('express');
const {TENANT}=require('./energy-case-domain');
const {UUID}=require('./energy-meter-domain');
const {formatEvidence,MAX_BYTES}=require('./energy-billing-evidence-domain');
function creerBillingEvidenceRouter({router,listerOrganisations,store,origineAutorisee,tenantAutorise}){
 if(!router?.use||!router?.get||!router?.post||typeof listerOrganisations!=='function'||!store||
  !['lister','creer','telecharger'].every(x=>typeof store[x]==='function'))throw TypeError('DEPENDANCES_HTTP_EVIDENCE');
 const fail=(res,n,c)=>res.status(n).json({statut:c});
 router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');res.set('Pragma','no-cache');res.set('X-Content-Type-Options','nosniff');res.set('Referrer-Policy','no-referrer');next();});
 const guard=fn=>async(req,res)=>{try{
  const actor=Number(req.auth?.personneId),tenant=req.query?.tenant;
  if(!Number.isSafeInteger(actor)||actor<1)return fail(res,401,'SESSION_REQUISE');
  if(typeof tenant!=='string'||!TENANT.test(tenant))return fail(res,400,'TENANT_INVALIDE');
  if(tenant!==tenantAutorise||!TENANT.test(tenantAutorise||''))return fail(res,403,'E_BILLING_EVIDENCE_NON_ACTIF');
  if(req.method!=='GET'&&req.get?.('Origin')!==origineAutorisee)return fail(res,403,'ORIGINE_REFUSEE');
  const orgs=await listerOrganisations(actor,tenant);
  if(!Array.isArray(orgs)||!orgs.some(o=>o.tenant_code===tenant))return fail(res,403,'TENANT_NON_AUTORISE');
  const ids=[req.params?.siteId,req.params?.declarationId];if(ids.some(x=>!UUID.test(x||'')))return fail(res,400,'IDENTIFIANT_INVALIDE');
  if(req.params?.fileId&&!UUID.test(req.params.fileId))return fail(res,400,'FICHIER_ID_INVALIDE');
  return await fn(req,res,{tenant,actor,siteId:req.params.siteId,declarationId:req.params.declarationId,fileId:req.params.fileId});
 }catch(e){console.error('EMeterEvidence:',e?.code||e?.name||'ERREUR');return fail(res,503,'JUSTIFICATIFS_INDISPONIBLES');}};
 const base='/sites/:siteId/declarations/:declarationId/fichiers';
 router.get(base,guard(async(_req,res,s)=>{const r=await store.lister(s);return r?res.json({statut:'JUSTIFICATIFS_PRIVES_NON_VERIFIES',...r}):fail(res,404,'DECLARATION_NON_AUTORISEE');}));
 const raw=express.raw({type:'application/octet-stream',limit:MAX_BYTES});
 function rawGuard(req,res,next){if(!/^application\/octet-stream(?:\s*;|$)/i.test(req.get?.('Content-Type')||''))return fail(res,415,'TRANSPORT_OCTET_STREAM_REQUIS');
  raw(req,res,err=>err?fail(res,err.type==='entity.too.large'?413:400,'FICHIER_NON_ACCEPTE'):next());}
 router.post(base,rawGuard,guard(async(req,res,s)=>{
  const bytes=req.body,mime=formatEvidence(bytes);
  if(!mime)return fail(res,415,'FICHIER_PDF_OU_PNG_INVALIDE');
  const requestKey=req.get?.('Idempotency-Key');if(!UUID.test(requestKey||''))return fail(res,400,'CLE_IDEMPOTENCE_REQUISE');
  const result=await store.creer({...s,bytes,mime,requestKey,name:req.get?.('X-SATEER-FILENAME')||''});
  return result.code==='OK'?res.status(result.nouveau?201:200).json({statut:'JUSTIFICATIF_CHIFFRE_NON_VERIFIE',...result}):
   fail(res,result.code==='DECLARATION_NON_AUTORISEE'?404:409,result.code||'ENREGISTREMENT_REFUSE');
 }));
 router.get(base+'/:fileId/telecharger',guard(async(_req,res,s)=>{
  const r=await store.telecharger(s);if(!r)return fail(res,404,'FICHIER_NON_AUTORISE');
  const extension=r.mime==='application/pdf'?'pdf':'png';
  res.set('Content-Type','application/octet-stream');
  res.set('Content-Disposition',`attachment; filename="justificatif-sateer-${s.fileId}.${extension}"`);
  res.set('Content-Length',String(r.bytes.length));return res.end(r.bytes);
 }));
 return router;
}
module.exports={creerBillingEvidenceRouter};
