'use strict';
// Validations déclaratives, sans moteur de calcul ni identité HTTP.
const {UUID}=require('./energy-case-domain');
const ZONES=Object.freeze(['BATIMENT','ETAGE','PIECE','ZONE','EXTERIEUR']);
const FAMILLES=Object.freeze(['ECLAIRAGE','CLIMATISATION','FROID','POMPAGE','MOTEUR','INFORMATIQUE','SOLAIRE','STOCKAGE','AUTRE']);
const KEYS_ZONE=new Set(['typeZone','nom','parentId']);
const KEYS_EQ=new Set(['zoneId','nom','famille','quantite','puissanceUnitaireW']);
function own(o,k){return Object.prototype.hasOwnProperty.call(o,k);}
function strictObject(o,keys){return !!o && typeof o==='object' && !Array.isArray(o) && Object.keys(o).every(k=>keys.has(k));}
function name(s){return typeof s==='string' && s.trim().length>0 && s.trim().length<=120 && !/[\u0000-\u001f\u007f]/.test(s);}
function zone(body){
 if(!strictObject(body,KEYS_ZONE)||!ZONES.includes(body.typeZone)||!name(body.nom))return null;
 const parentId=own(body,'parentId')?body.parentId:null;
 if(parentId!==null && (typeof parentId!=='string'||!UUID.test(parentId)))return null;
 if(parentId===null && !['BATIMENT','EXTERIEUR'].includes(body.typeZone))return null;
 if(parentId!==null && ['BATIMENT','EXTERIEUR'].includes(body.typeZone))return null;
 return Object.freeze({typeZone:body.typeZone,nom:body.nom.trim(),parentId});
}
function parentAdmis(type,parentType){
 return (type==='ETAGE' && parentType==='BATIMENT') ||
 (type==='PIECE' && ['BATIMENT','ETAGE'].includes(parentType)) ||
 (type==='ZONE' && ['BATIMENT','ETAGE','PIECE','EXTERIEUR'].includes(parentType));
}
function equipement(body){
 if(!strictObject(body,KEYS_EQ)||typeof body.zoneId!=='string'||!UUID.test(body.zoneId)||
   !name(body.nom)||!FAMILLES.includes(body.famille)||
   !Number.isSafeInteger(body.quantite)||body.quantite<1||body.quantite>10000)return null;
 const p=own(body,'puissanceUnitaireW')?body.puissanceUnitaireW:null;
 if(p!==null && (!Number.isSafeInteger(p)||p<1||p>100000000))return null;
 return Object.freeze({zoneId:body.zoneId,nom:body.nom.trim(),famille:body.famille,quantite:body.quantite,puissanceUnitaireW:p});
}
module.exports={ZONES,FAMILLES,zone,parentAdmis,equipement};
