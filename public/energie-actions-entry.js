'use strict';
/* Lien additif sur C4C tranche 1 ; aucun chargement de données ni permission implicite. */
(()=>{const a=document.getElementById('ouvrirActions');if(!a)return;
 const tenant=new URLSearchParams(location.search).get('tenant');
 if(tenant&&/^[A-Z][A-Z0-9_-]{0,49}$/.test(tenant))a.href='/energie-actions.html?tenant='+encodeURIComponent(tenant);
 else a.hidden=true;
})();
