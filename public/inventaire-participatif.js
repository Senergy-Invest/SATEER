'use strict';
/** SUNU Courant MVP02-B1 : présentation, sans nouvelle identité ni droit issu du navigateur. */
(async function(){
 const $=id=>document.getElementById(id);
 const params=new URLSearchParams(location.search),tenant=params.get('tenant'),caseId=params.get('case');
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
 const q='?tenant='+encodeURIComponent(tenant||'');
 let siteId=null,selected=null,requestKey=null,participation=null,sending=false;
 const types=[
  {id:'FROID',name:'Réfrigérateur',icon:'❄️'},
  {id:'CLIMATISATION',name:'Climatiseur',icon:'🌡️'},
  {id:'ECLAIRAGE',name:'Lampes',icon:'💡'},
  {id:'POMPAGE',name:'Pompe à eau',icon:'💧'},
  {id:'MOTEUR',name:'Machine',icon:'⚙️'},
  {id:'INFORMATIQUE',name:'Informatique',icon:'💻'},
  {id:'SOLAIRE',name:'Solaire',icon:'☀️'},
  {id:'STOCKAGE',name:'Batterie',icon:'🔋'},
  {id:'AUTRE',name:'Autre',icon:'➕'}
 ];
 if(tenant&&caseId)$('retour').href='/inventaire-energie.html'+q+'&case='+encodeURIComponent(caseId);
 else if(tenant)$('retour').href='/sunu-courant.html'+q;
 function message(id,t,error=false){const e=$(id);e.textContent=t;e.dataset.error=error?'true':'false';}
 async function request(method,path,data,key){
  const headers={'Accept':'application/json'};if(data!==undefined)headers['Content-Type']='application/json';
  if(key)headers['Idempotency-Key']=key;
  const r=await fetch('/api/energy/collab'+path+q,{method,credentials:'same-origin',cache:'no-store',headers,
   body:data===undefined?undefined:JSON.stringify(data)});
  const json=await r.json().catch(()=>({}));if(!r.ok)throw Error(json.statut||'HTTP '+r.status);return json;
 }
 async function copy(t,where){try{await navigator.clipboard.writeText(t);message(where,'Copié.',false);}catch(_){message(where,'Copie indisponible. Sélectionnez et copiez le texte affiché.',true);}}
 function line(el,text,tag='span'){const x=document.createElement(tag);x.textContent=text;el.append(x);return x;}
 function act(text,doIt,variant='secondary'){
  const b=document.createElement('button');b.type='button';b.className=variant;b.textContent=text;b.addEventListener('click',doIt);return b;
 }
 const blank=(ul,text)=>{ul.replaceChildren();const li=document.createElement('li');li.className='empty';li.textContent=text;ul.append(li);};
 async function refreshOwner(){
  if(!siteId)return;
  const [a,b]=await Promise.all([request('GET','/sites/'+siteId+'/invitations'),request('GET','/sites/'+siteId+'/contributions')]);
  const inv=$('listeInvitations');inv.replaceChildren();
  if(!a.invitations?.length)blank(inv,'Aucune invitation pour le moment.');
  for(const item of a.invitations||[]){
   const li=document.createElement('li');line(li,item.statut==='OUVERTE'?'Invitation à utiliser':item.statut==='ACCEPTEE'?'Invitation acceptée':'Invitation révoquée','strong');
   const expired=Date.parse(item.expireLe)<=Date.now();line(li,expired?'Code expiré':('Statut : '+item.statut+' · valable jusqu’au '+new Date(item.expireLe).toLocaleString('fr-FR')),'small');
   if(item.statut!=='REVOQUEE')li.append(act('Révoquer cet accès',async()=>{
    if(!window.confirm('Révoquer cette invitation et interdire toute nouvelle proposition ?'))return;
    try{await request('POST','/sites/'+siteId+'/invitations/'+item.id+'/revoquer',{});await refreshOwner();}
    catch(e){message('messageInvitation',e.message,true);}
   },'danger'));
   inv.append(li);
  }
  const list=$('listePropositions');list.replaceChildren();
  if(!b.contributions?.length)blank(list,'Aucune proposition à vérifier.');
  for(const item of b.contributions||[]){
   const li=document.createElement('li');line(li,item.nom+' · '+item.quantite+' appareil(s)','strong');
   line(li,item.famille+(item.puissanceUnitaireW?' · '+item.puissanceUnitaireW+' W':' · puissance inconnue'),'small');
   line(li,item.statut==='SOUMISE'?'En attente de votre décision':'Décision : '+item.statut,'small');
   if(item.statut==='SOUMISE'){
    const actions=document.createElement('div');actions.className='actions';
    for(const [label,decision] of [['Accepter','ACCEPTER'],['Refuser','REFUSER']]){
     actions.append(act(label,async()=>{
      if(!window.confirm(decision==='ACCEPTER'?'Ajouter cet appareil déclaré dans votre inventaire ?':'Refuser cette proposition ?'))return;
      try{await request('POST','/sites/'+siteId+'/contributions/'+item.id+'/decision',{decision});
       message('messageDecision','Décision enregistrée. Inventaire mis à jour si accepté.');await refreshOwner();}
      catch(e){message('messageDecision','Décision non confirmée : '+e.message,true);}
     },decision==='ACCEPTER'?'primary':'danger'));
    }
    li.append(actions);
   }
   list.append(li);
  }
 }
 $('creerInvitation').addEventListener('click',async()=>{
  if(!siteId)return;const b=$('creerInvitation');b.disabled=true;
  try{const r=await request('POST','/sites/'+siteId+'/invitations',{});
   $('codeInvitation').textContent=r.codeInvitation;$('codeBloc').hidden=false;
   message('messageInvitation','Invitation créée. Communiquez le code directement à une personne de confiance.');await refreshOwner();
  }catch(e){message('messageInvitation','Impossible de créer l’invitation : '+e.message,true);}finally{b.disabled=false;}
 });
 $('copierCode').addEventListener('click',()=>copy($('codeInvitation').textContent,'messageInvitation'));
 $('copierLien').addEventListener('click',()=>copy(location.origin+'/inventaire-participatif.html'+q,'messageInvitation'));
 $('formCode').addEventListener('submit',async e=>{
  e.preventDefault();const code=$('saisieCode').value.trim();
  try{await request('POST','/invitations/accepter',{codeInvitation:code});$('saisieCode').value='';
   message('messageCode','Invitation acceptée. Vous pouvez proposer un appareil.');await refreshParticipant();}
  catch(err){message('messageCode','Invitation non acceptée : '+err.message,true);}
 });
 function categories(){const parent=$('categories');parent.replaceChildren();for(const t of types){
   const btn=document.createElement('button');btn.className='device';btn.type='button';btn.dataset.famille=t.id;
   btn.setAttribute('aria-pressed',String(selected===t.id));const symbol=line(btn,t.icon);symbol.setAttribute('aria-hidden','true');line(btn,t.name);
   btn.addEventListener('click',()=>{selected=t.id;requestKey=null;categories();$('nom').focus();});parent.append(btn);
 }}
 categories();
 $('formProposition').addEventListener('input',()=>{if(!sending)requestKey=null;});
 $('formProposition').addEventListener('change',()=>{if(!sending)requestKey=null;});
 async function loadMyProposals(){if(!participation)return;
  const r=await request('GET','/participations/'+participation+'/contributions');const ul=$('mesPropositions');ul.replaceChildren();
  if(!r.contributions?.length)blank(ul,'Vous n’avez encore rien proposé.');
  for(const p of r.contributions||[]){const li=document.createElement('li');line(li,p.nom,'strong');line(li,'Quantité : '+p.quantite+' · '+p.statut,'small');ul.append(li);}
 }
 async function refreshParticipant(){
  const r=await request('GET','/mes-participations'),select=$('selectParticipation');
  const prior=participation;select.replaceChildren();const arr=r.participations||[];
  $('participations').hidden=!arr.length;
  for(const item of arr){const option=new Option(item.siteNom+' · expire le '+new Date(item.expireLe).toLocaleDateString('fr-FR'),item.invitationId);select.append(option);}
  participation=arr.some(x=>x.invitationId===prior)?prior:arr[0]?.invitationId||null;
  if(participation){select.value=participation;await loadMyProposals();}
 }
 $('selectParticipation').addEventListener('change',async()=>{participation=$('selectParticipation').value;
  try{await loadMyProposals();}catch(e){message('messageProposition',e.message,true);}
 });
 $('formProposition').addEventListener('submit',async e=>{
  e.preventDefault();if(sending||!participation)return;
  const name=$('nom').value.trim(),qty=Number($('quantite').value),power=$('puissance').value.trim();
  if(!selected||!name||name.length>120||!Number.isInteger(qty)||qty<1||qty>10000||
    (power!==''&&(!/^\d+$/.test(power)||Number(power)<1||Number(power)>100000000))){
   message('messageProposition','Choisissez un type et vérifiez le nom et la quantité.',true);return;
  }
  const payload={nom:name,famille:selected,quantite:qty,puissanceUnitaireW:power===''?null:Number(power)};
  if(!requestKey)requestKey=crypto.randomUUID();sending=true;$('envoyerProposition').disabled=true;
  try{await request('POST','/participations/'+participation+'/contributions',payload,requestKey);
   requestKey=null;$('formProposition').reset();selected=null;categories();
   message('messageProposition','Votre proposition a été envoyée. Le responsable doit la valider.');await loadMyProposals();
  }catch(err){message('messageProposition','Envoi non confirmé : '+err.message+'. Réessayez sans changer votre saisie.',true);}
  finally{sending=false;$('envoyerProposition').disabled=false;}
 });
 try{
  const ctx=await window.SATEER_CONTEXT_READY;
  if(!tenant||!(ctx.organisations||[]).some(o=>o.tenant_code===tenant))throw Error('ESPACE_NON_AUTORISE');
  if(caseId&&UUID.test(caseId)){
   const r=await fetch('/api/energy/inventory/sites'+q,{credentials:'same-origin',cache:'no-store'});
   if(r.ok){const d=await r.json(),site=(d.sites||[]).find(x=>x.energyCaseId===caseId);
    if(site){siteId=site.id;$('responsable').hidden=false;$('siteResponsable').textContent=site.nom;
     await refreshOwner();}
   }
  }
  await refreshParticipant();
  $('contexte').textContent='Session privée active · '+tenant+' · aucune permission institutionnelle.';
 }catch(e){message('contexte','Impossible d’ouvrir la collaboration : '+e.message,true);}
})();
