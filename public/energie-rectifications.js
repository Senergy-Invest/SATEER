'use strict';
/** E-METER-1C1 UI, aucun calcul ni transfert automatique de fichiers. */
(async()=>{
 const el=id=>document.getElementById(id),query=new URLSearchParams(location.search),tenant=query.get('tenant');
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 const from=query.get('from')==='controles'?'controles':'factures';
 const billing='/api/energy/facturation/v1',revisions='/api/energy/rectifications/v1';
 let sites=[],siteIndex=0,offset=0,suivant=false,documents=[],selected=null,revisionData=null,points=[],seq=0;
 let lastSubmission={fingerprint:null,key:null};
 const text=(id,s)=>el(id).textContent=String(s);
 const option=(value,label)=>{const o=document.createElement('option');o.value=String(value);o.textContent=label;return o;};
 const td=(tr,t)=>{const v=document.createElement('td');v.textContent=String(t??'—');tr.append(v);return v;};
 const url=(base,path,params={})=>base+path+'?'+new URLSearchParams({tenant,...params});
 async function get(path){const r=await fetch(path,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.statut||'HTTP_'+r.status);return d;}
 async function post(path,body,key){const r=await fetch(path,{method:'POST',credentials:'same-origin',cache:'no-store',
  headers:{Accept:'application/json','Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(body)});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.statut||'HTTP_'+r.status);return d;}
 const site=()=>sites[siteIndex];
 function period(){const visible=el('nature').value==='FACTURE';el('periode').hidden=!visible;
  el('periodeDebut').required=visible;el('periodeFin').required=visible;}
 function meterOptions(){const point=points.find(x=>x.id===el('pointId').value);const selectedMeter=el('meterId').value;
  const select=el('meterId');select.replaceChildren(option('','Aucun — lien non établi'));
  if(point)for(const m of point.compteurs||[])select.append(option(m.id,m.nom+(m.actif?'':' · ancien')));
  if([...select.options].some(o=>o.value===selectedMeter))select.value=selectedMeter;}
 function fillValues(v){for(const k of ['nature','energie','dateDocument','devise','montant','referenceDocument','referenceJustificatif'])
   el(k).value=v[k]??'';
  el('periodeDebut').value=v.periodeDebut||'';el('periodeFin').value=v.periodeFin||'';
  const selector=el('pointId');selector.replaceChildren(option('','Aucun — site seul'));
  for(const p of points)selector.append(option(p.id,p.nom));
  if(v.pointId&&!points.some(p=>p.id===v.pointId)){
   el('pointId').replaceChildren(option('','Point non charge dans la premiere page : correction interdite'));
   el('pointId').disabled=true;el('meterId').disabled=true;
   text('retourForm','Le point lié est absent de la page chargée. Aucune correction automatique du rattachement n’est permise.');
   el('enregistrer').disabled=true;period();return;
  }
  el('pointId').disabled=false;el('meterId').disabled=false;
  el('pointId').value=v.pointId||'';meterOptions();
  if(v.meterId&&![...el('meterId').options].some(o=>o.value===v.meterId)){
   text('retourForm','Compteur lié absent : correction interdite sans le registre complet.');
   el('enregistrer').disabled=true;period();return;
  }
  el('meterId').value=v.meterId||'';period();}
 function clearSelected(){selected=null;revisionData=null;text('historiqueEtat','Sélectionnez un document.');
  el('historique').replaceChildren();el('enregistrer').disabled=true;}
 function displayList(){el('documents').replaceChildren();
  for(const row of documents){const tr=document.createElement('tr');tr.dataset.selected=String(row.originalId===selected);
   td(tr,row.dateDocument);td(tr,row.nature+' · '+row.energie);td(tr,row.montant+' '+row.devise);td(tr,'v'+row.revision);
   const cell=td(tr,'');const btn=document.createElement('button');btn.type='button';btn.textContent='Consulter / rectifier';
   btn.addEventListener('click',()=>select(row.originalId));cell.append(btn);el('documents').append(tr);}
  if(!documents.length){const tr=document.createElement('tr');const cell=td(tr,'Aucun document pour cette page.');cell.colSpan=5;el('documents').append(tr);}
  el('precedent').disabled=offset===0;el('suivant').disabled=!suivant;text('page','Page '+(Math.floor(offset/50)+1));}
 function displayHistory(d){const body=el('historique');body.replaceChildren();
  const rows=[{revision:0,declaration:d.original,motif:'Déclaration initiale'},...d.revisions];
  for(const r of rows){const tr=document.createElement('tr');td(tr,'v'+r.revision);td(tr,r.declaration.dateDocument);
   td(tr,r.declaration.nature+' · '+r.declaration.energie);td(tr,r.declaration.montant+' '+r.declaration.devise);
   td(tr,r.motif);body.append(tr);}
  text('historiqueEtat','Versions conservées : '+rows.length+' · version actuelle v'+d.revisionActuelle+' · déclarations non vérifiées.');}
 async function select(id){const current=++seq;selected=id;revisionData=null;el('enregistrer').disabled=true;
  text('historiqueEtat','Chargement des versions autorisées…');displayList();
  try{const d=await get(url(revisions,'/sites/'+encodeURIComponent(site().id)+'/declarations/'+encodeURIComponent(id)+'/rectifications'));
   if(current!==seq)return;revisionData=d;displayHistory(d);
   el('enregistrer').disabled=d.revisionActuelle>=20;
   fillValues(d.actuel);el('motif').value='';
   if(d.revisionActuelle>=20){el('enregistrer').disabled=true;text('retourForm','Limite des 20 révisions atteinte.');}
   else if(!el('enregistrer').disabled)text('retourForm','Prêt à déclarer une correction justifiée, sans supprimer l’original.');
  }catch(e){if(current!==seq)return;text('historiqueEtat','Historique indisponible : '+e.message);el('enregistrer').disabled=true;}}
 async function load(){const s=site(),current=++seq;clearSelected();if(!s)return;
  text('etat','Chargement des documents et points de comptage…');
  try{const [docs,meter]=await Promise.all([get(url(revisions,'/sites/'+encodeURIComponent(s.id)+'/rectifications',{offset})),
   get('/api/energy/mesures/v1/sites/'+encodeURIComponent(s.id)+'/points?tenant='+encodeURIComponent(tenant))]);
   if(current!==seq)return;documents=docs.declarations;suivant=Boolean(docs.suivant);points=meter.points||[];
   const selector=el('pointId');selector.replaceChildren(option('','Aucun — site seul'));
   for(const p of points)selector.append(option(p.id,p.nom));selector.disabled=false;el('meterId').disabled=false;meterOptions();displayList();
   text('etat','Registre des versions chargé · les sommes restent déclaratives.');
  }catch(e){if(current!==seq)return;text('etat','Registre indisponible : '+e.message);documents=[];suivant=false;displayList();}}
 async function init(){try{
  if(!tenant||!/^[A-Z][A-Z0-9_-]{0,49}$/.test(tenant))throw Error('TENANT_INVALIDE');
  const requestedSite=query.get('site'),requestedDoc=query.get('document');
  el('versControles').href='/energie-controles.html?tenant='+encodeURIComponent(tenant)+'&source=DOCUMENTS'+
   (UUID.test(requestedSite||'')?'&site='+encodeURIComponent(requestedSite):'');
  const pageControles=el('versControles').href;
  if(from==='controles'){el('retour').textContent='← Contrôles de qualité';el('retour').href=pageControles;}
  else {el('retour').textContent='← Mes factures';el('retour').href='/energie-factures.html?'+new URLSearchParams({tenant,from:'rectifications',...(UUID.test(requestedSite||'')?{site:requestedSite}:{})}).toString();}
  el('versFactures').href='/energie-factures.html?'+new URLSearchParams({tenant,from:'rectifications',returnFrom:from,...(UUID.test(requestedSite||'')?{site:requestedSite}:{}),...(UUID.test(requestedDoc||'')?{document:requestedDoc}:{})}).toString();
  if(!window.SATEER_CONTEXT_READY)throw Error('SESSION_CORE_INDISPONIBLE');
  const ctx=await window.SATEER_CONTEXT_READY;
  if(!ctx.organisations?.some(x=>x.tenant_code===tenant))throw Error('TENANT_NON_AUTORISE');
  const r=await get(url(billing,'/sites'));sites=r.sites||[];
  const selector=el('site');selector.replaceChildren();
  if(!sites.length){selector.append(option('','Aucun site autorisé'));text('etat','Aucun site disponible.');return;}
  sites.forEach((s,i)=>selector.append(option(i,s.nom)));selector.disabled=false;
  if(requestedSite&&UUID.test(requestedSite)){const i=sites.findIndex(s=>s.id===requestedSite);if(i>=0){siteIndex=i;selector.value=String(i);}}
  await load();
  if(requestedDoc&&UUID.test(requestedDoc)&&documents.some(x=>x.originalId===requestedDoc))await select(requestedDoc);
  else if(requestedDoc)text('historiqueEtat','Ce document n’est pas présent sur cette page ; sélectionnez-le dans la liste autorisée.');
  if(r.suivant)text('etat','Liste des sites partielle : 50 premiers.');
 }catch(e){text('etat','Accès indisponible : '+e.message);}}
 el('nature').addEventListener('change',period);el('pointId').addEventListener('change',meterOptions);
 el('site').addEventListener('change',()=>{siteIndex=Number(el('site').value)||0;offset=0;load();});
 el('precedent').addEventListener('click',()=>{offset=Math.max(0,offset-50);load();});
 el('suivant').addEventListener('click',()=>{if(suivant){offset+=50;load();}});
 el('formulaire').addEventListener('submit',async(ev)=>{ev.preventDefault();if(!selected||!revisionData||!site())return;
  const facture=el('nature').value==='FACTURE';
  const valeurs={nature:el('nature').value,energie:el('energie').value,dateDocument:el('dateDocument').value,
   periodeDebut:facture?el('periodeDebut').value:null,periodeFin:facture?el('periodeFin').value:null,
   devise:el('devise').value.toUpperCase(),montant:el('montant').value.replace(',','.'),
   pointId:el('pointId').value||null,meterId:el('meterId').value||null,
   referenceDocument:el('referenceDocument').value||null,referenceJustificatif:el('referenceJustificatif').value||null};
  const body={motif:el('motif').value,valeurs};const fingerprint=site().id+selected+JSON.stringify(body);
  if(lastSubmission.fingerprint!==fingerprint)lastSubmission={fingerprint,key:crypto.randomUUID()};
  el('enregistrer').disabled=true;
  try{const r=await post(url(revisions,'/sites/'+encodeURIComponent(site().id)+'/declarations/'+encodeURIComponent(selected)+'/rectifications'),body,lastSubmission.key);
   text('retourForm','Révision v'+r.revision+' enregistrée · non vérifiée. Les anciennes valeurs et pièces sont conservées.');
   const root=selected;await load();if(documents.some(x=>x.originalId===root))await select(root);
  }catch(e){text('retourForm','Rectification refusée : '+e.message);el('enregistrer').disabled=false;}
 });
 period();await init();
})();
