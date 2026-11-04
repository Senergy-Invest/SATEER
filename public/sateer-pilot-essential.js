/* Lot 1K : organisation progressive, sans appel API ni modification des permissions. */
(function(){
 'use strict';
 function init(){
  if(!document.body.classList.contains('sateer-vice'))return;
  const main=document.querySelector('main.page');if(!main||main.dataset.sx1k)return;
  main.dataset.sx1k='1';
  const direct=()=>Array.from(main.children).filter(el=>el.matches('section.section'));
  const findSection=(name)=>direct().find(s=>s.querySelector('h2')?.textContent.trim()===name);
  const activity=findSection('Vue opérationnelle');
  const communication=findSection('Informer la communauté')||findSection('Communication ciblée');
  const units=findSection('Unités supervisées');
  const suivi=direct().find(s=>s.querySelector('#dernieresDemandes'));
  if(!activity||!units)return;
  // Preserve original publish link (including permission-driven hidden property).
  const actionSection=document.createElement('section');actionSection.className='section sx1k-primary';
  actionSection.innerHTML='<div class="section-header"><div><p class="eyebrow">ACCÈS RAPIDES</p><h2>Que souhaitez-vous faire ?</h2><p class="muted">Deux actions essentielles pour le pilotage quotidien.</p></div></div><div class="sx1k-actions"></div>';
  const actions=actionSection.querySelector('.sx1k-actions');
  const publish=document.getElementById('lienPublicationInstitutionnelle');
  if(publish){
    const a=document.createElement('a');a.className='sx1k-action';a.href='#';
    a.innerHTML='<span class="sx1k-glyph" aria-hidden="true">✉</span><span><strong>Publier une information</strong><small>Communiqué, image, PDF ou lien vidéo</small></span>';
    function update(){a.hidden=publish.hidden;a.href=publish.getAttribute('href')||'#';}
    update();new MutationObserver(update).observe(publish,{attributes:true,attributeFilter:['hidden','href']});actions.append(a);
  }
  const org=document.getElementById('organisationStructureLink');
  if(org){const a=document.createElement('a');a.className='sx1k-action';a.href=org.href;
   a.innerHTML='<span class="sx1k-glyph" aria-hidden="true">▦</span><span><strong>Voir l’organisation</strong><small>Services, membres et responsabilités</small></span>';
   new MutationObserver(()=>a.href=org.href).observe(org,{attributes:true,attributeFilter:['href']});actions.append(a);
  }
  activity.insertAdjacentElement('afterend',actionSection);
  actionSection.insertAdjacentElement('afterend',units);
  if(suivi)units.insertAdjacentElement('afterend',suivi);
  // Build a short dynamic unit listing; original cards remain intact in a disclosure.
  const grid=document.getElementById('supervisionUnitsGrid');
  if(grid){
   const summary=document.createElement('div');summary.className='sx1k-unit-list';summary.setAttribute('aria-live','polite');
   grid.before(summary);
   const detail=document.createElement('details');detail.className='sx1k-more';
   const head=document.createElement('summary');head.textContent='Consulter les détails des unités et ouvrir leurs espaces';
   detail.append(head);grid.before(detail);detail.append(grid);
   function draw(){
    const items=Array.from(grid.querySelectorAll('h3')).filter(e=>e.textContent.trim());
    summary.replaceChildren();
    if(!items.length){const p=document.createElement('p');p.className='sx1k-internal-note';p.textContent=grid.textContent.includes('Chargement')?'Chargement des unités…':'Aucune unité disponible dans ce périmètre.';summary.append(p);return;}
    items.forEach(h=>{const row=document.createElement('div');row.className='sx1k-unit-row';
     const name=document.createElement('strong');name.textContent=h.textContent.trim();
     const status=document.createElement('span');status.textContent='Unité supervisée';row.append(name,status);summary.append(row);});
   }
   draw();let scheduled=false;
   new MutationObserver(()=>{if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;draw();});}).observe(grid,{childList:true,subtree:true,characterData:true});
  }
  // Keep advanced functions present, but no longer in the primary visual flow.
  if(communication){const d=document.createElement('details');d.className='sx1k-more sx1k-aux';
   const s=document.createElement('summary');s.textContent='Communication : canaux et configuration';d.append(s);communication.before(d);d.append(communication);}
  // Existing disclosures from Lot 1J stay nested and fully functional.
  const auth=document.getElementById('gestionAccesDashboard');
  if(auth&&!auth.closest('details')){const d=document.createElement('details');d.className='sx1k-more sx1k-aux';
   const s=document.createElement('summary');s.textContent='Administration des accès';d.append(s);auth.before(d);d.append(auth);
   const sync=()=>d.hidden=auth.hidden;sync();new MutationObserver(sync).observe(auth,{attributes:true,attributeFilter:['hidden']});}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
