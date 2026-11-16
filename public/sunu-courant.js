"use strict";
(async function(){
 const f=document.getElementById('energyCaseForm'),info=document.getElementById('contexte'),msg=document.getElementById('message');
 const liste=document.getElementById('cases'),listeStatut=document.getElementById('listeStatut');
 let tenant; let pendingKey=null;
 f.addEventListener('input',()=>{pendingKey=null;});
 try{
  const ctx=await window.SATEER_CONTEXT_READY;
  const urlTenant=new URLSearchParams(location.search).get('tenant');
  if(!urlTenant){info.textContent='Lien incomplet : un tenant Energy autorisé est nécessaire.';return;}
  if(!(ctx.organisations||[]).some(o=>o.tenant_code===urlTenant)){
   info.textContent='Votre compte n’est pas rattaché à ce tenant. Aucun dossier n’est accessible.';return;
  }
  tenant=urlTenant;info.textContent='Session active · tenant '+tenant+' · dossiers personnels en recette. Cette page ne confère aucun droit institutionnel.';
  f.hidden=false;
  await actualiser();
 }catch(e){info.textContent='Session ou contexte indisponible.';return;}
 async function actualiser(){
  listeStatut.textContent='Chargement des dossiers…';liste.replaceChildren();
  try{
   const resp=await fetch('/api/energy/cases?tenant='+encodeURIComponent(tenant),{credentials:'same-origin',cache:'no-store'});
   const data=await resp.json();if(!resp.ok)throw new Error(data.statut||'HTTP '+resp.status);
   for(const item of data.cases||[]){const li=document.createElement('li');li.textContent=item.nomSite+' — '+item.typeSite+' — '+item.statut+' · '+new Date(item.dateCreation).toLocaleString('fr-FR');liste.append(li);}
   listeStatut.textContent=(data.cases||[]).length+' dossier(s) personnels'+(data.autresDisponibles?' (liste limitée aux 50 plus récents)':'');
  }catch(e){listeStatut.textContent='Chargement impossible : '+e.message;}
 }
 f.addEventListener('submit',async function(ev){ev.preventDefault();
  const choix=[...f.querySelectorAll('input[name="besoins"]:checked')].map(i=>i.value);
  if(choix.length<1||choix.length>6){msg.textContent='Choisis entre 1 et 6 besoins.';return;}
  const fd=new FormData(f);const body={tenantCode:tenant,profil:fd.get('profil'),typeSite:fd.get('typeSite'),nomSite:fd.get('nomSite'),pays:String(fd.get('pays')||'').trim().toUpperCase(),alimentation:fd.get('alimentation'),compteur:fd.get('compteur'),besoins:choix,description:fd.get('description')||'',consentement:fd.get('consentement')==='on'};
  const button=document.getElementById('sendCase');button.disabled=true;msg.textContent='Enregistrement en cours…';
  // Clé conservée en mémoire tant que la saisie n'est pas modifiée : pas de création doublon en cas de retry.
  const key=pendingKey||(pendingKey=crypto.randomUUID());
  try{
   const resp=await fetch('/api/energy/cases?tenant='+encodeURIComponent(tenant),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(body),cache:'no-store'});
   const data=await resp.json();if(!resp.ok)throw new Error(data.statut||'HTTP '+resp.status);
   msg.textContent='Dossier enregistré en brouillon : '+data.id+' (sans transmission institutionnelle).';pendingKey=null;await actualiser();
  }catch(e){msg.textContent='Échec : '+e.message+' — aucun succès présumé.';}
  finally{button.disabled=false;}
 });
})();
