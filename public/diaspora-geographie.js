"use strict";
(async function(){
  const $=id=>document.getElementById(id),params=new URLSearchParams(location.search),tenant=params.get('tenant');
  const status=$('geoStatus'),results=$('geoResults'),prefs=$('geoPrefs'),orgSelector=$('geoOrga');
  const TENANT=/^[A-Z][A-Z0-9_-]{0,49}$/;
  if(!tenant||!TENANT.test(tenant)){status.textContent='Tenant invalide : ouvrez cette page depuis Diaspora.';return;}
  $('geoBack').href='/diaspora.html?'+new URLSearchParams({tenant});
  const query='?'+new URLSearchParams({tenant});
  const el=(tag,text)=>{const node=document.createElement(tag);if(text!=null)node.textContent=String(text);return node;};
  async function call(endpoint,options={}){
    const r=await fetch(endpoint,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json','Content-Type':'application/json'},...options});
    const v=await r.json().catch(()=>({}));if(!r.ok)throw Error(v.statut||'HTTP '+r.status);return v;
  }
  let selectedArea=null;
  let organisations=[];
  async function loadPrefs(){
    const d=await call('/api/diaspora/geo-preferences'+query);
    prefs.replaceChildren();
    if(!d.preferences.length)prefs.append(el('p','Aucune zone sélectionnée pour le moment.'));
    for(const p of d.preferences){
      const card=el('div');card.className='g-item';
      card.append(el('strong',p.nom+' · '+p.type+' · '+p.pays),el('p',p.actif?'Abonnement actif':'Désabonné'));
      const buttons=el('div');buttons.className='g-actions';
      const button=el('button',p.actif?'Ne plus suivre':'Suivre à nouveau');button.type='button';
      button.addEventListener('click',async()=>{button.disabled=true;
        try{await call('/api/diaspora/geo-preferences/'+p.id+query,{method:'PUT',body:JSON.stringify({actif:!p.actif})});await loadPrefs();status.textContent='Préférence de zone mise à jour.';}
        catch(e){status.textContent='Modification refusée : '+e.message;button.disabled=false;}});
      buttons.append(button);card.append(buttons);prefs.append(card);
    }
  }
  async function listSource(){
    const id=orgSelector.value,container=$('geoPublications');container.replaceChildren();
    if(!id){$('geoProStatus').textContent='Choisir une organisation.';return;}
    try{
      const d=await call('/api/organisations/'+encodeURIComponent(id)+'/diaspora/source-publications'+query);
      $('geoProStatus').textContent='Source autorisée. Choisis une zone dans la recherche avant de l’affecter à une publication.';
      for(const p of d.publications){
        const card=el('div');card.className='g-item';
        card.append(el('strong',p.titre),el('p','État : '+p.etatDiffusion+' · Zone : '+(p.geoTerritoryName||'Aucune zone ciblée')));
        if(p.etatDiffusion==='NON_DEMANDEE'&&p.audienceType==='TOUS'&&p.mediaCount===0){
          const actions=el('div');actions.className='g-actions';
          for(const [label,territory] of [['Utiliser la zone choisie',false],['Retirer le ciblage',true]]){
            const btn=el('button',label);btn.type='button';
            if(territory)btn.className='secondary';
            btn.addEventListener('click',async()=>{
              if(!territory&&!selectedArea){status.textContent='Sélectionne d’abord une zone dans la recherche.';return;}
              btn.disabled=true;
              try{await call('/api/organisations/'+encodeURIComponent(id)+'/diaspora/geo-target/'+p.id+query,
                {method:'PUT',body:JSON.stringify({territoryId:territory?null:selectedArea.id})});
                status.textContent='Ciblage enregistré avant soumission.';await listSource();}
              catch(e){status.textContent='Ciblage refusé : '+e.message;btn.disabled=false;}});
            actions.append(btn);
          }
          card.append(actions);
        }
        container.append(card);
      }
    }catch(e){$('geoProStatus').textContent='Accès professionnel indisponible : '+e.message;}
  }
  async function search(){
    const q=$('geoSearch').value.trim();const u='/api/diaspora/geo-options?'+new URLSearchParams({tenant,q});
    status.textContent='Recherche des territoires…';results.replaceChildren();
    try{
      const data=await call(u);
      status.textContent=data.territoires.length+' territoire(s) trouvé(s).';
      for(const area of data.territoires){
        const card=el('div');card.className='g-item';card.append(el('strong',area.nom+' · '+area.type+' · '+area.pays));
        const acts=el('div');acts.className='g-actions';
        const choose=el('button','Choisir pour un ciblage professionnel');choose.type='button';
        choose.addEventListener('click',()=>{selectedArea=area;status.textContent='Zone sélectionnée : '+area.nom+'. Utilise-la dans une publication ci-dessous.';});
        const follow=el('button','Suivre cette zone');follow.type='button';
        follow.addEventListener('click',async()=>{follow.disabled=true;
          try{await call('/api/diaspora/geo-preferences/'+area.id+query,{method:'PUT',body:JSON.stringify({actif:true})});
            status.textContent='Tu suis maintenant '+area.nom+'.';await loadPrefs();}
          catch(e){status.textContent='Abonnement refusé : '+e.message;follow.disabled=false;}});
        acts.append(follow,choose);card.append(acts);results.append(card);
      }
    }catch(e){status.textContent='Recherche indisponible : '+e.message;}
  }
  $('geoFind').addEventListener('click',search);
  $('geoSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();search();}});
  try{
    const c=await window.SATEER_CONTEXT_READY;
    organisations=(Array.isArray(c?.organisations)?c.organisations:[]).filter(o=>o.tenant_code===tenant);
    if(!organisations.length){status.textContent='Aucun rattachement autorisé à ce tenant.';return;}
    await loadPrefs();
    $('geoProSection').hidden=false;
    for(const org of organisations){const opt=el('option',org.nom+' · '+org.type);opt.value=String(org.id);orgSelector.append(opt);}
    orgSelector.addEventListener('change',listSource);
    $('geoSearch').value='Bordeaux';await search();
  }catch(e){status.textContent='Session ou préférences indisponibles : '+e.message;}
})();
