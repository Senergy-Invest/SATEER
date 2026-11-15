"use strict";
/** D2A — contrôle Core pour chaque action, jamais de droit deduit d'un intitulé de rôle.
 * exigerSession est monte par server.js sur toute cette famille de routes.
 */
const TENANT=/^[A-Z][A-Z0-9_-]{0,49}$/;
const ID=/^[1-9][0-9]*$/;
function creerRoutesBureauDiaspora({router, verifierPermission, trouverOrganisation, service}) {
  if (!router || ['get','post'].some(x=>typeof router[x]!=='function') ||
      typeof verifierPermission!=='function' || typeof trouverOrganisation!=='function' ||
      !service || ['listSource','listQueue','transition'].some(x=>typeof service[x]!=='function'))
    throw new TypeError('DEPENDANCES_BUREAU_REQUISES');
  async function contexte(req,res,{revue=false}={}) {
    res.set('Cache-Control','private, no-store');
    const acteurId=Number(req.auth?.personneId);
    const o=String(req.params?.organisationId||'');
    const tenant=revue ? req.query?.tenant??req.body?.tenantCode : req.query?.tenant??req.body?.tenantCode;
    if(!Number.isSafeInteger(acteurId)||acteurId<=0)return {fail:res.status(401).json({statut:'AUTHENTIFICATION_REQUISE'})};
    if(!ID.test(o)||!Number.isSafeInteger(Number(o))||typeof tenant!=='string'||!TENANT.test(tenant))
      return {fail:res.status(400).json({statut:'CONTEXTE_INVALIDE'})};
    if(req.method==='POST'){
      const origin=req.get?.('Origin');
      const expected=process.env.SATEER_PUBLIC_ORIGIN||'http://localhost:3000';
      if(origin && origin!==expected)return {fail:res.status(403).json({statut:'ORIGINE_NON_AUTORISEE'})};
    }
    const organisationId=Number(o);
    const org=await trouverOrganisation(organisationId,tenant);
    if(!org)return {fail:res.status(404).json({statut:'ORGANISATION_INTROUVABLE'})};
    if(revue && org.type!=='SATEER')return {fail:res.status(403).json({statut:'BUREAU_SATEER_REQUIS'})};
    const required=revue?['TARGET_COMMUNICATION','MANAGE_PUBLICATIONS']:['TARGET_COMMUNICATION'];
    for(const permissionCode of required){
      const d=await verifierPermission({personneId:acteurId,organisationId,tenantCode:tenant,permissionCode,uniteId:null});
      if(d?.succes!==true||d.autorise!==true||d.portee!=='ORGANISATION')
        return {fail:res.status(403).json({statut:'ACCES_REFUSE',permissionRequise:permissionCode})};
    }
    return {acteurId,organisationId,tenant};
  }
  const envelope=handler=>async(req,res)=>{
    try{await handler(req,res);}catch(error){
      console.error('Bureau Diaspora :',error);
      return res.status(500).json({statut:'ERREUR_BUREAU_DIASPORA'});
    }
  };
  function publicationId(req,res){
    const id=req.params?.publicationId;
    if(typeof id!=='string'||!ID.test(id)||!Number.isSafeInteger(Number(id))){
      res.status(400).json({statut:'PUBLICATION_INVALIDE'});return null;
    }
    return Number(id);
  }
  router.get('/:organisationId/diaspora/source-publications',envelope(async(req,res)=>{
    const c=await contexte(req,res);if(c.fail)return;
    const p=await service.listSource(c.organisationId,c.tenant);
    if(!Array.isArray(p))throw new Error('PROJECTION_SOURCE_INVALIDE');
    return res.json({statut:'DIASPORA_SOURCE_CHARGEE',publications:p.map(x=>({
      id:Number(x.id),titre:String(x.titre||''),categorie:String(x.categorie||''),
      audienceType:String(x.audience_type||''),etatDiffusion:String(x.statut_diffusion_diaspora||''),
      datePublication:x.date_publication||null,mediaCount:Number(x.media_count||0),
      geoTerritoryId:x.geo_territory_id==null?null:Number(x.geo_territory_id),
      geoTerritoryName:x.geo_territory_nom||null,
      sponsorisee:x.sponsor_publication_id!=null,sponsorNom:x.sponsor_publication_id!=null?String(x.sponsor_nom||''):null}))});
  }));
  router.post('/:organisationId/diaspora/submit/:publicationId',envelope(async(req,res)=>{
    const c=await contexte(req,res);if(c.fail)return;
    const id=publicationId(req,res);if(id===null)return;
    const outcome=await service.transition({mode:'SUBMIT',publicationId:id,sourceOrgId:c.organisationId,tenant:c.tenant,acteurId:c.acteurId});
    return res.status(outcome.ok?200:409).json({statut:outcome.ok?'PUBLICATION_SOUMISE':outcome.code,publicationId:id});
  }));
  router.get('/:organisationId/diaspora/review-queue',envelope(async(req,res)=>{
    const c=await contexte(req,res,{revue:true});if(c.fail)return;
    const p=await service.listQueue(c.tenant);
    if(!Array.isArray(p))throw new Error('PROJECTION_FILE_INVALIDE');
    return res.json({statut:'DIASPORA_REVUE_CHARGEE',publications:p.map(x=>({
      id:Number(x.id),titre:String(x.titre||'').slice(0,255),contenu:String(x.contenu||'').slice(0,20000),
      categorie:String(x.categorie||''),audienceType:String(x.audience_type||''),
      organisation:String(x.organisation||''),organisationType:String(x.organisation_type||''),
      dateSoumission:x.date_soumission_diaspora||null,
      geoTerritoryId:x.geo_territory_id==null?null:Number(x.geo_territory_id),
      geoTerritoryName:x.geo_territory_nom||null,
      sponsorisee:x.sponsor_publication_id!=null,sponsorNom:x.sponsor_publication_id!=null?String(x.sponsor_nom||''):null}))});
  }));
  for(const [mode,verb] of [['APPROVE','approve'],['REJECT','reject']]){
    router.post('/:organisationId/diaspora/'+verb+'/:publicationId',envelope(async(req,res)=>{
      const c=await contexte(req,res,{revue:true});if(c.fail)return;
      const id=publicationId(req,res);if(id===null)return;
      let motif=null;
      if(mode==='REJECT'){
        if(typeof req.body?.motif!=='string'||req.body.motif.trim().length<10||req.body.motif.length>2000)
          return res.status(400).json({statut:'MOTIF_REJET_REQUIS'});
        motif=req.body.motif.trim();
      }
      const outcome=await service.transition({mode,publicationId:id,sourceOrgId:null,tenant:c.tenant,acteurId:c.acteurId,motif});
      return res.status(outcome.ok?200:409).json({statut:outcome.ok?(mode==='APPROVE'?'DIASPORA_DIFFUSEE':'DIASPORA_REJETEE'):outcome.code,publicationId:id});
    }));
  }
  return router;
}
module.exports={creerRoutesBureauDiaspora};
