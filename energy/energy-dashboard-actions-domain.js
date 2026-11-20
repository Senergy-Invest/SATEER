'use strict';
/** C4C tranche 2 : présentation fidèle de la file C2, sans SLA ni score artificiel. */
const STATUTS=Object.freeze(['TOUTES','EN_REVUE','A_CORRIGER']);
function filtreValide(v){return v===undefined?'TOUTES':(typeof v==='string'&&STATUTS.includes(v)?v:null);}
function ageEnJours(date,now=new Date()){
 const t=new Date(date).getTime(),today=new Date(now).getTime();
 if(!Number.isFinite(t)||!Number.isFinite(today))throw new TypeError('DATE_CONTRIBUTION_INVALIDE');
 return Math.max(0,Math.floor((today-t)/86400000));
}
function presenterAction(r,now=new Date()){
 if(!['EN_REVUE','A_CORRIGER'].includes(r.statut))throw new TypeError('STATUT_ACTION_INVALIDE');
 const d=new Date(r.date_modification);
 if(Number.isNaN(d.getTime()))throw new TypeError('DATE_CONTRIBUTION_INVALIDE');
 const examen=r.statut==='EN_REVUE';
 return {
  id:String(r.id), nom:String(r.nom), famille:String(r.famille),
  unite:{id:String(r.scope_node_id),nom:String(r.scope_nom)},
  statut:r.statut, prochaineEtape:examen?'EXAMEN_HUMAIN':'CORRECTION_AUTEUR',
  pourMoi:examen?r.est_relecteur===true:r.est_auteur===true,
  dateDerniereModification:d.toISOString(),joursDepuisModification:ageEnJours(d,now)
 };
}
module.exports={STATUTS,filtreValide,ageEnJours,presenterAction};
