/* Finition de lisibilite du dashboard strategique.
   Aucune API, aucune lecture/operation de donnees metier. */
(() => {
  'use strict';
  function apply() {
    const doc = document;
    if (!doc.body || !doc.getElementById('dashboardContenu')) return;
    doc.body.classList.add('sateer-consul-finition');

    // L'ancien correctif "rendreEnteteLisible" pose parfois un fond BLANC en inline !important.
    // Appliquer le nouveau bandeau APRES cette regle, toujours sur cette seule page.
    const title = Array.from(doc.querySelectorAll('h1')).find(el =>
      /dashboard strat[eé]gique/i.test(el.textContent || ''));
    const head = (title && (title.closest('header, .hero, .page-header, .dashboard-header') || title.parentElement)) ||
      doc.querySelector('.page .hero');
    if (head && head !== doc.body && head.id !== 'dashboardContenu') {
      head.classList.add('sateer-consul-bandeau-fini');
      if (head.style) {
        head.style.setProperty('background', 'linear-gradient(115deg, #0c2841 0%, #17445f 66%, #075950 100%)', 'important');
        head.style.setProperty('color', '#ffffff', 'important');
        head.style.setProperty('border-color', '#0c2841', 'important');
      }
      for (const item of head.querySelectorAll('h1,h2,h3,h4,p,span,small,strong,b,.eyebrow,.muted,#organisationNom')) {
        if (!item.style) continue;
        item.style.setProperty('color', item.classList?.contains('eyebrow') ? '#d3f6f0' : '#ffffff', 'important');
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
