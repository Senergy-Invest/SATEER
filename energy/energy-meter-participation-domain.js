'use strict';
/** EP1 : validation pure, aucune déduction de droit à partir d'une donnée du navigateur. */
const {UUID,indexManuel}=require('./energy-meter-domain');
const exact=(o,keys)=>!!o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
function liaison(x){return exact(x,['scopeNodeId'])&&UUID.test(x.scopeNodeId)?Object.freeze({scopeNodeId:x.scopeNodeId}):null;}
function attribution(x){return exact(x,['registerId','grantId'])&&UUID.test(x.registerId)&&UUID.test(x.grantId)?Object.freeze({...x}):null;}
function soumission(x,now=Date.now()){
 if(!exact(x,['valeur','releveLe','observation']))return null;
 return indexManuel(x,now);
}
function revue(x){return exact(x,['decision'])&&['INTEGRER','REFUSER'].includes(x.decision)?Object.freeze({...x}):null;}
function chaineValide(chain,actor){
 if(!Array.isArray(chain)||chain.length<2||Number(chain[0]?.personne_id)!==actor)return false;
 const visited=new Set();
 for(let i=0;i<chain.length;i++){
  const g=chain[i];if(!g||visited.has(String(g.id))||g.statut!=='ACTIF')return false;
  visited.add(String(g.id));
  if(i<chain.length-1&&String(g.parent_grant_id)!==String(chain[i+1].id))return false;
  if(i>0&&(g.role_scope==='OCCUPANT'||Number(g.personne_id)===actor))return false;
 }
 const root=chain.at(-1);
 return root.role_scope==='COORDINATEUR'&&root.parent_grant_id===null;
}
module.exports={UUID,liaison,attribution,soumission,revue,chaineValide};
