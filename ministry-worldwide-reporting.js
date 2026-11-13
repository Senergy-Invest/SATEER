"use strict";
/**
 * A4a — Projection mondiale de pilotage (fonction pure, données agrégées).
 *
 * Entrées déjà autorisées par un service appelant. Ne lit aucune base, ne
 * monte aucune route, ne calcule aucun droit et ne possède aucun dossier.
 * Les identifiants sont composites (tenant, organisation) ; aucun ID global
 * implicite n'est déduit des clés primaires locales.
 */
const TYPES = new Set(["MINISTERE", "AMBASSADE", "CONSULAT"]);
const DEPLOIEMENT = new Set(["RACCORDE", "EN_RECETTE", "NON_DEPLOYE"]);
const LIENS = new Map([
  ["SUPERVISION", ["MINISTERE", "AMBASSADE"]],
  ["ADMINISTRATIVE_TUTELLE", ["AMBASSADE", "CONSULAT"]]
]);
const METRIQUES = Object.freeze(["demandesRecues", "demandesTraitees", "dossiersEnCours"]);
const TENANT = /^[A-Z][A-Z0-9_-]{0,49}$/;
const MOIS = /^\d{4}-(?:0[1-9]|1[0-2])$/;
function id(x) { return typeof x === "number" && Number.isSafeInteger(x) && x > 0; }
function cle(tenantCode, organisationId) {
  if (typeof tenantCode !== "string" || !TENANT.test(tenantCode) || !id(organisationId))
    throw new TypeError("REFERENCE_ORGANISATION_INVALIDE");
  return `${tenantCode}:${organisationId}`;
}
function estInstant(x) {
  return typeof x === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(x) &&
    Number.isFinite(Date.parse(x));
}
function lienEffectif(relation, instant) {
  if (relation.approuvee !== true || relation.statut !== "ACTIVE" || relation.actif !== true) return false;
  for (const x of ["dateDebut", "dateFin"]) if (relation[x] != null && !estInstant(relation[x]))
    throw new TypeError("DATE_RELATION_INVALIDE");
  const now = Date.parse(instant);
  return (relation.dateDebut == null || Date.parse(relation.dateDebut) <= now) &&
    (relation.dateFin == null || now < Date.parse(relation.dateFin));
}
function protegerGraphe(noeuds, relations) {
  const enfants = new Map(noeuds.map(n => [n.reference, []]));
  for (const r of relations) enfants.get(r.parent).push(r.enfant);
  const etat = new Map();
  function visiter(ref) {
    if (etat.get(ref) === 1) throw new Error("CYCLE_RESEAU_MINISTERIEL");
    if (etat.get(ref) === 2) return;
    etat.set(ref, 1);
    for (const e of enfants.get(ref)) visiter(e);
    etat.set(ref, 2);
  }
  for (const x of noeuds) visiter(x.reference);
}
/**
 * `referencesAutorisees` doit provenir de la couche de permissions du Core :
 * ce paramètre ne constitue pas une autorisation en lui-même.
 * `postes` et `relations` proviennent d'un ANNUAIRE INSTITUTIONNEL VALIDÉ,
 * pas de la base privée d'un autre tenant.
 * `rapports` sont des instantanés agrégés déjà autorisés par leurs producteurs.
 */
function composerSupervisionMondiale({ postes, relations, rapports, referencesAutorisees, periode, dateReference } = {}) {
  if (!Array.isArray(postes) || !Array.isArray(relations) || !Array.isArray(rapports) ||
      !Array.isArray(referencesAutorisees) || !MOIS.test(periode || "") || !estInstant(dateReference)) {
    throw new TypeError("CONTEXTE_SUPERVISION_INVALIDE");
  }
  const allow = new Set();
  for (const x of referencesAutorisees) {
    if (!x || typeof x !== "object") throw new TypeError("REFERENCE_AUTORISEE_INVALIDE");
    const reference = cle(x.tenantCode, x.organisationId);
    if (allow.has(reference)) throw new TypeError("AUTORISATION_DUPLIQUEE");
    allow.add(reference);
  }
  const noeuds = new Map();
  for (const o of postes) {
    if (!o || typeof o !== "object") throw new TypeError("POSTE_INVALIDE");
    const reference = cle(o.tenantCode, o.organisationId);
    if (!TYPES.has(o.type) || !DEPLOIEMENT.has(o.statutDeploiement) ||
        typeof o.nom !== "string" || !o.nom.trim() || o.nom.length > 255 ||
        typeof o.paysImplantation !== "string" || !o.paysImplantation.trim() ||
        o.paysImplantation.length > 100) throw new TypeError("POSTE_INVALIDE");
    if (noeuds.has(reference)) throw new TypeError("POSTE_DUPLIQUE");
    if (allow.has(reference)) noeuds.set(reference, Object.freeze({
      reference, tenantCode: o.tenantCode, organisationId: o.organisationId,
      nom: o.nom, type: o.type, paysImplantation: o.paysImplantation,
      statutDeploiement: o.statutDeploiement
    }));
  }
  const aretes = [];
  const vues = new Set();
  for (const rel of relations) {
    if (!rel || !rel.parent || !rel.enfant) throw new TypeError("RELATION_INVALIDE");
    const parent = cle(rel.parent.tenantCode, rel.parent.organisationId);
    const enfant = cle(rel.enfant.tenantCode, rel.enfant.organisationId);
    // Ne pas révéler dans le sous-réseau les relations d'autres postes.
    if (!noeuds.has(parent) || !noeuds.has(enfant)) continue;
    if (!LIENS.has(rel.type) || !lienEffectif(rel, dateReference)) continue;
    const [parentType, enfantType] = LIENS.get(rel.type);
    if (parent === enfant || noeuds.get(parent).type !== parentType ||
        noeuds.get(enfant).type !== enfantType) throw new TypeError("HIERARCHIE_INVALIDE");
    const key = `${parent}|${enfant}|${rel.type}`;
    if (vues.has(key)) continue;
    vues.add(key);
    aretes.push(Object.freeze({ parent, enfant, type: rel.type }));
  }
  protegerGraphe([...noeuds.values()], aretes);
  const dernierRapport = new Map();
  for (const r of rapports) {
    if (!r || typeof r !== "object") throw new TypeError("RAPPORT_INVALIDE");
    const ref = cle(r.tenantCode, r.organisationId);
    if (!noeuds.has(ref)) continue;
    if (r.periode !== periode) continue; // ancien rapport ≠ zéro activité.
    if (dernierRapport.has(ref)) throw new TypeError("RAPPORT_DUPLIQUE");
    dernierRapport.set(ref, r);
  }
  const totaux = Object.fromEntries(METRIQUES.map(key => [key, 0]));
  let raccordes = 0, nonDeployes = 0, enRecette = 0, avecRapport = 0;
  const resultats = [...noeuds.values()].sort((a,b) => a.reference.localeCompare(b.reference))
    .map(o => {
      if (o.statutDeploiement === "NON_DEPLOYE") nonDeployes++;
      if (o.statutDeploiement === "EN_RECETTE") enRecette++;
      if (o.statutDeploiement === "RACCORDE") raccordes++;
      const rapport = dernierRapport.get(o.reference);
      let etat = o.statutDeploiement === "NON_DEPLOYE" ? "NON_DEPLOYE" :
        o.statutDeploiement === "EN_RECETTE" ? "EN_RECETTE" : "DONNEES_INDISPONIBLES";
      let metriques = null;
      if (o.statutDeploiement === "RACCORDE" && rapport && rapport.statut === "VALIDE" &&
          estInstant(rapport.produitLe) && Date.parse(rapport.produitLe) <= Date.parse(dateReference)) {
        metriques = {};
        for (const nom of METRIQUES) {
          if (!Number.isSafeInteger(rapport.metriques?.[nom]) || rapport.metriques[nom] < 0)
            throw new TypeError("METRIQUE_INVALIDE");
          metriques[nom] = rapport.metriques[nom];
          totaux[nom] += rapport.metriques[nom];
        }
        avecRapport++;
        etat = "RAPPORT_VALIDE";
      }
      return Object.freeze({ ...o, etatReporting: etat, metriques: metriques && Object.freeze(metriques) });
    });
  const couverture = avecRapport === 0 ? "AUCUNE_DONNEE" :
    avecRapport === raccordes ? "COMPLETE_PARMI_RACCORDES" : "PARTIELLE";
  return Object.freeze({
    periode, dateReference,
    organisations: Object.freeze(resultats),
    relations: Object.freeze(aretes.sort((a,b) => (a.parent+a.enfant).localeCompare(b.parent+b.enfant))),
    couverture: Object.freeze({ inventoriees: resultats.length, raccordees: raccordes,
      nonDeployees: nonDeployes, enRecette, avecRapport, statut: couverture }),
    indicateurs: Object.freeze({
      statut: couverture,
      // Un total partiel ne doit jamais être présenté comme un total mondial.
      totauxRenseignes: Object.freeze(totaux),
      couvertureIntegralePerimetreAutorise: couverture === "COMPLETE_PARMI_RACCORDES" &&
        nonDeployes === 0 && enRecette === 0 && raccordes === resultats.length
    })
  });
}
module.exports = Object.freeze({ composerSupervisionMondiale });
