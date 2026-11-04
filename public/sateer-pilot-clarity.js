/* Présentation uniquement : aucun appel API, aucun droit ajouté. */
(function(){
  function init(){
    if(!document.body.classList.contains('sateer-vice'))return;
    const main=document.querySelector('main.page');if(!main)return;
    const sections=Array.from(main.querySelectorAll(':scope > section.section'));
    const locate=(text)=>sections.find(s=>s.querySelector('h2')?.textContent?.trim()===text);
    const activity=locate('Vue opérationnelle');
    const communication=locate('Communication ciblée');
    if(activity&&communication){activity.insertAdjacentElement('afterend',communication);}
    // Mise en avant du geste principal ; le bouton original garde sa logique de permission.
    if(communication){
      const header=communication.querySelector('.section-header h2');if(header)header.textContent='Informer la communauté';
      const desc=communication.querySelector('.communication-preview p');
      if(desc)desc.textContent='Publier une information officielle, choisir son public et ajouter une photo, un PDF ou un lien vidéo. Toutes les publications restent dans Mon Consulat.';
    }
    const groups=[
      ['Communauté liée au Consulat','Communauté et territoires'],
      ['Réseau institutionnel','Associations et réseau institutionnel']
    ];
    for(const [heading,label] of groups){
      const sec=locate(heading);if(!sec)continue;
      const details=document.createElement('details');details.className='sx-disclosure';
      const summary=document.createElement('summary');summary.textContent=label;
      details.append(summary);sec.parentNode.insertBefore(details,sec);details.append(sec);
    }
    const territory=sections.find(s=>s.querySelector('#territoiresContainer'));
    if(territory){
      const details=document.createElement('details');details.className='sx-disclosure';
      const summary=document.createElement('summary');summary.textContent='Territoires et publications · Détails';
      details.append(summary);territory.parentNode.insertBefore(details,territory);details.append(territory);
    }
    const delegation=document.getElementById('gestionAccesDashboard');
    if(delegation){
      const details=document.createElement('details');details.className='sx-disclosure';
      const summary=document.createElement('summary');summary.textContent='Délégation des accès';
      details.append(summary);delegation.parentNode.insertBefore(details,delegation);details.append(delegation);
      // L'état hidden sur la section est piloté par les permissions : ne jamais le contourner.
      const sync=()=>{details.hidden=delegation.hidden;};sync();
      new MutationObserver(sync).observe(delegation,{attributes:true,attributeFilter:['hidden']});
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
