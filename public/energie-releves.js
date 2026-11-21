'use strict';
/** E-METER-1A : entrée privée, zéro calcul énergétique, zéro HTML injecté. */
(async()=>{
 const el=id=>document.getElementById(id);const tenant=new URLSearchParams(location.search).get('tenant');
 const api='/api/energy/mesures/v1';let sites=[],points=[],selectedSite=null,offset=0,lock=false;
 const status=(m,err=false)=>{el('etat').textContent=m;el('etat').classList.toggle('error',err);};
 const option=(label,value)=>{const o=document.createElement('option');o.value=value;o.textContent=label;return o;};
 const clearSelect=(id)=>{const x=el(id);x.replaceChildren(option('Choisir…',''));return x;};
 const request=async(method,path,data)=>{
  const headers={Accept:'application/json'};if(method!=='GET'){headers['Content-Type']='application/json';headers['Idempotency-Key']=crypto.randomUUID();}
  const r=await fetch(api+path+(path.includes('?')?'&':'?')+'tenant='+encodeURIComponent(tenant),
   {method,headers,credentials:'same-origin',cache:'no-store',...(method==='GET'?{}:{body:JSON.stringify(data)})});
  const v=await r.json().catch(()=>({}));if(!r.ok)throw Error(v.statut||'HTTP_'+r.status);return v;
 };
 const currentSite=()=>selectedSite?.id;
 const today=()=>{const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,19);};
 function fill(){
  const cp=clearSelect('compteur-point'),cm=clearSelect('registre-compteur'),r=clearSelect('releve-registre'),h=clearSelect('historique-registre');
  for(const p of points){cp.append(option(p.nom+' ('+p.typePoint+')',p.id));
   for(const m of p.compteurs||[]){if(m.actif)cm.append(option(p.nom+' · '+m.nom,m.id));
    for(const reg of m.registres||[]){const txt=p.nom+' · '+m.nom+' · '+reg.code+' ['+reg.unite+']';r.append(option(txt,reg.id));h.append(option(txt,reg.id));}
   }
  }
 }
 async function load(){if(!currentSite()){points=[];fill();return;}
  const x=await request('GET','/sites/'+encodeURIComponent(currentSite())+'/points');points=x.points;fill();
  status('Registre chargé : '+points.length+' point(s). Index déclaratifs non vérifiés.'+(x.suivant?' La liste des points est partielle.':''));
 }
 async function submit(form,build,endpoint,after){if(lock)return;lock=true;form.querySelector('button[type=submit]').disabled=true;
  try{if(!currentSite())throw Error('CHOISIR_SITE');const d=build();if(!d)throw Error('SELECTION_MANQUANTE');
   const r=await request('POST',endpoint(d),d.body);status('Enregistré · '+r.statut+(r.nouveau===false?' (déjà existant)':''));
   await load();if(after)after();
  }catch(e){status('Écriture refusée : '+e.message,true);}finally{lock=false;form.querySelector('button[type=submit]').disabled=false;}}
 const root=()=>'/sites/'+encodeURIComponent(currentSite());
 el('form-point').addEventListener('submit',e=>{e.preventDefault();submit(e.currentTarget,()=>({body:{nom:el('point-nom').value,energie:el('point-energie').value,typePoint:el('point-type').value}}),d=>root()+'/points');});
 el('form-compteur').addEventListener('submit',e=>{e.preventDefault();submit(e.currentTarget,()=>{const id=el('compteur-point').value;if(!id)return null;return {id,body:{nom:el('compteur-nom').value,technologie:el('compteur-tech').value,modeCommercial:el('compteur-mode').value,numeroSerie:el('compteur-numero').value||null,registreCode:el('compteur-code').value,registreUnite:el('compteur-unite').value}};},d=>root()+'/points/'+encodeURIComponent(d.id)+'/compteurs');});
 el('form-registre').addEventListener('submit',e=>{e.preventDefault();submit(e.currentTarget,()=>{const id=el('registre-compteur').value;if(!id)return null;return {id,body:{code:el('registre-code').value,unite:el('registre-unite').value}};},d=>root()+'/compteurs/'+encodeURIComponent(d.id)+'/registres');});
 el('form-releve').addEventListener('submit',e=>{e.preventDefault();submit(e.currentTarget,()=>{const id=el('releve-registre').value;if(!id)return null;return {id,body:{valeur:el('releve-valeur').value.replace(',','.'),releveLe:new Date(el('releve-date').value).toISOString(),observation:el('releve-note').value||null}};},d=>root()+'/registres/'+encodeURIComponent(d.id)+'/releves',()=>{status('Index enregistré comme déclaration à vérifier. Aucun kWh consommé calculé.');});});
 const historique=async()=>{const id=el('historique-registre').value;if(!id||!currentSite())return;
  try{const r=await request('GET',root()+'/registres/'+encodeURIComponent(id)+'/releves?offset='+offset);
   const body=el('historique');if(offset===0)body.replaceChildren();for(const item of r.releves){const tr=document.createElement('tr');
    for(const val of [new Date(item.releveLe).toLocaleString('fr-FR'),item.valeur,item.unite,'Déclaré · à vérifier',item.observation||'—']){const td=document.createElement('td');td.textContent=String(val);tr.append(td);}body.append(tr);}
   if(!r.releves.length&&offset===0){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=5;td.textContent='Aucun relevé enregistré.';tr.append(td);body.append(tr);}
   el('historique-suite').hidden=!r.suivant;status('Historique privé chargé. Aucun calcul automatique.');
  }catch(e){status('Historique indisponible : '+e.message,true);}};
 el('voir-historique').addEventListener('click',()=>{offset=0;historique();});
 el('historique-suite').addEventListener('click',()=>{offset+=50;historique();});
 el('rafraichir').addEventListener('click',()=>{load().catch(e=>status(e.message,true));});
 el('site').addEventListener('change',()=>{selectedSite=sites.find(s=>s.id===el('site').value)||null;el('historique').replaceChildren();offset=0;load().catch(e=>status(e.message,true));});
 try{
  if(!tenant||!/^[A-Z][A-Z0-9_-]{0,49}$/.test(tenant))throw Error('TENANT_INVALIDE');
  el('retour').href='/energie-pilotage.html?tenant='+encodeURIComponent(tenant);
  if(!window.SATEER_CONTEXT_READY)throw Error('SESSION_CORE_INDISPONIBLE');
  const ctx=await window.SATEER_CONTEXT_READY;if(!ctx.organisations?.some(x=>x.tenant_code===tenant))throw Error('TENANT_NON_AUTORISE');
  // Navigation vers 1B1 uniquement si sa propre API est activée pour cette session.
  fetch('/api/energy/facturation/v1/sites?tenant='+encodeURIComponent(tenant),
    {credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}})
    .then(r=>{if(r.ok){el('versFactures').href='/energie-factures.html?tenant='+encodeURIComponent(tenant);el('versFactures').hidden=false;}})
    .catch(()=>{});
  const data=await request('GET','/sites');sites=data.sites;
  const select=clearSelect('site');for(const s of sites)select.append(option(s.nom+' · '+s.pays,s.id));select.disabled=false;
  if(sites.length){selectedSite=sites[0];select.value=sites[0].id;el('releve-date').value=today();await load();}
  else status('Aucun site propriétaire accessible.',true);
  if(data.suivant)status('Première page des sites seulement : pagination à compléter avant usage multi-sites.',true);
 }catch(e){status('Accès indisponible : '+e.message,true);}
})();
