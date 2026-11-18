'use strict';
/** Valeurs versionnees : jamais de remplacement silencieux, aucune attestation technique. */
const crypto=require('node:crypto');
const {validateFields}=require('./equipment-label-domain');
function creerEquipmentLabelStore({obtenirClient,photoVault}){
 if(typeof obtenirClient!=='function'||!photoVault||typeof photoVault.read!=='function')throw TypeError('DEPENDANCES_LABEL');
 async function use(fn){const c=await obtenirClient();try{return await fn(c);}finally{c.release();}}
 async function tx(fn){return use(async c=>{let active=false;try{await c.query('BEGIN');active=true;const r=await fn(c);await c.query('COMMIT');active=false;return r;}catch(e){if(active)await c.query('ROLLBACK').catch(()=>{});throw e;}});}
 async function passport(c,{tenant,owner,passportId},lock=false){
  const r=await c.query(`SELECT p.id,p.public_id,p.tenant_id,p.owner_personne_id FROM energy_equipment_passports p
   JOIN tenants t ON t.id=p.tenant_id AND t.actif=TRUE
   WHERE t.code=$1 AND p.owner_personne_id=$2 AND p.public_id=$3::uuid LIMIT 1 ${lock?'FOR UPDATE OF p':''}`,[tenant,owner,passportId]);
  return r.rows[0]||null;
 }
 async function source(c,p,photoId){const r=await c.query(`SELECT id,type_photo,mime_type,taille_octets FROM energy_equipment_photos
  WHERE id=$1::uuid AND passeport_id=$2 AND tenant_id=$3 AND owner_personne_id=$4
  AND date_suppression IS NULL AND type_photo='ETIQUETTE' LIMIT 1`,[photoId,p.id,p.tenant_id,p.owner_personne_id]);return r.rows[0]||null;}
 async function photoForAnalysis({tenant,owner,passportId,photoId}){return use(async c=>{
  const p=await passport(c,{tenant,owner,passportId});if(!p)return null;
  const ph=await source(c,p,photoId);if(!ph)return null;
  const bytes=await photoVault.read({owner,passportId,photoId,type:'ETIQUETTE',mime:ph.mime_type});
  if(bytes.length!==Number(ph.taille_octets))throw Error('PHOTO_CORROMPUE');return {bytes,mime:ph.mime_type};
 });}
 async function saveProposal({tenant,owner,passportId,photoId,candidates}){return tx(async c=>{
  const p=await passport(c,{tenant,owner,passportId},true);if(!p)return {code:'PASSEPORT_INTROUVABLE'};
  if(!await source(c,p,photoId))return {code:'PHOTO_ETIQUETTE_INTROUVABLE'};
  const n=await c.query(`SELECT COUNT(*)::int AS n FROM energy_equipment_label_proposals
   WHERE passeport_id=$1 AND date_creation>NOW()-interval '24 hours'`,[p.id]);
  if(Number(n.rows[0].n)>=12)return {code:'LIMITE_LECTURES_24H'};
  const id=crypto.randomUUID();
  await c.query(`INSERT INTO energy_equipment_label_proposals(id,passeport_id,tenant_id,owner_personne_id,photo_id,moteur,propositions)
   VALUES($1,$2,$3,$4,$5,'MACOS_VISION_LOCAL_V1',$6::jsonb)`,[id,p.id,p.tenant_id,owner,photoId,JSON.stringify(candidates)]);
  return {code:'OK',analyseId:id};
 });}
 async function latest({tenant,owner,passportId}){return use(async c=>{
  const p=await passport(c,{tenant,owner,passportId});if(!p)return null;
  const r=await c.query(`SELECT DISTINCT ON (v.champ) v.champ,v.valeur,v.revision,v.provenance,v.photo_id,v.date_validation
    FROM energy_equipment_label_versions v WHERE v.passeport_id=$1 AND v.tenant_id=$2 AND v.owner_personne_id=$3
    ORDER BY v.champ,v.revision DESC`,[p.id,p.tenant_id,owner]);
  return r.rows.map(x=>({champ:x.champ,valeur:x.valeur,revision:Number(x.revision),provenance:x.provenance,photoId:x.photo_id,dateValidation:x.date_validation,verification:'DECLAREE_PAR_UTILISATEUR'}));
 });}
 async function confirm({tenant,owner,passportId,analyseId,fields}){return tx(async c=>{
  const p=await passport(c,{tenant,owner,passportId},true);if(!p)return {code:'PASSEPORT_INTROUVABLE'};
  let proposal=null;
  if(analyseId){
   const r=await c.query(`SELECT id,photo_id,propositions,expiration,statut FROM energy_equipment_label_proposals
     WHERE id=$1::uuid AND passeport_id=$2 AND tenant_id=$3 AND owner_personne_id=$4 FOR UPDATE`,[analyseId,p.id,p.tenant_id,owner]);
   if(r.rows.length!==1)return {code:'ANALYSE_INTROUVABLE'};
   proposal=r.rows[0];if(proposal.statut!=='PROPOSEE'||Date.now()>=new Date(proposal.expiration).getTime())return {code:'ANALYSE_EXPIREE_OU_UTILISEE'};
   if(!await source(c,p,proposal.photo_id))return {code:'PHOTO_SOURCE_SUPPRIMEE'};
  }
  const normalized=validateFields(fields);if(!normalized)return {code:'CHAMPS_INVALIDES'};
  const changes=[];
  for(const f of normalized){
   const proposed=proposal?.propositions?.[f.champ];
   const provenance=!proposal?'SAISIE_MANUELLE':proposed===f.valeur?'OCR_CONFIRME_PAR_UTILISATEUR':'OCR_CORRIGE_PAR_UTILISATEUR';
   const count=await c.query(`SELECT COALESCE(MAX(revision),0)+1 AS revision FROM energy_equipment_label_versions
      WHERE passeport_id=$1 AND champ=$2`,[p.id,f.champ]);
   const revision=Number(count.rows[0].revision);
   await c.query(`INSERT INTO energy_equipment_label_versions(passeport_id,tenant_id,owner_personne_id,photo_id,champ,revision,valeur,provenance)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[p.id,p.tenant_id,owner,proposal?.photo_id||null,f.champ,revision,f.valeur,provenance]);
   await c.query(`INSERT INTO energy_equipment_passport_events(passeport_id,tenant_id,acteur_personne_id,event_type,payload)
     VALUES($1,$2,$3,'EquipmentLabelFieldConfirmed.v1',$4::jsonb)`,[p.id,p.tenant_id,owner,JSON.stringify({champ:f.champ,revision,provenance})]);
   changes.push({champ:f.champ,revision,provenance});
  }
  if(proposal)await c.query(`UPDATE energy_equipment_label_proposals SET statut='CONFIRMEE' WHERE id=$1`,[proposal.id]);
  return {code:'OK',champs:changes};
 });}
 return {photoForAnalysis,saveProposal,latest,confirm};
}
module.exports={creerEquipmentLabelStore};
