'use strict';
/* C2 : un seul domaine Core/Scopes, aucune donnée d'autorisation fournie par le navigateur. */
(async function(){
 const $=id=>document.getElementById(id),p=new URLSearchParams(location.search),tenant=p.get('tenant');
 const caseId=p.get('case'),q='?tenant='+encodeURIComponent(tenant||'');
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 let grants=[],active=null,places=[],requestKey=null,sending=false;
 const empty=(id,t)=>{const el=$(id);el.replaceChildren();const li=document.createElement('li');li.textContent=t;el.append(li);};
 const feedback=(id,t,error=false)=>{const x=$(id);x.textContent=t;x.dataset.error=String(error);};
 const txt=(el,t,tag='span')=>{const n=document.createElement(tag);n.textContent=t;el.append(n);return n;};
 const button=(name,fn,kind='')=>{const b=document.createElement('button');b.type='button';b.textContent=name;b.className=kind;b.addEventListener('click',fn);return b;};
 async function request(base,method,route,data,key){const headers={Accept:'application/json'};if(data!==undefined)headers['Content-Type']='application/json';if(key)headers['Idempotency-Key']=key;
  const r=await fetch(base+route+(route.includes('?')?'&':'?')+'tenant='+encodeURIComponent(tenant),{method,credentials:'same-origin',cache:'no-store',headers,body:data===undefined?undefined:JSON.stringify(data)});
  const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.statut||'HTTP '+r.status);return j;
 }
 const api=(method,route,data,key)=>request('/api/energy/collecte/v1',method,route,data,key);
 const scope=(method,route,data,key)=>request('/api/energy/collab/v2',method,route,data,key);
 const selected=()=>grants.find(g=>g.id===$('responsabilite').value)||null;
 function fillSelect(el,options,getName,getValue){el.replaceChildren();for(const o of options){const opt=new Option(getName(o),getValue(o));el.add(opt);}}
 async function loadScope(){active=selected();places=[];if(!active)return;
  if(active.role==='OCCUPANT'){places=[{id:active.nodeId,nom:active.perimetre,typeNoeud:'BUREAU'}];}
  else{let offset=0;for(let page=0;page<8;page++){const res=await scope('GET','/sites/'+active.siteId+'/arbre?grantId='+active.id+'&offset='+offset);
    places.push(...res.unites);if(!res.autrePage)break;offset=res.prochainOffset;if(page===7)feedback('contexte','Affichage partiel des unités : utilisez votre responsable pour répartir les missions.');}}
  fillSelect($('lieu'),places,x=>x.nom+' · '+x.typeNoeud,x=>x.id);
  $('envoyer').disabled=!active.parentGrantId||!places.length;
  feedback('aideResponsabilite',active.parentGrantId?'Mon périmètre : '+active.perimetre:'Coordinateur : saisie directe dans l’inventaire classique ; C2 est réservé aux contributions à vérifier.');
  await reloadQueue();
 }
 function dataFromForm(){const f=new FormData($('formProposer')),power=String(f.get('puissance')||'').trim();
  return {sourceGrantId:active.id,scopeNodeId:f.get('scopeNodeId'),nom:String(f.get('nom')||'').trim(),famille:f.get('famille'),quantite:Number(f.get('quantite')),puissanceUnitaireW:power?Number(power):null};}
 async function reloadMine(){const out=await api('GET','/mes-propositions');const list=$('mesPropositions');list.replaceChildren();
  if(!out.propositions.length)return empty('mesPropositions','Aucune contribution envoyée pour le moment.');
  for(const item of out.propositions){const li=document.createElement('li');txt(li,item.nom+' · '+item.quantite+' appareil(s)','strong');
   txt(li,'Statut : '+item.statut.replaceAll('_',' ')+' · version '+item.version,'small');
   const actions=txt(li,'','div');actions.className='actions';
   actions.append(button('Voir l’historique',async()=>{try{const h=await api('GET','/propositions/'+item.id+'/historique');
    const details=txt(li,'','ul');for(const ev of h.evenements)txt(details,ev.action+' · v'+ev.version,'li');}
    catch(e){feedback('messageCorrection',e.message,true);}}));
   if(item.statut==='A_CORRIGER')actions.append(button('Corriger cette proposition',async()=>{
    if(!window.confirm('Remettre ce contenu dans le formulaire pour le corriger et renvoyer à la première validation ?'))return;
    const g=grants.find(x=>x.id===item.sourceGrantId);if(!g){feedback('messageCorrection','La responsabilité originale est indisponible.',true);return;}
    $('responsabilite').value=g.id;await loadScope();$('lieu').value=item.scopeNodeId;
    $('nomAppareil').value=item.nom;$('categorie').value=item.famille;$('quantite').value=item.quantite;$('puissance').value=item.puissanceUnitaireW??'';
    $('formProposer').dataset.correctionId=item.id;$('formProposer').dataset.version=String(item.version);
    feedback('messageCorrection','Corrigez puis renvoyez. Cette correction créera une nouvelle version.');$('nomAppareil').focus();
   },'primary'));
   list.append(li);
  }
 }
 async function reloadQueue(){const g=selected();if(!g||g.role==='OCCUPANT')return empty('fileRevue','Aucune validation autorisée pour cette responsabilité.');
  const out=await api('GET','/sites/'+g.siteId+'/a-verifier?grantId='+g.id),list=$('fileRevue');list.replaceChildren();
  if(!out.propositions.length)return empty('fileRevue','Aucune proposition à examiner actuellement.');
  for(const item of out.propositions){const li=document.createElement('li');txt(li,item.nom+' · '+item.quantite+' appareil(s) · '+item.famille,'strong');
   txt(li,'Puissance : '+(item.puissanceUnitaireW===null?'inconnue':item.puissanceUnitaireW+' W déclarés')+' · v'+item.version,'small');
   const a=txt(li,'','div');a.className='actions';
   for(const [title,dec,kind] of [['Valider / transmettre','APPROUVER','primary'],['Demander correction','A_CORRIGER',''],['Refuser','REFUSER','danger']])a.append(button(title,async()=>{
    if(!window.confirm(dec==='APPROUVER'?'Valider cette étape (ou intégrer si vous êtes coordinateur) ?':'Confirmer : '+title+' ?'))return;
    try{const r=await api('POST','/sites/'+g.siteId+'/propositions/'+item.id+'/decision',{reviewerGrantId:g.id,version:item.version,decision:dec});
     feedback('messageRevue',r.statut+' · '+r.statut);await reloadQueue();await reloadMine();}
    catch(e){feedback('messageRevue',e.message,true);} },kind));list.append(li);}
 }
 $('responsabilite').addEventListener('change',()=>{delete $('formProposer').dataset.correctionId;delete $('formProposer').dataset.version;requestKey=null;loadScope().catch(e=>feedback('contexte',e.message,true));});
 $('formProposer').addEventListener('input',()=>{if(!sending)requestKey=null;});
 $('formProposer').addEventListener('submit',async e=>{e.preventDefault();if(sending||!active)return;const d=dataFromForm();
  if(!d.nom||!Number.isSafeInteger(d.quantite)||d.quantite<1||!UUID.test(d.scopeNodeId)||!UUID.test(d.sourceGrantId))return feedback('messageProposition','Complétez le lieu, le nom et la quantité.',true);
  sending=true;$('envoyer').disabled=true;
  try{const f=$('formProposer');if(f.dataset.correctionId){await api('POST','/sites/'+active.siteId+'/propositions/'+f.dataset.correctionId+'/corriger',{...d,version:Number(f.dataset.version)});
    delete f.dataset.correctionId;delete f.dataset.version;feedback('messageProposition','Correction transmise à la chaîne de validation.');}
   else{if(!requestKey)requestKey=crypto.randomUUID();await api('POST','/sites/'+active.siteId+'/propositions',d,requestKey);requestKey=null;feedback('messageProposition','Proposition envoyée à votre responsable.');}
   $('nomAppareil').value='';$('quantite').value='1';$('puissance').value='';await reloadMine();await reloadQueue();}
  catch(e){feedback('messageProposition','Envoi non confirmé : '+e.message,true);}
  finally{sending=false;$('envoyer').disabled=!active?.parentGrantId;}
 });
 try{const ctx=await window.SATEER_CONTEXT_READY;
  if(!tenant||!(ctx.organisations||[]).some(x=>x.tenant_code===tenant))throw Error('Session Energy non autorisée.');
  if(caseId)$('retour').href='/energie-responsabilites.html?tenant='+encodeURIComponent(tenant)+'&case='+encodeURIComponent(caseId);
  else $('retour').href='/energie-responsabilites.html?tenant='+encodeURIComponent(tenant);
  const r=await scope('GET','/mes-responsabilites');grants=r.responsabilites||[];
  if(!grants.length){$('contexte').textContent='Aucune responsabilité active. Acceptez une invitation dans Mon espace de participation.';return;}
  fillSelect($('responsabilite'),grants,g=>g.site+' · '+g.perimetre+' · '+g.role,g=>g.id);
  $('contexte').textContent='Session privée active · '+tenant+' · '+grants.length+' responsabilité(s) visible(s)';
  await loadScope();await reloadMine();
 }catch(e){feedback('contexte','Impossible de charger la collecte : '+e.message,true);}
})();
