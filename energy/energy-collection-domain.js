'use strict';
/** C2 : validation pure de donnees, sans session, SQL ni calcul d'energie. */
const {UUID}=require('./energy-case-domain');
const {FAMILLES}=require('./energy-inventory-domain');
const SET=new Set(FAMILLES);
const own=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
const exact=(x,keys)=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>own(x,k));
function data(x){
 if(!exact(x,['sourceGrantId','scopeNodeId','nom','famille','quantite','puissanceUnitaireW'])||
 !UUID.test(x.sourceGrantId)||!UUID.test(x.scopeNodeId)||!SET.has(x.famille)||
 typeof x.nom!=='string'||!x.nom.trim()||x.nom.trim().length>120||/[\x00-\x1f\x7f]/.test(x.nom)||
 !Number.isSafeInteger(x.quantite)||x.quantite<1||x.quantite>10000||
 !(x.puissanceUnitaireW===null||(Number.isSafeInteger(x.puissanceUnitaireW)&&x.puissanceUnitaireW>=1&&x.puissanceUnitaireW<=100000000)))return null;
 return Object.freeze({sourceGrantId:x.sourceGrantId,scopeNodeId:x.scopeNodeId,nom:x.nom.trim(),famille:x.famille,quantite:x.quantite,puissanceUnitaireW:x.puissanceUnitaireW});
}
function revise(x){if(!x||typeof x!=='object'||Array.isArray(x)||!Number.isSafeInteger(x.version)||x.version<1)return null;
 const {version,...rest}=x,clean=data(rest);return clean?Object.freeze({...clean,version}):null;}
function decision(x){return exact(x,['reviewerGrantId','version','decision'])&&UUID.test(x.reviewerGrantId)&&
 Number.isSafeInteger(x.version)&&x.version>0&&['APPROUVER','REFUSER','A_CORRIGER'].includes(x.decision)?Object.freeze({...x}):null;}
/** Chaîne d'affectations fournie par l'espace Core/SQL, du déclarant vers la racine. */
function cheminValide(chain,sourcePersonne){
 if(!Array.isArray(chain)||chain.length<2||chain[0]?.personne_id!==sourcePersonne)return false;
 const seen=new Set();
 for(let i=0;i<chain.length;i++){
  const g=chain[i];if(!g||typeof g.id!=='string'||seen.has(g.id)||g.statut!=='ACTIF')return false;
  seen.add(g.id);
  if(i<chain.length-1 && g.parent_grant_id!==chain[i+1].id)return false;
  if(i>0 && g.role_scope==='OCCUPANT')return false;
  if(i>0 && g.personne_id===sourcePersonne)return false;
 }
 return chain[chain.length-1].role_scope==='COORDINATEUR' && chain[chain.length-1].parent_grant_id===null;
}
module.exports={UUID,data,revise,decision,cheminValide};
