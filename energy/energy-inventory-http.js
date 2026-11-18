'use strict';
const {TENANT,UUID}=require('./energy-case-domain');
const {zone,equipement}=require('./energy-inventory-domain');
const KEY=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function creerEnergyInventoryRouter({router,listerOrganisations,store,origineAutorisee,tenantAutorise}){
 if(!router||typeof router.post!=='function'||typeof router.get!=='function'||
   typeof listerOrganisations!=='function'||!store||
   ['creerSite','listerSites','obtenirSite','creerZone','creerEquipement'].some(k=>typeof store[k]!=='function'))
   throw new TypeError('INVENTORY_DEPENDANCES');
 async function scope(req,res){
  res.set('Cache-Control','private, no-store');
  const owner=Number(req.auth?.personneId),tenant=req.query?.tenant;
  if(!Number.isSafeInteger(owner)||owner<=0){res.status(401).json({statut:'SESSION_REQUISE'});return null;}
  if(typeof tenant!=='string'||!TENANT.test(tenant)){res.status(400).json({statut:'TENANT_INVALIDE'});return null;}
  if(!TENANT.test(tenantAutorise||'')||tenant!==tenantAutorise){res.status(403).json({statut:'EXPERIENCE_ENERGY_NON_ACTIVEE'});return null;}
  const orgs=await listerOrganisations(owner,tenant);
  if(!Array.isArray(orgs)||!orgs.some(o=>o.tenant_code===tenant)){
   res.status(403).json({statut:'TENANT_NON_AUTORISE'});return null;}
  return {tenant,owner};
 }
 function originOK(req){const origin=req.get?.('Origin');return !origin||origin===origineAutorisee;}
 function key(req){const k=req.get?.('Idempotency-Key');return typeof k==='string'&&KEY.test(k)?k:null;}
 function id(req,res){if(!UUID.test(req.params?.siteId||'')){res.status(400).json({statut:'SITE_ID_INVALIDE'});return null;}return req.params.siteId;}
 function error(res,e){console.error('Energy Inventory:',e?.code||e?.name||'ERREUR');return res.status(500).json({statut:'ERREUR_INVENTAIRE'});}
 router.post('/sites',async(req,res)=>{try{
   const s=await scope(req,res);if(!s)return;
   if(!originOK(req))return res.status(403).json({statut:'ORIGINE_REFUSEE'});
   if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||
     Object.keys(req.body).length!==1||!UUID.test(req.body.energyCaseId||''))return res.status(400).json({statut:'DOSSIER_ID_INVALIDE'});
   const result=await store.creerSite({...s,energyCaseId:req.body.energyCaseId});
   if(result.code!=='OK')return res.status(result.code==='DOSSIER_INACCESSIBLE'?404:409).json({statut:result.code});
   return res.status(result.nouveau?201:200).json({statut:'SITE_INVENTAIRE',...result});
  }catch(e){return error(res,e);}});
 router.get('/sites',async(req,res)=>{try{
   const s=await scope(req,res);if(!s)return;
   const result=await store.listerSites(s);return res.status(200).json({statut:'SITES_INVENTAIRE',...result});
  }catch(e){return error(res,e);}});
 router.get('/sites/:siteId',async(req,res)=>{try{
   const s=await scope(req,res);if(!s)return;const siteId=id(req,res);if(!siteId)return;
   const result=await store.obtenirSite({...s,siteId});
   return result?res.status(200).json({statut:'INVENTAIRE_PRIVE',...result}):res.status(404).json({statut:'SITE_INACCESSIBLE'});
  }catch(e){return error(res,e);}});
 router.post('/sites/:siteId/zones',async(req,res)=>{try{
   const s=await scope(req,res);if(!s)return;const siteId=id(req,res);if(!siteId)return;
   if(!originOK(req))return res.status(403).json({statut:'ORIGINE_REFUSEE'});
   const requestKey=key(req);if(!requestKey)return res.status(400).json({statut:'CLE_IDEMPOTENCE_REQUISE'});
   const saisie=zone(req.body);if(!saisie)return res.status(400).json({statut:'ZONE_INVALIDE'});
   const result=await store.creerZone({...s,siteId,requestKey,saisie});
   if(result.code!=='OK')return res.status(result.code==='SITE_INACCESSIBLE'?404:409).json({statut:result.code});
   return res.status(result.nouveau?201:200).json({statut:'ZONE_DECLAREE',...result});
  }catch(e){return error(res,e);}});
 router.post('/sites/:siteId/equipements',async(req,res)=>{try{
   const s=await scope(req,res);if(!s)return;const siteId=id(req,res);if(!siteId)return;
   if(!originOK(req))return res.status(403).json({statut:'ORIGINE_REFUSEE'});
   const requestKey=key(req);if(!requestKey)return res.status(400).json({statut:'CLE_IDEMPOTENCE_REQUISE'});
   const saisie=equipement(req.body);if(!saisie)return res.status(400).json({statut:'EQUIPEMENT_INVALIDE'});
   const result=await store.creerEquipement({...s,siteId,requestKey,saisie});
   if(result.code!=='OK')return res.status(result.code==='SITE_INACCESSIBLE'?404:409).json({statut:result.code});
   return res.status(result.nouveau?201:200).json({statut:'EQUIPEMENT_DECLARE',...result});
  }catch(e){return error(res,e);}});
 return router;
}
module.exports={creerEnergyInventoryRouter};
