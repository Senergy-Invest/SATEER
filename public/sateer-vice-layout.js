/* SATEER P3.3.5N — Vue synthétique du Vice-Consul.
   Le registre complet est une page distincte, les données sont protégées par le serveur. */
(function(){
 'use strict';
 if(typeof document==='undefined')return;
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n;};
 const id=name=>document.getElementById(name);
 const put=(parent,tag,cls,text)=>{const n=el(tag,cls,text);parent.appendChild(n);return n;};
 const clear=node=>node.replaceChildren();
 const format=value=>new Intl.NumberFormat('fr-FR').format(Number(value)||0);
 let registry='/registre-demandes-vice-consul.html';
 function linkFor(query={}){const url=new URL(registry,location.origin);for(const [k,v] of Object.entries(query)){if(v!==null&&v!==undefined&&v!=='')url.searchParams.set(k,v);}return url.pathname+url.search;}
 function elapsed(value){const d=new Date(value);if(!value||!Number.isFinite(d.getTime()))return 'Date de réception indisponible';const hours=Math.max(0,Math.floor((Date.now()-d.getTime())/3600000));const days=Math.floor(hours/24);return days>0?`${days} j ${hours%24} h depuis réception`:`${hours} h depuis réception`;}
 function headline(root){
  const hero=root.querySelector('.sx-p2-hero');const title=hero?.querySelector('h1');if(title)title.textContent='Pilotage du Consulat';
  const activity=id('sx-p2-activity');const h=activity?.querySelector('h2');if(h)h.textContent='Vue d’ensemble';
  if(activity){const kpis=activity.querySelectorAll('.sx-p2-metric');
   const definitions=[['Dossiers reçus sans prise en charge','NOUVELLE'],['Dossiers en traitement','EN_COURS'],['Dossiers clôturés','TRAITEE'],['Consulter les priorités','']];
   kpis.forEach((card,i)=>{if(i>3)return;const button=put(card,'button','sx-m3-metric-action');button.type='button';button.setAttribute('aria-label',definitions[i][0]);button.addEventListener('click',()=>i===3?id('sx-n-priorities')?.scrollIntoView({behavior:'smooth',block:'start'}):location.assign(linkFor({statut:definitions[i][1]})));});
   const subtitle=kpis[0]?.querySelector('small');if(subtitle)subtitle.textContent='Orientés ou à orienter, non pris en charge';
  }
  const demands=id('sx-p2-demands-action');if(demands){demands.textContent='Registre des demandes';demands.href=linkFor();}
 }
 function relocate(root){
  const metrics=id('sx-p2-activity'),oldLists=id('sx-p2-case-lists'),categories=id('sx-p2-categories'),
    comms=id('sx-p2-communication'),teams=id('sx-p2-teams-section'),network=id('sx-p2-association-section'),admin=id('sx-p2-admin');
  if(!metrics||!oldLists||!categories||!comms||!teams||!network||!admin)return false;
  // Maintenir les anciennes ancres dans le DOM pour compatibilité avec les scripts
  // existants, mais ne plus présenter des tableaux vides ou redondants au Vice-Consul.
  const others=el('div','sx-n-legacy-analytics');others.id='sx-m3-analytics';
  others.hidden=true;others.setAttribute('aria-hidden','true');
  const cards=put(others,'div','sx-m3-analytics-grid');
  [categories,teams,comms,network].forEach(x=>cards.appendChild(x));
  root.insertBefore(others,admin);
  for(const container of [...root.querySelectorAll(':scope > .sx-p2-columns')]){
   if(container!==oldLists&&!container.children.length)container.remove();
  }
  const old=el('div','sx-n-old-lists');old.hidden=true;old.setAttribute('aria-hidden','true');old.appendChild(oldLists);
  const register=el('section','sx-p2-block sx-n-registry-cta');
  const h=put(register,'div');put(h,'h2',null,'Registre des dossiers');
  put(h,'p','Recherche par numéro ou citoyen, filtres par démarche et bureau, 20 résultats par page. Détail et historique en lecture seule.');
  const a=put(register,'a','sx-n-primary','Ouvrir le registre des demandes');a.id='sx-n-open-registry';a.href=linkFor();
  const queue=el('section','sx-p2-block sx-n-queue');queue.id='sx-n-queue';
  put(queue,'h2',null,'Prise en charge et charge des bureaux');
  const waiting=put(queue,'div','sx-n-waiting');waiting.id='sx-n-waiting';
  const bureau=put(queue,'div','sx-n-bureaux');bureau.id='sx-n-bureaux';
  const priority=el('section','sx-p2-block sx-n-priority');priority.id='sx-n-priorities';
  const prHead=put(priority,'div','sx-n-priority-header');
  put(prHead,'h2',null,'Situations à examiner');
  put(prHead,'p',null,'Urgences d’abord, puis dossiers ouverts les plus anciens.');
  const prList=put(priority,'div','sx-n-priority-list');prList.id='sx-n-priority-list';
  const status=put(priority,'p','sx-n-summary-status','Chargement de la synthèse…');status.id='sx-n-summary-status';status.setAttribute('role','status');
  root.insertBefore(priority,others);
  root.insertBefore(queue,priority);
  root.insertBefore(register,others);
  root.insertBefore(old,others);
  // Les accès complémentaires restent disponibles, sans disperser les données.
  const links=el('details','sx-n-quicklinks');
  put(links,'summary',null,'Services complémentaires');
  const shortcuts=put(links,'nav','sx-n-quicklinks-list');shortcuts.setAttribute('aria-label','Services complémentaires');
  const q=new URLSearchParams(location.search);const org=q.get('organisation')||'',tenant=q.get('tenant')||'';
  if(/^[1-9][0-9]{0,14}$/.test(org)&&/^[A-Z][A-Z0-9_-]{1,49}$/.test(tenant)){
    const suffix='?'+new URLSearchParams({organisation:org,tenant});
    for(const [label,href] of [
      ['Courriers et préqualification','/email-secretariat-demo.html'+suffix],
      ['Associations partenaires','/associations-partenaires.html'+suffix],
      ['Publier une information','/publication-institutionnelle.html'+suffix]]){
      const anchor=put(shortcuts,'a',null,label);anchor.href=href;
    }
  } else put(shortcuts,'p',null,'Sélectionnez une organisation autorisée depuis le pilotage.');
  root.insertBefore(links,others);
  root.insertBefore(metrics,queue);
  document.body.classList.add('sx-m3-ready','sx-n-ready');
  return true;
 }
 function renderSummary(data){
  const counts=data.comptes||{},wait=id('sx-n-waiting'),bureaux=id('sx-n-bureaux'),list=id('sx-n-priority-list');
  clear(wait);clear(bureaux);clear(list);
  for(const [value,label,help,query] of [
   [counts.aOrienter,'À orienter','Aucun bureau destinataire','A_ORIENTER'],
   [counts.attentePriseEnCharge,'En attente d’un agent','Bureau désigné, prise en charge non enregistrée','ATTENTE_AGENT']]){
   const a=put(wait,'a','sx-n-wait-card');a.href=linkFor({orientation:query});
   put(a,'strong',null,format(value));put(a,'span',null,label);put(a,'small',null,help);
  }
  const top=put(bureaux,'div','sx-n-subhead');put(top,'h3',null,'Charge actuelle par bureau');
  put(top,'span',null,'Dossiers ouverts uniquement');
  if(!(data.bureaux||[]).length)put(bureaux,'p','Aucun dossier ouvert.');
  for(const b of data.bureaux||[]){const a=put(bureaux,'a','sx-n-bureau');a.href=linkFor(b.unitId?{unitId:b.unitId}: {statut:'NOUVELLE'});
   put(a,'span',null,b.unitName||'Non orienté');put(a,'strong',null,`${format(b.aPrendre)} à prendre · ${format(b.enCours)} en cours`);
   if(Number(b.urgents))put(a,'small',null,`${format(b.urgents)} urgent(s)`);
  }
  if((data.bureaux||[]).length===6)put(bureaux,'p','Les autres bureaux restent accessibles dans les statistiques et dans le registre.','sx-n-note');
  const rows=data.priorites||[];
  if(!rows.length)put(list,'p','Aucune demande ouverte à examiner.','sx-n-note');
  for(const d of rows){const row=put(list,'article','sx-n-priority-row');
   const left=put(row,'div');const name=[d.prenom,d.nom].filter(Boolean).join(' ')||'Citoyen';
   const title=put(left,'strong',null,`n°${d.id} · ${d.objet||d.categorie||'Demande'}`);
   put(left,'small',null,`${name} · ${d.unitName||'Bureau non désigné'} · ${elapsed(d.date_creation)}`);
   const right=put(row,'div','sx-n-priority-actions');
   const flag=d.priorite==='URGENTE'?'Urgent':d.statut==='NOUVELLE'?'À prendre en charge':'En traitement';
   put(right,'span',d.priorite==='URGENTE'?'sx-n-urgent':'sx-n-state',flag);
   const a=put(right,'a','sx-n-minilink','Consulter');a.href=linkFor({q:String(d.id)});
  }
  const alert=id('sx-p2-alert');if(alert)alert.textContent=format(counts.urgentsOuverts);
  id('sx-n-summary-status').textContent='Synthèse actualisée. Ancienneté calculée depuis la réception, sans seuil de retard présumé.';
 }
 async function fetchSummary(){
  const status=id('sx-n-summary-status');if(!status)return;
  try{
   const ctx=await window.SATEER_CONTEXT_READY;
   const qs=new URLSearchParams(location.search);
   const org=await window.SATEER_choisirOrganisation(Number(qs.get('organisation'))||null,'CONSULAT');
   const tenant=String(org?.tenant_code||qs.get('tenant')||ctx?.tenantCode||'').trim();
   if(!org||!tenant||(org.tenant_code&&qs.get('tenant')&&qs.get('tenant')!==org.tenant_code))throw Error('Organisation non autorisée.');
   registry='/registre-demandes-vice-consul.html?'+new URLSearchParams({organisation:String(org.id),tenant});
   const action=id('sx-p2-demands-action');if(action)action.href=linkFor();
   const open=id('sx-n-open-registry');if(open)open.href=linkFor();
   // Les chiffres affichés restent soumis au contrôle de permission serveur.
   const url='/api/pilot-procedures/supervision/synthese?'+new URLSearchParams({organisationId:String(org.id),tenant});
   const r=await fetch(url,{credentials:'same-origin',cache:'no-store'});
   if(!r.ok)throw Error(r.status===403?'Consultation non autorisée.':'Synthèse indisponible (HTTP '+r.status+').');
   const data=await r.json();if(data.statut!=='SYNTHESE_SUPERVISION')throw Error('Format inattendu.');
   renderSummary(data);
  }catch(e){status.textContent='Synthèse indisponible : '+(e.message||'Erreur de lecture')+'. Consultez le registre selon vos permissions.';}
 }
 function init(){
  if(!document.body.classList.contains('sateer-vice')||id('sx-n-queue'))return false;
  const root=id('sx-p2-root');if(!root||!relocate(root))return false;
  headline(root);fetchSummary();
  window.addEventListener('sateer:vice-dashboard-refreshed',fetchSummary);
  return true;
 }
 function start(){if(init())return;const parent=document.querySelector('main.page');if(!parent)return;
  const observer=new MutationObserver(()=>{if(init())observer.disconnect();});observer.observe(parent,{subtree:true,childList:true});}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
