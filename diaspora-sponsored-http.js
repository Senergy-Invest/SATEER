"use strict";
/** D2B-C1: session depuis server.js, aucune identité nommée par le navigateur. */
const T=/^[A-Z][A-Z0-9_-]{0,49}$/,I=/^[1-9][0-9]*$/;
function creerRoutesSponsorDiaspora({router,service,contexteCitoyen}){
 if(!router||typeof router.get!=='function'||typeof router.put!=='function'||!service||typeof contexteCitoyen!=='function')
  throw new TypeError('DEPENDANCES_SPONSOR_HTTP');
 const wrap=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){console.error('Sponsor Diaspora',e);return res.status(500).json({statut:'ERREUR_SPONSOR_DIASPORA'});}};
 async function ctx(req,res,write=false){
  res.set('Cache-Control','private, no-store');const personneId=Number(req.auth?.personneId),tenant=req.query?.tenant;
  if(!Number.isSafeInteger(personneId)||personneId<=0){res.status(401).json({statut:'AUTHENTIFICATION_REQUISE'});return null;}
  if(typeof tenant!=='string'||!T.test(tenant)){res.status(400).json({statut:'TENANT_INVALIDE'});return null;}
  if(write){const origin=req.get?.('Origin'),expected=process.env.SATEER_PUBLIC_ORIGIN||'http://localhost:3000';
   if(origin&&origin!==expected){res.status(403).json({statut:'ORIGINE_NON_AUTORISEE'});return null;}
   if(typeof req.body?.actif!=='boolean'){res.status(400).json({statut:'CONSENTEMENT_INVALIDE'});return null;}}
  if(!await contexteCitoyen(personneId,tenant)){res.status(403).json({statut:'ACCES_TENANT_REFUSE'});return null;}
  return{personneId,tenant};
 }
 router.get('/sponsor-consent',wrap(async(req,res)=>{const c=await ctx(req,res);if(!c)return;
  return res.json({statut:'CONSENTEMENT_SPONSOR_CHARGE',...(await service.lireConsentement(c.personneId,c.tenant))});}));
 router.put('/sponsor-consent',wrap(async(req,res)=>{const c=await ctx(req,res,true);if(!c)return;
  const r=await service.modifierConsentement(c.personneId,c.tenant,req.body.actif);
  return res.status(r.ok?200:403).json({statut:r.ok?'CONSENTEMENT_SPONSOR_MODIFIE':r.code,actif:r.actif});}));
 return router;
}
function creerRoutesMarquageSponsor({router,service,verifierPermission,trouverOrganisation}){
 if(!router||typeof router.put!=='function'||!service||typeof verifierPermission!=='function'||typeof trouverOrganisation!=='function')
  throw new TypeError('DEPENDANCES_MARQUAGE_SPONSOR');
 router.put('/:organisationId/diaspora/sponsorisation/:publicationId',async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  try{
   const acteurId=Number(req.auth?.personneId),tenant=req.query?.tenant;
   if(!Number.isSafeInteger(acteurId)||acteurId<=0)return res.status(401).json({statut:'AUTHENTIFICATION_REQUISE'});
   if(typeof tenant!=='string'||!T.test(tenant)||!I.test(String(req.params?.organisationId||''))||
      !I.test(String(req.params?.publicationId||'')))return res.status(400).json({statut:'CONTEXTE_INVALIDE'});
   const origin=req.get?.('Origin'),expected=process.env.SATEER_PUBLIC_ORIGIN||'http://localhost:3000';
   if(origin&&origin!==expected)return res.status(403).json({statut:'ORIGINE_NON_AUTORISEE'});
   if(typeof req.body?.sponsorise!=='boolean')return res.status(400).json({statut:'MARQUAGE_INVALIDE'});
   const organisationId=Number(req.params.organisationId),publicationId=Number(req.params.publicationId);
   if(!Number.isSafeInteger(organisationId)||!Number.isSafeInteger(publicationId))return res.status(400).json({statut:'IDENTIFIANT_INVALIDE'});
   if(!await trouverOrganisation(organisationId,tenant))return res.status(404).json({statut:'ORGANISATION_INTROUVABLE'});
   const right=await verifierPermission({personneId:acteurId,organisationId,tenantCode:tenant,
      permissionCode:'TARGET_COMMUNICATION',uniteId:null});
   if(right?.succes!==true||right.autorise!==true||right.portee!=='ORGANISATION')return res.status(403).json({statut:'ACCES_REFUSE'});
   const result=await service.definirSponsorisation({organisationId,publicationId,acteurId,tenant,sponsorise:req.body.sponsorise});
   return res.status(result.ok?200:409).json({statut:result.ok?'MARQUAGE_SPONSOR_ENREGISTRE':result.code,sponsorise:result.sponsorise});
  }catch(e){console.error('Marquage Sponsor Diaspora',e);return res.status(500).json({statut:'ERREUR_MARQUAGE_SPONSOR'});}
 });
 return router;
}
module.exports={creerRoutesSponsorDiaspora,creerRoutesMarquageSponsor};
