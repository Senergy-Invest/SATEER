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

  // Stabilise le contraste de l'en-tete de la page Consul, sans changer le dashboard.
  // Les anciens styles peuvent imposer du texte clair sur un fond blanc.
  function rendreEnteteLisible() {
    if (typeof document.querySelector !== 'function') return;
    const titre = document.querySelector('h1');
    if (!titre || !/dashboard strat[eé]gique/i.test(titre.textContent || '')) return;
    const entete = (typeof titre.closest === 'function' &&
      titre.closest('header, .hero, .page-header, .dashboard-header')) || titre.parentElement;
    if (!entete || entete === document.body || entete.id === 'dashboardContenu' || !entete.style) return;
    entete.classList.add('sateer-consul-entete-visible');
    // Couleurs imposees sur cet en-tete uniquement, meme face a des styles anciens.
    entete.style.setProperty('background', '#ffffff', 'important');
    entete.style.setProperty('color', '#142e49', 'important');
    if (typeof entete.querySelectorAll === 'function') {
      for (const noeud of entete.querySelectorAll('h1, h2, p, span, small, strong, b, .eyebrow, .muted, #organisationNom')) {
        if (noeud.style) noeud.style.setProperty('color', '#142e49', 'important');
      }
    }
  }
  function apply() {
    rendreEnteteLisible();
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
