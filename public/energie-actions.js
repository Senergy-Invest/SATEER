'use strict';
/** C4C tranche 2 : aucune écriture HTTP, aucune identité privée, aucun score énergétique. */
(async()=>{
 const el=id=>document.getElementById(id);
 const tenant=new URLSearchParams(location.search).get('tenant');
 const api='/api/energy/pilotage/v1';
 const nav=window.SATEER_C4C3_NAV;
 if(!nav)throw Error('NAVIGATION_C4C3_INDISPONIBLE');
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
  el('suiviBox').hidden=!data.acces.complet;
  if(!data.acces.complet)el('suivi').value='TOUS';
  for(const item of data.actions){const tr=document.createElement('tr');
   cell(tr,item.nom+' · '+item.famille);cell(tr,item.unite.nom);
   const status=cell(tr,item.statut==='EN_REVUE'?'En revue':'À corriger');status.className='code-status '+(item.statut==='EN_REVUE'?'review':'correction');
   cell(tr,new Date(item.dateDerniereModification).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'}));
   const days=cell(tr,item.joursDepuisModification===0?'Moins de 24 h':item.joursDepuisModification+' j (24 h)');days.className='age';
   const revue=cell(tr,item.suiviRelecture==='SANS_RELECTEUR_ACTIF'?'Sans relecteur actif':item.suiviRelecture==='RELECTEUR_ACTIF'?'Relecteur actif':'Retour à l’auteur');
   if(item.suiviRelecture==='SANS_RELECTEUR_ACTIF')revue.className='relecture-attention';
   cell(tr,item.pourMoi?'Pour moi':'Suivi du périmètre');
   const access=cell(tr,'');
   const context=sites[selected]||null, statut=el('filtre').value, suivi=el('suivi').value;
   const dest=item.suiviRelecture==='SANS_RELECTEUR_ACTIF'&&data.acces.complet
    ?nav.vers('/energie-responsabilites.html',tenant,context,statut,suivi,offset)
    :item.pourMoi?nav.vers('/energie-collecte.html',tenant,context,statut,suivi,offset,
       item.statut==='EN_REVUE'?'#fileRevue':'#mesPropositions'):null;
   if(dest){const a=document.createElement('a');a.href=dest;a.textContent=item.suiviRelecture==='SANS_RELECTEUR_ACTIF'?'Organiser C1':'Ouvrir C2';access.append(a);}else access.textContent='—';
   body.append(tr);
  }
  if(!data.actions.length){const tr=document.createElement('tr');const td=cell(tr,'Aucune proposition correspondant au filtre dans cette page.');td.colSpan=8;td.className='actions-empty';body.append(tr);}
  el('versCollecte').href=nav.vers('/energie-collecte.html',tenant,sites[selected],el('filtre').value,el('suivi').value,offset);
  suivant=Boolean(data.suivant);el('precedent').disabled=offset===0;el('suivant').disabled=!suivant;
  el('pageLabel').textContent='Page '+(Math.floor(offset/50)+1);
  el('perimetre').textContent='Accès : '+data.acces.role+' · Périmètre : '+data.acces.perimetre+(data.acces.complet?' · site intégral':' · périmètre limité');
 }
 async function load(){const current=++sequence,site=sites[selected];clear();if(!site)return;
  state('Chargement de la file de collecte du périmètre…');
  try{const args={offset:String(offset),statut:el('filtre').value};if(site.grantId)args.grantId=site.grantId;
   if(!site.grantId&&el('suivi').value!=='TOUS')args.suivi=el('suivi').value;
   const data=await get('/sites/'+encodeURIComponent(site.id)+'/actions',args);
   if(current!==sequence)return;render(data);
   state(data.statutStructure==='STRUCTURE_C1_NON_INITIALISEE'?'Structure C1 non initialisée.':'File privée chargée · données déclarées non certifiées');
  }catch(e){if(current!==sequence)return;state('File indisponible : '+e.message,true);clear();el('perimetre').textContent='';}}
 async function init(){try{
  if(!tenant||!/^[A-Z][A-Z0-9_-]{0,49}$/.test(tenant))throw Error('TENANT_INVALIDE');
  const q='?tenant='+encodeURIComponent(tenant);el('retour').href='/energie-pilotage.html'+q;
  el('versCollecte').href=nav.vers('/energie-collecte.html',tenant,null,'TOUTES','TOUS',0);
  if(!window.SATEER_CONTEXT_READY)throw Error('SESSION_CORE_INDISPONIBLE');
  const ctx=await window.SATEER_CONTEXT_READY;
  if(!ctx.organisations?.some(x=>x.tenant_code===tenant))throw Error('TENANT_NON_AUTORISE');
  const list=await get('/sites');sites=list.sites;
  const select=el('site');select.replaceChildren();
  if(!sites.length){select.append(opt('Aucun site ou périmètre accessible',''));state('Aucune responsabilité active.',true);return;}
  sites.forEach((s,i)=>select.append(opt(s.nom+' — '+s.role+(s.perimetre?' · '+s.perimetre:''),i)));
  // Restaurer le contexte sans faire confiance à l'URL : la liste vient de l'API protégée.
  const initial=nav.lireEtat(location.search,tenant);
  if(initial?.site){const i=sites.findIndex(s=>s.id===initial.site&&(s.grantId||null)===(initial.grantId||null));
   if(i>=0){selected=i;select.value=String(i);el('filtre').value=initial.statut;
    el('suivi').value=sites[i].grantId?'TOUS':initial.suivi;offset=initial.offset;}}
  select.disabled=false;await load();
  if(list.suivant)state('Liste des sites partielle (première page de 50).',true);
 }catch(e){state('Accès indisponible : '+e.message,true);clear();}}
 el('site').addEventListener('change',()=>{selected=Number(el('site').value)||0;el('suivi').value='TOUS';el('suiviBox').hidden=true;offset=0;load();});
 el('filtre').addEventListener('change',()=>{offset=0;load();});
 el('suivi').addEventListener('change',()=>{offset=0;load();});
 el('rafraichir').addEventListener('click',load);
 el('precedent').addEventListener('click',()=>{offset=Math.max(0,offset-50);load();});
 el('suivant').addEventListener('click',()=>{if(suivant){offset+=50;load();}});
 await init();
})();
