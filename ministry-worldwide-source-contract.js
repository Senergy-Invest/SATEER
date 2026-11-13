"use strict";
/**
 * A4b — Frontière d'approvisionnement du reporting mondial.
 * Ce contrat vérifie la FORME des lots, leur périmètre et leur cohérence.
 * Il ne remplace PAS la validation authentique de provenance par le fournisseur.
 * Ne pas brancher un annuaire réel sans convention, attestation et contrôles.
 */
const CODE = /^[A-Z][A-Z0-9_-]{0,49}$/;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9_.:-]{3,79}$/;
const PERIODE = /^\d{4}-(0[1-9]|1[0-2])$/;
class SourcesMinisteriellesIndisponibles extends Error {
  constructor() { super("SOURCES_MINISTERIELLES_NON_CONFIGUREES"); this.code = "SOURCES_MINISTERIELLES_NON_CONFIGUREES"; }
}
async function chargerLotNonConfigure() { throw new SourcesMinisteriellesIndisponibles(); }
function identite(x) {
  return x && typeof x === "object" && typeof x.tenantCode === "string" &&
    CODE.test(x.tenantCode) && Number.isSafeInteger(x.organisationId) && x.organisationId > 0;
}
function instant(x) { return typeof x === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(x) && Number.isFinite(Date.parse(x)); }
function ref(x) { return `${x.tenantCode}:${x.organisationId}`; }
function validerLotMinisteriel(lot, { tenantCode, organisationId, periode, dateReference } = {}) {
  if (!identite({ tenantCode, organisationId }) || !PERIODE.test(periode || "") || !instant(dateReference) ||
      !lot || typeof lot !== "object" || !identite(lot.racine) ||
      ref(lot.racine) !== `${tenantCode}:${organisationId}` ||
      !lot.provenance || typeof lot.provenance !== "object" ||
      !VERSION.test(lot.provenance.revisionAnnuaire || "") ||
      !VERSION.test(lot.provenance.revisionReporting || "") ||
      !instant(lot.provenance.valideLe) ||
      Date.parse(lot.provenance.valideLe) > Date.parse(dateReference) ||
      !Array.isArray(lot.postes) || !Array.isArray(lot.relations) ||
      !Array.isArray(lot.rapports) || !Array.isArray(lot.referencesAutorisees) ||
      lot.postes.length > 2000 || lot.relations.length > 10000 ||
      lot.rapports.length > 10000 || lot.referencesAutorisees.length > 2000) {
    throw new TypeError("LOT_MINISTERIEL_INVALIDE");
  }
  // Les seules données sortantes restent celles projetées par le composeur A4a.
  return {
    postes: lot.postes, relations: lot.relations, rapports: lot.rapports,
    referencesAutorisees: lot.referencesAutorisees,
    provenancePublique: Object.freeze({
      revisionAnnuaire: lot.provenance.revisionAnnuaire,
      revisionReporting: lot.provenance.revisionReporting,
      valideLe: lot.provenance.valideLe
    })
  };
}
/** Refuser tout poste sans chemin de supervision explicite depuis la racine.
 * Il ne s'agit pas d'une autorisation : celle-ci précède l'appel fournisseur.
 */
function exigerReseauAncre(vue, tenantCode, organisationId) {
  const racine = `${tenantCode}:${organisationId}`;
  const noeuds = new Map(vue.organisations.map(o => [o.reference, o]));
  if (!noeuds.has(racine) || noeuds.get(racine).type !== "MINISTERE")
    throw new TypeError("RACINE_MINISTERIELLE_ABSENTE");
  const enfants = new Map();
  for (const lien of vue.relations) {
    if (!enfants.has(lien.parent)) enfants.set(lien.parent, []);
    enfants.get(lien.parent).push(lien.enfant);
  }
  const vus = new Set([racine]); const file = [racine];
  for (let i = 0; i < file.length; i++) {
    for (const enfant of enfants.get(file[i]) || []) {
      if (!vus.has(enfant)) { vus.add(enfant); file.push(enfant); }
    }
  }
  if (vus.size !== vue.organisations.length)
    throw new TypeError("PERIMETRE_MINISTERIEL_HORS_RESEAU");
  return vue;
}
module.exports = Object.freeze({ SourcesMinisteriellesIndisponibles, chargerLotNonConfigure,
  validerLotMinisteriel, exigerReseauAncre });
