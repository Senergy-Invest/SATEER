'use strict';
/* C4C : projection passive du registre. Aucune mise à jour métier depuis cet écran. */
(async () => {
 const byId=id=>document.getElementById(id);
 const query=new URLSearchParams(location.search),tenant=query.get('tenant');
 const base='/api/energy/pilotage/v1';
 const labels=[['unites','Espaces dans le périmètre'],['responsabilites','Affectations actives'],
  ['enRevue','Propositions en revue'],['aCorriger','Propositions à corriger'],
  ['integrees','Propositions intégrées'],['equipementsLocalises','Équipements localisés'],
  ['appareillages','Appareillages déclarés'],['compteurs','Compteurs déclarés'],
  ['relationsDeclarees','Relations déclarées vers des espaces'],['esquisses','Positions physiques enregistrées']];
 let sites=[],selected=0,offset=0,suivant=false;
 const setState=(message,isError=false)=>{const el=byId('etat');el.textContent=message;el.classList.toggle('error',isError);};
 const url=(path,extra={})=>{const params=new URLSearchParams({tenant,...extra});return `${base}${path}?${params}`;};
 const get=async(path,extra={})=>{
  const res=await fetch(url(path,extra),{credentials:'same-origin',headers:{Accept:'application/json'}});
  const json=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(json.statut||`HTTP_${res.status}`);
  return json;
 };
 const option=(label,value)=>{const e=document.createElement('option');e.value=String(value);e.textContent=label;return e;};
 const cell=(tr,value)=>{const e=document.createElement('td');e.textContent=String(value);tr.append(e);};
 function afficher(tableau){
  const metrics=byId('indicateurs');metrics.replaceChildren();
  if(!tableau.indicateurs){const p=document.createElement('p');p.textContent='Structure C1 non initialisée : aucun bilan fiable à afficher.';metrics.append(p);}
  else for(const [key,label] of labels){
   const d=document.createElement('div');d.className='metric';const n=document.createElement('b');n.textContent=String(tableau.indicateurs[key]);
   const title=document.createElement('span');title.textContent=label;d.append(n,title);metrics.append(d);
  }
  let limits='Aucune mesure électrique ni économie calculée. Les relations C4A restent à vérifier.';
  if(tableau.equipementsSansLocalisation!==null && tableau.equipementsSansLocalisation!==undefined)
   limits+=` ${tableau.equipementsSansLocalisation} équipement(s) du site sans localisation C2 connue.`;
  else limits+=' Le nombre d’équipements non localisés n’est pas communiqué hors vue propriétaire intégrale.';
  byId('limites').textContent=limits;
  byId('perimetre').textContent=`Accès : ${tableau.acces.role} · Périmètre : ${tableau.acces.perimetre} · ${tableau.acces.complet?'Site intégral':'Vue restreinte au périmètre'}.`;
  const tbody=byId('unites');tbody.replaceChildren();
  if(!tableau.unites.length){const tr=document.createElement('tr');const td=document.createElement('td');td.colSpan=6;td.textContent='Aucune unité dans cette page.';tr.append(td);tbody.append(tr);}
  else for(const u of tableau.unites){const tr=document.createElement('tr');
   cell(tr,`${u.nom} · ${u.type}`);cell(tr,u.responsables);cell(tr,u.enRevue);cell(tr,u.aCorriger);cell(tr,u.equipements);cell(tr,u.esquisses);tbody.append(tr);
  }
  suivant=Boolean(tableau.suivant);
  byId('precedent').disabled=offset===0;byId('suivant').disabled=!suivant;
  byId('pageLabel').textContent=`Page ${Math.floor(offset/50)+1}`;
 }
 async function charger(){
  const site=sites[selected];if(!site)return;
  setState('Chargement des indicateurs du périmètre…');
  try {const args={offset:String(offset)};if(site.grantId)args.grantId=site.grantId;
   const d=await get(`/sites/${encodeURIComponent(site.id)}/synthese`,args);
   afficher(d);setState('Lecture privée du registre effectuée · données non certifiées');
  }catch(e){setState('Tableau inaccessible : '+e.message,true);byId('indicateurs').replaceChildren();byId('unites').replaceChildren();byId('precedent').disabled=true;byId('suivant').disabled=true;}
 }
 async function init(){try{
  if(!tenant||!/^[A-Z][A-Z0-9_-]{0,49}$/.test(tenant))throw Error('TENANT_MANQUANT_OU_INVALIDE');
  byId('retour').href='/energie-esquisse.html?tenant='+encodeURIComponent(tenant);
  // Le client Core gère /api/auth/me, le contexte et la redirection avec returnTo.
  // Ne dupliquez pas son mécanisme de session dans l'expérience Energy.
  if(!window.SATEER_CONTEXT_READY)throw Error('CONTEXTE_CORE_INDISPONIBLE');
  const session=await window.SATEER_CONTEXT_READY;
  if(!session.organisations?.some(o=>o.tenant_code===tenant))throw Error('TENANT_NON_AUTORISE');
  const data=await get('/sites');sites=data.sites;
  const select=byId('site');select.replaceChildren();
  if(!sites.length){select.append(option('Aucun site ou périmètre autorisé',''));setState('Aucune affectation active pour cette session.',true);return;}
  sites.forEach((s,i)=>select.append(option(`${s.nom} — ${s.role}${s.perimetre?' · '+s.perimetre:''}`,i)));
  select.disabled=false;await charger();
  if(data.suivant)setState('Attention : liste des sites partielle (plus de 50 vues).',true);
 }catch(e){setState('Accès indisponible : '+e.message,true);}}
 byId('site').addEventListener('change',()=>{selected=Number(byId('site').value)||0;offset=0;charger();});
 byId('rafraichir').addEventListener('click',charger);
 byId('precedent').addEventListener('click',()=>{offset=Math.max(0,offset-50);charger();});
 byId('suivant').addEventListener('click',()=>{if(suivant){offset+=50;charger();}});
 await init();
})();
