"use strict";
/** A5 : présentation d'agrégats; aucune inférence de droit ni rendu HTML brut. */
(function(root){
  function afficherVue(doc,zone,vue){
    if(!vue||typeof vue!=='object'||!vue.demandes||!vue.publications||!Array.isArray(vue.unites))
      throw new TypeError('PROJECTION_INVALIDE');
    const el=(tag,klass,content)=>{
      const x=doc.createElement(tag);if(klass)x.className=klass;
      if(content!==undefined)x.textContent=String(content);return x;
    };
    const entiers=[['total','Demandes reçues'],['nouvelles','Nouvelles'],
      ['enCours','En cours'],['traitees','Traitées'],['sansDestination','Sans bureau de destination'],
      ['urgentesOuvertes','Urgentes ouvertes']];
    const grille=el('div','ambassade-operations-grid');
    for(const [champ,label] of entiers){
      const v=vue.demandes[champ];
      if(!Number.isSafeInteger(v)||v<0)throw new TypeError('METRIQUE_INVALIDE');
      const card=el('article','ambassade-operations-metric');
      card.append(el('strong','',v),el('span','',label));grille.append(card);
    }
    const publiees=vue.publications.publiees;
    if(!Number.isSafeInteger(publiees)||publiees<0)throw new TypeError('PUBLICATIONS_INVALIDES');
    const annonces=el('p','',`${publiees} publication(s) publiées par cette ambassade.`);
    const sousTitre=el('h3','','Bureaux configurés dans cette ambassade');
    const bureaux=el('ul','ambassade-operations-units');
    for(const u of vue.unites){
      if(!u||typeof u.nom!=='string'||u.nom.length>255)throw new TypeError('UNITE_INVALIDE');
      bureaux.append(el('li','',u.nom));
    }
    if(!vue.unites.length)bureaux.append(el('li','','Aucun bureau actif configuré.'));
    const aide=el('p','ambassade-operations-caution',
      'Les chiffres concernent uniquement les demandes de cette ambassade. ' +
      'Aucune orientation automatique vers un consulat n’est activée.');
    zone.replaceChildren(grille,annonces,sousTitre,bureaux,aide);
  }
  async function charger({organisationId,tenantCode,fetcher=root.fetch,doc=root.document}={}){
    const statut=doc.getElementById('ambassadeOperationsStatut');
    const zone=doc.getElementById('ambassadeOperationsContenu');
    if(!statut||!zone)return;
    zone.replaceChildren();
    statut.textContent='Lecture des indicateurs autorisés…';
    const route='/api/ambassade-operations/'+encodeURIComponent(organisationId)+'/summary?'+
      new URLSearchParams({tenant:tenantCode});
    try{
      const response=await fetcher(route,{method:'GET',credentials:'same-origin',cache:'no-store',
        headers:{Accept:'application/json'}});
      if(response.status===403){statut.textContent='Indicateurs non habilités pour ce compte.';return;}
      if(response.status===404){statut.textContent='Vue opérationnelle non activée sur cette instance.';return;}
      if(!response.ok)throw new Error('INDICATEURS_INDISPONIBLES');
      const data=await response.json();
      if(data.statut!=='OPERATIONS_AMBASSADE'||Number(data.vue?.organisationId)!==Number(organisationId)||
        data.vue?.tenantCode!==tenantCode)throw new Error('REPONSE_INVALIDE');
      afficherVue(doc,zone,data.vue);
      statut.textContent='Indicateurs de cette ambassade, selon vos permissions.';
    }catch(e){zone.replaceChildren();statut.textContent='Indicateurs indisponibles. Aucune valeur inventée.';}
  }
  const api=Object.freeze({afficherVue,charger});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root&&typeof root==='object')root.SATEER_AMBASSADE_OPERATIONS=api;
})(typeof window!=='undefined'?window:globalThis);
