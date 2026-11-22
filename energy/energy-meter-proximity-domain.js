'use strict';
/** E-METER-1C3 : signaux indicatifs de proximité dans le TEMPS, jamais une différence d'index. */
const {compareDecimal}=require('./energy-meter-quality-domain');
const SEUIL_SECONDES=60;
const LIMIT=50;
function pagination(raw){
 if(raw===undefined)return 0;
 if(typeof raw!=='string'||!/^(?:0|[1-9]\d{0,4})$/.test(raw))return null;
 const n=Number(raw);return n<=10000?n:null;
}
function signauxProximite({valeur,precedente=null,secondes=null,memeUnite=true}){
 if(precedente===null||secondes===null||memeUnite===false)return [];
 if(typeof secondes!=='number'||!Number.isFinite(secondes)||secondes<=0||secondes>SEUIL_SECONDES)return [];
 // Compare deux chaînes décimales exactement ; n'en déduit aucune différence énergétique.
 const cmp=compareDecimal(valeur,precedente);
 if(cmp===0)return [{code:'RELEVES_RAPPROCHES_IDENTIQUES',niveau:'INFORMATION',
  explication:'Deux saisies proches dans le temps ont le même index déclaré. Vérifier si elles sont volontairement répétées.'}];
 return [{code:'RELEVES_RAPPROCHES_DIFFERENTS',niveau:'A_VERIFIER',
  explication:'Deux saisies proches dans le temps ont des index déclarés différents. Vérifier les horaires et les saisies.'}];
}
function statut(signaux){return signaux.some(s=>s.niveau==='A_VERIFIER')?'A_VERIFIER':'AUCUNE_ALERTE_DETECTEE';}
module.exports={SEUIL_SECONDES,LIMIT,pagination,signauxProximite,statut};
