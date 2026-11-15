"use strict";
/** Parcours SOURCE — la session et les droits sont controles par le Core en HTTP. */
(async function(){
 const $=id=>document.getElementById(id),q=new URLSearchParams(location.search),tenant=q.get('tenant');
 const org=$('d3Organisation'),button=$('d3Submit'),status=$('d3Status');
 if(!tenant||!/^[A-Z][A-Z0-9_-]{0,49}$/.test(tenant)){status.textContent='Contexte Diaspora invalide.';return;}
 const base='/diaspora-communication.html?'+new URLSearchParams({tenant});$('d3Back').href=base;
 const query='?'+new URLSearchParams({tenant});
 let authorised=new Set();
 const fetchJson=async(url,options={})=>{
  const r=await fetch(url,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json','Content-Type':'application/json'},...options});
  const x=await r.json().catch(()=>({}));if(!r.ok)throw Error(x.statut||('HTTP '+r.status));return x;
 };
 try{
  const context=await window.SATEER_CONTEXT_READY;
  const associations=(Array.isArray(context?.organisations)?context.organisations:[])
    .filter(x=>x.tenant_code===tenant&&x.type==='ASSOCIATION'&&Number.isSafeInteger(Number(x.id))&&Number(x.id)>0);
  org.replaceChildren();
  const empty=document.createElement('option');empty.value='';empty.textContent='Choisir une association';org.append(empty);
  for(const a of associations){const opt=document.createElement('option');opt.value=String(a.id);opt.textContent=a.nom;org.append(opt);}
  if(associations.length===1)org.value=String(associations[0].id);
  const suggested=q.get('organisation');if(associations.some(a=>String(a.id)===suggested))org.value=suggested;
  if(!associations.length){status.textContent='Aucune association rattachée à ce compte.';return;}
  async function check(){
   button.disabled=true;$('d3Links').hidden=true;
   if(!org.value){status.textContent='Sélectionner l’association émettrice.';return;}
   status.textContent='Vérification du droit de communication…';
   try{
    await fetchJson('/api/organisations/'+encodeURIComponent(org.value)+'/diaspora/source-publications'+query);
    authorised.add(org.value);button.disabled=false;status.textContent='Association autorisée. Publication non soumise au Bureau.';
   }catch(e){authorised.delete(org.value);status.textContent='Création non autorisée : '+e.message;}
  }
  org.addEventListener('change',check);await check();
  $('d3Form').addEventListener('submit',async e=>{
   e.preventDefault();const id=org.value;if(!id||!authorised.has(id))return;
   button.disabled=true;$('d3Links').hidden=true;status.textContent='Création de la publication…';
   try{
    const body={tenantCode:tenant,titre:$('d3Titre').value.trim(),contenu:$('d3Contenu').value.trim(),categorie:$('d3Categorie').value};
    const created=await fetchJson('/api/organisations/'+encodeURIComponent(id)+'/diaspora/publications'+query,
      {method:'POST',body:JSON.stringify(body)});
    if(created.statut!=='DIASPORA_PUBLICATION_CREEE'||!Number.isSafeInteger(Number(created.publicationId)))throw Error('REPONSE_CREATION_INVALIDE');
    status.textContent='Publication n°'+created.publicationId+' créée (NON_DEMANDEE). Choisis une zone, puis soumets-la au Bureau dans l’espace professionnel.';
    $('d3Geo').href='/diaspora-zones-professionnelles.html?'+new URLSearchParams({tenant,organisation:id});
    $('d3Diffusion').href='/diaspora-communication.html?'+new URLSearchParams({tenant,organisation:id});
    $('d3Links').hidden=false;$('d3Form').reset();org.value=id;
   }catch(error){status.textContent='Création refusée : '+error.message;}
   finally{button.disabled=false;}
  });
 }catch(error){status.textContent='Session Diaspora indisponible : '+error.message;}
})();
