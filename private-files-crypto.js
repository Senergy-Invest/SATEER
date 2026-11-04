"use strict";
const crypto = require("node:crypto");
const { chargerCle } = require("./identity-documents-crypto");
const MAGIC = Buffer.from("S1U1", "ascii");
function subkey() {
  return Buffer.from(crypto.hkdfSync("sha256", chargerCle(), Buffer.from("sateer_test/private-files/v1"), Buffer.from("SATEER-CITIZEN-VAULT"), 32));
}
function aad(owner, id, category, mime) {
  return Buffer.from(["SATEER-VAULT-1", owner, id, category, mime].join("|"));
}
function encrypt(buffer, owner, id, category, mime) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", subkey(), iv);
  cipher.setAAD(aad(owner, id, category, mime));
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), encrypted]);
}
function decrypt(blob, owner, id, category, mime) {
  if (!Buffer.isBuffer(blob) || blob.length < 33 || !blob.subarray(0, 4).equals(MAGIC)) throw Error("CORRUPT");
  const iv = blob.subarray(4, 16);
  const tag = blob.subarray(16, 32);
  const decipher = crypto.createDecipheriv("aes-256-gcm", subkey(), iv);
  decipher.setAAD(aad(owner, id, category, mime));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(blob.subarray(32)), decipher.final()]);
}
module.exports = { encrypt, decrypt };
