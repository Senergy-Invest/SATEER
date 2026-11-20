'use strict';
/** C4C tranche 2 : aucune écriture HTTP, aucune identité privée, aucun score énergétique. */
(async()=>{
 const el=id=>document.getElementById(id);
 const tenant=new URLSearchParams(location.search).get('tenant');
 const api='/api/energy/pilotage/v1';
 let sites=[],selected=0,offset=0,suivant=false,sequence=0;
 const state=(s,err=false)=>{el('etat').textContent=s;el('etat').classList.toggle('error',err);};
 const opt=(text,value)=>{const o=document.createElement('option');o.textContent=text;o.value=String(value);return o;};
 const cell=(tr,text)=>{const td=document.createElement('td');td.textContent=String(text);tr.append(td);return td;};
 const clear=()=>{el('actions').replaceChildren();el('precedent').disabled=true;el('suivant').disabled=true;};
 const url=(path,params={})=>api+path+'?'+new URLSearchParams({tenant,...params}).toString();
 async function get(path,params={}){
  const r=await fetch(url(path,params),{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
  const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.statut||'HTTP_'+r.status);return data;
 }
 function render(data){clear();const body=el('actions');
  for(const item of data.actions){const tr=document.createElement('tr');
   cell(tr,item.nom+' · '+item.famille);cell(tr,item.unite.nom);
   const status=cell(tr,item.statut==='EN_REVUE'?'En revue':'À corriger');status.className='code-status '+(item.statut==='EN_REVUE'?'review':'correction');
   cell(tr,new Date(item.dateDerniereModification).toLocaleDateString('fr-FR'));
   const days=cell(tr,item.joursDepuisModification);days.className='age';
   cell(tr,item.pourMoi?'Pour moi':'Suivi du périmètre');body.append(tr);
  }
  if(!data.actions.length){const tr=document.createElement('tr');const td=cell(tr,'Aucune proposition correspondant au filtre dans cette page.');td.colSpan=6;td.className='actions-empty';body.append(tr);}
  suivant=Boolean(data.suivant);el('precedent').disabled=offset===0;el('suivant').disabled=!suivant;
  el('pageLabel').textContent='Page '+(Math.floor(offset/50)+1);
  el('perimetre').textContent='Accès : '+data.acces.role+' · Périmètre : '+data.acces.perimetre+(data.acces.complet?' · site intégral':' · périmètre limité');
 }
 async function load(){const current=++sequence,site=sites[selected];clear();if(!site)return;
  state('Chargement de la file de collecte du périmètre…');
  try{const args={offset:String(offset),statut:el('filtre').value};if(site.grantId)args.grantId=site.grantId;
   const data=await get('/sites/'+encodeURIComponent(site.id)+'/actions',args);
   if(current!==sequence)return;render(data);
   state(data.statutStructure==='STRUCTURE_C1_NON_INITIALISEE'?'Structure C1 non initialisée.':'File privée chargée · données déclarées non certifiées');
  }catch(e){if(current!==sequence)return;state('File indisponible : '+e.message,true);clear();el('perimetre').textContent='';}}
 async function init(){try{
  if(!tenant||!/^[A-Z][A-Z0-9_-]{0,49}$/.test(tenant))throw Error('TENANT_INVALIDE');
  const q='?tenant='+encodeURIComponent(tenant);el('retour').href='/energie-pilotage.html'+q;
  el('versCollecte').href='/energie-collecte.html'+q;
  if(!window.SATEER_CONTEXT_READY)throw Error('SESSION_CORE_INDISPONIBLE');
  const ctx=await window.SATEER_CONTEXT_READY;
  if(!ctx.organisations?.some(x=>x.tenant_code===tenant))throw Error('TENANT_NON_AUTORISE');
  const list=await get('/sites');sites=list.sites;
  const select=el('site');select.replaceChildren();
  if(!sites.length){select.append(opt('Aucun site ou périmètre accessible',''));state('Aucune responsabilité active.',true);return;}
  sites.forEach((s,i)=>select.append(opt(s.nom+' — '+s.role+(s.perimetre?' · '+s.perimetre:''),i)));
  select.disabled=false;await load();
  if(list.suivant)state('Liste des sites partielle (première page de 50).',true);
 }catch(e){state('Accès indisponible : '+e.message,true);clear();}}
 el('site').addEventListener('change',()=>{selected=Number(el('site').value)||0;offset=0;load();});
 el('filtre').addEventListener('change',()=>{offset=0;load();});
 el('rafraichir').addEventListener('click',load);
 el('precedent').addEventListener('click',()=>{offset=Math.max(0,offset-50);load();});
 el('suivant').addEventListener('click',()=>{if(suivant){offset+=50;load();}});
 await init();
})();
