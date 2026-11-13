"use strict";
/** Adaptateur A5 : une route GET, session fournie par exigerSession du Core. */
const TENANT=/^[A-Z][A-Z0-9_-]{0,49}$/;
const ID=/^[1-9][0-9]*$/;
function creerRouteOperationsAmbassade({router,trouverOrganisation,verifierPermission,charger}={}){
  if(!router||typeof router.get!=='function'||typeof trouverOrganisation!=='function'||
    typeof verifierPermission!=='function'||typeof charger!=='function')
    throw new TypeError('DEPENDANCES_OPERATIONS_INVALIDES');
  router.get('/:organisationId/summary',async(req,res)=>{
    res.set('Cache-Control','private, no-store');
    const personneId=Number(req.auth?.personneId);
    if(!Number.isSafeInteger(personneId)||personneId<=0)
      return res.status(401).json({statut:'AUTHENTIFICATION_REQUISE'});
    const input=req.params?.organisationId,tenantCode=req.query?.tenant;
    const organisationId=typeof input==='string'&&ID.test(input)?Number(input):NaN;
    if(!Number.isSafeInteger(organisationId)||organisationId<=0||typeof tenantCode!=='string'||!TENANT.test(tenantCode))
      return res.status(400).json({statut:'CONTEXTE_INVALIDE'});
    try{
      const org=await trouverOrganisation(organisationId,tenantCode);
      if(!org||Number(org.id)!==organisationId||org.type!=='AMBASSADE'||org.tenant_code!==tenantCode)
        return res.status(403).json({statut:'ACCES_OPERATIONS_REFUSE'});
      const droit=await verifierPermission({personneId,organisationId,tenantCode,
        permissionCode:'VIEW_ORGANISATION_ANALYTICS',uniteId:null});
      if(droit?.succes!==true||droit?.autorise!==true||droit?.portee!=='ORGANISATION')
        return res.status(403).json({statut:'ACCES_OPERATIONS_REFUSE'});
      const vue=await charger({organisationId,tenantCode});
      if(!vue||vue.organisationId!==organisationId||vue.tenantCode!==tenantCode)
        throw new Error('PROJECTION_HORS_CONTEXTE');
      return res.status(200).json({statut:'OPERATIONS_AMBASSADE',vue});
    }catch(e){console.error('Operations Ambassade indisponibles',e?.code||'ERREUR');
      return res.status(503).json({statut:'OPERATIONS_INDISPONIBLES'});}
  });
  return router;
}
module.exports=Object.freeze({creerRouteOperationsAmbassade});
