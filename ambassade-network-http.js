"use strict";
/** API A12 : uniquement GET, session + permission organisationnelle + type AMBASSADE. */
const { exigerPermission } = require('./auth-authorization');
const ID=/^[1-9][0-9]*$/, TENANT=/^[A-Z][A-Z0-9_-]{0,49}$/;
function creerRouteReseauAmbassade({router,charger}={}) {
  if(!router?.get || typeof charger!=='function')throw new TypeError('DEPENDANCES_RESEAU_MANQUANTES');
  router.get('/:organisationId',...exigerPermission('VIEW_ORGANISATION_ANALYTICS','ORGANISATION'),async(req,res)=>{
    res.set('Cache-Control','private, no-store');
    const raw=req.params.organisationId, tenant=req.query.tenant;
    if(!ID.test(raw||'')||!TENANT.test(tenant||''))return res.status(400).json({statut:'CONTEXTE_INVALIDE'});
    try {
      const data=await charger({organisationId:Number(raw),tenantCode:tenant});
      if(!data)return res.status(404).json({statut:'AMBASSADE_INTROUVABLE'});
      return res.status(200).json(data);
    }catch(e){console.error('Reseau Ambassade :',e?.message||e);return res.status(503).json({statut:'RESEAU_INDISPONIBLE'});}
  });
  return router;
}
module.exports=Object.freeze({creerRouteReseauAmbassade});
