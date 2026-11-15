"use strict";
/** UX1 : preferences geographiques strictement citoyennes.
 * Les choix d'audience professionnelle sont dans diaspora-zones-professionnelles.
 */
(async function(){
  const $=id=>document.getElementById(id);
  const tenant=new URLSearchParams(location.search).get('tenant');
  const status=$('geoStatus'),results=$('geoResults'),prefs=$('geoPrefs');
  if(!status||!results||!prefs||!tenant||!/^[A-Z][A-Z0-9_-]{0,49}$/.test(tenant)){
    if(status)status.textContent='Contexte Diaspora invalide.';return;
  }
  $('geoBack').href='/diaspora.html?'+new URLSearchParams({tenant});
  const query='?'+new URLSearchParams({tenant});
  const el=(tag,value)=>{const element=document.createElement(tag);if(value!=null)element.textContent=String(value);return element;};
  async function api(endpoint,options={}){
    const res=await fetch(endpoint,{credentials:'same-origin',cache:'no-store',
      headers:{Accept:'application/json','Content-Type':'application/json'},...options});
    const body=await res.json().catch(()=>({}));
    if(!res.ok)throw Error(body.statut||'HTTP '+res.status);
    return body;
  }
  let activeAreas=new Set();
  async function loadPrefs(){
    const body=await api('/api/diaspora/geo-preferences'+query);
    const preferences=Array.isArray(body.preferences)?body.preferences:[];
    activeAreas=new Set(preferences.filter(p=>p.actif===true).map(p=>Number(p.id)));
    prefs.replaceChildren();
    if(!preferences.length)prefs.append(el('p','Aucune zone choisie pour le moment.'));
    for(const pref of preferences){
      const card=el('div');card.className='g-item';
      card.append(el('strong',pref.nom+' · '+pref.type+' · '+pref.pays),
        el('p',pref.actif?'Abonnement actif':'Abonnement inactif'));
      const acts=el('div');acts.className='g-actions';
      const button=el('button',pref.actif?'Ne plus suivre':'Suivre à nouveau');button.type='button';
      button.addEventListener('click',async()=>{
        button.disabled=true;
        try{
          await api('/api/diaspora/geo-preferences/'+encodeURIComponent(pref.id)+query,
            {method:'PUT',body:JSON.stringify({actif:!pref.actif})});
          await loadPrefs();await search();
          status.textContent=pref.actif?'Zone retirée : aucune nouvelle alerte pour '+pref.nom+'.':
            'Zone suivie : '+pref.nom+'.';
        }catch(err){status.textContent='Modification refusée : '+err.message;button.disabled=false;}
      });
      acts.append(button);card.append(acts);prefs.append(card);
    }
  }
  async function search(){
    const q=$('geoSearch').value.trim();results.replaceChildren();
    if(!q){status.textContent='Saisis une ville, un département ou une région.';return;}
    status.textContent='Recherche en cours…';
    try{
      const body=await api('/api/diaspora/geo-options?'+new URLSearchParams({tenant,q}));
      const areas=Array.isArray(body.territoires)?body.territoires:[];
      status.textContent=areas.length+' territoire(s) trouvé(s).';
      for(const area of areas){
        const card=el('div');card.className='g-item';
        card.append(el('strong',area.nom+' · '+area.type+' · '+area.pays));
        const actions=el('div');actions.className='g-actions';
        const followed=activeAreas.has(Number(area.id));
        const btn=el('button',followed?'Déjà suivi':'Suivre cette zone');
        btn.type='button';btn.disabled=followed;
        btn.addEventListener('click',async()=>{
          btn.disabled=true;
          try{
            await api('/api/diaspora/geo-preferences/'+encodeURIComponent(area.id)+query,
              {method:'PUT',body:JSON.stringify({actif:true})});
            await loadPrefs();await search();status.textContent='Tu suis maintenant '+area.nom+'.';
          }catch(e){status.textContent='Abonnement refusé : '+e.message;btn.disabled=false;}
        });
        actions.append(btn);card.append(actions);results.append(card);
      }
    }catch(e){status.textContent='Recherche indisponible : '+e.message;}
  }
  $('geoFind').addEventListener('click',search);
  $('geoSearch').addEventListener('keydown',event=>{
    if(event.key==='Enter'){event.preventDefault();search();}
  });
  try{
    const context=await window.SATEER_CONTEXT_READY;
    if(!Array.isArray(context?.organisations)||!context.organisations.some(o=>o.tenant_code===tenant)){
      status.textContent='Accès à cette expérience non autorisé.';return;
    }
    await loadPrefs();status.textContent='Saisis un territoire pour le suivre ou le retirer.';
  }catch(e){status.textContent='Préférences indisponibles : '+e.message;}
})();
