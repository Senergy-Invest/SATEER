'use strict';
/** Domaine C3 : modèle technique ≠ appareil individuel, aucune certification implicite. */
const crypto=require('node:crypto');
const {UUID}=require('./energy-case-domain');
const {FAMILLES}=require('./energy-inventory-domain');
const FAMILY=new Set(FAMILLES);
const FIELDS=['famille','sousFamille','designation','marque','modele','puissanceNominaleW','tensionV','sourcePassportId'];
function label(value,max,required=false){
 if(value===null||value===undefined||value==='')return required?null:null;
 if(typeof value!=='string')return null;
 const v=value.normalize('NFC').trim().replace(/\s+/g,' ');
 return v&&v.length<=max&&!/[\x00-\x1f\x7f<>]/.test(v)?v:null;
}
function ref(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!FIELDS.includes(k)))return null;
 if(!FAMILY.has(body.famille))return null;
 const sousFamille=label(body.sousFamille,80,true),designation=label(body.designation,120,true);
 if(!sousFamille||!designation)return null;
 const marque=label(body.marque,80),modele=label(body.modele,80);
 for(const [key,v] of [['marque',body.marque],['modele',body.modele]])if(v!==null&&v!==undefined&&v!==''&&!(key==='marque'?marque:modele))return null;
 const watts=body.puissanceNominaleW??null,volts=body.tensionV??null;
 if(watts!==null&&(!Number.isSafeInteger(watts)||watts<1||watts>100000000))return null;
 if(volts!==null&&(!Number.isSafeInteger(volts)||volts<1||volts>1000000))return null;
 const source=body.sourcePassportId??null;if(source!==null&&!UUID.test(source))return null;
 return Object.freeze({famille:body.famille,sousFamille,designation,marque,modele,puissanceNominaleW:watts,tensionV:volts,sourcePassportId:source});
}
function canonical(v){return String(v??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLowerCase();}
function identity(r){if(!r.marque||!r.modele)return null;
 return crypto.createHash('sha256').update([r.famille,r.sousFamille,r.marque,r.modele].map(canonical).join('\x1f')).digest('hex');}
function contentHash(r){return crypto.createHash('sha256').update(JSON.stringify(r)).digest('hex');}
module.exports={UUID,FAMILLES,ref,identity,canonical,contentHash};
