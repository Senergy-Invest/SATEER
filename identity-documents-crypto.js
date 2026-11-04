"use strict";
// SATEER 1S - Références chiffrées AES-256-GCM avec liaison (personne,type).
// Aucune trace de valeur déchiffrée ne doit être journalisée.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

function cheminCle() {
    return process.env.SATEER_IDENTITY_KEY_FILE ||
        path.join(os.homedir(), ".sateer-secrets", "identity-sateer-test-v1.key");
}
function chargerCle() {
    const p = cheminCle();
    const stat = fs.lstatSync(p);
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
        throw Error("CLE_NON_SECURISÉE");
    }
    const contenu = fs.readFileSync(p, "utf8").trim();
    if (!/^[A-Za-z0-9+/]{43}=$/.test(contenu)) throw Error("CLE_INVALIDE");
    const cle = Buffer.from(contenu, "base64");
    if (cle.length !== 32 || cle.toString("base64") !== contenu) throw Error("CLE_INVALIDE");
    return cle;
}
function donneesAssociees(personneId, type) {
    return Buffer.from("SATEER-ID-DOC-1|" + String(personneId) + "|" + type, "utf8");
}
function chiffrerNumero(numero, personneId, type, cle) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", cle, iv);
    cipher.setAAD(donneesAssociees(personneId, type));
    const bytes = Buffer.concat([cipher.update(numero, "utf8"), cipher.final()]);
    return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), bytes.toString("base64")].join(":");
}
function dechiffrerNumero(payload, personneId, type, cle) {
    const parties = String(payload || "").split(":");
    if (parties.length !== 4 || parties[0] !== "v1") throw Error("FORMAT_CHIFFRE_INVALIDE");
    const [_, ivBase64, tagBase64, cipherBase64] = parties;
    const iv = Buffer.from(ivBase64, "base64");
    const tag = Buffer.from(tagBase64, "base64");
    if (iv.length !== 12 || tag.length !== 16) throw Error("FORMAT_CHIFFRE_INVALIDE");
    const decipher = crypto.createDecipheriv("aes-256-gcm", cle, iv);
    decipher.setAAD(donneesAssociees(personneId, type));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(cipherBase64, "base64")), decipher.final()]).toString("utf8");
}
module.exports = { chargerCle, chiffrerNumero, dechiffrerNumero };
