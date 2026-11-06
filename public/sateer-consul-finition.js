/* Finition de lisibilite du dashboard strategique.
   Aucune API, aucune lecture/operation de donnees metier. */
(() => {
  'use strict';
  function apply() {
    const doc = document;
    if (!doc.body || !doc.getElementById('dashboardContenu')) return;
    doc.body.classList.add('sateer-consul-finition');

    // Les anciens themes imposent parfois des couleurs en inline !important.
    // Les remplacer ici sur le seul en-tete du dashboard, sans changer le metier.
    const title = Array.from(doc.querySelectorAll('h1')).find(el =>
      /dashboard strat[eé]gique/i.test(el.textContent || ''));
    const head = (title && (title.closest('header, .hero, .page-header, .dashboard-header') || title.parentElement)) ||
      doc.querySelector('.page .hero');
    if (head && head !== doc.body && head.id !== 'dashboardContenu') {
      head.classList.add('sateer-consul-bandeau-fini');
      if (head.style) {
        head.style.setProperty('background', '#eaf1fa', 'important');
        head.style.setProperty('color', '#16324f', 'important');
        head.style.setProperty('border-color', '#cddce9', 'important');
      }
      for (const item of head.querySelectorAll('h1,h2,h3,h4,p,span,small,strong,b,.eyebrow,.muted,#organisationNom')) {
        if (!item.style) continue;
        item.style.setProperty('color', item.classList?.contains('eyebrow') ? '#193850' : '#16324f', 'important');
        item.style.setProperty('opacity', '1', 'important');
        item.style.setProperty('text-shadow', 'none', 'important');
      }
    }

    // Ne modifier que les liens de retour au Consulat, pas les destinations.
    for (const a of doc.querySelectorAll('a[href]')) {
      const label = (a.textContent || '').replace(/\s+/g, ' ').trim();
      const href = a.getAttribute('href') || '';
      const isReturn = /retour\s+[aà]\s+mon\s+consulat/i.test(label) ||
        (/^\/?consulat\.html(?:\?.*)?$/i.test(href) && /retour/i.test(label));
      if (!isReturn) continue;
      a.classList.add('sateer-consul-return-visible');
      if (a.style) {
        a.style.setProperty('background', '#143955', 'important');
        a.style.setProperty('color', '#ffffff', 'important');
        a.style.setProperty('opacity', '1', 'important');
        a.style.setProperty('visibility', 'visible', 'important');
        a.style.setProperty('text-decoration', 'none', 'important');
      }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, {once:true});
  else apply();
})();
