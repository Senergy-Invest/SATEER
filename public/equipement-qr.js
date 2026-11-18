'use strict';(async()=>{
 const token=new URLSearchParams(location.search).get('t');const label=document.getElementById('scanMessage'),link=document.getElementById('ouvrir');
 try{await window.SATEER_CONTEXT_READY;
  if(!/^[A-Za-z0-9_-]{27}$/.test(token||''))throw Error('CODE_INVALIDE');
  const r=await fetch('/api/energy/passports/scan/'+encodeURIComponent(token),{credentials:'same-origin',cache:'no-store'});
  const data=await r.json();if(!r.ok||data.statut!=='PASSEPORT_PAR_QR')throw Error('AUCUN_PASSEPORT_AUTORISE');
  label.textContent='Appareil retrouvé. Vous pouvez consulter votre fiche privée.';
  link.href='/fiche-equipement.html?tenant='+encodeURIComponent(data.tenantCode)+'&id='+encodeURIComponent(data.passeport.id);link.hidden=false;
 }catch(_){label.textContent='Aucune fiche accessible pour votre compte avec ce code. Vérifiez votre connexion.';}
})();
