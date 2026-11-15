"use strict";
/** UX1 : ciblage d'une publication par une organisation habilitee. Aucune preference citoyenne modifiee. */
(async function(){
  const $=id=>document.getElementById(id),params=new URLSearchParams(location.search),tenant=params.get('tenant');
  const orgSelector=$('proOrga'),status=$('proStatus'),context=$('proContext'),results=$('proResults'),pubs=$('proPublications');
  if(!tenant||!/^[A-Z][A-Z0-9_-]{0,49}$/.test(tenant)){
    context.textContent='Tenant invalide : ouvrez cette page depuis la diffusion Diaspora.';return;
  }
  const q='?'+new URLSearchParams({tenant}),origin='/diaspora-communication.html';
  const node=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=String(text);return n;};
  async function api(url,options={}){
    const r=await fetch(url,{credentials:'same-origin',cache:'no-store',
      headers:{Accept:'application/json','Content-Type':'application/json'},...options});
    const result=await r.json().catch(()=>({}));if(!r.ok)throw Error(result.statut||'HTTP '+r.status);
    return result;
  }
  let selectedArea=null,organisations=[];
  function back(){const paramsBack=new URLSearchParams({tenant});if(orgSelector.value)paramsBack.set('organisation',orgSelector.value);
    $('proBack').href=origin+'?'+paramsBack;}
  async function list(){
    pubs.replaceChildren();back();
    const org=organisations.find(o=>String(o.id)===orgSelector.value);
    if(!org){context.textContent='Sélectionne ton organisation émettrice.';return;}
    try{
      const response=await api('/api/organisations/'+encodeURIComponent(org.id)+'/diaspora/source-publications'+q);
      context.textContent='Source autorisée : '+org.nom+'.';
      const items=Array.isArray(response.publications)?response.publications:[];
      if(!items.length)pubs.append(node('p','Aucune publication de cette organisation.'));
      for(const p of items){
        const card=node('article');card.className='g-item';
        card.append(node('strong',p.titre),node('p','État : '+p.etatDiffusion+' · Zone : '+(p.geoTerritoryName||'Aucune zone ciblée')));
        const eligible=p.etatDiffusion==='NON_DEMANDEE'&&p.audienceType==='TOUS'&&p.mediaCount===0;
        if(!eligible){card.append(node('p','Ciblage figé : publication déjà soumise, traitée ou non éligible.'));pubs.append(card);continue;}
        const actions=node('div');actions.className='g-actions';
        for(const [label,remove] of [['Affecter la zone sélectionnée',false],['Retirer le ciblage',true]]){
          const same=!remove&&selectedArea&&Number(p.geoTerritoryId)===Number(selectedArea.id);
          const display=remove?label:(same?'Déjà affectée : '+selectedArea.nom:(selectedArea?'Affecter '+selectedArea.nom:label));
          const button=node('button',display);button.type='button';if(remove)button.className='secondary';
          if(same)button.disabled=true;
          button.addEventListener('click',async()=>{
            if(!remove&&!selectedArea){status.textContent='Choisir d’abord une zone dans la recherche.';return;}
            button.disabled=true;
            try{
              await api('/api/organisations/'+encodeURIComponent(org.id)+'/diaspora/geo-target/'+encodeURIComponent(p.id)+q,
                {method:'PUT',body:JSON.stringify({territoryId:remove?null:selectedArea.id})});
              await list();status.textContent=remove?'Ciblage retiré.':'Zone affectée : '+selectedArea.nom+'.';
            }catch(e){status.textContent='Modification refusée : '+e.message;button.disabled=false;}
          });
          actions.append(button);
        }
        card.append(actions);pubs.append(card);
      }
    }catch(e){context.textContent='Accès source refusé ou indisponible : '+e.message;}
  }
  async function search(){
    const term=$('proSearch').value.trim();results.replaceChildren();
    if(!term){status.textContent='Saisis une ville ou une région.';return;}
    status.textContent='Recherche en cours…';
    try{
      const data=await api('/api/diaspora/geo-options?'+new URLSearchParams({tenant,q:term}));
      const areas=Array.isArray(data.territoires)?data.territoires:[];
      status.textContent=areas.length+' territoire(s) trouvé(s).';
      for(const area of areas){
        const card=node('div');card.className='g-item';card.append(node('strong',area.nom+' · '+area.type+' · '+area.pays));
        const actions=node('div');actions.className='g-actions';
        const button=node('button','Choisir cette zone pour une publication');button.type='button';
        button.addEventListener('click',async()=>{selectedArea=area;await list();status.textContent='Zone sélectionnée : '+area.nom+'. Une zone déjà affectée apparaît en lecture seule.';});
        actions.append(button);card.append(actions);results.append(card);
      }
    }catch(e){status.textContent='Recherche indisponible : '+e.message;}
  }
  $('proFind').addEventListener('click',search);
  $('proSearch').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();search();}});
  orgSelector.addEventListener('change',list);
  try{
    const c=await window.SATEER_CONTEXT_READY;
    organisations=(Array.isArray(c?.organisations)?c.organisations:[]).filter(o=>o.tenant_code===tenant&&Number.isSafeInteger(Number(o.id))&&Number(o.id)>0);
    if(!organisations.length){context.textContent='Aucune organisation liée à ce tenant.';back();return;}
    for(const org of organisations){const option=node('option',org.nom+' · '+org.type);option.value=String(org.id);orgSelector.append(option);}
    const suggested=params.get('organisation');
    if(organisations.some(o=>String(o.id)===suggested))orgSelector.value=suggested;
    else if(organisations.length===1)orgSelector.value=String(organisations[0].id);
    back();await list();
  }catch(e){context.textContent='Contexte professionnel indisponible : '+e.message;}
})();
