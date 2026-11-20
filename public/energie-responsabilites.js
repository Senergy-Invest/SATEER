'use strict';
/* Façade Energy Scope C1. Aucun droit depuis l'URL ou le navigateur. */
(async function(){
 const $=id=>document.getElementById(id),params=new URLSearchParams(location.search),tenant=params.get('tenant'),caseId=params.get('case');
 const q='?tenant='+encodeURIComponent(tenant||'');
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 const api='/api/energy/collab/v2';
 let mine=[],active=null,siteId=null,actorId=null,offset=0,units=[];
 function status(id,v,error=false){const e=$(id);e.textContent=v;e.style.color=error?'#b23d30':'';}
 function option(text,value){return new Option(text,value);}
 async function request(method,route,body,key){const r=await fetch(api+route+q,{method,credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{})},body:body?JSON.stringify(body):undefined});
  const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.statut||'HTTP '+r.status);return data;}
 function row(ul,label,note,buttons=[]){const li=document.createElement('li'),box=document.createElement('div'),strong=document.createElement('strong'),small=document.createElement('small');strong.textContent=label;small.textContent=note;box.append(strong,small);li.append(box);for(const b of buttons)li.append(b);ul.append(li);return li;}
 function btn(text,cb,danger){const x=document.createElement('button');x.type='button';x.textContent=text;x.className=danger?'danger':'secondary';x.addEventListener('click',cb);return x;}
 function empty(ul,msg){ul.replaceChildren();row(ul,msg,'');}
 async function invitations(){const data=await request('GET','/mes-invitations');const ul=$('mesInvitations');ul.replaceChildren();
  for(const i of data.invitations||[])row(ul,i.perimetre+' · '+i.role,i.site+' · Invitation à votre compte · expire le '+new Date(i.expireLe).toLocaleString('fr-FR'),[
    btn('Accepter',async()=>{try{await request('POST','/invitations/'+i.id+'/accepter',{});await refresh();}catch(e){status('contexte','Invitation non acceptée : '+e.message,true);}})]);
  if(!ul.children.length)empty(ul,'Aucune invitation en attente pour ce compte.');
 }
 async function account(){const r=await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'}),d=await r.json();if(!r.ok||!Number.isSafeInteger(d.personne?.id))throw Error('COMPTE_NON_AUTHENTIFIE');actorId=d.personne.id;
  $('monIdentifiant').textContent=String(actorId);}
 $('copierIdentifiant').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(String(actorId));}catch(_){status('contexte','Copie non disponible : sélectionner l’identifiant manuellement.');}});
 // Le paramètre grantId doit précéder le paramètre tenant existant.
 async function readTree(reset=true){if(!active)return;if(reset){offset=0;units=[];}
  const route='/sites/'+active.siteId+'/arbre?grantId='+encodeURIComponent(active.id)+'&offset='+offset;
  const response=await fetch(api+route+'&tenant='+encodeURIComponent(tenant),{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
  const d=await response.json().catch(()=>({}));if(!response.ok)throw Error(d.statut||'ARBRE_NON_AUTORISE');
  units.push(...(d.unites||[]));offset=d.prochainOffset??0;$('chargerSuite').hidden=!d.autrePage;
  const ul=$('listeLieux');ul.replaceChildren();const parent=$('parentUnite'),target=$('uniteInvitee');parent.replaceChildren();target.replaceChildren();
  for(const n of units){row(ul,n.nom,n.typeNoeud);parent.append(option(n.nom+' · '+n.typeNoeud,n.id));target.append(option(n.nom+' · '+n.typeNoeud,n.id));}
  if(!units.length)empty(ul,'Aucun lieu visible.');
  const count=units.length;
  $('tableauProgres').textContent='Unités visibles dans ce périmètre : '+count+(d.autrePage?' (affichage paginé)':'')+'. Avancement de collecte et économies : non encore disponibles dans cette tranche.';
 }
 $('chargerSuite').addEventListener('click',async()=>{try{await readTree(false);}catch(e){status('scopeContexte',e.message,true);}});
 async function loadDelegated(){const ul=$('delegations'),invs=$('invitationsEnvoyees');ul.replaceChildren();invs.replaceChildren();
  if(!active||active.role==='OCCUPANT'){empty(ul,'Aucune autorité de délégation.');empty(invs,'Aucune invitation à gérer.');return;}
  const [g,i]=await Promise.all([
   fetch(api+'/sites/'+active.siteId+'/responsabilites?grantId='+active.id+'&tenant='+tenant,{credentials:'same-origin',cache:'no-store'}).then(r=>r.json()),
   fetch(api+'/sites/'+active.siteId+'/invitations?grantId='+active.id+'&tenant='+tenant,{credentials:'same-origin',cache:'no-store'}).then(r=>r.json())
  ]);
  for(const x of g.responsabilites||[])row(ul,'Compte '+x.personneId+' · '+x.role,x.perimetre+' · '+x.statut,x.statut==='ACTIF'?[
    btn('Révoquer et retirer les délégations associées',async()=>{if(!confirm('Retirer cette responsabilité et toutes les délégations qui en dépendent ?'))return;
     try{await request('POST','/sites/'+active.siteId+'/responsabilites/'+x.id+'/revoquer',{sourceGrantId:active.id});await refresh();}catch(e){status('scopeContexte','Révocation impossible : '+e.message,true);}},true)]:[]);
  if(!ul.children.length)empty(ul,'Aucune responsabilité déléguée dans cette branche.');
  for(const x of i.invitations||[])row(invs,'Compte '+x.destinataire+' · '+x.role,x.statut+' · '+new Date(x.expireLe).toLocaleString('fr-FR'),x.statut==='EN_ATTENTE'?[
    btn('Annuler',async()=>{try{await request('POST','/invitations/'+x.id+'/revoquer',{});await loadDelegated();}catch(e){status('msgInvite',e.message,true);}},true)]:[]);
  if(!invs.children.length)empty(invs,'Aucune invitation émise depuis cette responsabilité.');
 }
 async function renderActive(){active=mine.find(x=>x.id===$('scopeActif').value)||mine[0]||null;
  if(!active){$('gestion').hidden=true;return;}
  $('gestion').hidden=false;$('scopeActif').value=active.id;siteId=active.siteId;
  status('scopeContexte',active.site+' · '+active.perimetre+' · '+active.role+'. Les données des autres branches ne sont pas exposées.');
  const can=active.role!=='OCCUPANT';$('formUnite').hidden=!can;$('formInviter').hidden=!can;
  await Promise.all([readTree(),loadDelegated()]);
 }
 $('scopeActif').addEventListener('change',()=>renderActive().catch(e=>status('scopeContexte',e.message,true)));
 async function refresh(){await invitations();const d=await request('GET','/mes-responsabilites');const prior=active?.id;mine=d.responsabilites||[];
  const sel=$('scopeActif');sel.replaceChildren();for(const m of mine)sel.append(option(m.site+' · '+m.perimetre+' · '+m.role,m.id));
  if(prior&&mine.some(x=>x.id===prior))sel.value=prior;
  if(!mine.length){$('gestion').hidden=true;}else await renderActive();
 }
 let actionKey=null;
 $('formUnite').addEventListener('input',()=>actionKey=null);
 $('formUnite').addEventListener('submit',async e=>{e.preventDefault();if(!active||active.role==='OCCUPANT')return;
  const d=new FormData(e.currentTarget),data={sourceGrantId:active.id,parentNodeId:d.get('parentNodeId'),typeNoeud:d.get('typeNoeud'),nom:String(d.get('nom')||'').trim()};
  if(!actionKey)actionKey=crypto.randomUUID();const b=e.currentTarget.querySelector('[type="submit"]');b.disabled=true;
  try{await request('POST','/sites/'+active.siteId+'/unites',data,actionKey);actionKey=null;$('nomUnite').value='';status('msgUnite','Unité ajoutée dans votre périmètre.');await readTree();}
  catch(err){status('msgUnite','Création non confirmée : '+err.message,true);}finally{b.disabled=false;}
 });
 let inviteKey=null;$('formInviter').addEventListener('input',()=>inviteKey=null);
 $('formInviter').addEventListener('submit',async e=>{e.preventDefault();if(!active||active.role==='OCCUPANT')return;
  const d=new FormData(e.currentTarget),data={sourceGrantId:active.id,targetNodeId:d.get('targetNodeId'),targetPersonneId:Number(d.get('targetPersonneId')),role:d.get('role')};
  if(!Number.isSafeInteger(data.targetPersonneId)||data.targetPersonneId<=0){status('msgInvite','Identifiant de compte incorrect.',true);return;}
  if(!inviteKey)inviteKey=crypto.randomUUID();const b=e.currentTarget.querySelector('[type="submit"]');b.disabled=true;
  try{await request('POST','/sites/'+active.siteId+'/invitations',data,inviteKey);inviteKey=null;$('idInvite').value='';status('msgInvite','Invitation envoyée au compte concerné.');await loadDelegated();}
  catch(err){status('msgInvite','Invitation non confirmée : '+err.message,true);}finally{b.disabled=false;}
 });
 $('initialiser').addEventListener('click',async()=>{if(!siteId)return;$('initialiser').disabled=true;
  try{await request('POST','/sites/'+siteId+'/initialiser',{});$('initialiser').hidden=true;await refresh();}
  catch(e){status('contexte','Initialisation refusée : '+e.message,true);}finally{$('initialiser').disabled=false;}
 });
 try{const ctx=await window.SATEER_CONTEXT_READY;if(!tenant||!(ctx.organisations||[]).some(x=>x.tenant_code===tenant))throw Error('TENANT_NON_AUTORISE');
  await account();if(caseId&&uuid.test(caseId)){
   const r=await fetch('/api/energy/inventory/sites'+q,{credentials:'same-origin',cache:'no-store'});
   if(r.ok){const x=await r.json();const owned=(x.sites||[]).find(o=>o.energyCaseId===caseId);
    if(owned){siteId=owned.id;$('initialiser').hidden=false;$('retour').href='/inventaire-energie.html'+q+'&case='+caseId;}}
  }
  await refresh();if(mine.some(m=>m.siteId===siteId))$('initialiser').hidden=true;
  // La navigation d'origine est préservée pour toutes les autres entrées.
  const retourC4C3=window.SATEER_C4C3_NAV?.retourDepuis(location.search,tenant);
  if(retourC4C3){$('retour').href=retourC4C3;$('retour').textContent='← Suivi des contributions C4C';}
  status('contexte','Session active · invitation nominative · accès limité à vos responsabilités.');
 }catch(e){status('contexte','Impossible d’ouvrir cet espace : '+e.message,true);}
})();
