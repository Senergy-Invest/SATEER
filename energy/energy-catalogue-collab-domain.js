'use strict';
/** C3B — une proposition de modèle rattachée à un équipement C2 déjà intégré. */
const {UUID,ref,identity,contentHash}=require('./energy-catalogue-domain');
const {cheminValide}=require('./energy-collection-domain');
const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const RAW=['famille','sousFamille','designation','marque','modele','puissanceNominaleW','tensionV'];
function fields(x){const d=ref({...x,sourcePassportId:null});if(!d)return null;const {sourcePassportId,...clean}=d;return clean;}
function submit(x){
 if(!exact(x,['sourceGrantId','c2ProposalId',...RAW])||!UUID.test(x.sourceGrantId||'')||!UUID.test(x.c2ProposalId||''))return null;
 const d=fields(Object.fromEntries(RAW.map(k=>[k,x[k]])));
 return d?Object.freeze({sourceGrantId:x.sourceGrantId,c2ProposalId:x.c2ProposalId,...d}):null;
}
function correct(x){if(!exact(x,['version',...RAW])||!Number.isSafeInteger(x.version)||x.version<1)return null;
 const d=fields(Object.fromEntries(RAW.map(k=>[k,x[k]])));
 return d?Object.freeze({version:x.version,...d}):null;
}
function decide(x){return exact(x,['reviewerGrantId','version','decision','referenceId'])&&UUID.test(x.reviewerGrantId||'')&&
 Number.isSafeInteger(x.version)&&x.version>0&&['APPROUVER','REFUSER','A_CORRIGER','RAPPROCHER'].includes(x.decision)&&
 ((x.decision==='RAPPROCHER'&&UUID.test(x.referenceId||''))||(x.decision!=='RAPPROCHER'&&x.referenceId===null))?Object.freeze({...x}):null;}
module.exports={UUID,RAW,fields,submit,correct,decide,identity,contentHash,cheminValide};
