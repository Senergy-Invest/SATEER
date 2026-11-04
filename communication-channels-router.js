"use strict";
const express = require("express");
const { executerRequete } = require("./database");
const { exigerSession } = require("./auth-http");
const { exigerPermission } = require("./auth-authorization");
const router = express.Router();
const codeValide = x => typeof x === "string" && /^[A-Z0-9][A-Z0-9_-]{1,99}$/.test(x);
const idValide = x => Number.isSafeInteger(Number(x)) && Number(x) > 0;

async function contexte(req,res,next) {
  try {
    const organisationId=Number(req.params.organisationId);
    const tenantCode=String(req.body?.tenantCode || req.query.tenant || "").trim();
    if(!idValide(organisationId) || !/^[A-Za-z0-9_-]{1,30}$/.test(tenantCode))
      return res.status(400).json({statut:"CONTEXTE_INVALIDE"});
    const scope=await executerRequete(`SELECT o.id AS organisation_id,t.id AS tenant_id FROM organisations o JOIN tenants t ON t.id=o.tenant_id WHERE o.id=$1 AND t.code=$2`,[organisationId,tenantCode]);
    if(scope.rowCount!==1) return res.status(404).json({statut:"ORGANISATION_INTROUVABLE"});
    req.communicationScope={organisationId,tenantId:scope.rows[0].tenant_id,tenantCode};
    next();
  } catch(e){console.error("Canaux contexte:",e);res.status(500).json({statut:"ERREUR_CANAUX"});}
}
async function rattachement(req,res,next){
  try {
    const {organisationId}=req.communicationScope;
    const r=await executerRequete(`SELECT 1 FROM relations_personne_organisation WHERE personne_id=$1 AND organisation_id=$2 LIMIT 1`,[req.auth.personneId,organisationId]);
    if(!r.rowCount) return res.status(403).json({statut:"PERSONNE_HORS_ORGANISATION"});
    next();
  } catch(e){console.error("Canaux rattachement:",e);res.status(500).json({statut:"ERREUR_CANAUX"});}
}
// Listage public pour les membres de l'organisation. Les canaux restreints
// ne sont jamais divulgués dans cet incrément.
router.get("/:organisationId/channels",exigerSession,contexte,rattachement,async(req,res)=>{
  try {
    const {organisationId,tenantId}=req.communicationScope;
    const r=await executerRequete(`SELECT c.id,c.code,c.nom,c.description,c.visibility,c.date_creation, EXISTS(SELECT 1 FROM communication_channel_subscriptions s WHERE s.channel_id=c.id AND s.tenant_id=c.tenant_id AND s.organisation_id=c.organisation_id AND s.personne_id=$3 AND s.actif=true) AS abonne FROM communication_channels c WHERE c.organisation_id=$1 AND c.tenant_id=$2 AND c.actif=true AND c.visibility='PUBLIC' ORDER BY c.nom,c.id`,[organisationId,tenantId,req.auth.personneId]);
    return res.json({statut:"CANAUX_CHARGES",canaux:r.rows});
  }catch(e){console.error("Lister canaux:",e);return res.status(500).json({statut:"ERREUR_CANAUX"});}
});
router.post("/:organisationId/channels",...exigerPermission("TARGET_COMMUNICATION","ORGANISATION"),contexte,async(req,res)=>{
  try{
    const {organisationId,tenantId}=req.communicationScope;
    const {code,nom,description}=req.body||{};
    if(!codeValide(code)||typeof nom!=="string"||!nom.trim()||nom.length>180|| (description!=null&&(typeof description!=="string"||description.length>2000)))return res.status(400).json({statut:"CANAL_INVALIDE"});
    // Restreindre la création aux canaux PUBLIC dans ce premier incrément :
    // MEMBERS/RESTRICTED nécessitent encore une politique de diffusion dédiée.
    if(req.body.visibility && req.body.visibility!=="PUBLIC") return res.status(400).json({statut:"VISIBILITE_NON_IMPLEMENTEE"});
    const r=await executerRequete(`INSERT INTO communication_channels(tenant_id,organisation_id,code,nom,description,visibility,created_by) VALUES($1,$2,$3,$4,$5,'PUBLIC',$6) ON CONFLICT (tenant_id,organisation_id,code) DO NOTHING RETURNING id,code,nom,description,visibility`,[tenantId,organisationId,code,nom.trim(),description||null,req.auth.personneId]);
    if(!r.rowCount) return res.status(409).json({statut:"CANAL_EXISTANT"});
    return res.status(201).json({statut:"CANAL_CREE",canal:r.rows[0]});
  }catch(e){console.error("Creer canal:",e);return res.status(500).json({statut:"ERREUR_CANAUX"});}
});
router.post("/:organisationId/channels/:channelId/subscribe",exigerSession,contexte,rattachement,async(req,res)=>{
  try {
    if(!idValide(req.params.channelId))return res.status(400).json({statut:"CANAL_INVALIDE"});
    const {organisationId,tenantId}=req.communicationScope;
    const r=await executerRequete(`INSERT INTO communication_channel_subscriptions(channel_id,tenant_id,organisation_id,personne_id,actif) SELECT c.id,c.tenant_id,c.organisation_id,$4,true FROM communication_channels c WHERE c.id=$1 AND c.tenant_id=$2 AND c.organisation_id=$3 AND c.actif=true AND c.visibility='PUBLIC' ON CONFLICT(channel_id,personne_id) DO UPDATE SET actif=true,date_modification=now() RETURNING id`,[req.params.channelId,tenantId,organisationId,req.auth.personneId]);
    if(!r.rowCount)return res.status(404).json({statut:"CANAL_INACCESSIBLE"});
    return res.json({statut:"ABONNEMENT_ACTIF"});
  }catch(e){console.error("Abonnement canal:",e);return res.status(500).json({statut:"ERREUR_CANAUX"});}
});
router.delete("/:organisationId/channels/:channelId/subscribe",exigerSession,contexte,rattachement,async(req,res)=>{
  try {
    if(!idValide(req.params.channelId))return res.status(400).json({statut:"CANAL_INVALIDE"});
    const {organisationId,tenantId}=req.communicationScope;
    await executerRequete(`UPDATE communication_channel_subscriptions SET actif=false,date_modification=now() WHERE channel_id=$1 AND tenant_id=$2 AND organisation_id=$3 AND personne_id=$4`,[req.params.channelId,tenantId,organisationId,req.auth.personneId]);
    return res.json({statut:"ABONNEMENT_DESACTIVE"});
  }catch(e){console.error("Desabonnement canal:",e);return res.status(500).json({statut:"ERREUR_CANAUX"});}
});
module.exports=router;
