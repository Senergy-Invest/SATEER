'use strict';
const {UUID}=require('./energy-case-domain');
const ROLE=Object.freeze(['COORDINATEUR','RESPONSABLE','OCCUPANT']);
const TYPES=Object.freeze(['SITE','BATIMENT','ETAGE','BUREAU','LOCAL','SERVICE','ATELIER','ZONE','EXTERIEUR','INSTALLATION','AUTRE']);
function exact(o,fields){return o!==null&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===fields.length&&fields.every(k=>Object.prototype.hasOwnProperty.call(o,k));}
function node(body){if(!exact(body,['sourceGrantId','parentNodeId','typeNoeud','nom'])||!UUID.test(body.sourceGrantId||'')||!UUID.test(body.parentNodeId||'')||!TYPES.includes(body.typeNoeud)||typeof body.nom!=='string'||!body.nom.trim()||body.nom.trim().length>120||/[\x00-\x1f\x7f]/.test(body.nom))return null;
 return {sourceGrantId:body.sourceGrantId,parentNodeId:body.parentNodeId,typeNoeud:body.typeNoeud,nom:body.nom.trim()};}
function invitation(body){if(!exact(body,['sourceGrantId','targetNodeId','targetPersonneId','role'])||!UUID.test(body.sourceGrantId||'')||!UUID.test(body.targetNodeId||'')||!Number.isSafeInteger(body.targetPersonneId)||body.targetPersonneId<=0||!['RESPONSABLE','OCCUPANT'].includes(body.role))return null;
 return {sourceGrantId:body.sourceGrantId,targetNodeId:body.targetNodeId,targetPersonneId:body.targetPersonneId,role:body.role};}
function revocation(body){return exact(body,['sourceGrantId'])&&UUID.test(body.sourceGrantId||'')?{sourceGrantId:body.sourceGrantId}:null;}
module.exports={UUID,ROLE,TYPES,node,invitation,revocation};
