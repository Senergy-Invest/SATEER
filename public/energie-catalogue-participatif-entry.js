'use strict';
// La navigation n'est pas une habilitation : Core/Auth et les grants C1 restent souverains.
(function(){const a=document.getElementById('lienC3B');if(!a)return;
 const p=new URLSearchParams(location.search),tenant=p.get('tenant'),caseId=p.get('case');
 if(!tenant){a.hidden=true;return;}
 a.href='/energie-catalogue-participatif.html?tenant='+encodeURIComponent(tenant)+(caseId?'&case='+encodeURIComponent(caseId):'');
})();
