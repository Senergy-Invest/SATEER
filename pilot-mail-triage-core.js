'use strict';
/**
 * P335BX - decisions DE FILE uniquement, pour des messages DEMO_SYNTHETIQUE.
 * Ne donne jamais l'autorisation de creer un dossier, router, repondre ou envoyer.
 * Le non-traite reste visible au Vice-Consul. Defaut: intervention humaine.
 */
const intent = require('./public/sateer-mail-intent-core');
const dispatch = require('./pilot-mail-dispatch-core');
const CATEGORIES = Object.freeze(['PASSEPORT','ETAT_CIVIL','CARTE_CONSULAIRE']);
const MODES = Object.freeze(['MANUEL','PROPOSITION']);
const FILES = Object.freeze({
  SECRETARIAT:'SECRETARIAT_INTERVENTION',
  ASSISTANT:'ASSISTANT_A_VERIFIER',
  BUREAU:'BUREAU_A_VERIFIER'
});
function reglePour(rules,categorie) {
  if(!CATEGORIES.includes(categorie))return null;
  return (Array.isArray(rules)?rules:[]).find(r=>r.categorie===categorie && r.actif===true && r.mode==='PROPOSITION')||null;
}
function orienterVirtuellement(message,rules=[]) {
  const a=intent.qualifier(message?.objet,message?.texte);
  const rule=reglePour(rules,a.categorie);
  let file=FILES.SECRETARIAT, motif='INTENTION_AMBIGUE_OU_CONFIGURATION_MANUELLE', bureauId=null;
  if(a.intention==='INFORMATION' && rule) {
    file=FILES.ASSISTANT;motif='RECHERCHE_SOURCE_OFFICIELLE_ET_MODELE_A_VALIDER';
  } else if(a.intention==='DEMANDE' && rule && rule.bureauValide===true && Number.isSafeInteger(Number(rule.bureauId)) && Number(rule.bureauId)>0) {
    file=FILES.BUREAU;motif='CONTROLES_IDENTITE_PIECES_CONSENTEMENT_NON_EFFECTUES';bureauId=Number(rule.bureauId);
  } else if(a.intention==='DEMANDE' && rule) {
    motif='AUCUN_BUREAU_HABILITE';
  }
  // Le noyau P335BW reste le garde-fou sur les conditions d'execution.
  const preuve=dispatch.calculerDestination({intention:a.intention,categorieNonAmbigue:!!a.categorie,
    regleEmailActive:!!rule,bureauHabilite:!!(rule?.bureauValide),bureauId,
    ficheValidee:false,modeleApprouve:false,identiteVerifiee:false,piecesVerifiees:false,
    consentementVerifie:false,autorisationEnvoi:false});
  return Object.freeze({
    intention:a.intention,categorie:a.categorie,motifQualification:a.motif,
    file,motif,bureauId,decisionNoyau:preuve.destination,
    simulation:true,execution:false,acheminementReel:false,reponseEnvoyee:false,
    dossierCree:false,verificationHumaineOuInstitutionnelleRequise:true
  });
}
function pourSecretariat(message,rules) {return orienterVirtuellement(message,rules).file===FILES.SECRETARIAT;}
module.exports=Object.freeze({FILES,CATEGORIES,MODES,orienterVirtuellement,pourSecretariat});
