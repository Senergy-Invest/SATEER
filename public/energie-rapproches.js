'use strict';
/** E-METER-1C3 : lecture seule et rendu textContent, sans valeur recalculée. */
(async()=>{
 const $=id=>document.getElementById(id),query=new URLSearchParams(location.search);
 const tenant=query.get('tenant'),UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 let sites=[],index=0,offset=0,suivant=false,sequence=0;
 const txt=(id,v)=>{$(id).textContent=String(v)};
 const td=(tr,v)=>{const c=document.createElement('td');c.textContent=String(v??'—');tr.append(c);return c};
 const option=(value,label)=>{const o=document.createElement('option');o.value=value;o.textContent=label;return o};
 const url=(path,extra={})=>'/api/energy/proximite/v1'+path+'?'+new URLSearchParams({tenant,...extra});
 async function get(u){const r=await fetch(u,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.statut||'HTTP_'+r.status);return d;}
 function clear(){const tr=document.createElement('tr');const c=td(tr,'Chargement…');c.colSpan=5;$('resultats').replaceChildren(tr);
  $('precedent').disabled=true;$('suivant').disabled=true;}
 function render(data){const tbody=$('resultats');tbody.replaceChildren();
  for(const x of data.items||[]){const tr=document.createElement('tr');td(tr,x.date);
   td(tr,x.point+' · '+x.compteur+' · '+x.registre);td(tr,x.valeur+' '+x.unite);
   td(tr,x.intervalleSecondes===null?'—':x.intervalleSecondes+' s');
   const c=td(tr,'');if(!x.signaux.length){c.textContent='Aucun signal détecté — non vérifié';c.className='proximite-vide';}
   for(const s of x.signaux){const b=document.createElement('strong');b.className='proximite-tag '+(s.niveau==='A_VERIFIER'?'proximite-alerte':'proximite-info');
    b.textContent=s.code+' · '+(s.niveau==='A_VERIFIER'?'À vérifier':'Information');
    const detail=document.createElement('span');detail.className='proximite-detail';detail.textContent=s.explication;c.append(b,detail);}
   tbody.append(tr);
  }
  if(!data.items?.length){const tr=document.createElement('tr'),c=td(tr,'Aucun relevé pour cette page.');c.colSpan=5;tbody.append(tr);}
  $('precedent').disabled=offset===0;suivant=Boolean(data.suivant);$('suivant').disabled=!suivant;
  txt('page','Page '+(Math.floor(offset/50)+1));
  txt('information','Page de '+(data.items?.length||0)+' relevés · seuil indicatif 60 secondes ·'
   +(suivant?' page suivante disponible.':' aucune page suivante signalée.')+' Aucun total exhaustif déduit.');
 }
 async function load(){const s=sites[index],serial=++sequence;clear();if(!s)return;txt('etat','Lecture privée en cours…');
  try{const result=await get(url('/sites/'+encodeURIComponent(s.id)+'/signaux',{offset:String(offset)}));
   if(serial!==sequence)return;render(result);txt('etat','Contrôles consultés · valeurs non certifiées.');}
  catch(e){if(serial!==sequence)return;txt('etat','Lecture indisponible : '+e.message);const tr=document.createElement('tr'),c=td(tr,'Lecture impossible.');c.colSpan=5;$('resultats').replaceChildren(tr);}}
 async function init(){try{
  if(!tenant||!/^[A-Z][A-Z0-9_-]{0,49}$/.test(tenant))throw Error('TENANT_INVALIDE');
  if(!window.SATEER_CONTEXT_READY)throw Error('SESSION_CORE_INDISPONIBLE');
  const ctx=await window.SATEER_CONTEXT_READY;
  if(!ctx.organisations?.some(x=>x.tenant_code===tenant))throw Error('TENANT_NON_AUTORISE');
  const list=await get(url('/sites'));sites=list.sites||[];const select=$('site');select.replaceChildren();
  if(!sites.length){select.append(option('','Aucun site autorisé'));txt('etat','Aucun site autorisé.');return;}
  sites.forEach((s,i)=>select.append(option(String(i),s.nom)));const requested=query.get('site');
  if(requested&&UUID.test(requested)){const pos=sites.findIndex(s=>s.id===requested);if(pos>=0){index=pos;select.value=String(pos);}}
  const back=new URLSearchParams({tenant,source:'RELEVES',site:sites[index].id});
  $('retour').href='/energie-controles.html?'+back;
  select.disabled=false;await load();
 }catch(e){txt('etat','Accès indisponible : '+e.message);}}
 $('site').addEventListener('change',()=>{index=Number($('site').value)||0;offset=0;
  $('retour').href='/energie-controles.html?'+new URLSearchParams({tenant,source:'RELEVES',site:sites[index]?.id||''});load();});
 $('actualiser').addEventListener('click',load);
 $('precedent').addEventListener('click',()=>{offset=Math.max(0,offset-50);load();});
 $('suivant').addEventListener('click',()=>{if(suivant){offset+=50;load();}});
 await init();
})();
