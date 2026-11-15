"use strict";
/** D1 — Lecture Diaspora à diffusion validée. Aucune écriture, aucun droit accordé.
 * La session vient exclusivement de exigerSession, monté par server.js.
 * Les appartenances sont contrôlées pour le tenant exact avant toute lecture.
 * La première tranche n'expose que l'audience générale TOUS ; les ciblages
 * spécifiques seront sécurisés lors du MVP dédié au Bureau Communication.
 */
const TENANT = /^[A-Z][A-Z0-9_-]{0,49}$/;

function creerRouteLectureDiaspora({router, listerOrganisations, listerPublications, listerMarquages=null} = {}) {
  if (!router || typeof router.get !== 'function' ||
      typeof listerOrganisations !== 'function' || typeof listerPublications !== 'function') {
    throw new TypeError('DEPENDANCES_DIASPORA_REQUISES');
  }

  router.get('/feed', async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    const personneId = Number(req.auth?.personneId);
    const tenant = req.query?.tenant;
    if (!Number.isSafeInteger(personneId) || personneId <= 0) {
      return res.status(401).json({statut:'AUTHENTIFICATION_REQUISE'});
    }
    if (typeof tenant !== 'string' || !TENANT.test(tenant)) {
      return res.status(400).json({statut:'TENANT_INVALIDE'});
    }
    try {
      const organisations = await listerOrganisations(personneId, tenant);
      if (!Array.isArray(organisations) || !organisations.some(org =>
        org && org.tenant_code === tenant && Number.isSafeInteger(Number(org.id)) && Number(org.id)>0)) {
        return res.status(403).json({statut:'ACCES_TENANT_REFUSE'});
      }
      const publications = await listerPublications(personneId, tenant);
      if (!Array.isArray(publications)) throw new Error('PROJECTION_INVALIDE');
      // Double filtre volontaire : le service SQL doit filtrer DIFFUSEE, mais la
      // projection HTTP ne laisse jamais passer des soumissions ou une audience
      // restreinte en cas de régression du service sous-jacent.
      // Un marquage commercial n'accorde pas d'accès privé et n'entraîne aucun push.
      // Il est cependant affiché clairement sur toute publication consultable.
      const marques=typeof listerMarquages==='function'
        ? await listerMarquages(publications.map(p=>Number(p?.id)).filter(x=>Number.isSafeInteger(x)&&x>0),tenant)
        : [];
      const mapSponsors=new Map(marques.map(x=>[Number(x.id),String(x.sponsor_nom||'')]));
      const visibles = publications.filter(p =>
        p && p.statut_diffusion_diaspora === 'DIFFUSEE' && p.audience_type === 'TOUS')
        .slice(0, 100).map(p => ({
          id: Number(p.id),
          titre: String(p.titre || '').slice(0,255),
          contenu: String(p.contenu || '').slice(0,20000),
          categorie: String(p.categorie || 'INFORMATION').slice(0,100),
          priorite: String(p.priorite || 'NORMALE').slice(0,100),
          organisation: String(p.organisation || '').slice(0,255),
          organisationType: String(p.organisation_type || '').slice(0,100),
          dateDiffusion: p.date_diffusion_diaspora || null,
          sponsorisee:mapSponsors.has(Number(p.id)),sponsorNom:mapSponsors.get(Number(p.id))||null
        }))
        .filter(p=>Number.isSafeInteger(p.id)&&p.id>0);
      return res.json({statut:'DIASPORA_FEED_CHARGE',tenant,publications:visibles,
        perimetre:'DIFFUSEE_TOUS',limite:100});
    } catch(error) {
      console.error('Diaspora lecture :', error);
      return res.status(500).json({statut:'ERREUR_DIASPORA_FEED'});
    }
  });
  return router;
}
module.exports = {creerRouteLectureDiaspora};
