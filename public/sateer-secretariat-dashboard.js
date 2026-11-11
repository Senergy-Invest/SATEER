/* SATEER Bordeaux P335BR : page d'accueil propre au secrétariat de recette.
 * La décision d'accès appartient uniquement au serveur, jamais à l'UI.
 */
(() => {
  'use strict';
  const ORG = '70';
  const TENANT = 'P6V_3B5AC5AB9DB04657';
  const status = document.getElementById('secretariatStatus');
  const content = document.getElementById('secretariatWorkspace');
  const mailLink = document.getElementById('secretariatMailLink');
  if (!status || !content || !mailLink) return;
  const params = new URLSearchParams(location.search);
  const org = params.get('organisation') || ORG;
  const tenant = params.get('tenant') || TENANT;
  if (org !== ORG || tenant !== TENANT) {
    status.textContent = 'Contexte organisation / tenant invalide.';
    return;
  }
  Promise.resolve(window.SATEER_CONTEXT_READY).then(async () => {
    const query = new URLSearchParams({organisationId:ORG, tenant:TENANT});
    const response = await fetch('/api/bordeaux-email-demo/access?' + query, {
      credentials:'same-origin', cache:'no-store', headers:{Accept:'application/json'}
    });
    if (!response.ok) {
      status.textContent = response.status===403 ? 'Compte non habilité au secrétariat.' : 'Accès de recette indisponible (HTTP '+response.status+').';
      return;
    }
    const body = await response.json();
    if (body.statut !== 'ACCES_COURRIERS_DEMO_AUTORISE' || body.lectureSeule!==true) {
      status.textContent = 'Réponse serveur non reconnue.';
      return;
    }
    mailLink.href = '/email-secretariat-demo.html?' + new URLSearchParams({organisation:ORG,tenant:TENANT,retour:'secretariat'});
    content.hidden = false;
    status.textContent = 'Espace de recette autorisé — lecture seule.';
  }).catch(() => { status.textContent = 'Vérification de session impossible.'; });
})();
