"use strict";
/** D2B-A - preferences volontaires et fil personnel ; aucun secret navigateur. */
(async function(){
 const q=new URLSearchParams(window.location.search),tenant=q.get('tenant');
 const box=document.getElementById('diasporaSubscriptionControls'),status=document.getElementById('diasporaSubscriptionStatus');
 const followed=document.getElementById('diasporaFollowedFeed'),followedStatus=document.getElementById('diasporaFollowedStatus');
 if(!box||!status||!followed||!followedStatus||!tenant||!/^[A-Z][A-Z0-9_-]{0,49}$/.test(tenant))return;
 const param='?'+new URLSearchParams({tenant});
 function node(tag,txt,className){const el=document.createElement(tag);if(txt!=null)el.textContent=String(txt);if(className)el.className=className;return el;}
 async function call(url,options={}){
  const response=await fetch(url,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json','Content-Type':'application/json'},...options});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.statut||('HTTP '+response.status));return data;
 }
 async function loadFollowed(){
  const result=await call('/api/diaspora/followed-feed'+param);
  followed.replaceChildren();
  const pubs=result.publications||[];
  followedStatus.textContent=pubs.length?pubs.length+' publication(s) correspondant à tes abonnements.':'Aucune information suivie actuellement.';
  for(const pub of pubs){
    const card=node('article',null,'diaspora-card');card.id='publication-'+Number(pub.id);
    card.append(node('p',(pub.sponsorisee?'Communication sponsorisée · ':'')+(pub.categorie||'Information'),'diaspora-tag'),node('h3',pub.titre||'Information'),
      node('p','Source : '+(pub.organisation||'Non renseignée'),'diaspora-meta'),node('p',pub.contenu||''));
    followed.append(card);
  }
 }
 async function load(){
  status.textContent='Chargement de tes abonnements…';box.replaceChildren();
  const data=await call('/api/diaspora/subscriptions'+param);
  const current=Array.isArray(data.abonnements)?data.abonnements:[];
  const themes=Array.isArray(data.themes)?data.themes:[];
  const associations=Array.isArray(data.associations)?data.associations:[];
  async function checkboxItem(label,endpoint,checked){
    const row=node('label',null,'diaspora-optin-row');
    const check=document.createElement('input');check.type='checkbox';check.checked=checked;
    row.append(check,node('span',label));
    check.addEventListener('change',async()=>{
      check.disabled=true;status.textContent='Enregistrement de ton choix…';
      try{await call(endpoint+param,{method:'PUT',body:JSON.stringify({actif:check.checked})});
        status.textContent='Préférence enregistrée. Aucune notification n’est imposée.';await loadFollowed();}
      catch(e){check.checked=!check.checked;status.textContent='Impossible de modifier : '+e.message;}
      finally{check.disabled=false;}
    });
    box.append(row);
  }
  box.append(node('h3','Thèmes qui m’intéressent'));
  for(const theme of themes){
    const active=current.some(x=>x.themeCode===theme&&x.actif);
    await checkboxItem(theme.replaceAll('_',' '),'/api/diaspora/subscriptions/theme/'+encodeURIComponent(theme),active);
  }
  box.append(node('h3','Associations vérifiées par le Bureau SATEER'));
  if(!associations.length)box.append(node('p','Aucune association vérifiée dans ce périmètre pour le moment.','diaspora-note'));
  for(const a of associations){
    const active=current.some(x=>Number(x.associationId)===Number(a.id)&&x.actif);
    await checkboxItem(a.nom+(a.statut==='VERIFIEE'?'':' (vérification suspendue)'),'/api/diaspora/subscriptions/association/'+encodeURIComponent(a.id),active);
  }
  status.textContent='Choisis librement tes thèmes et associations. Désabonnement possible à tout moment.';
  await loadFollowed();
 }
 try{await window.SATEER_CONTEXT_READY;await load();}
 catch(e){status.textContent='Abonnements indisponibles : '+e.message;followedStatus.textContent='Fil suivi indisponible.';}
})();
