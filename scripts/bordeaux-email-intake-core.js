'use strict';
// SATEER Bordeaux: pré-qualification des seuls messages synthétiques. Aucun accès IMAP/SMTP.
const crypto = require('crypto');
const TENANT = 'P6V_3B5AC5AB9DB04657';
const ORG = 70;
const FINGERPRINT = /^[a-f0-9]{64}$/;
const normalize = s => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const patterns = Object.freeze({
  PASSEPORT: /\b(passeport|passport)\b/,
  CARTE_CONSULAIRE: /\bcarte\s+consulaire\b/,
  ETAT_CIVIL: /\b(etat\s+civil|acte\s+de\s+naissance|acte\s+de\s+mariage|acte\s+de\s+deces)\b/
});
function proposerCategorie(subject, body) {
  const text = normalize(`${subject || ''}\n${body || ''}`);
  const matching = Object.keys(patterns).filter(key => patterns[key].test(text));
  return {categorie: matching.length === 1 ? matching[0] : null,
    statut: matching.length === 1 ? 'PROPOSITION_A_VALIDER' : 'QUALIFICATION_MANUELLE',
    motif: matching.length === 0 ? 'AUCUN_MOT_CLE_FIABLE' : matching.length > 1 ? 'CATEGORIES_AMBIGUES' : 'MOT_CLE_DETECTE'};
}
function empreinte(mailboxKey, messageId) {
  if (typeof mailboxKey !== 'string' || !/^[A-Z][A-Z0-9_]{2,50}$/.test(mailboxKey)) throw Error('BOITE_INVALIDE');
  if (typeof messageId !== 'string' || !/^<[a-zA-Z0-9._+\-]{1,100}@[a-zA-Z0-9.\-]{1,120}>$/.test(messageId)) throw Error('MESSAGE_ID_INVALIDE');
  const hex = crypto.createHash('sha256').update(mailboxKey + '\0' + messageId).digest('hex');
  if (!FINGERPRINT.test(hex)) throw Error('EMPREINTE_INVALIDE');
  return hex;
}
const DEMO = Object.freeze({
  mailboxKey: 'CONSULAT_DEMO',
  messageId: '<sateer-bordeaux-demo-carte-001@example.invalid>',
  fromLabel: 'Citoyen fictif (simulation)',
  subject: '[DEMO BORDEAUX] Demande de carte consulaire par e-mail',
  body: 'Bonjour, je souhaite préparer une carte consulaire. Ceci est un e-mail entièrement fictif de recette. Merci.',
  tenantCode: TENANT,
  organisationId: ORG
});
module.exports = { TENANT, ORG, DEMO, proposerCategorie, empreinte };
