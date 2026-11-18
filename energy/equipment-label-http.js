'use strict';
/** Routes OCR facultatives, montées avec exigerSession Core; aucune donnée brute OCR journalisée. */
const {UUID,TENANT}=require('./energy-case-domain');
const {candidatesFromLines,validateFields}=require('./equipment-label-domain');
function creerEquipmentLabelRouter({router,listerOrganisations,store,ocr,origineAutorisee,tenantAutorise}){
 if(!router||typeof router.post!=='function'||typeof listerOrganisations!=='function'||!store||!ocr)throw TypeError('DEPENDANCES_HTTP_LABEL');
 router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');res.set('Referrer-Policy','no-referrer');res.set('X-Content-Type-Options','nosniff');next();});
 const err=(res,n,code)=>res.status(n).json({statut:code});
 async function scope(req,res){
  const owner=Number(req.auth?.personneId),tenant=req.query?.tenant;
  if(!Number.isSafeInteger(owner)||owner<1)return err(res,401,'SESSION_REQUISE'),null;
  if(typeof tenant!=='string'||!TENANT.test(tenant))return err(res,400,'TENANT_INVALIDE'),null;
  if(tenant!==tenantAutorise)return err(res,403,'ENERGY_NON_AUTORISE'),null;
  if(!UUID.test(req.params?.passportId||''))return err(res,400,'PASSEPORT_ID_INVALIDE'),null;
  const list=await listerOrganisations(owner,tenant);
  if(!Array.isArray(list)||!list.some(o=>o.tenant_code===tenant))return err(res,403,'TENANT_NON_AUTORISE'),null;
  return {owner,tenant,passportId:req.params.passportId};
 }
 const origin=req=>req.get?.('Origin')===origineAutorisee;
 const failed=(res,e)=>{console.error('Energy OCR:',e?.code||e?.name||'ERREUR');return err(res,503,'LECTURE_ETIQUETTE_INDISPONIBLE');};
 router.get('/:passportId',async(req,res)=>{try{const s=await scope(req,res);if(!s)return;const values=await store.latest(s);return values?res.json({statut:'CARACTERISTIQUES_DECLAREES',valeurs:values}):err(res,404,'PASSEPORT_INTROUVABLE');}catch(e){return failed(res,e);}});
 router.post('/:passportId/analyser',async(req,res)=>{try{
  const s=await scope(req,res);if(!s)return;if(!origin(req))return err(res,403,'ORIGINE_REFUSEE');
  if(!req.body||Object.keys(req.body).length!==1||!UUID.test(req.body.photoId||''))return err(res,400,'PHOTO_ID_INVALIDE');
  const photo=await store.photoForAnalysis({...s,photoId:req.body.photoId});if(!photo)return err(res,404,'PHOTO_ETIQUETTE_INTROUVABLE');
  let lines;try{lines=await ocr.recognize(photo.bytes,photo.mime);}catch(e){return failed(res,e);}
  const candidates=candidatesFromLines(lines);
  if(Object.keys(candidates).length===0)return res.json({statut:'AUCUNE_CARACTERISTIQUE_LISIBLE',propositions:{},analyseId:null});
  const saved=await store.saveProposal({...s,photoId:req.body.photoId,candidates});
  if(saved.code!=='OK')return err(res,409,saved.code);
  return res.json({statut:'PROPOSITIONS_A_CONFIRMER',propositions:candidates,analyseId:saved.analyseId,expirationMinutes:20,
   avertissement:'Lecture automatique indicative, aucune valeur verifiee'});
 }catch(e){return failed(res,e);}});
 router.post('/:passportId/confirmer',async(req,res)=>{try{
  const s=await scope(req,res);if(!s)return;if(!origin(req))return err(res,403,'ORIGINE_REFUSEE');
  const b=req.body;if(!b||Object.keys(b).sort().join(',')!=='analyseId,valeurs'||
   (b.analyseId!==null&&!UUID.test(b.analyseId||''))||!validateFields(b.valeurs))return err(res,400,'CONFIRMATION_INVALIDE');
  const result=await store.confirm({...s,analyseId:b.analyseId,fields:b.valeurs});
  if(result.code!=='OK')return err(res,result.code==='PASSEPORT_INTROUVABLE'?404:409,result.code);
  return res.json({statut:'CARACTERISTIQUES_CONFIRMEES_PAR_UTILISATEUR',...result,verification:'NON_CERTIFIE'});
 }catch(e){return failed(res,e);}});
 return router;
}
module.exports={creerEquipmentLabelRouter};
