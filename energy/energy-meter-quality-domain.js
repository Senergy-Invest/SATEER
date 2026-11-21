'use strict';
/** E-METER-1C2 — Signaux de contrôle uniquement, jamais une certification ou un calcul de consommation. */
const SOURCES=Object.freeze(['RELEVES','DOCUMENTS']);
const LIMIT=50;
function pagination(raw){
 if(raw===undefined)return 0;
 if(typeof raw!=='string'||!/^(?:0|[1-9]\d{0,4})$/.test(raw))return null;
 const n=Number(raw);return n<=10000?n:null;
}
function decimalCanon(s){return typeof s==='string'&&/^\d{1,14}(?:\.\d{1,6})?$/.test(s);}
// Comparaison exacte des indices, sans Number() ou floating point JavaScript.
function compareDecimal(a,b){
 if(!decimalCanon(a)||!decimalCanon(b))throw TypeError('INDEX_NON_CANONIQUE');
 const norm=s=>{const [i,f='']=s.split('.');return [i.replace(/^0+(?=\d)/,''),f];};
 const [ai,af]=norm(a),[bi,bf]=norm(b);
 if(ai.length!==bi.length)return Math.sign(ai.length-bi.length);
 if(ai!==bi)return ai<bi?-1:1;
 const left=af.padEnd(6,'0'),right=bf.padEnd(6,'0');return left===right?0:left<right?-1:1;
}
function signauxReleve({valeur,precedente=null}){
 if(!decimalCanon(valeur)||precedente!==null&&!decimalCanon(precedente))throw TypeError('INDEX_INVALIDE');
 if(precedente===null)return [];
 const cmp=compareDecimal(valeur,precedente);
 if(cmp<0)return [{code:'INDEX_EN_BAISSE',niveau:'A_VERIFIER',explication:'Index inférieur au relevé chronologique précédent ; vérifier remise à zéro, remplacement ou erreur de saisie.'}];
 if(cmp===0)return [{code:'INDEX_INCHANGE',niveau:'INFORMATION',explication:'Index inchangé entre deux relevés ; cela ne prouve ni une panne ni une consommation nulle.'}];
 return [];
}
function signauxDocument({referenceDoublon=false,preuveVersionCourante=false}){
 if(typeof referenceDoublon!=='boolean'||typeof preuveVersionCourante!=='boolean')throw TypeError('CONTROLE_INVALIDE');
 const result=[];
 if(referenceDoublon)result.push({code:'REFERENCE_REPETEE',niveau:'A_VERIFIER',explication:'Référence identique sur plusieurs documents courants du même site, de même nature et énergie ; doublon à confirmer.'});
 if(!preuveVersionCourante)result.push({code:'PIECE_NON_ASSOCIEE',niveau:'INFORMATION',explication:'Aucun fichier joint à cette version ; la pièce est facultative et une version antérieure peut conserver sa pièce.'});
 return result;
}
function statut(signaux){return signaux.some(x=>x.niveau==='A_VERIFIER')?'A_VERIFIER':'AUCUNE_ALERTE_DETECTEE';}
module.exports={SOURCES,LIMIT,pagination,compareDecimal,signauxReleve,signauxDocument,statut};
