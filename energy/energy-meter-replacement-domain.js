'use strict';
/** Remplacement volontaire d'un compteur : aucun index, kWh, facture ou economie calcule. */
const {UUID,appareil}=require('./energy-meter-domain');
const MOTIF=/^[^\x00-\x08\x0b\x0c\x0e-\x1f\x7f]{12,400}$/u;
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
function analyserRemplacement(body){
 if(!body||typeof body!=='object'||Array.isArray(body))return null;
 const keys=Object.keys(body);
 if(keys.length!==3||!keys.every(k=>['nouveauCompteur','motif','confirmation'].includes(k)))return null;
 if(body.confirmation!=='CONFIRMER_REMPLACEMENT'||typeof body.motif!=='string')return null;
 const motif=body.motif.trim();
 if(!MOTIF.test(motif)||!own(body,'nouveauCompteur'))return null;
 const nouveauCompteur=appareil(body.nouveauCompteur);
 if(!nouveauCompteur)return null;
 return Object.freeze({motif,nouveauCompteur});
}
module.exports={UUID,analyserRemplacement};
