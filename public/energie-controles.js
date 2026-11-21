'use strict';
/** E-METER-1C2 — Affichage texte seul, aucune mutation ni résultat certifié. */
(async()=>{
 const $=id=>document.getElementById(id);
 const tenant=new URLSearchParams(location.search).get('tenant');
 const api='/api/energy/qualite/v1';
 let sites=[],index=0,offset=0,suivant=false,sequence=0;
 const txt=(id,v)=>{$(id).textContent=String(v);};
 const option=(value,title)=>{const e=document.createElement('option');e.value=value;e.textContent=title;return e;};
 const cell=(tr,v)=>{const td=document.createElement('td');td.textContent=String(v??'—');tr.append(td);return td;};
 function url(path,extra={}){return api+path+'?'+new URLSearchParams({tenant,...extra}).toString();}
 async function get(p){const r=await fetch(p,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.statut||'HTTP_'+r.status);return d;}
 function clear(){const b=$('resultats');b.replaceChildren();const tr=document.createElement('tr');const td=cell(tr,'Chargement…');td.colSpan=5;b.append(tr);
  $('precedent').disabled=true;$('suivant').disabled=true;}
 function render(data){const b=$('resultats');b.replaceChildren();
  for(const item of data.items||[]){const tr=document.createElement('tr');cell(tr,item.date);
   const reading=data.source==='RELEVES';
   cell(tr,reading?item.point+' · '+item.compteur+' · '+item.registre:item.nature+' · '+item.energie);
   cell(tr,reading?item.valeur+' '+item.unite:item.montant+' '+item.devise+' · '+(item.reference||'sans référence'));
   const td=cell(tr,'');if(!item.signaux.length){td.textContent='Aucun signal détecté — non vérifié';td.className='qualite-vide';}
   for(const s of item.signaux){const strong=document.createElement('strong');strong.textContent=s.code+' · '+(s.niveau==='A_VERIFIER'?'À vérifier':'Information');
    strong.className='qualite-code '+(s.niveau==='A_VERIFIER'?'qualite-alerte':'qualite-info');
    const detail=document.createElement('span');detail.className='qualite-detail';detail.textContent=s.explication;td.append(strong,detail);}
   const act=cell(tr,'');if(!reading){const a=document.createElement('a');a.href='/energie-rectifications.html?tenant='+encodeURIComponent(tenant);
    a.textContent='Voir les versions';act.append(a);}else act.textContent='À examiner dans les relevés';b.append(tr);
  }
  if(!data.items?.length){const tr=document.createElement('tr');const td=cell(tr,'Aucune donnée déclarée pour cette page.');td.colSpan=5;b.append(tr);}
  $('precedent').disabled=offset===0;suivant=Boolean(data.suivant);$('suivant').disabled=!suivant;
  txt('page','Page '+(Math.floor(offset/50)+1));
  txt('information','Page de '+(data.items?.length||0)+' éléments · déclarations non certifiées ·'+
   (suivant?' pagination suivante disponible.':' aucune page suivante signalée.')+' Aucun total exhaustif déduit.');
 }
 async function load(){const s=sites[index],current=++sequence;clear();if(!s)return;
  txt('etat','Lecture des données déclarées…');
  try{const data=await get(url('/sites/'+encodeURIComponent(s.id)+'/signaux',{source:$('source').value,offset:String(offset)}));
   if(current!==sequence)return;render(data);txt('etat','Contrôles consultés · signaux indicatifs seulement.');}
  catch(e){if(current!==sequence)return;txt('etat','Lecture refusée : '+e.message);const tr=document.createElement('tr');const td=cell(tr,'Impossible de charger le contrôle.');td.colSpan=5;$('resultats').replaceChildren(tr);}}
 async function init(){try{
  if(!tenant||!/^[A-Z][A-Z0-9_-]{0,49}$/.test(tenant))throw Error('TENANT_INVALIDE');
  $('retour').href='/energie-rectifications.html?tenant='+encodeURIComponent(tenant);
  if(!window.SATEER_CONTEXT_READY)throw Error('SESSION_CORE_INDISPONIBLE');
  const ctx=await window.SATEER_CONTEXT_READY;
  if(!ctx.organisations?.some(o=>o.tenant_code===tenant))throw Error('TENANT_NON_AUTORISE');
  const list=await get(url('/sites'));sites=list.sites||[];const select=$('site');select.replaceChildren();
  if(!sites.length){select.append(option('','Aucun site autorisé'));txt('etat','Aucun site autorisé.');return;}
  for(let i=0;i<sites.length;i++)select.append(option(String(i),sites[i].nom));
  select.disabled=false;await load();if(list.suivant)txt('etat','Liste de sites partielle : 50 premiers sites seulement.');
 }catch(e){txt('etat','Accès indisponible : '+e.message);}}
 $('site').addEventListener('change',()=>{index=Number($('site').value)||0;offset=0;load();});
 $('source').addEventListener('change',()=>{offset=0;load();});
 $('actualiser').addEventListener('click',load);
 $('precedent').addEventListener('click',()=>{offset=Math.max(0,offset-50);load();});
 $('suivant').addEventListener('click',()=>{if(suivant){offset+=50;load();}});
 await init();
})();
