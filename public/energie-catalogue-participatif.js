'use strict';
/* Vue non privilégiée : seul le serveur Core + grants C1 décide. */
(async function(){
 const $=id=>document.getElementById(id),u=new URLSearchParams(location.search),tenant=u.get('tenant')||'',caseId=u.get('case');
 const q='?tenant='+encodeURIComponent(tenant),api='/api/energy/catalogue-collab/v1';
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 const say=(id,s,bad=false)=>{const e=$(id);e.textContent=s;e.style.color=bad?'#b23424':'';};
 let equipments=[],mine=[],roles=[],edit=null,key=null,siteId=null;
 const option=(value,label)=>new Option(label,value);
 async function request(url,method='GET',body,keyValue){const r=await fetch(url+(url.includes('?')?'&':'?')+'tenant='+encodeURIComponent(tenant),{
  method,credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json',...(body!==undefined?{'Content-Type':'application/json'}:{}),...(keyValue?{'Idempotency-Key':keyValue}:{})},
  body:body===undefined?undefined:JSON.stringify(body)});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.statut||'HTTP_'+r.status);return d;}
 const button=(text,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.addEventListener('click',fn);return b;};
 function row(list,title,subtitle){const li=document.createElement('li'),strong=document.createElement('strong'),small=document.createElement('small');
  strong.textContent=title;small.textContent=subtitle;li.append(strong,small);list.append(li);return li;}
 function fields(){return {famille:$('famille').value,sousFamille:$('sousFamille').value.trim(),designation:$('designation').value.trim(),
  marque:$('marque').value.trim()||null,modele:$('modele').value.trim()||null,
  puissanceNominaleW:$('watts').value?Number($('watts').value):null,tensionV:$('volts').value?Number($('volts').value):null};}
 function renderSource(){const select=$('equipement');select.replaceChildren();for(const x of equipments)select.append(option(x.c2ProposalId,x.nom+' · '+x.famille));
  select.disabled=Boolean(edit);$('famille').value=equipments.find(x=>x.c2ProposalId===select.value)?.famille||'';
  if(!equipments.length)select.append(option('','Aucun appareil C2 intégré dans ce compte'));
  $('envoyer').disabled=!equipments.length&&!edit;
 }
 $('equipement').addEventListener('change',()=>{edit=null;key=null;renderSource();});
 $('formProposition').addEventListener('input',()=>{key=null;});
 $('annulerCorrection').addEventListener('click',()=>{edit=null;key=null;$('formProposition').reset();$('annulerCorrection').hidden=true;$('envoyer').textContent='Soumettre la fiche au responsable';renderSource();});
 async function loadMine(){const d=await request(api+'/mes-propositions'),ul=$('mesFiches');mine=d.propositions||[];ul.replaceChildren();
  for(const p of mine){const li=row(ul,p.sousFamille+' · '+p.designation,[p.famille,p.marque||'marque inconnue',p.modele||'modèle inconnu',p.statut,'version '+p.version].join(' · '));
   li.append(button('Voir les étapes',async()=>{try{const h=await request(api+'/propositions/'+p.id+'/historique');
    say('messageMesFiches',(h.evenements||[]).map(e=>e.action+' (v'+e.version+')').join(' → ')||'Aucun événement.');}catch(e){say('messageMesFiches',e.message,true);}}));
   if(p.statut==='A_CORRIGER')li.append(button('Corriger cette fiche',()=>{edit=p;key=null;
    $('sousFamille').value=p.sousFamille;$('designation').value=p.designation;$('marque').value=p.marque||'';$('modele').value=p.modele||'';
    $('watts').value=p.puissanceNominaleW||'';$('volts').value=p.tensionV||'';
    $('famille').value=p.famille;$('equipement').disabled=true;$('envoyer').disabled=false;$('envoyer').textContent='Renvoyer la correction';$('annulerCorrection').hidden=false;
    $('formProposition').scrollIntoView({behavior:'smooth',block:'start'});}));
  }
  if(!mine.length)row(ul,'Aucune fiche technique proposée','Commencez à partir d’un équipement C2 intégré.');
  if(d.listePartielle)say('messageMesFiches','Liste limitée aux 100 premières fiches.');
 }
 async function reviewQueue(){const ul=$('fileRevue');ul.replaceChildren();let total=0;const permitted=roles.filter(r=>r.role!=='OCCUPANT').slice(0,30);
  for(const r of permitted){const d=await request(api+'/sites/'+r.siteId+'/a-verifier?grantId='+encodeURIComponent(r.id));
   for(const p of d.propositions||[]){total++;
    const li=row(ul,p.sousFamille+' · '+p.designation,[r.site,r.perimetre,p.famille,p.marque||'marque inconnue',p.modele||'modèle inconnu','v'+p.version].join(' · '));
    let sel=null;
    if(r.role==='COORDINATEUR'){
     try{const refs=await request('/api/energy/catalogue/v1/sites/'+r.siteId+'/references');
      const validated=(refs.references||[]).filter(x=>x.statut==='REFERENCE_INTERNE');
      if(validated.length){sel=document.createElement('select');sel.setAttribute('aria-label','Référence interne existante à rapprocher');
       sel.append(option('','Choisir un modèle validé à rapprocher'));for(const x of validated)sel.append(option(x.id,(x.marque||'')+' '+(x.modele||'')+' · '+x.sousFamille));li.append(sel);}
     }catch(_){/* Les références C3A restent privées au propriétaire. */}
    }
    async function decide(decision){if(decision==='RAPPROCHER'&&(!sel||!UUID.test(sel.value)))return say('messageRevue','Choisir une référence déjà validée.',true);
     if(!confirm(decision==='APPROUVER'?'Transmettre au supérieur, ou créer une candidate C3A si vous êtes coordinateur ?':decision==='RAPPROCHER'?'Rapprocher cette proposition du modèle sélectionné, sans lier de passeport ?':decision==='REFUSER'?'Refuser cette fiche ?':'Demander une correction ?'))return;
     try{const d=await request(api+'/sites/'+r.siteId+'/propositions/'+p.id+'/decision','POST',{
      reviewerGrantId:r.id,version:p.version,decision,referenceId:decision==='RAPPROCHER'?sel.value:null});
      say('messageRevue',d.statut==='EN_CATALOGUE'?'Candidate créée dans C3A : référencement humain encore obligatoire.':d.statut==='RAPPROCHEE'?'Référence rapprochée sans association de passeport.':'Décision '+d.statut+' enregistrée.');await refresh();
     }catch(e){say('messageRevue','Décision refusée : '+e.message,true);}}
    li.append(button(r.role==='COORDINATEUR'?'Créer candidate C3A':'Valider et transmettre',()=>decide('APPROUVER')),
     button('Demander correction',()=>decide('A_CORRIGER')),button('Refuser',()=>decide('REFUSER')));
    if(r.role==='COORDINATEUR'&&sel)li.append(button('Rapprocher du modèle choisi',()=>decide('RAPPROCHER')));
   }
   if(d.listePartielle)say('messageRevue','File partielle : 100 propositions par responsabilité.');
  }
  if(!total)row(ul,'Aucune fiche en attente de votre décision','Les autres branches ne sont pas visibles.');
  if(roles.length>30)say('messageRevue','30 responsabilités affichées : navigation étendue prévue pour les grands sites.');
 }
 async function refresh(){await loadMine();await reviewQueue();}
 $('formProposition').addEventListener('submit',async e=>{e.preventDefault();const b=$('envoyer');b.disabled=true;
  try{const f=fields();if(edit){await request(api+'/sites/'+edit.siteId+'/propositions/'+edit.id+'/corriger','POST',{version:edit.version,...f});
   say('messageForm','Correction renvoyée avec nouvelle version.');edit=null;$('annulerCorrection').hidden=true;b.textContent='Soumettre la fiche au responsable';}
   else{const x=equipments.find(z=>z.c2ProposalId===$('equipement').value);if(!x)throw Error('AUCUN_EQUIPEMENT_INTEGRE');
    if(!key)key=crypto.randomUUID();await request(api+'/sites/'+x.siteId+'/propositions','POST',{sourceGrantId:x.sourceGrantId,c2ProposalId:x.c2ProposalId,...f},key);
    key=null;say('messageForm','Proposition transmise à votre responsable.');}
   $('formProposition').reset();renderSource();await refresh();}
  catch(err){say('messageForm',err.message,true);}finally{b.disabled=!edit&&!equipments.length;}});
 if(tenant)$('retour').href='/energie-collecte.html'+q+(caseId?'&case='+encodeURIComponent(caseId):'');
 try{const ctx=await window.SATEER_CONTEXT_READY;if(!tenant||!((ctx.organisations||[]).some(o=>o.tenant_code===tenant)))throw Error('SESSION_OU_TENANT_NON_AUTORISE');
  const [e,g]=await Promise.all([request(api+'/mes-equipements-c2'),request('/api/energy/collab/v2/mes-responsabilites')]);
  equipments=e.equipements||[];roles=g.responsabilites||[];siteId=roles[0]?.siteId||equipments[0]?.siteId||null;
  say('contexte','Session privée active · '+tenant+' · '+roles.length+' responsabilité(s) et '+equipments.length+' équipement(s) C2 personnels intégrés.');
  renderSource();await refresh();
 }catch(e){say('contexte','Catalogue participatif non accessible : '+e.message,true);}
})();
