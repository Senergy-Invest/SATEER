"use strict";
/** Route session obligatoire, identité exclusivement fournie par exigerSession. */
const TENANT=/^[A-Z][A-Z0-9_-]{0,49}$/;
const ID=/^[1-9][0-9]*$/;
const validId=v=>typeof v==='string'&&ID.test(v)&&Number.isSafeInteger(Number(v));
function creerRoutesPreferencesGeo({router,service,contexteCitoyen}) {
  if(!router||typeof router.get!=='function'||typeof router.put!=='function'||
    !service||typeof contexteCitoyen!=='function')throw new TypeError('DEPENDANCES_GEO_HTTP');
  const wrap=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){console.error('Diaspora geo',e);res.status(500).json({statut:'ERREUR_GEO_DIASPORA'});}};
  async function context(req,res,write=false){
    res.set('Cache-Control','private, no-store');
    const personneId=Number(req.auth?.personneId),tenant=req.query?.tenant;
    if(!Number.isSafeInteger(personneId)||personneId<=0){res.status(401).json({statut:'AUTHENTIFICATION_REQUISE'});return null;}
    if(typeof tenant!=='string'||!TENANT.test(tenant)){res.status(400).json({statut:'TENANT_INVALIDE'});return null;}
    if(write){
      const origin=req.get?.('Origin'),allowed=process.env.SATEER_PUBLIC_ORIGIN||'http://localhost:3000';
      if(origin&&origin!==allowed){res.status(403).json({statut:'ORIGINE_NON_AUTORISEE'});return null;}
      if(typeof req.body?.actif!=='boolean'){res.status(400).json({statut:'CHOIX_INVALIDE'});return null;}
    }
    if(!await contexteCitoyen(personneId,tenant)){res.status(403).json({statut:'ACCES_TENANT_REFUSE'});return null;}
    return {personneId,tenant};
  }
  router.get('/geo-options',wrap(async(req,res)=>{
    const c=await context(req,res);if(!c)return;
    const q=req.query?.q??'';
    if(typeof q!=='string'||q.length>60)return res.status(400).json({statut:'RECHERCHE_INVALIDE'});
    const items=await service.chercherTerritoires(q);
    return res.json({statut:'TERRITOIRES_CHARGES',territoires:items.map(x=>({
      id:Number(x.id),nom:String(x.nom),type:String(x.type),pays:String(x.pays)}))});
  }));
  router.get('/geo-preferences',wrap(async(req,res)=>{
    const c=await context(req,res);if(!c)return;
    const items=await service.listerPreferences(c.personneId,c.tenant);
    return res.json({statut:'PREFERENCES_GEO_CHARGEES',preferences:items.map(x=>({
      id:Number(x.id),nom:String(x.nom),type:String(x.type),pays:String(x.pays),actif:x.actif===true}))});
  }));
  router.put('/geo-preferences/:territoryId',wrap(async(req,res)=>{
    const c=await context(req,res,true);if(!c)return;
    if(!validId(req.params?.territoryId))return res.status(400).json({statut:'TERRITOIRE_INVALIDE'});
    const result=await service.modifierPreference(c.personneId,c.tenant,Number(req.params.territoryId),req.body.actif);
    return res.status(result.ok?200:403).json({statut:result.ok?'PREFERENCE_GEO_MODIFIEE':result.code,actif:result.actif});
  }));
  return router;
}
function creerRoutesCiblageGeo({router,service,verifierPermission,trouverOrganisation}){
  if(!router||typeof router.put!=='function'||!service||typeof verifierPermission!=='function'||typeof trouverOrganisation!=='function')
    throw new TypeError('DEPENDANCES_CIBLAGE_HTTP');
  router.put('/:organisationId/diaspora/geo-target/:publicationId',async(req,res)=>{
    try{
      res.set('Cache-Control','private, no-store');
      const personneId=Number(req.auth?.personneId),tenant=req.query?.tenant;
      if(!Number.isSafeInteger(personneId)||personneId<=0)return res.status(401).json({statut:'AUTHENTIFICATION_REQUISE'});
      if(typeof tenant!=='string'||!TENANT.test(tenant)||!validId(req.params?.organisationId)||!validId(req.params?.publicationId))
        return res.status(400).json({statut:'CONTEXTE_INVALIDE'});
      const origin=req.get?.('Origin'),allowed=process.env.SATEER_PUBLIC_ORIGIN||'http://localhost:3000';
      if(origin&&origin!==allowed)return res.status(403).json({statut:'ORIGINE_NON_AUTORISEE'});
      const geo=req.body?.territoryId;
      if(geo!==null&&(!Number.isSafeInteger(geo)||geo<=0))return res.status(400).json({statut:'TERRITOIRE_INVALIDE'});
      const orgId=Number(req.params.organisationId);
      const org=await trouverOrganisation(orgId,tenant);
      if(!org)return res.status(404).json({statut:'ORGANISATION_INTROUVABLE'});
      const permission=await verifierPermission({personneId,organisationId:orgId,tenantCode:tenant,
        permissionCode:'TARGET_COMMUNICATION',uniteId:null});
      if(permission?.succes!==true||permission.autorise!==true||permission.portee!=='ORGANISATION')
        return res.status(403).json({statut:'ACCES_REFUSE'});
      const outcome=await service.definirCible({organisationId:orgId,publicationId:Number(req.params.publicationId),
        territoryId:geo,acteurId:personneId,tenant});
      return res.status(outcome.ok?200:409).json({statut:outcome.ok?'CIBLE_GEO_MODIFIEE':outcome.code,territoryId:outcome.territoryId});
    }catch(e){console.error('Ciblage Diaspora geo',e);return res.status(500).json({statut:'ERREUR_CIBLAGE_GEO'});}
  });
  return router;
}
module.exports={creerRoutesPreferencesGeo,creerRoutesCiblageGeo};
