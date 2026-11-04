"use strict";
/** SATEER Lot 1T : verification consulaire INTERNE seulement. Jamais de statut officiel. */
const express = require("express");
const { executerRequete, obtenirClientDatabase } = require("./database");
const { exigerSession } = require("./auth-http");
const { obtenirPermissionsEffectivesDatabase } = require("./services-database");
const router = express.Router();
const ACTIFS = ["EN_ATTENTE", "EN_INSTRUCTION", "COMPLEMENT_REQUIS"];
const ACTIONS = {
  PRENDRE_EN_CHARGE: { de: ["EN_ATTENTE"], vers: "EN_INSTRUCTION", evenement: "PRISE_EN_CHARGE" },
  DEMANDER_COMPLEMENT: { de: ["EN_INSTRUCTION"], vers: "COMPLEMENT_REQUIS", evenement: "COMPLEMENT_DEMANDE" },
  TERMINER_EXAMEN: { de: ["EN_INSTRUCTION"], vers: "EXAMEN_TERMINE", evenement: "EXAMEN_TERMINE" },
  REFUSER: { de: ["EN_INSTRUCTION"], vers: "REFUSEE", evenement: "REFUS" }
};
router.use((req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  res.set("Pragma", "no-cache");
  res.set("X-Content-Type-Options", "nosniff");
  if (process.env.PGDATABASE !== "sateer_test") return res.status(503).json({ statut:"LOT_PILOTE_DESACTIVE" });
  next();
});
router.use(exigerSession);
function echec(res, statut, code) { return res.status(code).json({ statut }); }
function controleOrigine(req, res, next) {
  const origine = process.env.SATEER_PUBLIC_ORIGIN || "http://localhost:3000";
  if (req.get("Origin") !== origine || !/^application\/json(?:\s*;|$)/i.test(req.get("Content-Type") || ""))
    return echec(res,"ORIGINE_OU_FORMAT_NON_AUTORISE",403);
  next();
}
function contexte(req) {
  const id = Number(req.query.organisation);
  const tenant = req.query.tenant;
  return Number.isSafeInteger(id) && id > 0 && typeof tenant === "string" && /^[A-Za-z0-9_-]{2,50}$/.test(tenant) ? { id, tenant } : null;
}
async function membre(personneId, ctx) {
  const r = await executerRequete(`SELECT 1 FROM relations_personne_organisation x
    JOIN organisations o ON o.id=x.organisation_id JOIN tenants t ON t.id=o.tenant_id
    WHERE x.personne_id=$1 AND x.organisation_id=$2 AND t.code=$3 LIMIT 1`,[personneId,ctx.id,ctx.tenant]);
  return r.rowCount > 0;
}
async function autoriserContexte(req,res,next) {
  const ctx = contexte(req);
  if (!ctx) return echec(res,"CONTEXTE_INVALIDE",400);
  try {
    if (!await membre(req.auth.personneId,ctx)) return echec(res,"ACCES_REFUSE",403);
    req.verifCtx = ctx;
    next();
  } catch (_) { return echec(res,"VERIFICATION_INDISPONIBLE",503); }
}
async function exigerDroit(code,req,res,next) {
  try {
    const c=req.verifCtx;
    const droits=await obtenirPermissionsEffectivesDatabase(req.auth.personneId,c.id,c.tenant);
    if (!droits.succes || !(droits.permissionsOrganisationRole || []).includes(code)) return echec(res,"ACCES_REFUSE",403);
    next();
  } catch (_) { return echec(res,"VERIFICATION_INDISPONIBLE",503); }
}
function texte(v, max, obligatoire=false) {
  if (v === undefined || v === null || v === "") return obligatoire ? null : null;
  if (typeof v !== "string" || v.length > max || /[\x00-\x1F\x7F]/.test(v)) return null;
  return v.trim() || null;
}
const bonId=x=>Number.isSafeInteger(Number(x)) && Number(x)>0;
const exposerDemande=r=>({id:Number(r.id),organisationId:Number(r.organisation_id),statut:r.statut,
 typesDocuments:r.types_documents, messageCitoyen:r.message_citoyen||null,
 retourConsulat:r.retour_consulat||null,dateCreation:r.date_creation,dateModification:r.date_modification,
 ...(r.prenom !== undefined ? { citoyen:{ prenom:r.prenom,nom:r.nom } } : {})});

// Titulaire : uniquement ses propres dossiers et le rattachement réel.
router.get("/mes-demandes", autoriserContexte, async (req,res)=>{
 try {
  const r=await executerRequete(`SELECT * FROM identity_verification_requests WHERE personne_id=$1 AND organisation_id=$2 ORDER BY date_creation DESC LIMIT 30`,[req.auth.personneId,req.verifCtx.id]);
  return res.json({statut:"DEMANDES_CHARGEES",demandes:r.rows.map(exposerDemande)});
 } catch (_) {return echec(res,"VERIFICATION_INDISPONIBLE",503);}
});
router.post("/mes-demandes", controleOrigine, autoriserContexte, async (req,res)=>{
 const b=req.body;
 if (!b || Object.keys(b).sort().join(",")!=="consentement,message" || b.consentement!==true ||
      (b.message !== null && b.message !== "" && !texte(b.message,600)))
   return echec(res,"DEMANDE_INVALIDE_OU_CONSENTEMENT_ABSENT",400);
 const note=texte(b.message,600);
 const client=await obtenirClientDatabase().catch(()=>null);
 if (!client) return echec(res,"VERIFICATION_INDISPONIBLE",503);
 try {
  await client.query("BEGIN");
  const refs=await client.query(`SELECT type_document FROM citizen_identity_documents WHERE personne_id=$1 ORDER BY type_document`,[req.auth.personneId]);
  if (!refs.rows.length) {await client.query("ROLLBACK");return echec(res,"REFERENCE_DOCUMENTAIRE_REQUISE",400);}
  const existent=await client.query(`SELECT id FROM identity_verification_requests WHERE personne_id=$1 AND organisation_id=$2 AND statut = ANY($3) LIMIT 1`,[req.auth.personneId,req.verifCtx.id,ACTIFS]);
  if (existent.rows.length) {await client.query("ROLLBACK");return echec(res,"DEMANDE_DEJA_EN_COURS",409);}
  const ins=await client.query(`INSERT INTO identity_verification_requests(personne_id,organisation_id,consentement_at,types_documents,message_citoyen)
    VALUES ($1,$2,NOW(),$3::jsonb,$4) RETURNING *`,[req.auth.personneId,req.verifCtx.id,JSON.stringify(refs.rows.map(x=>x.type_document)),note]);
  await client.query(`INSERT INTO identity_verification_events(demande_id,acteur_id,action,statut_avant,statut_apres)
    VALUES ($1,$2,'SOUMISSION',NULL,'EN_ATTENTE')`,[ins.rows[0].id,req.auth.personneId]);
  await client.query("COMMIT");return res.status(201).json({statut:"DEMANDE_CREEE",demande:exposerDemande(ins.rows[0])});
 } catch(e) {await client.query("ROLLBACK").catch(()=>{});return echec(res,e.code==='23505'?"DEMANDE_DEJA_EN_COURS":"VERIFICATION_INDISPONIBLE",e.code==='23505'?409:503);}
 finally {client.release();}
});
router.post("/mes-demandes/:id/completer", controleOrigine, autoriserContexte, async(req,res)=>{
 if(!bonId(req.params.id) || !req.body || Object.keys(req.body).join(",")!=="message" || !texte(req.body.message,600,true))
  return echec(res,"DONNEES_INVALIDES",400);
 const cl=await obtenirClientDatabase().catch(()=>null);
 if(!cl) return echec(res,"VERIFICATION_INDISPONIBLE",503);
 try {
  await cl.query("BEGIN");
  const refs=await cl.query(`SELECT type_document FROM citizen_identity_documents WHERE personne_id=$1`,[req.auth.personneId]);
  if(!refs.rowCount){await cl.query("ROLLBACK");return echec(res,"REFERENCE_DOCUMENTAIRE_REQUISE",400);}
  const upd=await cl.query(`UPDATE identity_verification_requests SET statut='EN_ATTENTE', message_citoyen=$1,
    types_documents=$2::jsonb,retour_consulat=NULL,date_modification=NOW()
    WHERE id=$3 AND personne_id=$4 AND organisation_id=$5 AND statut='COMPLEMENT_REQUIS'
    RETURNING *`,[texte(req.body.message,600),JSON.stringify(refs.rows.map(x=>x.type_document)),Number(req.params.id),req.auth.personneId,req.verifCtx.id]);
  if (!upd.rowCount){await cl.query("ROLLBACK");return echec(res,"DOSSIER_NON_MODIFIABLE",409);}
  await cl.query(`INSERT INTO identity_verification_events(demande_id,acteur_id,action,statut_avant,statut_apres)
    VALUES ($1,$2,'COMPLEMENT_RECU','COMPLEMENT_REQUIS','EN_ATTENTE')`,[Number(req.params.id),req.auth.personneId]);
  await cl.query("COMMIT");return res.json({statut:"COMPLEMENT_TRANSMIS",demande:exposerDemande(upd.rows[0])});
 } catch (_) {await cl.query("ROLLBACK").catch(()=>{});return echec(res,"VERIFICATION_INDISPONIBLE",503);} finally{cl.release();}
});

// Instruction institutionnelle : pas d'accès au numéro complet, permission explicite et organisation.
router.get("/instruction", autoriserContexte,(req,res,next)=>exigerDroit("VIEW_IDENTITY_VERIFICATION_REQUESTS",req,res,next),async(req,res)=>{
 try {
  const r=await executerRequete(`SELECT v.*,p.prenom,p.nom FROM identity_verification_requests v
   JOIN personnes p ON p.id=v.personne_id WHERE v.organisation_id=$1 ORDER BY v.date_modification DESC LIMIT 75`,[req.verifCtx.id]);
  return res.json({statut:"DOSSIERS_CHARGES",demandes:r.rows.map(exposerDemande)});
 } catch (_) {return echec(res,"VERIFICATION_INDISPONIBLE",503);}
});
router.post("/instruction/:id/action", controleOrigine, autoriserContexte,
 (req,res,next)=>exigerDroit("REVIEW_IDENTITY_VERIFICATION_REQUESTS",req,res,next),async(req,res)=>{
  if(!bonId(req.params.id) || !req.body || typeof req.body !== "object" || Array.isArray(req.body) ||
    Object.keys(req.body).sort().join(",")!=="action,commentaire") return echec(res,"DONNEES_INVALIDES",400);
  const a=Object.hasOwn(ACTIONS,req.body.action) ? ACTIONS[req.body.action] : null;
  if(!a) return echec(res,"ACTION_INVALIDE",400);
  const commentaire=texte(req.body.commentaire,600);
  if((req.body.commentaire!=="" && req.body.commentaire!==null && commentaire===null) ||
     (["DEMANDER_COMPLEMENT","REFUSER"].includes(req.body.action) && !commentaire)) return echec(res,"MOTIF_REQUIS_OU_INVALIDE",400);
  const cl=await obtenirClientDatabase().catch(()=>null);
  if(!cl) return echec(res,"VERIFICATION_INDISPONIBLE",503);
  try {
   await cl.query("BEGIN");
   const old=await cl.query(`SELECT statut FROM identity_verification_requests WHERE id=$1 AND organisation_id=$2 FOR UPDATE`,[Number(req.params.id),req.verifCtx.id]);
   if(!old.rowCount){await cl.query("ROLLBACK");return echec(res,"DOSSIER_INTROUVABLE",404);}
   const avant=old.rows[0].statut;
   if(!a.de.includes(avant)){await cl.query("ROLLBACK");return echec(res,"TRANSITION_INTERDITE",409);}
   const upd=await cl.query(`UPDATE identity_verification_requests SET statut=$1, retour_consulat=$2,
     instruit_par=$3,date_modification=NOW() WHERE id=$4 AND organisation_id=$5 RETURNING *`,
     [a.vers,commentaire,req.auth.personneId,Number(req.params.id),req.verifCtx.id]);
   await cl.query(`INSERT INTO identity_verification_events(demande_id,acteur_id,action,statut_avant,statut_apres,commentaire)
     VALUES($1,$2,$3,$4,$5,$6)`,[Number(req.params.id),req.auth.personneId,a.evenement,avant,a.vers,commentaire]);
   await cl.query("COMMIT");return res.json({statut:"DOSSIER_MIS_A_JOUR",demande:exposerDemande(upd.rows[0]),identiteOfficiellementVerifiee:false});
  } catch (_) {await cl.query("ROLLBACK").catch(()=>{});return echec(res,"VERIFICATION_INDISPONIBLE",503);}finally{cl.release();}
 });
module.exports={identityVerificationsRouter:router};
