'use strict';
/** E-METER-1C1 : corrections declaratives, sans effacement, moteur de calcul ou transfert de preuves. */
const {declaration}=require('./energy-billing-domain');
const FIELDS=new Set(['motif','valeurs']);
function normaliserMotif(v){
 if(typeof v!=='string'||/[\x00-\x1f\x7f]/.test(v))return null;
 const s=v.trim();return s.length>=12&&s.length<=400?s:null;
}
function rectification(body,now=Date.now()){
 if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).length!==2||Object.keys(body).some(k=>!FIELDS.has(k)))return null;
 const motif=normaliserMotif(body.motif),valeurs=declaration(body.valeurs,now);
 return motif&&valeurs?Object.freeze({motif,valeurs}):null;
}
const FIELDS_VALUE=['nature','energie','dateDocument','periodeDebut','periodeFin','devise','montant','pointId','meterId','referenceDocument','referenceJustificatif'];
function equivalentes(a,b){return FIELDS_VALUE.every(k=>(a?.[k]??null)===(b?.[k]??null));}
module.exports={normaliserMotif,rectification,equivalentes,FIELDS_VALUE};
