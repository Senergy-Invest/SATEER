'use strict';
/** Présentation seule : aucune somme, kWh ou tarif déduit. Toutes les valeurs serveur sont du texte. */
(async()=>{
 const el=id=>document.getElementById(id),tenant=new URLSearchParams(location.search).get('tenant');
 const api='/api/energy/facturation/v1';let sites=[],siteIndex=0,offset=0,suivant=false,sequence=0,points=[];
 let lastSubmission={fingerprint:null,key:null};
 const text=(id,v)=>{el(id).textContent=v;};
 const option=(v,t)=>{const o=document.createElement('option');o.value=v;o.textContent=t;return o;};
 const cell=(tr,t)=>{const d=document.createElement('td');d.textContent=String(t??'—');tr.append(d);};
 async function request(p,method='GET',body,requestKey){const headers={Accept:'application/json'};
  if(body){headers['Content-Type']='application/json';headers['Idempotency-Key']=requestKey||crypto.randomUUID();}
  const response=await fetch(p,{method,credentials:'same-origin',cache:'no-store',headers,body:body?JSON.stringify(body):undefined});
  const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.statut||'HTTP_'+response.status);return data;}
 const url=(path,q={})=>api+path+'?'+new URLSearchParams({tenant,...q});
 const site=()=>sites[siteIndex];
 function displayMode(){const facture=el('nature').value==='FACTURE';el('periode').hidden=!facture;
  el('periodeDebut').required=facture;el('periodeFin').required=facture;}
 function fillMeters(){const p=points.find(p=>p.id===el('pointId').value);
  const sel=el('meterId');sel.replaceChildren(option('','Aucun — lien non établi'));
  if(p)for(const d of p.compteurs||[])sel.append(option(d.id,d.nom+(d.actif?'':' · ancien')));}
 function fillPoints(data){points=data?.points||[];const sel=el('pointId');sel.replaceChildren(option('','Aucun — site seul'));
  for(const p of points)sel.append(option(p.id,p.nom));fillMeters();}
 function paint(data){const body=el('historique');body.replaceChildren();
  for(const row of data.declarations||[]){const tr=document.createElement('tr');
   cell(tr,row.dateDocument);cell(tr,row.nature+' · '+row.energie);
   cell(tr,row.periodeDebut?row.periodeDebut+' → '+row.periodeFin:'—');
   cell(tr,row.montant+' '+row.devise);cell(tr,'Déclaré · à vérifier');cell(tr,row.referenceDocument||'—');body.append(tr);}
  if(!data.declarations?.length){const tr=document.createElement('tr');const td=document.createElement('td');td.colSpan=6;td.textContent='Aucune déclaration pour cette page.';tr.append(td);body.append(tr);}
  suivant=Boolean(data.suivant);el('precedent').disabled=offset===0;el('suivant').disabled=!suivant;text('page','Page '+(Math.floor(offset/50)+1));
 }
 async function load(){const s=site(),current=++sequence;if(!s)return;
  el('enregistrer').disabled=true;text('etat','Chargement des déclarations et des compteurs…');
  try{const [list,meters]=await Promise.all([request(url('/sites/'+encodeURIComponent(s.id)+'/declarations',{offset})),
     request('/api/energy/mesures/v1/sites/'+encodeURIComponent(s.id)+'/points?tenant='+encodeURIComponent(tenant))]);
   if(current!==sequence)return;paint(list);fillPoints(meters);text('etat','Registre chargé · montants déclarés non vérifiés.');el('enregistrer').disabled=false;
  }catch(e){if(current!==sequence)return;text('etat','Données indisponibles : '+e.message);text('retourForm','La saisie est désactivée tant que les données privées ne sont pas disponibles.');}}
 async function init(){try{
  if(!tenant||!/^[A-Z][A-Z0-9_-]{0,49}$/.test(tenant))throw Error('TENANT_INVALIDE');
  el('retour').href='/energie-releves.html?tenant='+encodeURIComponent(tenant);
  if(!window.SATEER_CONTEXT_READY)throw Error('SESSION_CORE_INDISPONIBLE');
  const ctx=await window.SATEER_CONTEXT_READY;if(!ctx.organisations?.some(x=>x.tenant_code===tenant))throw Error('TENANT_NON_AUTORISE');
  const data=await request(url('/sites'));sites=data.sites||[];const sel=el('site');sel.replaceChildren();
  if(!sites.length){sel.append(option('','Aucun site accessible'));text('etat','Aucun site privé disponible.');return;}
  sites.forEach((s,i)=>sel.append(option(String(i),s.nom)));sel.disabled=false;
  if(data.suivant)text('etat','Liste partielle : seuls les 50 premiers sites sont affichés.');
  await load();
 }catch(e){el('enregistrer').disabled=true;text('etat','Accès indisponible : '+e.message);}}
 el('nature').addEventListener('change',displayMode);el('pointId').addEventListener('change',fillMeters);
 el('site').addEventListener('change',()=>{siteIndex=Number(el('site').value)||0;offset=0;load();});
 el('actualiser').addEventListener('click',()=>load());
 el('precedent').addEventListener('click',()=>{offset=Math.max(0,offset-50);load();});
 el('suivant').addEventListener('click',()=>{if(suivant){offset+=50;load();}});
 el('formulaire').addEventListener('submit',async ev=>{ev.preventDefault();const s=site();if(!s)return;
  const facture=el('nature').value==='FACTURE';const body={nature:el('nature').value,energie:el('energie').value,
    dateDocument:el('dateDocument').value,devise:el('devise').value.toUpperCase(),montant:el('montant').value.replace(',','.'),
    periodeDebut:facture?el('periodeDebut').value:null,periodeFin:facture?el('periodeFin').value:null,
    referenceDocument:el('referenceDocument').value||null,referenceJustificatif:el('referenceJustificatif').value||null,
    pointId:el('pointId').value||null,meterId:el('meterId').value||null};
  el('enregistrer').disabled=true;
  const fingerprint=s.id+JSON.stringify(body);
  if(lastSubmission.fingerprint!==fingerprint)lastSubmission={fingerprint,key:crypto.randomUUID()};
  try{const result=await request(url('/sites/'+encodeURIComponent(s.id)+'/declarations'),'POST',body,lastSubmission.key);
   text('retourForm','Déclaration enregistrée · '+result.id+' · à vérifier. Aucune consommation calculée.');offset=0;await load();
  }catch(e){text('retourForm','Enregistrement refusé : '+e.message);el('enregistrer').disabled=false;}
 });
 displayMode();el('enregistrer').disabled=true;await init();
})();
