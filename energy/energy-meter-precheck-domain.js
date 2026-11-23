'use strict';
/** E-METER-3 R1 : contrôle indicatif AVANT décision, jamais certification ou calcul d'énergie. */
const {signauxReleve,statut}=require('./energy-meter-quality-domain');
const {signauxProximite}=require('./energy-meter-proximity-domain');
function evaluerPrecontrole({valeur,precedent=null,suivant=null,compteurActif=true}){
 if(typeof valeur!=='string'||typeof compteurActif!=='boolean')throw TypeError('PRECONTROLE_INVALIDE');
 if(precedent!==null&&(!precedent||typeof precedent.valeur!=='string'||!Number.isFinite(precedent.secondes)||precedent.secondes<=0))throw TypeError('PRECEDENT_INVALIDE');
 if(suivant!==null&&(!suivant||typeof suivant.valeur!=='string'))throw TypeError('SUIVANT_INVALIDE');
 const signaux=signauxReleve({valeur,precedente:precedent?.valeur??null});
 if(precedent!==null){
  signaux.push(...signauxProximite({valeur,precedente:precedent.valeur,secondes:precedent.secondes,memeUnite:true}));
 }
 if(suivant!==null){
  signaux.push({code:'RELEVE_NON_STRICTEMENT_ANTERIEUR',niveau:'A_VERIFIER',
   explication:'Un relevé canonique existe à la même heure ou après cette déclaration sur le même registre. Vérifier l’ordre chronologique.'});
 }
 if(!compteurActif){
  signaux.push({code:'COMPTEUR_DEVENU_INACTIF',niveau:'A_VERIFIER',
   explication:'Le compteur lié à la mission n’est plus actif ; sa déclaration ne doit pas être intégrée comme relevé courant.'});
 }
 const qualite=statut(signaux);
 return Object.freeze({signaux,statutQualite:qualite==='A_VERIFIER'?'A_VERIFIER':precedent===null?'REFERENCE_ABSENTE':'AUCUN_SIGNAL_DETECTE',
  controleIndicationSeulement:true,aucuneConsommationCalculee:true,verificationMetrologique:false});
}
module.exports={evaluerPrecontrole};
