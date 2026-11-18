'use strict';
/** Routeur MVP02A-1 : la session Core est obligatoire sur tout le montage /api/energy/passports. */
const express=require('express');
const {TENANT,UUID}=require('./energy-case-domain');
const {formatImage,MAX_BYTES}=require('./equipment-photo-vault');
const TOKEN=/^[A-Za-z0-9_-]{27}$/;
const TYPES=new Set(['APPAREIL','ETIQUETTE']);
function creerEquipmentPassportRouter({router,listerOrganisations,store,origineAutorisee,tenantAutorise}){
 if(!router||typeof listerOrganisations!=='function'||!store||typeof router.post!=='function')throw TypeError('DEPENDANCES_PASSEPORT');
 router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');res.set('X-Content-Type-Options','nosniff');res.set('Referrer-Policy','no-referrer');next();});
 function error(res,n,code){return res.status(n).json({statut:code});}
 async function scope(req,res,withoutTenant=false){
  const owner=Number(req.auth?.personneId),tenant=withoutTenant?tenantAutorise:req.query?.tenant;
  if(!Number.isSafeInteger(owner)||owner<=0){error(res,401,'SESSION_REQUISE');return null;}
  if(typeof tenant!=='string'||!TENANT.test(tenant)){error(res,400,'TENANT_INVALIDE');return null;}
  if(!TENANT.test(tenantAutorise||'')||tenant!==tenantAutorise){error(res,403,'EXPERIENCE_ENERGY_NON_ACTIVEE');return null;}
  const orgs=await listerOrganisations(owner,tenant);
  if(!Array.isArray(orgs)||!orgs.some(o=>o.tenant_code===tenant)){error(res,403,'TENANT_NON_AUTORISE');return null;}
  return {owner,tenant};
 }
 function allowedOrigin(req){const origin=req.get('Origin');return origin===origineAutorisee;}
 function validId(req,res,field){const v=req.params[field];if(!UUID.test(v||'')){error(res,400,'IDENTIFIANT_INVALIDE');return false;}return true;}
 function failed(res,e){console.error('Energy passport:',e?.code||e?.name||'ERREUR');return error(res,503,'PASSEPORT_INDISPONIBLE');}
 // Une seule identité à la demande, jamais 3 passeports créés implicitement pour « 3 lampes ».
 router.post('/sites/:siteId/equipements/:inventoryId',async(req,res)=>{try{
  const s=await scope(req,res);if(!s)return;
  if(!allowedOrigin(req))return error(res,403,'ORIGINE_REFUSEE');
  if(!validId(req,res,'siteId')||!validId(req,res,'inventoryId'))return;
  if(!req.body||Object.keys(req.body).length!==1||!Number.isSafeInteger(req.body.numeroIndividuel)||
   req.body.numeroIndividuel<1||req.body.numeroIndividuel>10000)return error(res,400,'NUMERO_INDIVIDUEL_INVALIDE');
  const r=await store.create({...s,siteId:req.params.siteId,inventoryId:req.params.inventoryId,numeroIndividuel:req.body.numeroIndividuel});
  if(r.code!=='OK')return error(res,r.code==='EQUIPEMENT_INACCESSIBLE'?404:409,r.code);
  return res.status(r.newly?201:200).json({statut:'PASSEPORT_INDIVIDUEL_DECLARE',id:r.id,nouveau:r.newly});
 }catch(e){return failed(res,e);}});
 router.get('/sites/:siteId',async(req,res)=>{try{
  const s=await scope(req,res);if(!s)return;if(!validId(req,res,'siteId'))return;
  const data=await store.list({...s,siteId:req.params.siteId});return res.json({statut:'PASSEPORTS_PRIVES',...data});
 }catch(e){return failed(res,e);}});
 router.get('/scan/:token',async(req,res)=>{try{
  const s=await scope(req,res,true);if(!s)return;if(!TOKEN.test(req.params.token||''))return error(res,400,'CODE_INVALIDE');
  const data=await store.scan({...s,token:req.params.token});return data?res.json({statut:'PASSEPORT_PAR_QR',tenantCode:s.tenant,...data}):error(res,404,'CODE_NON_AUTORISE');
 }catch(e){return failed(res,e);}});
 router.get('/:passportId',async(req,res)=>{try{
  const s=await scope(req,res);if(!s)return;if(!validId(req,res,'passportId'))return;
  const data=await store.full({...s,passportId:req.params.passportId});
  if(!data)return error(res,404,'PASSEPORT_INTROUVABLE');
  return res.json({statut:'PASSEPORT_PRIVE',passeport:data.passeport,photos:data.photos,
    qrUrl:origineAutorisee+'/equipement-qr.html?t='+encodeURIComponent(data.scanToken)});
 }catch(e){return failed(res,e);}});
 const raw=express.raw({type:'application/octet-stream',limit:MAX_BYTES});
 router.post('/:passportId/photos/:type',raw,async(req,res)=>{try{
  const s=await scope(req,res);if(!s)return;
  if(!allowedOrigin(req))return error(res,403,'ORIGINE_REFUSEE');
  if(!validId(req,res,'passportId'))return;
  if(!TYPES.has(req.params.type))return error(res,400,'TYPE_PHOTO_INVALIDE');
  if(!/^application\/octet-stream(?:\s*;|$)/i.test(req.get('Content-Type')||''))return error(res,415,'TRANSPORT_INVALIDE');
  const mime=formatImage(req.body);if(!mime)return error(res,415,'PHOTO_INVALIDE_OU_TROP_GRANDE');
  const result=await store.addPhoto({...s,passportId:req.params.passportId,type:req.params.type,bytes:req.body,mime});
  if(result.code!=='OK')return error(res,result.code==='PASSEPORT_INTROUVABLE'?404:409,result.code);
  return res.status(201).json({statut:'PHOTO_PRIVEE_ENREGISTREE',photoId:result.photoId});
 }catch(e){return failed(res,e);}});
 router.get('/:passportId/photos/:photoId',async(req,res)=>{try{
  const s=await scope(req,res);if(!s)return;
  if(!validId(req,res,'passportId')||!validId(req,res,'photoId'))return;
  const p=await store.readPhoto({...s,passportId:req.params.passportId,photoId:req.params.photoId});
  if(!p)return error(res,404,'PHOTO_INTROUVABLE');
  res.set('Content-Type',p.mime);res.set('Content-Disposition','inline');return res.end(p.bytes);
 }catch(e){return failed(res,e);}});
 router.delete('/:passportId/photos/:photoId',async(req,res)=>{try{
  const s=await scope(req,res);if(!s)return;if(!allowedOrigin(req))return error(res,403,'ORIGINE_REFUSEE');
  if(!validId(req,res,'passportId')||!validId(req,res,'photoId'))return;
  const result=await store.removePhoto({...s,passportId:req.params.passportId,photoId:req.params.photoId});
  return result.code==='OK'?res.json({statut:'PHOTO_SUPPRIMEE'}):error(res,404,'PHOTO_INTROUVABLE');
 }catch(e){return failed(res,e);}});
 return router;
}
module.exports={creerEquipmentPassportRouter};
