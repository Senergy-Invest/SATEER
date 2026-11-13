"use strict";
/**
 * A3a: contrat de sécurité des relations utilisées par Communication.
 * Sans PostgreSQL, sans réseau et sans données personnelles.
 * Les tests d'intégration réelle sont assurés par communication-p3-1-api-test.js.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
function file(name) { return fs.readFileSync(path.join(root, name), 'utf8'); }
function containsOnlyApprovedType(sql, aliases, label) {
  for (const alias of aliases) {
    assert.match(sql, new RegExp(`${alias}\\.type\\s*=\\s*'COMMUNITY_MEMBER'`),
      label + ' : filtrage explicite COMMUNICATION attendu sur ' + alias);
  }
  assert.doesNotMatch(sql, /type\s*IN\s*\([^)]*ADMINISTRATIVE_TUTELLE/i,
    label + ' : interdit de traiter la tutelle comme une relation de diffusion');
  assert.doesNotMatch(sql, /type\s*IN\s*\([^)]*SUPERVISION/i,
    label + ' : interdit de traiter la supervision comme une relation de diffusion');
}
const targets = file('communication-targets.js');
const targetCTE = targets.split('), cibles_autorisees AS (')[1]?.split('), nouvelle_publication AS (')[0];
assert.ok(targetCTE, 'CTE cibles_autorisees doit rester identifiable');
containsOnlyApprovedType(targetCTE, ['r'], 'Creation publication multi-organisations');
const router = file('communication-targets-router.js');
const dest = router.split('router.get("/:organisationId/communication-destinations"')[1]?.split('router.get("/:organisationId/communication-feed"')[0];
assert.ok(dest, 'Route liste de destinataires doit rester identifiable');
containsOnlyApprovedType(dest, ['rel'], 'Liste des destinataires');
const database = file('services-database.js');
const funcStart = database.indexOf('async function listerPublicationsVisiblesPourPersonneDatabase(');
const funcEnd = database.indexOf('async function creerDemandeDatabase(', funcStart);
assert.ok(funcStart >= 0 && funcEnd > funcStart, 'Service Commun doit rester présent');
const content = database.slice(funcStart, funcEnd);
const audience = content.split("pub.audience_type = 'ORGANISATIONS'")[1]?.split(')\n                    )')[0];
assert.ok(audience, 'Audience ORGANISATIONS doit rester identifiable');
containsOnlyApprovedType(audience, ['rel'], 'Accès publication selon organisation cible');
assert.match(content, /pub\.audience_type = 'ASSOCIATION'[\s\S]*?rel\.type='COMMUNITY_MEMBER'/,
  'Le filtrage ASSOCIATION historique doit être conservé');
// Le contrat de graphe n'attribue pas de permissions.
const graph = require('../institution-relationship-graph');
const now = '2026-11-13T13:00:00Z';
const relation = {tenant_id:1,source_organisation_id:2,target_organisation_id:3,
  actif:true,statut:'ACTIVE',date_debut:null,date_fin:null};
for (const kind of ['ADMINISTRATIVE_TUTELLE','SUPERVISION','COORDINATION','COMMUNITY_MEMBER']) {
  assert.equal(graph.estRelationDeCommunicationCandidate({...relation,type:kind},{tenantId:1,dateReference:now}),false,
    'La relation '+kind+' ne doit pas devenir une permission interinstitutionnelle');
}
assert.equal(graph.estRelationDeCommunicationCandidate({...relation,type:'COMMUNICATION_AUTHORIZATION'},
  {tenantId:1,dateReference:now}),true,
  'Le contrat pur peut reconnaitre une candidature explicite, sans activer cette relation en SQL');
const fixture = file('scripts/communication-p3-1-api-test.js');
assert.doesNotMatch(fixture, /'TEST_P3_1'/,
  'La fixture de contrat ne doit plus utiliser un type arbitraire pour les permissions');
assert.match(fixture, /'COMMUNITY_MEMBER','ACTIVE',TRUE/,
  'La fixture de test conserve une relation de diffusion explicitement permise');
console.log('PASS_A3A_RELATIONS: ciblage, liste, audience et absence de droits de tutelle');
