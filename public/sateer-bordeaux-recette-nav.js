(() => {
  'use strict';
  // Lien de recette volontairement absent hors du pilote local de Bordeaux.
  const { hostname, port, search } = window.location;
  if (hostname !== '127.0.0.1' || port !== '3200') return;
  const query = new URLSearchParams(search);
  if (query.get('organisation') !== '70' || query.get('tenant') !== 'P6V_3B5AC5AB9DB04657') return;
  if (!/(?:^|\/)(?:dashboard-vice-consul|catalogue-demarches)\.html$/.test(window.location.pathname)) return;
  if (document.getElementById('sateer-bordeaux-recette-navigation')) return;
  const root = document.querySelector('main');
  if (!root) return;
  const nav = document.createElement('nav');
  nav.id = 'sateer-bordeaux-recette-navigation';
  nav.setAttribute('aria-label', 'Accès à la simulation du pilote Bordeaux');
  nav.style.cssText = 'margin:12px 0;padding:12px;border:1px solid #b6ced1;border-radius:8px;background:#f4f9f9;line-height:1.6';
  const link = document.createElement('a');
  link.href = 'http://127.0.0.1:3300/bordeaux-catalogue-recette.html';
  link.textContent = 'Simulation du catalogue Bordeaux (non officielle, port 3300)';
  nav.append(link);
  const desc = document.createElement('small');
  desc.textContent = 'Démonstration locale uniquement : aucune validation institutionnelle ni notification citoyenne.';
  desc.style.cssText = 'display:block;color:#38595d';
  nav.append(desc);
  root.prepend(nav);
})();
