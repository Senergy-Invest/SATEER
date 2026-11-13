"use strict";
/**
 * A3c : lecture d'un sous-réseau institutionnel, jamais de mutation.
 * La session est exigée par le montage Express ; le routeur vérifie aussi
 * l'identité issue de req.auth. Les permissions sont évaluées dans le
 * service du Core avec VIEW_INSTITUTION_NETWORK, pour la racine choisie.
 */
const { ReseauRefuse } = require('./institution-network-database');
const TENANT = /^[A-Z][A-Z0-9_-]{0,49}$/;
const ID = /^[1-9][0-9]*$/;

function creerRouteLectureReseau({ router, resoudreTenantId, lireSousReseau } = {}) {
  if (!router || typeof router.get !== 'function' ||
      typeof resoudreTenantId !== 'function' || typeof lireSousReseau !== 'function') {
    throw new TypeError('Dependances du reseau institutionnel obligatoires');
  }
  router.get('/:organisationId', async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    const personneId = Number(req.auth?.personneId);
    if (!Number.isSafeInteger(personneId) || personneId <= 0)
      return res.status(401).json({ statut: 'AUTHENTIFICATION_REQUISE' });
    const texteId = req.params?.organisationId;
    const tenantCode = req.query?.tenant;
    const racineId = typeof texteId === 'string' && ID.test(texteId) ? Number(texteId) : NaN;
    if (!Number.isSafeInteger(racineId) || racineId <= 0 ||
        typeof tenantCode !== 'string' || !TENANT.test(tenantCode))
      return res.status(400).json({ statut: 'CONTEXTE_INVALIDE' });
    try {
      const tenantId = await resoudreTenantId(tenantCode);
      if (!Number.isSafeInteger(tenantId) || tenantId <= 0)
        return res.status(403).json({ statut: 'ACCES_RESEAU_REFUSE' });
      const reseau = await lireSousReseau({
        acteur: { personneId, tenantCode }, tenantId, racineId
      });
      // Projection explicite : aucune permission, adresse, dossier ou personne.
      function noeud(x) { return { id: x.id, nom: x.nom, type: x.type }; }
      return res.status(200).json({
        statut: 'RESEAU_INSTITUTIONNEL',
        racine: noeud(reseau.racine),
        descendants: reseau.descendants.map(x => ({ ...noeud(x), profondeur: x.profondeur })),
        relations: reseau.relationsStructurelles.map(x => ({
          parentId: x.parentId, enfantId: x.enfantId, type: x.type
        }))
      });
    } catch (e) {
      if (e instanceof ReseauRefuse)
        return res.status(403).json({ statut: 'ACCES_RESEAU_REFUSE' });
      console.error('Lecture du réseau institutionnel indisponible :', e?.message || e);
      return res.status(500).json({ statut: 'RESEAU_INDISPONIBLE' });
    }
  });
  return router;
}
module.exports = Object.freeze({ creerRouteLectureReseau });
