"use strict";
/** Session deja exigee sur /api/diaspora ; aucun id personne ne vient du client. */
const TENANT=/^[A-Z][A-Z0-9_-]{0,49}$/;
const ID=/^[1-9][0-9]*$/;
const {THEMES}=require('./diaspora-optin-service');
function creerRoutesOptinDiaspora({router,service}){
  if(!router||typeof router.get!=='function'||typeof router.put!=='function'||!service)
    throw new TypeError('DEPENDANCES_HTTP_OPTIN');
  async function ctx(req,res,write=false){
    res.set('Cache-Control','private, no-store');
    const personneId=Number(req.auth?.personneId),tenant=req.query?.tenant;
    if(!Number.isSafeInteger(personneId)||personneId<=0){res.status(401).json({statut:'AUTHENTIFICATION_REQUISE'});return null;}
    if(typeof tenant!=='string'||!TENANT.test(tenant)){res.status(400).json({statut:'TENANT_INVALIDE'});return null;}
    if(write){
      const origin=req.get?.('Origin'),expected=process.env.SATEER_PUBLIC_ORIGIN||'http://localhost:3000';
      if(origin && origin!==expected){res.status(403).json({statut:'ORIGINE_NON_AUTORISEE'});return null;}
      if(!req.body||typeof req.body.actif!=='boolean'){
        res.status(400).json({statut:'CHOIX_ABONNEMENT_INVALIDE'});return null;
      }
    }
    const tenantId=await service.contexteCitoyen(personneId,tenant);
    if(!tenantId){res.status(403).json({statut:'ACCES_TENANT_REFUSE'});return null;}
    return {personneId,tenant,tenantId};
  }
  const wrap=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){console.error('Optin Diaspora',e);return res.status(500).json({statut:'ERREUR_ABONNEMENTS_DIASPORA'});}};
  router.get('/subscriptions',wrap(async(req,res)=>{
    const c=await ctx(req,res);if(!c)return;
    const [abonnements,associations]=await Promise.all([service.lister(c.personneId,c.tenant),service.listerAssociations(c.tenant,c.personneId)]);
    return res.json({statut:'ABONNEMENTS_DIASPORA_CHARGES',themes:THEMES,abonnements:abonnements.map(x=>({
      associationId:x.association_id==null?null:Number(x.association_id),themeCode:x.theme_code,actif:x.actif===true
    })),associations:associations.map(x=>({id:Number(x.id),nom:x.nom,statut:x.statut}))});
  }));
  router.put('/subscriptions/theme/:theme',wrap(async(req,res)=>{
    const c=await ctx(req,res,true);if(!c)return;
    const code=req.params?.theme;if(!THEMES.includes(code))return res.status(400).json({statut:'THEME_INVALIDE'});
    const outcome=await service.modifierTheme(c.personneId,c.tenant,code,req.body.actif);
    return res.status(outcome.ok?200:403).json({statut:outcome.ok?'ABONNEMENT_MODIFIE':outcome.code,actif:outcome.actif});
  }));
  router.put('/subscriptions/association/:associationId',wrap(async(req,res)=>{
    const c=await ctx(req,res,true);if(!c)return;
    const str=req.params?.associationId;
    if(!ID.test(str)||!Number.isSafeInteger(Number(str)))return res.status(400).json({statut:'ASSOCIATION_INVALIDE'});
    const outcome=await service.modifierAssociation(c.personneId,c.tenant,Number(str),req.body.actif);
    return res.status(outcome.ok?200:403).json({statut:outcome.ok?'ABONNEMENT_MODIFIE':outcome.code,actif:outcome.actif});
  }));
  router.get('/followed-feed',wrap(async(req,res)=>{
    const c=await ctx(req,res);if(!c)return;
    const pubs=await service.listerSuivies(c.personneId,c.tenant);
    return res.json({statut:'FIL_SUIVI_CHARGE',publications:pubs.map(p=>({
      id:Number(p.id),titre:String(p.titre||'').slice(0,255),contenu:String(p.contenu||'').slice(0,20000),
      categorie:String(p.categorie||'').slice(0,100),priorite:String(p.priorite||'NORMALE').slice(0,100),
      organisation:String(p.organisation||'').slice(0,255),organisationType:String(p.organisation_type||'').slice(0,100),
      dateDiffusion:p.date_diffusion_diaspora||null}))});
  }));
  return router;
}
module.exports={creerRoutesOptinDiaspora};
