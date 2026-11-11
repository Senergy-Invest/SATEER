/* SATEER P335BR : entrée secrétariat uniquement si autorisée par le serveur. */
(() => {
  'use strict';
  const section = document.getElementById('secretariatBordeauxSection');
  const link = document.getElementById('secretariatBordeauxLink');
  if (!section || !link) return;
  const tenant='P6V_3B5AC5AB9DB04657';
  Promise.resolve(window.SATEER_CONTEXT_READY).then(async () => {
    const query=new URLSearchParams({organisationId:'70',tenant});
    const r=await fetch('/api/bordeaux-email-demo/access?'+query, {
      credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}
    });
    if (!r.ok) return;
    const body=await r.json();
    if (body.statut!=='ACCES_COURRIERS_DEMO_AUTORISE' || body.lectureSeule!==true) return;
    link.href='/secretariat-bordeaux.html?'+new URLSearchParams({organisation:'70',tenant});
    section.hidden=false;
  }).catch(() => {});
})();
