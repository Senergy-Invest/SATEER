'use strict';
/** Domaine C4A : trois vues, une seule source canonique C1/051 ; aucune inférence de câblage. */
const {UUID}=require('./energy-case-domain');
const TYPES=Object.freeze(['SOURCE','COMPTEUR','TABLEAU','CIRCUIT','DEPART']);
const LINKS=Object.freeze(['ALIMENTE','MESURE','DESSERT']);
const USES=Object.freeze(['FROID','ECLAIRAGE','VENTILATION','CHAUFFAGE','POMPAGE','INFORMATIQUE','PRODUCTION','SECURITE','AUTRE']);
const same=(o,keys)=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
const label=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.trim().length<=max&&!/[\x00-\x1f\x7f<>]/.test(v)?v.trim():null;
const nullable=(v,max)=>v===null?null:label(v,max);
const asset=o=>{
 if(!same(o,['typeNoeud','nom','repere','scopeNodeId'])||!TYPES.includes(o.typeNoeud)||!label(o.nom,120)||
    (o.repere!==null&&!label(o.repere,60)) ||
    (o.scopeNodeId!==null&&!UUID.test(o.scopeNodeId||'')))return null;
 return {typeNoeud:o.typeNoeud,nom:label(o.nom,120),repere:nullable(o.repere,60),scopeNodeId:o.scopeNodeId};
};
const link=o=>{
 if(!same(o,['sourceAssetId','typeLien','targetAssetId','targetScopeNodeId','targetEquipmentId'])||
    !UUID.test(o.sourceAssetId||'')||!LINKS.includes(o.typeLien)||
    [o.targetAssetId,o.targetScopeNodeId,o.targetEquipmentId].filter(x=>x!==null).length!==1 ||
    (o.targetAssetId!==null&&!UUID.test(o.targetAssetId||''))||
    (o.targetScopeNodeId!==null&&!UUID.test(o.targetScopeNodeId||''))||
    (o.targetEquipmentId!==null&&!UUID.test(o.targetEquipmentId||''))||
    (o.typeLien==='DESSERT'&&o.targetScopeNodeId===null)||
    (o.typeLien==='ALIMENTE'&&o.targetScopeNodeId!==null)||
    (o.sourceAssetId===o.targetAssetId))return null;
 return {...o};
};
const usage=o=>{
 if(!same(o,['equipmentId','usage','commentaire'])||!UUID.test(o.equipmentId||'')||!USES.includes(o.usage)||
    (o.commentaire!==null&&!label(o.commentaire,200)))return null;
 return {equipmentId:o.equipmentId,usage:o.usage,commentaire:o.commentaire===null?null:label(o.commentaire,200)};
};
module.exports={TYPES,LINKS,USES,asset,link,usage};
