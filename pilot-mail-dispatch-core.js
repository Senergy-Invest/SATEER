'use strict';
/**
 * SATEER P335BW - noyau métier PUR de décision pour les courriers.
 * Ne lit aucune base de données, n'envoie aucun e-mail, n'affecte aucun dossier.
 * Le moteur appelant doit fournir des preuves vérifiées (catalogue, identité,
 * habilitations du bureau, consignes de l'institution). Sorties descriptives.
 */
const INTENTIONS = new Set(['INFORMATION','DEMANDE','SECRETARIAT']);
const RESULTATS = Object.freeze({
  HUMAIN:'SECRETARIAT_INTERVENTION',
  BROUILLON:'ASSISTANT_BROUILLON_A_VALIDER',
  AUTO:'ASSISTANT_ENVOI_AUTORISABLE',
  BUREAU:'BUREAU_A_TRAITER',
  PIECES:'BUREAU_A_COMPLETER',
});
function calculerDestination(entree) {
  const e=entree && typeof entree==='object'?entree:{};
  const intention=String(e.intention||'SECRETARIAT');
  const human=(raison)=>({destination:RESULTATS.HUMAIN,raison,execution:false});
  if(!INTENTIONS.has(intention)) return human('INTENTION_INCONNUE');
  if(e.exception===true || intention==='SECRETARIAT') return human('AMBIGUITE_OU_EXCEPTION');
  // Pas de réponse sans fiche active explicitement validée.
  if(intention==='INFORMATION') {
    if(e.ficheValidee!==true || e.modeleApprouve!==true) return human('SOURCE_OFFICIELLE_OU_MODELE_NON_APPROUVE');
    if(e.automatisationInformation===true && e.autorisationEnvoi===true && e.controleDestinataire===true) {
      // Autorisable ≠ envoyé : un exécuteur dédié vérifie et audite l'acte.
      return {destination:RESULTATS.AUTO,raison:'CONDITIONS_VERIFIEES',execution:false};
    }
    return {destination:RESULTATS.BROUILLON,raison:'VALIDATION_HUMAINE_REQUISE',execution:false};
  }
  // Pas de déduction d'un bureau à partir du seul mot « passeport ».
  if(e.categorieNonAmbigue!==true || e.bureauHabilite!==true || e.regleEmailActive!==true)
    return human('ROUTAGE_EMAIL_NON_HABILITE');
  if(e.identiteVerifiee!==true || e.piecesVerifiees!==true || e.consentementVerifie!==true) {
    return {destination:RESULTATS.PIECES,raison:'DOSSIER_A_COMPLETER_OU_VERIFIER',execution:false,bureauId:e.bureauId||null};
  }
  return {destination:RESULTATS.BUREAU,raison:'ORIENTATION_POSSIBLE_APRES_CONTROLES',execution:false,bureauId:e.bureauId||null};
}
/**
 * Affectation AUTO : plus faible charge pondérée/capacité, uniquement parmi les
 * agents actifs et habilités du bureau. Aucun changement de dossier.
 */
function proposerAgent(agents, options={}) {
  const bureauId=Number(options.bureauId);
  if(!Number.isSafeInteger(bureauId)||bureauId<=0) return {etat:'BUREAU_INVALIDE',execution:false};
  const eligible=(Array.isArray(agents)?agents:[]).filter(a=>
    Number(a.bureauId)===bureauId && a.actif===true && a.habilite===true && a.absent!==true &&
    Number.isFinite(Number(a.capacite)) && Number(a.capacite)>0 &&
    Number.isFinite(Number(a.charge)) && Number(a.charge)>=0 &&
    Number.isSafeInteger(Number(a.personneId)) && Number(a.personneId)>0);
  if(options.mode==='MANUEL') {
    const id=Number(options.personneId);
    const agent=eligible.find(a=>Number(a.personneId)===id);
    return agent?{etat:'PROPOSITION_MANUELLE',personneId:id,execution:false}: {etat:'AGENT_MANUEL_NON_HABILITE',execution:false};
  }
  if(options.mode!=='AUTO') return {etat:'MODE_INCONNU',execution:false};
  if(eligible.length===0)return {etat:'AUCUN_AGENT_ELIGIBLE',execution:false};
  eligible.sort((a,b)=>{
    const diff=Number(a.charge)/Number(a.capacite)-Number(b.charge)/Number(b.capacite);
    return Math.abs(diff)>1e-12?diff:Number(a.personneId)-Number(b.personneId);
  });
  const x=eligible[0];
  return {etat:'PROPOSITION_AUTOMATIQUE',personneId:Number(x.personneId),charge:Number(x.charge),capacite:Number(x.capacite),execution:false};
}
function durees(dossiers) {
  // Horodatages fournis par le moteur de workflow. Ne pas assimiler clôture à réponse.
  const xs=Array.isArray(dossiers)?dossiers:[];
  const sec=(a,b)=>a&&b&&Number.isFinite(Date.parse(a))&&Number.isFinite(Date.parse(b))&&Date.parse(b)>=Date.parse(a)?(Date.parse(b)-Date.parse(a))/1000:null;
  const parcours=xs.map(d=>({
    dossierId:d.id,
    receptionVersOrientationSecondes:sec(d.recuLe,d.orienteLe),
    orientationVersPriseEnChargeSecondes:sec(d.orienteLe,d.prisEnChargeLe),
    priseEnChargeVersPremiereReponseSecondes:sec(d.prisEnChargeLe,d.premiereReponseLe),
    receptionVersRemiseSecondes:sec(d.recuLe,d.remisLe),
  }));
  const avg=k=>{const n=parcours.map(x=>x[k]).filter(x=>x!==null);return n.length?Math.round(n.reduce((a,b)=>a+b,0)/n.length):null};
  return {nombreDossiers:parcours.length,parcours,moyennesSecondes:{
    receptionVersOrientation:avg('receptionVersOrientationSecondes'),
    orientationVersPriseEnCharge:avg('orientationVersPriseEnChargeSecondes'),
    priseEnChargeVersPremiereReponse:avg('priseEnChargeVersPremiereReponseSecondes'),
    receptionVersRemise:avg('receptionVersRemiseSecondes')
  }};
}
module.exports=Object.freeze({calculerDestination,proposerAgent,durees,RESULTATS});
