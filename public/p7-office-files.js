/* SATEER P7 : espace de travail, pieces autorisees et delai INDICATIF */
(()=>{'use strict';
 const make=(tag,t)=>{const n=document.createElement(tag);if(t!=null)n.textContent=String(t);return n;};
 const qs=new URLSearchParams(location.search),org=qs.get('organisation'),tenant=qs.get('tenant');
 async function render(box,id){const url=(suffix)=>'/api/pilot-procedures/dossiers/'+encodeURIComponent(id)+'/'+suffix+'?'+new URLSearchParams({organisationId:org,tenant});
  const wrap=make('section');wrap.className='p7-office';wrap.append(make('h3','Pièces et suivi du dossier'));box.append(wrap);
  try{
   const responses=await Promise.all(['documents','suivi'].map(s=>fetch(url(s),{credentials:'same-origin',cache:'no-store'})));
   if(responses.some(r=>!r.ok))throw Error('Accès limité aux dossiers autorisés.');
   const [files,progress]=await Promise.all(responses.map(r=>r.json()));
   const d=progress.suivi;
   if(d){wrap.append(make('p',`Demande créée : ${new Date(d.date_creation).toLocaleDateString('fr-FR')} · Ancienneté : ${d.ageJours} jour(s)`));
    if(d.delaiIndicatifJours)wrap.append(make('p',`Délai indicatif configuré : ${d.delaiIndicatifJours} jours · Échéance indicative : ${new Date(d.echeanceIndicative).toLocaleDateString('fr-FR')}`));
    if(d.delaiIndicatifJours&&d.ageJours>d.delaiIndicatifJours&&d.statut!=='TRAITEE')wrap.append(make('strong','Attention : délai indicatif dépassé.'));}
   if(!files.documents.length){wrap.append(make('p','Aucune pièce jointe au dossier par le parcours guidé.'));return;}
   const list=make('ul');for(const f of files.documents){const li=make('li');const a=make('a',(f.nom||f.categorie)+' — Récupérer');a.href=url('documents/'+encodeURIComponent(f.id));a.setAttribute('download','');li.append(a);list.append(li);}wrap.append(list);
  }catch(e){wrap.append(make('p','Pièces indisponibles ou accès non autorisé.'));}
 }
 window.SATEER_P7_SHOW_CASE=render;
})();
