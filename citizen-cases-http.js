"use strict";
/** A15 — lecture des demandes personnelles, expérience institutionnelle générique.
 * Le client ne choisit JAMAIS la personne : l'identité vient de la session.
 * Aucune écriture ni nouvelle permission. Les droits restent dans le Core.
 */
const TENANT = /^[A-Z][A-Z0-9_-]{0,49}$/;
const ID = /^[1-9][0-9]*$/;
function creerRouteMesDemandes({ router, listerOrganisations, trouverOrganisation, listerDemandes } = {}) {
  if (!router || typeof router.get !== 'function' ||
      [listerOrganisations, trouverOrganisation, listerDemandes].some(x => typeof x !== 'function')) {
    throw new TypeError('DEPENDANCES_DEMANDES_REQUISES');
  }
  router.get('/demandes', async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    const personneId = Number(req.auth?.personneId);
    const brutId = req.query?.organisation;
    const tenant = req.query?.tenant;
    const organisationId = typeof brutId === 'string' && ID.test(brutId) ? Number(brutId) : NaN;
    if (!Number.isSafeInteger(personneId) || personneId <= 0) {
      return res.status(401).json({ statut: 'AUTHENTIFICATION_REQUISE' });
    }
    if (!Number.isSafeInteger(organisationId) || organisationId <= 0 ||
        typeof tenant !== 'string' || !TENANT.test(tenant)) {
      return res.status(400).json({ statut: 'CONTEXTE_INVALIDE' });
    }
    try {
      const organisations = await listerOrganisations(personneId, tenant);
      if (!Array.isArray(organisations) || !organisations.some(o =>
          Number(o.id) === organisationId && (o.tenant_code == null || o.tenant_code === tenant))) {
        return res.status(403).json({ statut: 'PERSONNE_HORS_ORGANISATION' });
      }
      const org = await trouverOrganisation(organisationId, tenant);
      if (!org || !['AMBASSADE', 'CONSULAT'].includes(org.type)) {
        return res.status(403).json({ statut: 'ORGANISATION_NON_AUTORISEE' });
      }
      const demandes = await listerDemandes(personneId, organisationId, tenant);
      if (!Array.isArray(demandes)) throw new Error('LISTE_INVALIDE');
      // Projection minimale, sans identifiants de tiers ni données de dossiers étrangers.
      const liste = demandes.map(d => ({
        id: Number(d.id), objet: String(d.objet || ''),
        categorie: String(d.categorie || ''), statut: String(d.statut || ''),
        dateCreation: d.date_creation
      }));
      return res.json({ statut: 'MES_DEMANDES_CHARGEES', organisationId, tenantCode: tenant,
        demandes: liste });
    } catch (error) {
      console.error('Liste citoyenne de demandes indisponible :', error?.message || error);
      return res.status(500).json({ statut: 'DEMANDES_INDISPONIBLES' });
    }
  });
  return router;
}
module.exports = { creerRouteMesDemandes };
