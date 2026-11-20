'use strict';
/** C4C — valeurs de tableau de bord; PAS de kWh, d'économies ni de score arbitraire. */
const LIMIT = 50;
const MAX_OFFSET = 10000;
function offsetValide(raw) {
  const value = raw === undefined ? 0 : (typeof raw === 'string' && /^[0-9]+$/.test(raw) ? Number(raw) : NaN);
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_OFFSET ? value : null;
}
function nombre(raw) {
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 0) throw new TypeError('COMPTEUR_AGREGE_INVALIDE');
  return n;
}
const LABELS = Object.freeze({
  unites: 'Espaces du périmètre',
  responsabilites: 'Affectations actives',
  enRevue: 'Propositions à examiner',
  aCorriger: 'Propositions à corriger',
  integrees: 'Propositions intégrées',
  equipementsLocalises: 'Équipements localisés',
  appareillages: 'Éléments électriques déclarés',
  compteurs: 'Compteurs déclarés',
  relationsDeclarees: 'Relations déclarées vers des espaces',
  esquisses: 'Éléments placés sur l’esquisse physique'
});
function normaliserIndicateurs(row) {
  const out = {};
  for (const k of Object.keys(LABELS)) out[k] = nombre(row[k] ?? 0);
  return out;
}
module.exports = {LIMIT, MAX_OFFSET, LABELS, offsetValide, nombre, normaliserIndicateurs};
