"use strict";
/**
 * A3b — Accès au réseau institutionnel via les tables CORE déjà présentes.
 * Aucun routeur HTTP, aucun rôle automatiquement attribué, aucune insertion
 * de relations réelles par cet import. L'appelant doit fournir les décisions
 * d'autorisation et une transaction PostgreSQL unique pour les écritures.
 *
 * Direction pour les liens STRUCTURELS : source=parent, target=enfant.
 * La portée actuelle est strictement INTRA-TENANT. Le reporting mondial futur
 * devra passer par des agrégats autorisés, non par des lectures croisées SQL.
 */
const {
  construireGrapheInstitutionnel,
  descendantsInstitutionnels,
  TYPES_STRUCTURELS
} = require("./institution-relationship-graph");

class ReseauRefuse extends Error {
  constructor(message = "ACCES_RESEAU_REFUSE") { super(message); this.code = message; }
}

const SQL_ORGANISATIONS = `
SELECT o.id, o.tenant_id, o.nom, o.type
FROM organisations o
JOIN tenants t ON t.id = o.tenant_id AND t.actif = TRUE
WHERE t.id = $1
  AND o.type IN ('MINISTERE', 'AMBASSADE', 'CONSULAT')
ORDER BY o.id`;

const SQL_RELATIONS = `
SELECT r.id, r.tenant_id, r.source_organisation_id, r.target_organisation_id,
       r.type, r.statut, r.actif, r.date_debut, r.date_fin
FROM organisation_relationships r
JOIN organisations parent ON parent.id = r.source_organisation_id
  AND parent.tenant_id = r.tenant_id
JOIN organisations enfant ON enfant.id = r.target_organisation_id
  AND enfant.tenant_id = r.tenant_id
JOIN tenants t ON t.id = r.tenant_id AND t.actif = TRUE
WHERE t.id = $1 AND r.type IN ('SUPERVISION', 'ADMINISTRATIVE_TUTELLE')
ORDER BY r.id`;

const SQL_VERROU = 'SELECT pg_advisory_xact_lock($1::integer, $2::integer)';
const SQL_INSERT = `
INSERT INTO organisation_relationships
  (tenant_id, source_organisation_id, target_organisation_id, type,
   statut, actif, date_debut, date_fin, metadata)
SELECT $1, parent.id, enfant.id, $4, 'ACTIVE', TRUE, CURRENT_TIMESTAMP, NULL,
       jsonb_build_object('referenceValidation', $5::text, 'origine', 'INSTITUTION_NETWORK_A3B')
FROM organisations parent
JOIN organisations enfant ON enfant.tenant_id = parent.tenant_id AND enfant.id = $3
JOIN tenants t ON t.id = parent.tenant_id AND t.actif = TRUE
WHERE parent.id = $2 AND t.id = $1
ON CONFLICT (tenant_id, source_organisation_id, target_organisation_id, type)
DO NOTHING
RETURNING id, tenant_id, source_organisation_id, target_organisation_id, type, statut`;

const SQL_REVOQUER = `
UPDATE organisation_relationships r
SET actif = FALSE, statut = 'REVOKED', date_fin = CURRENT_TIMESTAMP,
    date_modification = CURRENT_TIMESTAMP
FROM organisations parent, organisations enfant, tenants t
WHERE r.tenant_id = $1 AND r.source_organisation_id = $2
  AND r.target_organisation_id = $3 AND r.type = $4
  AND r.statut = 'ACTIVE' AND r.actif = TRUE
  AND parent.id = r.source_organisation_id AND parent.tenant_id = r.tenant_id
  AND enfant.id = r.target_organisation_id AND enfant.tenant_id = r.tenant_id
  AND t.id = r.tenant_id AND t.actif = TRUE
RETURNING r.id, r.tenant_id, r.source_organisation_id, r.target_organisation_id, r.type, r.statut`;

const SQL_AUDITER = `
INSERT INTO audit_trail
  (tenant_id, organisation_id, personne_id, action, entity_type, entity_id, details)
VALUES ($1, $2, $3, $4, 'organisation_relationships', $5::text, $6::jsonb)`;

function idStrict(value) { return typeof value === "number" && Number.isSafeInteger(value) && value > 0; }
function identiteValide(acteur) { return acteur && idStrict(acteur.personneId); }
function typeLienValide(type) { return TYPES_STRUCTURELS.includes(type); }
function referenceValide(value) { return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:\/-]{3,119}$/.test(value); }

/**
 * Le callback `autoriser` est OBLIGATOIRE : jamais de privilège implicite.
 * Les écritures demandent une autorisation pour chacune des deux organisations
 * et une référence de validation institutionnelle traçable (pas une preuve
 * cryptographique d'approbation ; elle devra venir du workflow validé).
 */
function creerServiceReseauInstitutionnel({ requete, autoriser, transaction } = {}) {
  if (typeof requete !== 'function' || typeof autoriser !== 'function')
    throw new TypeError('Dépendances réseau et autorisation obligatoires');

  async function verifier(acteur, tenantId, orgId, action) {
    if (!identiteValide(acteur) || !idStrict(tenantId) || !idStrict(orgId))
      throw new ReseauRefuse();
    const accord = await autoriser({ acteur, tenantId, organisationId: orgId, action });
    if (accord !== true) throw new ReseauRefuse();
  }

  async function donnees(query, tenantId) {
    const [organisations, relations] = await Promise.all([
      query(SQL_ORGANISATIONS, [tenantId]), query(SQL_RELATIONS, [tenantId])
    ]);
    if (!Array.isArray(organisations?.rows) || !Array.isArray(relations?.rows))
      throw new Error('RESEAU_DONNEES_INCOMPLETES');
    return { organisations: organisations.rows, relations: relations.rows };
  }

  function construire(d, tenantId, now) {
    return construireGrapheInstitutionnel({ ...d, tenantId, dateReference: now });
  }

  async function lireSousReseau({ acteur, tenantId, racineId, dateReference = new Date().toISOString() } = {}) {
    await verifier(acteur, tenantId, racineId, 'VIEW_INSTITUTION_NETWORK');
    const d = await donnees(requete, tenantId);
    const graphe = construire(d, tenantId, dateReference);
    const racine = graphe.organisations.find(x => x.id === racineId);
    if (!racine) throw new ReseauRefuse('RACINE_NON_AUTORISEE');
    const descendants = descendantsInstitutionnels(graphe, racineId);
    const selection = new Set([racineId, ...descendants.map(x => x.id)]);
    return Object.freeze({
      racine,
      descendants,
      relationsStructurelles: graphe.relationsStructurelles.filter(x =>
        selection.has(x.parentId) && selection.has(x.enfantId))
    });
  }

  function relationPermise(parent, enfant, type) {
    return (parent.type === 'MINISTERE' && enfant.type === 'AMBASSADE' && type === 'SUPERVISION') ||
      (parent.type === 'AMBASSADE' && enfant.type === 'CONSULAT' && type === 'ADMINISTRATIVE_TUTELLE');
  }

  async function muter({ acteur, tenantId, parentId, enfantId, type, referenceValidation, action }) {
    if (!idStrict(tenantId) || !idStrict(parentId) || !idStrict(enfantId) || parentId === enfantId ||
        !typeLienValide(type)) throw new TypeError('RELATION_INVALIDE');
    if (action === 'CREER' && !referenceValide(referenceValidation))
      throw new TypeError('REFERENCE_VALIDATION_REQUISE');
    await verifier(acteur, tenantId, parentId, 'MANAGE_INSTITUTION_NETWORK');
    await verifier(acteur, tenantId, enfantId, 'MANAGE_INSTITUTION_NETWORK');
    if (typeof transaction !== 'function') throw new ReseauRefuse('TRANSACTION_INDISPONIBLE');

    return transaction(async client => {
      if (!client || typeof client.query !== 'function') throw new Error('CLIENT_TRANSACTIONNEL_REQUIS');
      // Verrou transactionnel réservé à ce contrat, tenant par tenant.
      await client.query(SQL_VERROU, [581233, tenantId]);
      const q = (sql, args) => client.query(sql, args);
      const d = await donnees(q, tenantId);
      const parent = d.organisations.find(o => o.id === parentId && o.tenant_id === tenantId);
      const enfant = d.organisations.find(o => o.id === enfantId && o.tenant_id === tenantId);
      if (!parent || !enfant || !relationPermise(parent, enfant, type))
        throw new ReseauRefuse('RELATION_NON_PERMISE');
      let result;
      if (action === 'CREER') {
        // Le graphe refuse notamment les cycles et les données tenant étrangères.
        construire({ ...d, relations: [...d.relations, {
          tenant_id: tenantId, source_organisation_id: parentId,
          target_organisation_id: enfantId, statut: 'ACTIVE', actif: true, type,
          date_debut: null, date_fin: null
        }] }, tenantId, new Date().toISOString());
        result = await q(SQL_INSERT, [tenantId, parentId, enfantId, type, referenceValidation]);
      } else if (action === 'REVOQUER') {
        result = await q(SQL_REVOQUER, [tenantId, parentId, enfantId, type]);
      } else throw new TypeError('ACTION_INVALIDE');
      if (result?.rows?.length !== 1) throw new ReseauRefuse('RELATION_ABSENTE_OU_DEJA_TRAITEE');
      const lien = result.rows[0];
      await q(SQL_AUDITER, [tenantId, parentId, acteur.personneId,
        action === 'CREER' ? 'INSTITUTION_RELATION_CREATED' : 'INSTITUTION_RELATION_REVOKED',
        lien.id, JSON.stringify({ parentId, enfantId, type, referenceValidation: action === 'CREER' ? referenceValidation : null })]);
      return lien;
    });
  }

  return Object.freeze({
    lireSousReseau,
    creerLien: params => muter({ ...params, action: 'CREER' }),
    revoquerLien: params => muter({ ...params, action: 'REVOQUER' })
  });
}

/** Adaptateur transactionnel optionnel. N'ouvre une transaction que si appelé. */
function creerTransactionPostgres(obtenirClient) {
  if (typeof obtenirClient !== 'function') throw new TypeError('Obtenir client PostgreSQL obligatoire');
  return async callback => {
    const client = await obtenirClient();
    let ouverte = false;
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      ouverte = true;
      const valeur = await callback(client);
      await client.query('COMMIT');
      ouverte = false;
      return valeur;
    } catch (erreur) {
      if (ouverte) await client.query('ROLLBACK').catch(() => {});
      throw erreur;
    } finally { client.release(); }
  };
}

module.exports = Object.freeze({
  creerServiceReseauInstitutionnel,
  creerTransactionPostgres,
  ReseauRefuse,
  SQL_ORGANISATIONS, SQL_RELATIONS, SQL_INSERT, SQL_REVOQUER
});
