'use strict';
/* SATEER_EMAIL_VICE_P2_FIX_V1 : lien dans la barre réellement visible (P2).
 * Aucun accès forcé : l'API conserve son contrôle de session et de permissions.
 */
(function () {
  function installerLien(documentRef, locationRef) {
    const compact = documentRef.getElementById('sx-p2-root');
    const compactActions = compact ? compact.querySelector('.sx-p2-actions') : null;
    if (compact && !compactActions) return 'BARRE_P2_ABSENTE';

    // Le dashboard P2 est construit au DOMContentLoaded. Ne jamais insérer
    // le lien dans une section ancienne, masquée par le CSS P2.
    if (!compact && documentRef.querySelector('script[src*="sateer-p2.js"]')) return 'ATTENTE_P2';

    const params = new URLSearchParams(locationRef.search || '');
    const organisation = params.get('organisation') || params.get('organisationId') || '';
    const tenant = params.get('tenant') || '';
    const valide = /^[1-9][0-9]{0,14}$/.test(organisation) && /^[A-Z][A-Z0-9_-]{1,49}$/.test(tenant);
    let action = documentRef.getElementById('sateer-vice-email-entry');
    if (!action) {
      action = documentRef.createElement('a');
      action.id = 'sateer-vice-email-entry';
      action.setAttribute('aria-label', 'Courriers entrants — simulation en lecture seule');
      const label = documentRef.createElement('span');
      label.textContent = '✉ Courriers entrants';
      const hint = documentRef.createElement('span');
      hint.className = 'sateer-vice-email-entry-hint';
      hint.textContent = 'Simulation · lecture seule';
      action.append(label, hint);
    }
    action.className = compact ? 'sateer-vice-email-entry sx-p2-secondary' : 'sateer-vice-email-entry';
    if (valide) {
      action.href = '/email-secretariat-demo.html?' + new URLSearchParams({organisation, tenant}).toString();
      action.removeAttribute('aria-disabled');
      action.removeAttribute('title');
    } else {
      action.removeAttribute('href');
      action.setAttribute('aria-disabled', 'true');
      action.title = 'Ouvrez le pilotage avec une organisation et un tenant autorisés.';
    }

    if (compactActions) {
      // Le bouton "Actualiser" existe dans le même nav. Le courrier apparaît
      // à côté des liens "Publier" et "Suivre", et jamais dans un bloc caché.
      const reload = compactActions.querySelector('#sx-p2-refresh');
      if (action.parentNode !== compactActions) compactActions.insertBefore(action, reload || null);
      return valide ? 'INSTALLE_DANS_P2_VISIBLE' : 'CONTEXTE_MANQUANT';
    }

    // Repli pour une installation dépourvue de la présentation P2.
    const publication = Array.from(documentRef.querySelectorAll('a[href]'))
      .find(el => (el.getAttribute('href') || '').includes('publication-institutionnelle.html') && !el.closest('[hidden]'));
    if (publication) {
      if (action.parentNode !== publication.parentNode) publication.insertAdjacentElement('afterend', action);
    } else {
      const main = documentRef.querySelector('main') || documentRef.body;
      if (!main) return 'EMPLACEMENT_ABSENT';
      if (action.parentNode !== main) main.insertAdjacentElement('afterbegin', action);
    }
    return valide ? 'INSTALLE_ANCIEN_DASHBOARD' : 'CONTEXTE_MANQUANT';
  }

  if (typeof module === 'object' && module.exports) module.exports = {installerLien};
  if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    function init() {
      const result = installerLien(document, window.location);
      if (result === 'ATTENTE_P2') {
        const main = document.querySelector('main.page') || document.documentElement;
        const observer = new MutationObserver(() => {
          const next = installerLien(document, window.location);
          if (next !== 'ATTENTE_P2') observer.disconnect();
        });
        observer.observe(main, {childList: true});
      }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
    else init();
  }
}());
