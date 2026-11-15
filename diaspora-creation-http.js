"use strict";
/** Creation D3 pour une source ASSOCIATION Diaspora : source session, permission Core.
 * Publication uniquement textuelle, audience TOUS, categorie Diaspora, etat NON_DEMANDEE.
 * L'approbation SATEER reste une transition distincte via D2A.
 */
const TENANT=/^[A-Z][A-Z0-9_-]{0,49}$/;
const ID=/^[1-9][0-9]*$/;
const CATEGORIES=Object.freeze(['EVENEMENT','FORMATION','EMPLOI','ENTREPRENEURIAT','CULTURE','COMMUNAUTE']);
const CHAMPS=new Set(['tenantCode','titre','contenu','categorie']);
function creerRoutesCreationDiaspora({router,verifierPermission,trouverOrganisation,creerPublication}){
 if(!router || typeof router.post!=='function' || typeof verifierPermission!=='function' ||
    typeof trouverOrganisation!=='function' || typeof creerPublication!=='function')
   throw new TypeError('DEPENDANCES_CREATION_DIASPORA');
 router.post('/:organisationId/diaspora/publications',async(req,res)=>{
  try{
   res.set('Cache-Control','private, no-store');
   const acteurId=Number(req.auth?.personneId);
   if(!Number.isSafeInteger(acteurId)||acteurId<=0)return res.status(401).json({statut:'AUTHENTIFICATION_REQUISE'});
   const tenant=req.query?.tenant;
   const orgParam=String(req.params?.organisationId||'');
   if(typeof tenant!=='string'||!TENANT.test(tenant)||!ID.test(orgParam)||!Number.isSafeInteger(Number(orgParam)))
     return res.status(400).json({statut:'CONTEXTE_INVALIDE'});
   const origin=req.get?.('Origin');
   const allowed=process.env.SATEER_PUBLIC_ORIGIN||'http://localhost:3000';
   if(origin&&origin!==allowed)return res.status(403).json({statut:'ORIGINE_NON_AUTORISEE'});
   const orgId=Number(orgParam);
   const org=await trouverOrganisation(orgId,tenant);
   if(!org)return res.status(404).json({statut:'ORGANISATION_INTROUVABLE'});
   // Ce MVP n'autorise pas le Bureau SATEER ni un citoyen a publier au nom d'une association.
   if(org.type!=='ASSOCIATION')return res.status(403).json({statut:'SOURCE_ASSOCIATIVE_REQUISE'});
   const permission=await verifierPermission({personneId:acteurId,organisationId:orgId,tenantCode:tenant,
     permissionCode:'TARGET_COMMUNICATION',uniteId:null});
   if(permission?.succes!==true||permission.autorise!==true||permission.portee!=='ORGANISATION')
     return res.status(403).json({statut:'ACCES_REFUSE',permissionRequise:'TARGET_COMMUNICATION'});
   const body=req.body;
   if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!CHAMPS.has(k))||
      body.tenantCode!==tenant||typeof body.titre!=='string'||!body.titre.trim()||
      body.titre.length>255||typeof body.contenu!=='string'||!body.contenu.trim()||
      body.contenu.length>20000||!CATEGORIES.includes(body.categorie))
      return res.status(400).json({statut:'PUBLICATION_DIASPORA_INVALIDE'});
   const publication=await creerPublication(tenant,orgId,acteurId,body.titre.trim(),body.contenu.trim(),
       'TOUS',null,body.categorie,'NORMALE',[],null);
   if(!publication)return res.status(409).json({statut:'PUBLICATION_NON_CREEE'});
   return res.status(201).json({statut:'DIASPORA_PUBLICATION_CREEE',publicationId:Number(publication.id),
      etatDiffusion:'NON_DEMANDEE',categorie:body.categorie});
  }catch(err){console.error('Creation Diaspora :',err);return res.status(500).json({statut:'ERREUR_CREATION_DIASPORA'});}
 });
 return router;
}
module.exports={creerRoutesCreationDiaspora,CATEGORIES};
