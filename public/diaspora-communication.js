"use strict";
(async function(){
 const find=id=>document.getElementById(id);
 const orgSelect=find('dcOrg'), status=find('dcStatus'),sourceSection=find('dcSourceSection'),reviewSection=find('dcReviewSection');
 const param=new URLSearchParams(location.search),tenant=param.get('tenant');
 if(!tenant || !/^[A-Z][A-Z0-9_-]{0,49}$/.test(tenant)) {status.textContent='Tenant invalide : ouvrez cette page depuis Diaspora.';return;}
 find('dcDiasporaLink').href='/diaspora.html?'+new URLSearchParams({tenant});
 find('dcGeoLink').href='/diaspora-zones-professionnelles.html?'+new URLSearchParams({tenant});
 const make=(tag,txt,cls)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(txt!=null)x.textContent=String(txt);return x;};
 const call=async(url,options={})=>{const response=await fetch(url,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json', 'Content-Type':'application/json'},...options});
  const body=await response.json().catch(()=>({}));if(!response.ok)throw Error(body.statut||('HTTP '+response.status));return body;};
 let organisations=[];
 try { const c=await window.SATEER_CONTEXT_READY;
  organisations=(Array.isArray(c.organisations)?c.organisations:[]).filter(o=>o.tenant_code===tenant && Number.isSafeInteger(Number(o.id)) && Number(o.id)>0);
  orgSelect.replaceChildren(make('option','Choisir une organisation'));
  for(const o of organisations){const opt=make('option',o.nom+' · '+o.type);opt.value=String(o.id);orgSelect.append(opt);}
  if(!organisations.length){status.textContent='Aucune organisation accessible dans ce tenant.';return;}
  const suggested=param.get('organisation');if(organisations.some(o=>String(o.id)===suggested))orgSelect.value=suggested;
  if(!orgSelect.value && organisations.length===1)orgSelect.value=String(organisations[0].id);
  status.textContent=orgSelect.value?'Chargement du contexte professionnel…':'Choisis une organisation pour vérifier tes droits.';
 }catch(e){status.textContent='Contexte professionnel indisponible : '+e.message;return;}
 async function load(){
  const selected=organisations.find(o=>String(o.id)===orgSelect.value);
  sourceSection.hidden=true;reviewSection.hidden=true;find('dcDirectorySection').hidden=true;
  find('dcGeoSection').hidden=true;find('dcRoleText').hidden=true;
  if(!selected){status.textContent='Sélectionne une organisation.';return;}
  const base='/api/organisations/'+encodeURIComponent(selected.id)+'/diaspora/';
  const q='?'+new URLSearchParams({tenant});const errors=[];let hasAccess=false;
  try{
   const data=await call(base+'source-publications'+q);hasAccess=true;sourceSection.hidden=false;
   find('dcGeoSection').hidden=false;
   find('dcGeoLink').href='/diaspora-zones-professionnelles.html?'+new URLSearchParams({tenant,organisation:String(selected.id)});
   const container=find('dcSourceList');container.replaceChildren();
   if(!data.publications.length)container.append(make('p','Aucune publication disponible.','dc-info'));
   for(const p of data.publications){const card=make('article',null,'dc-card');card.append(make('strong',p.titre),make('p',p.categorie+' · '+p.audienceType+' · '+p.etatDiffusion,'dc-meta'));
    const eligible=p.audienceType==='TOUS' && p.etatDiffusion==='NON_DEMANDEE' && p.mediaCount===0;
    if(eligible){const acts=make('div',null,'dc-actions'),btn=make('button','Soumettre au Bureau SATEER');
      btn.type='button';btn.addEventListener('click',async()=>{btn.disabled=true;try{await call(base+'submit/'+encodeURIComponent(p.id)+q,{method:'POST',body:JSON.stringify({tenantCode:tenant})});status.textContent='Publication '+p.id+' soumise pour revue.';await load();}catch(e){btn.disabled=false;status.textContent='Soumission refusée : '+e.message;}});
      acts.append(btn);card.append(acts);
    }else card.append(make('p','Aucune nouvelle soumission possible dans cet état ou cette audience.','dc-info'));
    if(p.etatDiffusion==='NON_DEMANDEE' && p.audienceType==='TOUS' && p.mediaCount===0){
      const mark=make('button',p.sponsorisee?'Retirer le marquage sponsorisé':'Déclarer sponsorisée');
      mark.type='button';mark.addEventListener('click',async()=>{
        if(!window.confirm('Confirmer le marquage commercial de cette publication de ton organisation ?'))return;
        mark.disabled=true;
        try{await call(base+'sponsorisation/'+p.id+q,{method:'PUT',body:JSON.stringify({sponsorise:!p.sponsorisee})});await load();}
        catch(e){mark.disabled=false;status.textContent='Marquage refusé : '+e.message;}});
      const panel=make('div',null,'dc-actions');panel.append(mark);card.append(panel);
    }
    container.append(card);
   }
  }catch(e){errors.push('Soumission : '+e.message);}
  if(selected.type==='SATEER')try{
   const data=await call(base+'review-queue'+q);hasAccess=true;reviewSection.hidden=false;
   const container=find('dcReviewList');container.replaceChildren();if(!data.publications.length)container.append(make('p','Aucune publication en attente.','dc-info'));
   for(const p of data.publications){const card=make('article',null,'dc-card');card.append(make('strong',p.titre),make('p','Source : '+p.organisation+' · '+p.organisationType+' · Audience : '+p.audienceType+' · Zone notification : '+(p.geoTerritoryName||'Générale')+' · '+(p.sponsorisee?'Sponsorisé · Sponsor : '+p.sponsorNom:'Non sponsorisé'),'dc-meta'),make('p',p.contenu));
    const acts=make('div',null,'dc-actions');
    if(p.audienceType==='TOUS'){
      const yes=make('button','Approuver la diffusion');yes.type='button';yes.addEventListener('click',async()=>{
        if(!window.confirm('Approuver la diffusion générale de cette publication dans Diaspora ?'))return;
        yes.disabled=true;try{await call(base+'approve/'+p.id+q,{method:'POST',body:JSON.stringify({tenantCode:tenant})});status.textContent='Publication '+p.id+' approuvée.';await load();}catch(e){yes.disabled=false;status.textContent='Approbation refusée : '+e.message;}});acts.append(yes);
    }else card.append(make('p','Audience non autorisée pour D2A : rejet motivé uniquement.','dc-meta'));
    const motif=make('textarea');motif.placeholder='Motif de rejet obligatoire (10 caractères minimum)';motif.maxLength=2000;
    const no=make('button','Rejeter','dc-reject');no.type='button';no.addEventListener('click',async()=>{no.disabled=true;try{await call(base+'reject/'+p.id+q,{method:'POST',body:JSON.stringify({tenantCode:tenant,motif:motif.value})});status.textContent='Publication '+p.id+' rejetée.';await load();}catch(e){no.disabled=false;status.textContent='Rejet refusé : '+e.message;}});
    acts.append(no);card.append(motif,acts);container.append(card);
   }
  }catch(e){errors.push('Revue : '+e.message);}
  // D2B-A : verification volontaire des associations, strictement bureau SATEER.
  if(selected.type==='SATEER')try{
    const data=await call(base+'association-directory'+q);hasAccess=true;
    const dir=find('dcDirectorySection'),list=find('dcDirectoryList');
    dir.hidden=false;list.replaceChildren();
    if(!data.associations.length)list.append(make('p','Aucune association dans ce tenant.','dc-info'));
    for(const a of data.associations){
      const card=make('article',null,'dc-card');
      card.append(make('strong',a.nom),make('p','Statut SATEER : '+a.statut,'dc-meta'));
      const next=a.statut==='VERIFIEE'?'SUSPENDUE':'VERIFIEE';
      const btn=make('button',next==='VERIFIEE'?'Vérifier cette association':'Suspendre la vérification');btn.type='button';
      btn.addEventListener('click',async()=>{
        if(!window.confirm('Confirmer le statut '+next+' pour '+a.nom+' ?'))return;
        btn.disabled=true;
        try{await call(base+'association-directory/'+encodeURIComponent(a.id)+q,{method:'POST',body:JSON.stringify({statut:next})});
          status.textContent='Statut associatif enregistré : '+next;await load();}
        catch(e){btn.disabled=false;status.textContent='Modification refusée : '+e.message;}
      });
      const acts=make('div',null,'dc-actions');acts.append(btn);card.append(acts);list.append(card);
    }
  }catch(e){errors.push('Répertoire : '+e.message);}
  const role=find('dcRoleText');role.hidden=!hasAccess;
  if(hasAccess)role.textContent=selected.type==='SATEER' && !reviewSection.hidden?'Bureau de communication SATEER':'Organisation émettrice';
  status.textContent=hasAccess?'Accès vérifiés pour '+selected.nom+(errors.length?' · '+errors.join(' ; '):''):'Aucune fonction autorisée pour '+selected.nom+'. '+errors.join(' ; ');
 }
 orgSelect.addEventListener('change',load);
 if(orgSelect.value)await load();
})();
