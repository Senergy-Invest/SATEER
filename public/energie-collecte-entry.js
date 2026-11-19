'use strict';
(async function(){
 try{
  const link=document.getElementById('allerCollecte'),p=new URLSearchParams(location.search),tenant=p.get('tenant');
  if(!link||!tenant)return;
  const ctx=await window.SATEER_CONTEXT_READY;
  if(!(ctx.organisations||[]).some(o=>o.tenant_code===tenant)){link.hidden=true;return;}
  const q='?tenant='+encodeURIComponent(tenant)+(p.get('case')?'&case='+encodeURIComponent(p.get('case')):'');
  link.href='/energie-collecte.html'+q;
 }catch(_){const link=document.getElementById('allerCollecte');if(link)link.hidden=true;}
})();
