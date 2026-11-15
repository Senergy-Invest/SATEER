"use strict";
/** Registre de verification associative. Permissions Core sur organisation SATEER uniquement. */
const TENANT=/^[A-Z][A-Z0-9_-]{0,49}$/;
const ID=/^[1-9][0-9]*$/;
function creerRoutesRepertoireDiaspora({router,service,verifierPermission,trouverOrganisation}){
  if(!router||typeof router.get!=='function'||typeof router.post!=='function'||
     typeof verifierPermission!=='function'||typeof trouverOrganisation!=='function'||!service)
    throw new TypeError('DEPENDANCES_REPERTOIRE_REQUISES');
  async function context(req,res,write){
    res.set('Cache-Control','private, no-store');
    const personneId=Number(req.auth?.personneId),orgStr=req.params?.organisationId,tenant=req.query?.tenant;
    if(!Number.isSafeInteger(personneId)||personneId<=0){res.status(401).json({statut:'AUTHENTIFICATION_REQUISE'});return null;}
    if(!ID.test(orgStr)||!Number.isSafeInteger(Number(orgStr))||typeof tenant!=='string'||!TENANT.test(tenant)){
      res.status(400).json({statut:'CONTEXTE_INVALIDE'});return null;
    }
    if(write){
      const origin=req.get?.('Origin'),expected=process.env.SATEER_PUBLIC_ORIGIN||'http://localhost:3000';
      if(origin&&origin!==expected){res.status(403).json({statut:'ORIGINE_NON_AUTORISEE'});return null;}
    }
    const organisationId=Number(orgStr);
    const org=await trouverOrganisation(organisationId,tenant);
    if(!org||org.type!=='SATEER'){res.status(403).json({statut:'BUREAU_SATEER_REQUIS'});return null;}
    for(const permissionCode of ['TARGET_COMMUNICATION','MANAGE_PUBLICATIONS']){
      const d=await verifierPermission({personneId,organisationId,tenantCode:tenant,permissionCode,uniteId:null});
      if(d?.succes!==true||d.autorise!==true||d.portee!=='ORGANISATION'){
        res.status(403).json({statut:'ACCES_REFUSE',permissionRequise:permissionCode});return null;
      }
    }
    return {personneId,organisationId,tenant};
  }
  const wrap=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){console.error('Repertoire Diaspora',e);return res.status(500).json({statut:'ERREUR_REPERTOIRE_DIASPORA'});}};
  router.get('/:organisationId/diaspora/association-directory',wrap(async(req,res)=>{
    const c=await context(req,res,false);if(!c)return;
    const rows=await service.listerRepertoireBureau(c.tenant);
    return res.json({statut:'REPERTOIRE_DIASPORA_CHARGE',associations:rows.map(x=>({id:Number(x.id),nom:x.nom,statut:x.statut}))});
  }));
  router.post('/:organisationId/diaspora/association-directory/:associationId',wrap(async(req,res)=>{
    const c=await context(req,res,true);if(!c)return;
    const target=req.params?.associationId,statut=req.body?.statut;
    if(!ID.test(target)||!Number.isSafeInteger(Number(target))||!['VERIFIEE','SUSPENDUE'].includes(statut))
      return res.status(400).json({statut:'PARAMETRES_REPERTOIRE_INVALIDES'});
    const result=await service.verifierAssociation({bureauId:c.organisationId,associationId:Number(target),acteurId:c.personneId,tenant:c.tenant,statut});
    return res.status(result.ok?200:409).json({statut:result.ok?'ASSOCIATION_STATUT_MODIFIE':result.code,associationId:Number(target),etat:result.statut});
  }));
  return router;
}
module.exports={creerRoutesRepertoireDiaspora};
