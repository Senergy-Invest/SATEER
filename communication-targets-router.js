"use strict";
const express=require("express");
const {exigerSession}=require("./auth-http");
const {exigerPermission}=require("./auth-authorization");
const {executerRequete}=require("./database");
const {listerPublicationsVisiblesPourPersonneDatabase}=require("./services-database");
const {listerIdsPublicationsGeneralesAbonne}=require("./communication-access");
const router=express.Router();
function scope(req,res,next){
  const id=Number(req.params.organisationId),tenant=req.query.tenant;
  if(!Number.isSafeInteger(id)||id<=0||typeof tenant!=="string"||!(/^[A-Za-z0-9_-]{1,30}$/).test(tenant))
    return res.status(400).json({statut:"CONTEXTE_INVALIDE"});
  req.channelScope={id,tenant};next();
}
// Les personnes autorisées à publier peuvent consulter les relations actives.
router.get("/:organisationId/communication-destinations",...exigerPermission("TARGET_COMMUNICATION","ORGANISATION"),scope,async(req,res)=>{
  try {
    const {id,tenant}=req.channelScope;
    const r=await executerRequete(`
      SELECT DISTINCT o.id,o.nom,o.type
      FROM tenants t JOIN organisations source ON source.tenant_id=t.id AND source.id=$1
      JOIN organisation_relationships rel ON rel.target_organisation_id=source.id AND rel.tenant_id=t.id
      JOIN organisations o ON o.id=rel.source_organisation_id AND o.tenant_id=t.id
      WHERE t.code=$2 AND rel.type='COMMUNITY_MEMBER'
        AND rel.actif=TRUE AND rel.statut='ACTIVE'
        AND (rel.date_fin IS NULL OR rel.date_fin > CURRENT_TIMESTAMP)
      ORDER BY o.nom,o.id`,[id,tenant]);
    return res.set("Cache-Control","no-store").json({statut:"DESTINATIONS_CHARGEES",organisations:r.rows});
  }catch(e){console.error("Destinations communication",e);return res.status(500).json({statut:"ERREUR_DESTINATIONS"});}
});
// Vue générique des publications envoyées à des organisations membres.
// Les utilisateurs sans rattachement à l'émetteur n'obtiennent que les cibles
// auxquelles leurs relations personnelles ET les relations inter-org donnent accès.
router.get("/:organisationId/communication-feed",exigerSession,scope,async(req,res)=>{
  try {
    const {id,tenant}=req.channelScope,personne=Number(req.auth.personneId);
    const member=await executerRequete(`SELECT 1 FROM relations_personne_organisation r
      JOIN organisations o ON o.id=r.organisation_id JOIN tenants t ON t.id=o.tenant_id
      WHERE r.personne_id=$1 AND r.organisation_id=$2 AND t.code=$3 LIMIT 1`,[personne,id,tenant]);
    const all=await listerPublicationsVisiblesPourPersonneDatabase(personne,id,tenant);
    // Un membre externe ne lit une audience generale que s'il est encore
    // autorise par une relation active ET abonne au canal de cette publication.
    const generales=member.rowCount ? null : await listerIdsPublicationsGeneralesAbonne(
      executerRequete, personne, id, tenant
    );
    const visibles=member.rowCount ? all : all.filter(p=>
      p.audience_type==='ORGANISATIONS' || p.audience_type==='ASSOCIATION'
      || generales.has(String(p.id))
    );
    return res.set("Cache-Control","private, no-store").json({statut:"PUBLICATIONS_CHARGEES",publications:visibles});
  }catch(e){console.error("Lecture fil communication",e);return res.status(500).json({statut:"ERREUR_FIL"});}
});
module.exports=router;
