"use strict";
(async function(){
 const p=new URLSearchParams(location.search),tenant=p.get('tenant');
 const status=document.getElementById('sponsorStatus'),choice=document.getElementById('sponsorAccord');
 if(!status||!choice||!tenant||!/^[A-Z][A-Z0-9_-]{0,49}$/.test(tenant)){
  if(status)status.textContent='Contexte Diaspora invalide.';return;
 }
 document.getElementById('sponsorRetour').href='/diaspora.html?'+new URLSearchParams({tenant});
 const endpoint='/api/diaspora/sponsor-consent?'+new URLSearchParams({tenant});
 async function call(method,body){const r=await fetch(endpoint,{method,credentials:'same-origin',cache:'no-store',
   headers:{Accept:'application/json','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.statut||'HTTP '+r.status);return d;}
 try{
  await window.SATEER_CONTEXT_READY;
  const r=await call('GET');choice.checked=r.actif===true;choice.disabled=false;
  status.textContent=choice.checked?'Accord actif. Tu peux le retirer à tout moment.':'Accord non donné : aucune notification sponsorisée.';
  choice.addEventListener('change',async()=>{
   const wanted=choice.checked;choice.disabled=true;status.textContent='Enregistrement de ta préférence…';
   try{const result=await call('PUT',{actif:wanted});choice.checked=result.actif===true;
    status.textContent=choice.checked?'Accord enregistré. Pas de notification rétroactive.':'Accord retiré. Plus aucune nouvelle notification sponsorisée.';}
   catch(e){choice.checked=!wanted;status.textContent='Échec de modification : '+e.message;}
   finally{choice.disabled=false;}
  });
 }catch(e){status.textContent='Préférences indisponibles : '+e.message;}
})();
