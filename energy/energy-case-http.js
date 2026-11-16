"use strict";
const {validerSaisie,TENANT,UUID}=require('./energy-case-domain');
const REQUEST_KEY=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function creerEnergyCaseRouter({router,listerOrganisations,store,origineAutorisee,tenantAutorise}){
 if(!router || typeof router.get!=='function' || typeof router.post!=='function' ||
  typeof listerOrganisations!=='function' || !store || ['creer','lister','obtenir'].some(k=>typeof store[k]!=='function'))throw new TypeError('ENERGY_DEPENDANCES');
 async function autoriser(req,res){
  res.set('Cache-Control','private, no-store');
  const owner=Number(req.auth?.personneId),tenant=req.query?.tenant;
  if(!Number.isSafeInteger(owner)||owner<=0){res.status(401).json({statut:'SESSION_REQUISE'});return null;}
  if(typeof tenant!=='string'||!TENANT.test(tenant)){res.status(400).json({statut:'TENANT_INVALIDE'});return null;}
  if(!TENANT.test(tenantAutorise||'')||tenant!==tenantAutorise){res.status(403).json({statut:'EXPERIENCE_ENERGY_NON_ACTIVEE'});return null;}
  const organisations=await listerOrganisations(owner,tenant);
  if(!Array.isArray(organisations)||!organisations.some(o=>o.tenant_code===tenant)){
   res.status(403).json({statut:'TENANT_NON_AUTORISE'});return null;
  }
  return {owner,tenant};
 }
 router.post('/cases',async(req,res)=>{try{
  const scope=await autoriser(req,res);if(!scope)return;
  const origine=req.get?.('Origin');
  if(origine && origine!==origineAutorisee)return res.status(403).json({statut:'ORIGINE_REFUSEE'});
  const key=req.get?.('Idempotency-Key');
  if(typeof key!=='string'||!REQUEST_KEY.test(key))return res.status(400).json({statut:'CLE_IDEMPOTENCE_REQUISE'});
  const saisie=validerSaisie(req.body,scope.tenant);
  if(!saisie)return res.status(400).json({statut:'SAISIE_ENERGIE_INVALIDE'});
  const result=await store.creer({...scope,requestKey:key,saisie});
  if(result.code==='TENANT_ABSENT')return res.status(404).json({statut:'TENANT_ABSENT'});
  if(result.code!=='OK')return res.status(409).json({statut:result.code});
  return res.status(result.nouveau?201:200).json({statut:'ENERGY_CASE_BROUILLON',id:result.publicId,dateCreation:result.dateCreation,nouveau:result.nouveau});
 }catch(e){console.error('Energy case creation:',e.code||e.name);return res.status(500).json({statut:'ERREUR_ENERGY_CASE'});}});
 router.get('/cases',async(req,res)=>{try{
  const scope=await autoriser(req,res);if(!scope)return;
  const result=await store.lister(scope);
  return res.status(200).json({statut:'ENERGY_CASES_PERSONNELS',...result});
 }catch(e){console.error('Energy cases list:',e.code||e.name);return res.status(500).json({statut:'ERREUR_ENERGY_CASE'});}});
 router.get('/cases/:id',async(req,res)=>{try{
  const scope=await autoriser(req,res);if(!scope)return;
  if(!UUID.test(req.params?.id||''))return res.status(400).json({statut:'ID_ENERGY_INVALIDE'});
  const result=await store.obtenir({...scope,publicId:req.params.id});
  return result?res.status(200).json({statut:'ENERGY_CASE_TROUVE',energyCase:result}):res.status(404).json({statut:'ENERGY_CASE_INTROUVABLE'});
 }catch(e){console.error('Energy case detail:',e.code||e.name);return res.status(500).json({statut:'ERREUR_ENERGY_CASE'});}});
 return router;
}
module.exports={creerEnergyCaseRouter};
