/* Habillage progressif du dashboard strategique : aucune requete ni modification des donnees. */
(() => {
  'use strict';
  const ids = [
    'kpiDemandesTotal','kpiTauxTraitement','kpiDelaiMoyen','kpiUrgentes',
    'kpiUsagers','kpiTerritoires','kpiNouvelles','kpiEnCours','kpiTraites',
    'kpiImportantes','kpiPublications','kpiPublicationsPubliees',
    'kpiPublicationsSoumises','kpiPublicationsDiffusees'
  ];
  function cardFor(value) {
    // Preferer la carte du projet, sans jamais prendre le conteneur de toutes les cartes.
    const known = value.closest('.dashboard-kpi, .strategic-kpi, .kpi-card, .metric-card, .stat-card, .dashboard-stat, .strategic-stat');
    if (known) return known;
    let current = value.parentElement;
    let best = current;
    for (let depth = 0; current && depth < 4; depth++, current = current.parentElement) {
      if (current.querySelectorAll('[id^="kpi"]').length > 1) break;
      best = current;
      if (current.children && current.children.length > 1) return current;
    }
    return best;
  }
  function apply() {
    if (!document.body || !document.getElementById('dashboardContenu')) return;
    document.body.classList.add('sateer-consul-refonte');
    const cards = new Set();
    for (const id of ids) {
      const value = document.getElementById(id);
      if (!value) continue;
      const card = cardFor(value);
      if (!card || card === document.body || card.id === 'dashboardContenu' || cards.has(card)) continue;
      cards.add(card);
      card.classList.add('sateer-strat-kpi');
      if (id === 'kpiDemandesTotal') card.classList.add('sateer-strat-kpi--accent');
      if (id === 'kpiUrgentes') card.classList.add('sateer-strat-kpi--urgent');
    }
    // Le retour au consulat doit conserver le contexte si les deux parametres sont presents.
    const params = new URLSearchParams(window.location.search);
    const organisation = params.get('organisation');
    const tenant = params.get('tenant');
    const validId = /^[1-9]\d*$/.test(organisation || '');
    const validTenant = /^[A-Z][A-Z0-9_-]{1,49}$/.test(tenant || '');
    for (const link of document.querySelectorAll('a[href]')) {
      const href = link.getAttribute('href') || '';
      if (!/^\/?consulat\.html(?:\?.*)?$/.test(href)) continue;
      if (validId && validTenant) {
        link.setAttribute('href', `/consulat.html?organisation=${encodeURIComponent(organisation)}&tenant=${encodeURIComponent(tenant)}`);
      }
      link.classList.add('sateer-consul-return');
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, {once: true});
  else apply();
})();
