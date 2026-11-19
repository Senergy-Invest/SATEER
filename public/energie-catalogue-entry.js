'use strict';
// Petit lien optionnel : ne change aucun droit et réutilise le contexte de l'inventaire.
(function(){
 const a=document.getElementById('lienCatalogue');if(!a)return;
 const p=new URLSearchParams(window.location.search),tenant=p.get('tenant'),caseId=p.get('case');
 if(!tenant||!caseId)return;
 a.href='/energie-catalogue.html?tenant='+encodeURIComponent(tenant)+'&case='+encodeURIComponent(caseId);
 a.hidden=false;
})();
