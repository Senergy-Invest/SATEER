'use strict';
(async function(){
 try{
  const p=new URLSearchParams(location.search),tenant=p.get('tenant'),id=p.get('case');
  const a=document.getElementById('lienHierarchie');if(!a||!tenant||!id)return;
  const ctx=await window.SATEER_CONTEXT_READY;
  if(!(ctx.organisations||[]).some(o=>o.tenant_code===tenant))return;
  a.href='/energie-responsabilites.html?tenant='+encodeURIComponent(tenant)+'&case='+encodeURIComponent(id);
  a.hidden=false;
 }catch(_){/* aucun lien d organisation si contexte indisponible */}
})();
