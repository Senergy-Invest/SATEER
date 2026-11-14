"use strict";
/* A6 : contextualise la façade historique Communication lorsque ouverte depuis
 * Mon Ambassade ; aucune permission n'est créée ici. Le backend reste seul juge.
 */
(function (root) {
  function presentation({ doc, organisation, tenantCode, contexte } = {}) {
    const paramsOK = organisation && Number.isSafeInteger(Number(organisation)) && Number(organisation) > 0 &&
      typeof tenantCode === 'string' && /^[A-Z][A-Z0-9_-]{0,49}$/.test(tenantCode);
    const appartient = paramsOK && Array.isArray(contexte?.organisations) && contexte.organisations.some(x =>
      Number(x.id) === Number(organisation) && x.type === 'AMBASSADE' && x.tenant_code === tenantCode);
    if (!appartient) return false;
    const retour = doc.querySelector('.com-back');
    const sousTitre = doc.querySelector('.com-kicker');
    const bandeau = doc.querySelector('.com-banner h1');
    if (retour) {
      retour.textContent = '← Retour à Mon Ambassade';
      retour.href = '/ambassade.html?' + new URLSearchParams({ organisation: String(organisation), tenant: tenantCode });
    }
    if (sousTitre) sousTitre.textContent = 'SATEER · Espace Ambassade';
    if (bandeau) bandeau.textContent = 'Communication institutionnelle de l’Ambassade';
    return true;
  }
  async function initialiser() {
    const query = new URLSearchParams(root.location.search);
    if (query.get('from') !== 'AMBASSADE') return;
    try {
      const contexte = await root.SATEER_CONTEXT_READY;
      presentation({ doc: root.document, organisation: query.get('organisation'),
        tenantCode: query.get('tenant'), contexte });
    } catch { /* La session et les droits de publication restent vérifiés côté API. */ }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { presentation };
  if (root?.document && root?.location) initialiser();
})(typeof window !== 'undefined' ? window : globalThis);
