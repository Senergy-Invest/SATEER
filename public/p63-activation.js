/* P6.3.2: activation one-time link, clear rate-limit feedback, no automatic retries. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const params=new URLSearchParams(location.hash.slice(1)),token=params.get('invitation');
 history.replaceState(null,'','/activation-agent.html'); // Never leave the token in browser history.
 const status=$('sx-p63-activation-status'),form=$('sx-p63-activation-form'),existing=$('sx-p63-existing'),submit=$('sx-p63-activation-submit');
 let cooldownUntil=0;
 function info(t,bad=false){status.textContent=t;status.classList.toggle('sx-p63-error',bad);}
 if(!token||!/^[A-Za-z0-9_-]{43}$/.test(token)){
  form.hidden=true;existing.disabled=true;info('Lien d’invitation invalide ou absent. Demandez un nouveau lien au responsable du bureau.',true);return;
 }
 function remaining(){return Math.max(0,Math.ceil((cooldownUntil-Date.now())/1000));}
 function updateControls(){const seconds=remaining();submit.disabled=seconds>0;existing.disabled=seconds>0;
  if(seconds){const minutes=Math.ceil(seconds/60);submit.textContent=`Réessayer dans ${minutes} min`;}
  else submit.textContent='Activer mon accès';
 }
 async function post(path,body){
  if(remaining())throw Object.assign(new Error('TROP_DE_TENTATIVES'),{seconds:remaining()});
  const response=await fetch(path,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({invitation:token,...body})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
   const e=new Error(data.statut||`HTTP ${response.status}`);
   if(response.status===429){
    const header=Number(response.headers.get('Retry-After'));
    const indicated=Number(data.retryAfterSeconds);
    e.seconds=Number.isFinite(header)&&header>0?header:Number.isFinite(indicated)&&indicated>0?indicated:900;
   }
   throw e;
  }
  return data;
 }
 function failure(e,prefix){
  if(e.message==='TROP_DE_TENTATIVES'){
   const seconds=Number.isFinite(e.seconds)&&e.seconds>0?Math.ceil(e.seconds):900;
   cooldownUntil=Date.now()+seconds*1000;
   info(`Trop de tentatives d’activation. Réessayez dans environ ${Math.ceil(seconds/60)} minute(s). Ne rechargez pas la page en boucle. Si le lien est expiré ou révoqué, contactez le responsable du bureau.`,true);
   updateControls();return;
  }
  const explanations={
   INVITATION_INVALIDE_OU_EXPIREE:'Invitation expirée, déjà acceptée, révoquée ou e-mail différent de celui invité. Vérifiez l’adresse et demandez un nouveau lien si nécessaire.',
   ACTIVATION_INVALIDE:'Vérifiez l’e-mail et choisissez un mot de passe de 16 à 128 caractères, avec majuscule, minuscule et chiffre.',
   COMPTE_EXISTANT_CONNECTEZ_VOUS:'Ce compte existe déjà. Connectez-vous avec le compte invité, puis rouvrez le lien et choisissez « Accepter avec mon compte existant ».',
   AUTHENTIFICATION_REQUISE:'Connectez-vous dans cet onglet avec le compte invité, puis rouvrez le lien original.',
   CONNECTEZ_VOUS_AVEC_LE_COMPTE_INVITE:'Le compte connecté ne correspond pas à l’e-mail invité. Reconnectez-vous avec le bon compte.'
  };
  info(explanations[e.message]||prefix+e.message,true);
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();const email=$('sx-p63-email').value.trim().toLowerCase(),password=$('sx-p63-password').value;
  // Match the backend before POST to avoid wasting limited attempts.
  if(password.length<16||password.length>128||!/[a-z]/.test(password)||!/[A-Z]/.test(password)||!/[0-9]/.test(password)){
   info('Mot de passe : entre 16 et 128 caractères, avec majuscule, minuscule et chiffre.',true);return;
  }
  submit.disabled=true;info('Activation en cours…');
  try{await post('/api/staff-invitations/activate-new',{email,motDePasse:password});form.hidden=true;existing.hidden=true;info('Compte activé et affecté au bureau. Vous pouvez vous connecter avec votre e-mail et votre mot de passe.');$('sx-p63-login').hidden=false;}
  catch(e){failure(e,'Activation refusée : ');}
  finally{updateControls();}
 });
 existing.addEventListener('click',async()=>{
  existing.disabled=true;info('Vérification de votre session SATEER…');
  try{await post('/api/staff-invitations/activate-existing',{});form.hidden=true;existing.hidden=true;info('Invitation acceptée. Votre affectation sera visible après reconnexion.');$('sx-p63-login').hidden=false;}
  catch(e){failure(e,'Acceptation refusée : ');}
  finally{updateControls();}
 });
 // UI countdown only; never automatically resubmit a privileged action.
 setInterval(()=>{if(remaining()>0){updateControls();}else if(cooldownUntil){cooldownUntil=0;updateControls();info('Vous pouvez réessayer votre activation.',false);}},30000);
})();
