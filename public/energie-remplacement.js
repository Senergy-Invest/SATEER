'use strict';
/** E-METER-1E1. La verite des droits et des etats reste exclusivement dans les APIs. */
(async()=>{
 const el=x=>document.getElementById(x),tenant=new URLSearchParams(location.search).get('tenant');
 const oldApi='/api/energy/mesures/v1',newApi='/api/energy/remplacement/v1';
 let sites=[],points=[],siteId='',selected=null,lock=false,pending=null;
 const option=(label,value)=>{const o=document.createElement('option');o.textContent=label;o.value=value;return o;};
 const report=(msg,bad=false)=>{el('message').textContent=msg;el('message').classList.toggle('error',bad);};
 function clear(id,label='Choisir…'){el(id).replaceChildren(option(label,''));}
 function pointChange(){
  pending=null;selected=points.find(p=>p.id===el('point').value)||null;
  const old=selected?.compteurs?.filter(c=>c.actif)||[];
  if(!selected){el('ancien').textContent='Choisissez un point.';el('envoyer').disabled=true;return;}
  const historique=(selected.compteurs||[]).filter(c=>!c.actif).length;
  if(old.length!==1){el('ancien').textContent='Remplacement indisponible : ce point ne présente pas exactement un compteur actif.';el('envoyer').disabled=true;return;}
  const m=old[0];
  el('ancien').textContent='Compteur actuel : '+m.nom+'\nRegistres : '+(m.registres||[]).map(r=>r.code+' ['+r.unite+']').join(', ')+'\nCompteurs antérieurs conservés : '+historique+'\nLes relevés de chaque registre restent disponibles dans leur historique privé.';
  el('envoyer').disabled=false;
 }
 async function json(path,options={}){
  const resp=await fetch(path,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json',...(options.headers||{})},...options});
  const parsed=await resp.json().catch(()=>({}));if(!resp.ok)throw Error(parsed.statut||'HTTP_'+resp.status);return parsed;
 }
 async function load(){
  selected=null;pending=null;clear('point');el('point').disabled=true;el('envoyer').disabled=true;
  if(!siteId)return;
  const v=await json(oldApi+'/sites/'+encodeURIComponent(siteId)+'/points?tenant='+encodeURIComponent(tenant));
  points=v.points||[];
  for(const p of points)el('point').append(option(p.nom+' · '+p.typePoint,p.id));
  el('point').disabled=false;
  if(points.length===1){el('point').value=points[0].id;pointChange();}
  if(v.suivant)report('La liste est partielle : ce parcours n’affiche que la première page de points.',true);
  else report('Choisissez le point à remplacer. Aucun changement n’est effectué avant confirmation.');
 }
 el('point').addEventListener('change',pointChange);
 el('site').addEventListener('change',()=>{siteId=el('site').value;load().catch(e=>report(e.message,true));});
 for(const id of ['nom','tech','mode','serie','code','unite','motif','confirmer'])el(id).addEventListener('input',()=>{pending=null;});
 el('remplacement').addEventListener('submit',async e=>{
  e.preventDefault();if(lock)return;
  const old=selected?.compteurs?.filter(c=>c.actif)||[];
  if(!siteId||!selected||old.length!==1)return report('Sélectionnez un point avec un seul compteur actif.',true);
  if(!el('confirmer').checked||!el('remplacement').reportValidity())return report('Confirmation et données obligatoires manquantes.',true);
  const payload={confirmation:'CONFIRMER_REMPLACEMENT',motif:el('motif').value.trim(),nouveauCompteur:{
   nom:el('nom').value.trim(),technologie:el('tech').value,modeCommercial:el('mode').value,
   numeroSerie:el('serie').value.trim()||null,registreCode:el('code').value.trim(),registreUnite:el('unite').value}};
  const signature=JSON.stringify({siteId,pointId:selected.id,meterId:old[0].id,payload});
  if(!pending||pending.signature!==signature)pending={signature,key:crypto.randomUUID()};
  lock=true;el('envoyer').disabled=true;
  try{
   const path=newApi+'/sites/'+encodeURIComponent(siteId)+'/points/'+encodeURIComponent(selected.id)+
    '/compteurs/'+encodeURIComponent(old[0].id)+'/remplacer?tenant='+encodeURIComponent(tenant);
   const result=await json(path,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':pending.key},body:JSON.stringify(payload)});
   pending=null;el('confirmer').checked=false;
   await load();report('Compteur remplacé dans le registre de recette ; ancien compteur et relevés conservés. '+(result.nouveau===false?'Rejeu idempotent confirmé.':''));
  }catch(err){report('Remplacement refusé : '+err.message+'. Vérifiez le motif ou réessayez sans modifier les données.',true);}
  finally{lock=false;if(selected?.compteurs?.filter(c=>c.actif)?.length===1)el('envoyer').disabled=false;}
 });
 try{
  if(!tenant||!/^[A-Z][A-Z0-9_-]{0,49}$/.test(tenant))throw Error('TENANT_INVALIDE');
  el('retour').href='/energie-releves.html?tenant='+encodeURIComponent(tenant);
  el('versHistorique').href=el('retour').href;
  if(!window.SATEER_CONTEXT_READY)throw Error('SESSION_CORE_INDISPONIBLE');
  const ctx=await window.SATEER_CONTEXT_READY;
  if(!ctx.organisations?.some(x=>x.tenant_code===tenant))throw Error('TENANT_NON_AUTORISE');
  const r=await json(oldApi+'/sites?tenant='+encodeURIComponent(tenant));sites=r.sites||[];
  clear('site');for(const s of sites)el('site').append(option(s.nom+' · '+s.pays,s.id));el('site').disabled=false;
  if(sites.length){siteId=sites[0].id;el('site').value=siteId;await load();}else report('Aucun site propriétaire autorisé.',true);
  if(r.suivant)report('Attention : liste de sites partielle.',true);
 }catch(err){report('Accès indisponible : '+err.message,true);}
})();
