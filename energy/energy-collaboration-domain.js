'use strict';
/** Contrats métier sans session, DB, UI ou technique d'invitation. */
const crypto=require('node:crypto');
const {FAMILLES}=require('./energy-inventory-domain');
const {UUID}=require('./energy-case-domain'); // Contrat UUID canonique déjà testé, pas de regex dupliquée.
const CODE=/^scb_[A-Za-z0-9_-]{32}$/;
const FAMILY=new Set(FAMILLES);
const OWN=Object.prototype.hasOwnProperty;
function strict(o,fields){return !!o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).every(x=>fields.includes(x));}
function proposition(body){
 if(!strict(body,['nom','famille','quantite','puissanceUnitaireW'])||
   typeof body.nom!=='string'||!body.nom.trim()||body.nom.trim().length>120||/[\x00-\x1f\x7f]/.test(body.nom)||
   !FAMILY.has(body.famille)||!Number.isSafeInteger(body.quantite)||body.quantite<1||body.quantite>10000)return null;
 const watts=OWN.call(body,'puissanceUnitaireW')?body.puissanceUnitaireW:null;
 if(watts!==null&&(!Number.isSafeInteger(watts)||watts<1||watts>100000000))return null;
 return Object.freeze({nom:body.nom.trim(),famille:body.famille,quantite:body.quantite,puissanceUnitaireW:watts});
}
function revue(body){return strict(body,['decision'])&&Object.keys(body).length===1&&
 ['ACCEPTER','REFUSER'].includes(body.decision)?body.decision:null;}
function nouveauCode(){return 'scb_'+crypto.randomBytes(24).toString('base64url');}
function digestCode(code){return crypto.createHash('sha256').update('SATEER-COLLAB-INVITE-v1:'+code,'utf8').digest('hex');}
module.exports={UUID,CODE,proposition,revue,nouveauCode,digestCode};
