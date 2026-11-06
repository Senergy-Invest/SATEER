/* Présentation progressive du suivi citoyen — aucune API, aucune donnée modifiée. */
(() => {
  'use strict';
  function init() {
    const get = id => document.getElementById(id);
    const title = get('detailTitle');
    const status = get('demandeStatut');
    const history = get('historiqueContainer');
    const replies = get('reponsesContainer');
    const category = get('demandeCategorie');
    if (!title || !status || !history || !replies || !category) return;
    if (document.body.classList.contains('sateer-case-detail')) return;
    document.body.classList.add('sateer-case-detail');

    const sectionOf = el => el.closest('section') || el.closest('article') || null;
    let hero = sectionOf(title) || title.parentElement;
    let identity = sectionOf(category);
    let historySection = sectionOf(history);
    let responseSection = sectionOf(replies);
    if (hero) hero.dataset.sateerDetail='hero';
    if (identity && identity !== hero) identity.dataset.sateerDetail='identity';
    if (historySection && historySection !== hero) historySection.dataset.sateerDetail='history';
    if (responseSection && responseSection !== hero) responseSection.dataset.sateerDetail='responses';

    // Mettre en avant la réponse de l'institution avant la chronologie,
    // seulement si les deux sections sont bien sœurs dans la page existante.
    if (responseSection && historySection && responseSection !== historySection &&
        responseSection.parentElement === historySection.parentElement &&
        responseSection.compareDocumentPosition(historySection) & Node.DOCUMENT_POSITION_PRECEDING) {
      historySection.before(responseSection);
    }

    const progress = document.createElement('div');
    progress.className='sateer-case-progress';
    progress.hidden=true;
    const line=document.createElement('div');line.className='sateer-case-statusline';
    const label=document.createElement('strong');label.textContent='Avancement de votre demande';
    const pill=document.createElement('span');pill.className='sateer-case-pill';pill.setAttribute('role','status');
    line.append(label,pill);
    const steps=document.createElement('div');steps.className='sateer-case-steps';steps.setAttribute('aria-label','Progression du dossier');
    const words=['Demande envoyée','En traitement','Réponse apportée'];
    const nodes=words.map((word,i)=>{
      const el=document.createElement('div');el.className='sateer-case-step';
      const n=document.createElement('span');n.className='number';n.textContent=String(i+1);
      const text=document.createElement('span');text.textContent=word;el.append(n,text);steps.append(el);return el;
    });
    progress.append(line,steps);
    title.insertAdjacentElement('afterend',progress);
    function updateStatus() {
      const raw=status.textContent.trim().toUpperCase();
      const levels={NOUVELLE:0,EN_COURS:1,TRAITEE:2};
      if (!Object.prototype.hasOwnProperty.call(levels,raw)) {progress.hidden=true;return;}
      progress.hidden=false;progress.dataset.state=raw;
      pill.textContent=({NOUVELLE:'Demande reçue',EN_COURS:'En cours de traitement',TRAITEE:'Demande traitée'})[raw];
      nodes.forEach((node,i)=>{
        node.classList.toggle('is-done',i<levels[raw]);
        node.classList.toggle('is-current',i===levels[raw]);
        if (i===levels[raw]) node.setAttribute('aria-current','step'); else node.removeAttribute('aria-current');
      });
    }
    updateStatus();
    const statusObserver=new MutationObserver(updateStatus);
    statusObserver.observe(status,{childList:true,characterData:true,subtree:true});

    // Libellé public plus intelligible que le code technique P6.
    function polishTimeline() {
      history.querySelectorAll('.timeline-title').forEach(el=>{
        if (el.textContent.trim()==='ORIENTATION_AUTOMATIQUE') el.textContent='Transmise au bureau compétent';
      });
      history.querySelectorAll('.timeline-transition').forEach(el=>{
        const t=el.textContent.trim().match(/^(.+?)\s*→\s*(.+)$/);
        if (t && t[1].trim()===t[2].trim()) el.textContent='Affectation enregistrée';
      });
    }
    polishTimeline();
    const historyObserver=new MutationObserver(polishTimeline);
    historyObserver.observe(history,{childList:true,subtree:true});
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
