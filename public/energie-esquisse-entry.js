'use strict';
/* Masquer le lien sur les anciennes instances C4A dont le moteur C4B n'est pas activé. */
(async()=>{const a=document.getElementById('ouvrirEsquisse');if(!a)return;
 const tenant=new URLSearchParams(location.search).get('tenant');if(!tenant)return;
 a.href='/energie-esquisse.html?tenant='+encodeURIComponent(tenant);
 const probe='/api/energy/esquisse/v1/sites/00000000-0000-4000-8000-000000000000/positions?tenant='+encodeURIComponent(tenant)+'&vue=PHYSIQUE';
 try{const r=await fetch(probe,{credentials:'same-origin',headers:{Accept:'application/json'}});
  if(!r.headers.get('content-type')?.includes('application/json'))return;
  const j=await r.json();if(r.status===404&&j.statut==='SITE_NON_AUTORISE')a.hidden=false;
 }catch(_){/* Pas de C4B ici, le lien reste masqué. */}
})();
