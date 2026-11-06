'use strict';
// Point d'entree vers la boîte e-mail SYNTHETIQUE, sans accès ni écriture métier.
(function () {
  function installerLien(documentRef, locationRef) {
    if (documentRef.getElementById('sateer-vice-email-entry')) return 'DEJA_PRESENT';
    const params = new URLSearchParams(locationRef.search || '');
    const organisation = params.get('organisation') || params.get('organisationId') || '';
    const tenant = params.get('tenant') || '';
    const valide = /^[1-9][0-9]{0,14}$/.test(organisation) && /^[A-Z][A-Z0-9_-]{1,49}$/.test(tenant);
    const action = documentRef.createElement('a');
    action.id = 'sateer-vice-email-entry';
    action.className = 'sateer-vice-email-entry';
    action.setAttribute('aria-label', 'Courriers entrants — simulation en lecture seule');
    if (valide) {
      action.href = '/email-secretariat-demo.html?' + new URLSearchParams({organisation, tenant}).toString();
    } else {
      action.removeAttribute('href');
      action.setAttribute('aria-disabled', 'true');
      action.title = 'Ouvrez le pilotage avec une organisation et un tenant autorisés.';
    }
    const label = documentRef.createElement('span');
    label.textContent = '✉ Courriers entrants';
    const hint = documentRef.createElement('span');
    hint.className = 'sateer-vice-email-entry-hint';
    hint.textContent = 'Simulation · lecture seule';
    action.append(label, hint);

    const publishedAction = Array.from(documentRef.querySelectorAll('a[href]'))
      .find(element => (element.getAttribute('href') || '').includes('publication-institutionnelle.html'));
    if (publishedAction) {
      publishedAction.insertAdjacentElement('afterend', action);
    } else {
      const main = documentRef.querySelector('main') || documentRef.body;
      if (main) main.insertAdjacentElement('afterbegin', action);
      else return 'EMPLACEMENT_ABSENT';
    }
    return valide ? 'INSTALLE' : 'CONTEXTE_MANQUANT';
  }

  if (typeof module === 'object' && module.exports) module.exports = {installerLien};
  if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    const init = () => installerLien(document, window.location);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once: true});
    else init();
  }
}());
