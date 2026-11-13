"use strict";
/**
 * A2.5 — Vue de structure institutionnelle (contrat PUR).
 *
 * Ne lit PAS PostgreSQL, ne monte AUCUNE route, ne donne AUCUN droit.
 * Les organisations et relations sont fournies par un appelant qui doit avoir
 * préalablement vérifié la session, le tenant et le droit de voir ce réseau.
 * Les droits métier restent exclusivement évalués par le Core RBAC/ressource.
 */

const TYPES_STRUCTURELS = Object.freeze(["SUPERVISION", "ADMINISTRATIVE_TUTELLE"]);
const TYPES_COLLABORATION = Object.freeze([
  "COORDINATION", "COOPERATION", "COMMUNITY_MEMBER", "COMMUNICATION_AUTHORIZATION"
]);
const TYPES_CONNUS = Object.freeze([...TYPES_STRUCTURELS, ...TYPES_COLLABORATION]);

function entierPositif(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function instantValide(value) {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\d(?:T\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d))?$/.test(value)) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** Identifiants de relations, dates, typage et tenant doivent être valides. */
function estRelationEffective(relation, { tenantId, dateReference } = {}) {
  const reference = instantValide(dateReference);
  if (!entierPositif(tenantId) || reference === null || !relation ||
      relation.tenant_id !== tenantId || !entierPositif(relation.source_organisation_id) ||
      !entierPositif(relation.target_organisation_id) ||
      relation.source_organisation_id === relation.target_organisation_id ||
      relation.statut !== "ACTIVE" || relation.actif !== true ||
      !TYPES_CONNUS.includes(relation.type)) return false;
  const debut = relation.date_debut == null ? null : instantValide(relation.date_debut);
  const fin = relation.date_fin == null ? null : instantValide(relation.date_fin);
  if (relation.date_debut != null && debut === null) return false;
  if (relation.date_fin != null && fin === null) return false;
  return (debut === null || debut <= reference) && (fin === null || reference < fin);
}

/**
 * Propose uniquement une relation de type communication comme candidate.
 * Il ne s'agit PAS d'une autorisation de publier/consulter : droits RBAC,
 * audience, consentement et ressource restent à vérifier côté moteur Communication.
 */
function estRelationDeCommunicationCandidate(relation, contexte) {
  return estRelationEffective(relation, contexte) &&
    relation.type === "COMMUNICATION_AUTHORIZATION";
}

/**
 * Construit un DAG de structure (arêtes source institution parent -> cible enfant).
 * Les collaborations (y compris COMMUNICATION_AUTHORIZATION) ne deviennent
 * JAMAIS des liens hiérarchiques ; les types de tutelle ne deviennent JAMAIS
 * des permissions de consultation ou de publication.
 *
 * Aucune inférence sur les postes, pays d'accréditation ni données sensibles.
 */
function construireGrapheInstitutionnel({ organisations, relations, tenantId, dateReference } = {}) {
  if (!entierPositif(tenantId) || instantValide(dateReference) === null ||
      !Array.isArray(organisations) || !Array.isArray(relations)) {
    throw new TypeError("Contexte institutionnel invalide.");
  }
  const noeuds = new Map();
  for (const org of organisations) {
    if (!org || !entierPositif(org.id) || !entierPositif(org.tenant_id) ||
        typeof org.type !== "string" || typeof org.nom !== "string") {
      throw new TypeError("Organisation invalide.");
    }
    // Un appelant peut avoir un ensemble multi-tenant : aucune fuite dans le graphe.
    if (org.tenant_id !== tenantId) continue;
    if (noeuds.has(org.id)) throw new Error("Organisation dupliquée.");
    noeuds.set(org.id, Object.freeze({ id: org.id, nom: org.nom, type: org.type }));
  }
  const aretes = [];
  const dejaVues = new Set();
  for (const rel of relations) {
    if (!estRelationEffective(rel, { tenantId, dateReference }) ||
        !TYPES_STRUCTURELS.includes(rel.type) ||
        !noeuds.has(rel.source_organisation_id) ||
        !noeuds.has(rel.target_organisation_id)) continue;
    const identifiant = `${rel.source_organisation_id}/${rel.target_organisation_id}/${rel.type}`;
    if (dejaVues.has(identifiant)) continue;
    dejaVues.add(identifiant);
    aretes.push(Object.freeze({
      parentId: rel.source_organisation_id,
      enfantId: rel.target_organisation_id,
      type: rel.type
    }));
  }
  const enfants = new Map([...noeuds.keys()].map(id => [id, []]));
  for (const arete of aretes) enfants.get(arete.parentId).push(arete.enfantId);
  // Refuser tout cycle, y compris si plusieurs tutelles convergent sur un poste.
  const visite = new Map();
  function parcourir(id) {
    if (visite.get(id) === 1) throw new Error("Cycle institutionnel détecté.");
    if (visite.get(id) === 2) return;
    visite.set(id, 1);
    for (const cible of enfants.get(id)) parcourir(cible);
    visite.set(id, 2);
  }
  for (const id of noeuds.keys()) parcourir(id);
  return Object.freeze({
    tenantId,
    organisations: Object.freeze([...noeuds.values()].sort((a, b) => a.id - b.id)),
    relationsStructurelles: Object.freeze(aretes.sort((a, b) =>
      a.parentId - b.parentId || a.enfantId - b.enfantId || a.type.localeCompare(b.type)))
  });
}

/** Parcours dédupliqué avec distance minimale, sans jamais retourner de droits. */
function descendantsInstitutionnels(graphe, organisationParentId) {
  if (!graphe || !Array.isArray(graphe.organisations) ||
      !Array.isArray(graphe.relationsStructurelles) || !entierPositif(organisationParentId) ||
      !graphe.organisations.some(org => org.id === organisationParentId)) {
    throw new TypeError("Graphe ou organisation de départ invalide.");
  }
  const enfants = new Map();
  for (const arete of graphe.relationsStructurelles) {
    if (!enfants.has(arete.parentId)) enfants.set(arete.parentId, []);
    enfants.get(arete.parentId).push(arete.enfantId);
  }
  const profondeur = new Map([[organisationParentId, 0]]);
  const file = [organisationParentId];
  for (let i = 0; i < file.length; i += 1) {
    const parent = file[i];
    for (const enfantId of enfants.get(parent) || []) {
      if (profondeur.has(enfantId)) continue;
      profondeur.set(enfantId, profondeur.get(parent) + 1);
      file.push(enfantId);
    }
  }
  const detail = new Map(graphe.organisations.map(org => [org.id, org]));
  return Object.freeze([...profondeur.entries()].filter(([id]) => id !== organisationParentId)
    .map(([id, distance]) => Object.freeze({ ...detail.get(id), profondeur: distance }))
    .sort((a, b) => a.profondeur - b.profondeur || a.id - b.id));
}

module.exports = Object.freeze({
  TYPES_STRUCTURELS,
  TYPES_COLLABORATION,
  TYPES_CONNUS,
  estRelationEffective,
  estRelationDeCommunicationCandidate,
  construireGrapheInstitutionnel,
  descendantsInstitutionnels
});
