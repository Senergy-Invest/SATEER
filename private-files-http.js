"use strict";
/** Lot 1U - Coffre personnel de demonstration. Jamais de scans reels ni de partage institutionnel. */
const express = require("express");
const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = fs.promises;
const path = require("node:path");
const os = require("node:os");
const { executerRequete } = require("./database");
const { exigerSession } = require("./auth-http");
const { encrypt, decrypt } = require("./private-files-crypto");
const router = express.Router();
const CATEGORIES = new Set(["CNI_RECTO", "CNI_VERSO", "PASSEPORT", "CARTE_CONSULAIRE", "ACTE_NAISSANCE", "JUSTIFICATIF_DOMICILE", "AUTRE"]);
const MIME = {jpg:"image/jpeg",png:"image/png",webp:"image/webp",pdf:"application/pdf"};
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function error(res, status, code) { return res.status(status).json({ statut:code }); }
router.use((_req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  res.set("Pragma", "no-cache");
  res.set("X-Content-Type-Options", "nosniff");
  if (process.env.PGDATABASE !== "sateer_test") return error(res, 503, "COFFRE_PILOTE_DESACTIVE");
  next();
});
router.use(exigerSession);
function origin(req, res, next) {
  const configured = process.env.SATEER_PUBLIC_ORIGIN;
  if (!configured || req.get("Origin") !== configured) return error(res, 403, "ORIGINE_NON_AUTORISEE");
  next();
}
function folder() {
  const home = path.join(os.homedir(), ".sateer-private");
  const target = path.join(home, "sateer_test", "citizen-files");
  const folders = [home, path.join(home,"sateer_test"), target];
  for (const item of folders) {
    const stat = fs.lstatSync(item);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077)) throw Error("STOCKAGE_NON_PRIVE");
  }
  return target;
}
function diskfile(id) { if (!UUID.test(id)) throw Error("INVALID_ID"); return path.join(folder(), id + ".enc"); }
function signature(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 16) return null;
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return MIME.jpg;
  if (buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return MIME.png;
  if (buffer.toString("ascii",0,4)==="RIFF" && buffer.toString("ascii",8,12)==="WEBP") return MIME.webp;
  if (buffer.toString("ascii",0,5)==="%PDF-") return MIME.pdf;
  return null;
}
function sanitizeName(s) {
  if (typeof s !== "string" || s.length > 500) return "document";
  let n;
  try { n = decodeURIComponent(s); } catch (_) { return "document"; }
  return path.basename(n).replace(/[\x00-\x1f\x7f\\/<>"'`]/g, "_").slice(0, 120) || "document";
}
function dto(row) {
  return {id:row.id, categorie:row.categorie, nom:row.nom_original, format:row.mime_type,
    taille:Number(row.taille_octets), dateCreation:row.date_creation, statut:"DOCUMENT_PERSONNEL_NON_VERIFIE"};
}
router.get("/", async(req,res) => {
  try {
    const q=await executerRequete("SELECT id,categorie,nom_original,mime_type,taille_octets,date_creation FROM citizen_private_files WHERE personne_id=$1 ORDER BY date_creation DESC LIMIT 50", [req.auth.personneId]);
    return res.json({statut:"COFFRE_CHARGE",documents:q.rows.map(dto)});
  } catch (_) {return error(res,503,"COFFRE_INDISPONIBLE");}
});
const raw = express.raw({type:"application/octet-stream", limit:MAX_BYTES});
function rawGuard(req,res,next) {
  raw(req,res,(err)=>{
    if (err) return error(res,err.type==="entity.too.large"?413:400,"FICHIER_TROP_VOLUMINEUX_OU_INVALIDE");
    next();
  });
}
router.post("/:categorie", origin, rawGuard, async(req,res)=>{
  if (!CATEGORIES.has(req.params.categorie)) return error(res,400,"CATEGORIE_INVALIDE");
  if (!/^application\/octet-stream(?:\s*;|$)/i.test(req.get("Content-Type")||"")) return error(res,415,"FORMAT_TRANSPORT_INVALIDE");
  const bytes=req.body, mime=signature(bytes);
  if (!mime || bytes.length > MAX_BYTES || bytes.length < 16) return error(res,415,"FORMAT_FICHIER_REFUSE");
  const nom = sanitizeName(req.get("X-SATEER-FILENAME"));
  const id=crypto.randomUUID();
  let target=null;
  try {
    const count=await executerRequete("SELECT COUNT(*)::int AS n FROM citizen_private_files WHERE personne_id=$1",[req.auth.personneId]);
    if (count.rows[0].n >= MAX_FILES) return error(res,409,"COFFRE_PLEIN");
    const encrypted = encrypt(bytes,req.auth.personneId,id,req.params.categorie,mime);
    target = diskfile(id);
    await fsp.writeFile(target,encrypted,{flag:"wx",mode:0o600});
    const result=await executerRequete(`INSERT INTO citizen_private_files(id,personne_id,categorie,nom_original,mime_type,taille_octets)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,[id,req.auth.personneId,req.params.categorie,nom,mime,bytes.length]);
    return res.status(201).json({statut:"FICHIER_CHIFFRE",document:dto(result.rows[0])});
  } catch (_) {
    if (target) await fsp.unlink(target).catch(()=>{});
    return error(res,503,"ENREGISTREMENT_FICHIER_INDISPONIBLE");
  }
});
router.get("/:id/telecharger",async(req,res)=>{
  if (!UUID.test(req.params.id)) return error(res,400,"IDENTIFIANT_INVALIDE");
  try {
    const q=await executerRequete("SELECT * FROM citizen_private_files WHERE id=$1 AND personne_id=$2",[req.params.id,req.auth.personneId]);
    if (!q.rowCount) return error(res,404,"DOCUMENT_INTROUVABLE");
    const x=q.rows[0];
    const blob=await fsp.readFile(diskfile(x.id));
    const plain=decrypt(blob,req.auth.personneId,x.id,x.categorie,x.mime_type);
    if (plain.length !== x.taille_octets || signature(plain) !== x.mime_type) throw Error("CORRUPT");
    const ext = Object.keys(MIME).find(k=>MIME[k]===x.mime_type);
    res.set("Content-Type","application/octet-stream");
    res.set("Content-Disposition",`attachment; filename="document-sateer-${x.id}.${ext}"`);
    res.set("Content-Length",String(plain.length));
    return res.end(plain);
  } catch (_) { return error(res,503,"LECTURE_FICHIER_INDISPONIBLE"); }
});
router.delete("/:id",origin,async(req,res)=>{
  if (!UUID.test(req.params.id)) return error(res,400,"IDENTIFIANT_INVALIDE");
  try {
    const r=await executerRequete("DELETE FROM citizen_private_files WHERE id=$1 AND personne_id=$2 RETURNING id",[req.params.id,req.auth.personneId]);
    if (!r.rowCount) return error(res,404,"DOCUMENT_INTROUVABLE");
    await fsp.unlink(diskfile(req.params.id)).catch(()=>{});
    return res.json({statut:"DOCUMENT_SUPPRIME"});
  } catch (_) { return error(res,503,"SUPPRESSION_FICHIER_INDISPONIBLE"); }
});
module.exports={privateFilesRouter:router,signature};
