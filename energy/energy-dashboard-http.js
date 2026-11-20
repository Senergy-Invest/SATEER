'use strict';
/** C4C : API strictement GET, aucune autorisation ni appartenance inventée. */
const {UUID,TENANT} = require('./energy-case-domain');
const {offsetValide} = require('./energy-dashboard-domain');
function creerEnergyDashboardRouter({router,listerOrganisations,store,tenantAutorise}) {
  if (!router?.use || !router?.get || typeof listerOrganisations !== 'function' ||
      !store || typeof store.sites !== 'function' || typeof store.synthese !== 'function') {
    throw TypeError('DEPENDANCES_C4C');
  }
  const refuse = (res,status,code) => res.status(status).json({statut:code});
  router.use((_req,res,next) => {
    res.set('Cache-Control','private, no-store');
    res.set('X-Content-Type-Options','nosniff');
    res.set('Referrer-Policy','no-referrer');
    next();
  });
  const guard = fn => async (req,res) => {
    try {
      const actor = Number(req.auth?.personneId), tenant = req.query?.tenant;
      if (!Number.isSafeInteger(actor) || actor <= 0) return refuse(res,401,'SESSION_REQUISE');
      if (typeof tenant !== 'string' || !TENANT.test(tenant)) return refuse(res,400,'TENANT_INVALIDE');
      if (tenant !== tenantAutorise || !TENANT.test(tenantAutorise || '')) return refuse(res,403,'C4C_NON_ACTIF');
      const orgs = await listerOrganisations(actor,tenant);
      if (!Array.isArray(orgs) || !orgs.some(o => o.tenant_code === tenant)) return refuse(res,403,'TENANT_NON_AUTORISE');
      return await fn(req,res,{actor,tenant});
    } catch(e) {
      console.error('EnergyDashboardC4C:', e?.code || e?.name || 'ERREUR');
      return refuse(res,503,'TABLEAU_DE_BORD_INDISPONIBLE');
    }
  };
  router.get('/sites',guard(async (req,res,s) => {
    const offset = offsetValide(req.query?.offset);
    if (offset === null) return refuse(res,400,'PAGINATION_INVALIDE');
    return res.json({statut:'SITES_PILOTAGE_PRIVES',...await store.sites({...s,offset})});
  }));
  router.get('/sites/:siteId/synthese',guard(async (req,res,s) => {
    if (!UUID.test(req.params?.siteId || '')) return refuse(res,400,'SITE_INVALIDE');
    const offset = offsetValide(req.query?.offset);
    if (offset === null) return refuse(res,400,'PAGINATION_INVALIDE');
    const grantId = req.query?.grantId;
    if (grantId !== undefined && !UUID.test(grantId || '')) return refuse(res,400,'AFFECTATION_INVALIDE');
    const data = await store.synthese({...s,siteId:req.params.siteId,grantId:grantId || null,offset});
    return data ? res.json({statut:'PILOTAGE_C4C_PRIVE',...data}) : refuse(res,404,'PERIMETRE_NON_AUTORISE');
  }));
  return router;
}
module.exports = {creerEnergyDashboardRouter};
