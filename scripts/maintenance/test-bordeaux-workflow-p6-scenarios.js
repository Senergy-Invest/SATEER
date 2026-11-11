'use strict';
/**
 * P3.3.5BK — Scenarios E2E auth HTTP sur fixtures P6 en transaction.
 * Ce module est appelé depuis scripts/p6-routing-api-test.js uniquement
 * avec SATEER_TEST_WORKFLOW=1. Le harnais possède BEGIN / ROLLBACK et
 * vérifie l'absence de résidus sur une autre connexion.
 */
module.exports = async function verifierWorkflowP6(ctx) {
  const { assert, api, status, ok, client, submit, fixture, TENANT, base } = ctx;
  const d = await submit('PASSEPORT');
  const dossierId = d.id;
  const route = `/api/organisations/${fixture.orgId}/units/${fixture.passport}/cases/${dossierId}/respond`;
  const take = await api(base, `/api/agent/demandes/${dossierId}/prise-en-charge`, 'POST',
    { organisationId: fixture.orgId, tenantCode: TENANT }, fixture.cookies.pass, false);
  status(take, 200, 'BK: prise en charge d un dossier purement synthetique');

  const capabilitiesNoSession = await api(base, '/api/pilot/document-workflow/capabilities', 'GET', undefined, null, false);
  status(capabilitiesNoSession, 401, 'BK: capacites workflow inaccessibles anonymement');
  const capabilitiesAgent = await api(base, '/api/pilot/document-workflow/capabilities', 'GET', undefined, fixture.cookies.pass, false);
  status(capabilitiesAgent, 200, 'BK: capacites disponibles pour session agent');
  assert.equal(capabilitiesAgent.json?.version, 'P3.3.5G');

  const post = (operation, confirmation, cookie=fixture.cookies.pass, tenantCode=TENANT, unitId=fixture.passport) =>
    api(base, `/api/organisations/${fixture.orgId}/units/${unitId}/cases/${dossierId}/respond`, 'POST',
      { tenantCode, contenu:`P335BK ${operation} fictif`, operation, confirmation }, cookie, false);
  const state = async () => {
    const r = await client.query('SELECT statut, metadata, date_cloture FROM demandes WHERE id=$1', [dossierId]);
    assert.equal(r.rowCount, 1);
    return r.rows[0];
  };
  const count = async () => {
    const r = await client.query(`SELECT
      (SELECT count(*)::int FROM demande_reponses WHERE demande_id=$1) AS reponses,
      (SELECT count(*)::int FROM demande_history WHERE demande_id=$1) AS historique,
      (SELECT count(*)::int FROM notifications WHERE reference_type='DEMANDE' AND reference_id=$1) AS notifications`, [dossierId]);
    return r.rows[0];
  };
  const start = await count();

  status(await post('DOCUMENT_REMIS', true), 409, 'BK: remise sans document pret refusee');
  status(await post('DOCUMENT_PRET', false), 400, 'BK: preparation sans confirmation refusee');
  status(await post('DOCUMENT_REMIS', false), 400, 'BK: remise sans confirmation refusee');
  status(await post('OPERATEUR_INCONNU', true), 400, 'BK: operation inconnue refusee');
  status(await post('MESSAGE', false, null), 401, 'BK: ecriture anonyme refusee');
  status(await post('MESSAGE', false, fixture.cookies.unqualified), 403, 'BK: agent sans droit refuse');
  status(await post('MESSAGE', false, fixture.cookies.pass, `${TENANT}_AUTRE`), 403, 'BK: autre tenant refuse');
  status(await post('MESSAGE', false, fixture.cookies.pass, TENANT, fixture.civil), 403, 'BK: autre bureau refuse');
  assert.deepEqual(await count(), start, 'Aucun effet de bord des operations refusees');

  const msg = await post('MESSAGE', false); status(msg, 200, 'BK: message agent reussi');
  assert.equal(msg.json?.statut, 'REPONSE_ENVOYEE');
  let s = await state();
  assert.equal(s.statut, 'EN_COURS', 'MESSAGE ne cloture jamais le dossier');
  assert.equal(s.date_cloture, null, 'MESSAGE ne pose pas de date de cloture');
  assert.notEqual(s.metadata?.sateer_document?.statut, 'PRET_A_RETIRER');

  const pret = await post('DOCUMENT_PRET', true); status(pret, 200, 'BK: document pret confirme');
  assert.equal(pret.json?.statut, 'DOCUMENT_PRET_CONFIRME');
  s = await state();
  assert.equal(s.statut, 'EN_COURS', 'PRET ne cloture pas le dossier');
  assert.equal(s.metadata?.sateer_document?.statut, 'PRET_A_RETIRER');
  assert.equal(s.date_cloture, null);

  status(await post('DOCUMENT_PRET', true), 409, 'BK: confirmation PRET dupliquee refusee');
  const remise = await post('DOCUMENT_REMIS', true); status(remise, 200, 'BK: document remis et dossier clos');
  assert.equal(remise.json?.statut, 'DOCUMENT_REMIS_CONFIRME');
  s = await state();
  assert.equal(s.statut, 'TRAITEE', 'REMIS cloture le dossier');
  assert.equal(s.metadata?.sateer_document?.statut, 'REMIS');
  assert.ok(s.date_cloture, 'REMIS pose une date de cloture');
  status(await post('DOCUMENT_REMIS', true), 409, 'BK: remise dupliquee refusee');
  status(await post('MESSAGE', false), 409, 'BK: aucun message apres cloture');

  const end = await count();
  for (const field of ['reponses', 'historique', 'notifications']) {
    assert.equal(end[field]-start[field], 3, `Trois operations et exactement trois ${field}`);
  }
  const actions = await client.query(`SELECT action FROM demande_history WHERE demande_id=$1 AND action = ANY($2::text[]) ORDER BY id`,
    [dossierId, ['REPONSE_ENVOYEE','DOCUMENT_PRET_CONFIRME','DOCUMENT_REMIS_CONFIRME']]);
  assert.deepEqual(actions.rows.map(r=>r.action), ['REPONSE_ENVOYEE','DOCUMENT_PRET_CONFIRME','DOCUMENT_REMIS_CONFIRME']);
  const citizen = await api(base, `/api/demandes/${dossierId}?organisationId=${fixture.orgId}&tenant=${TENANT}`,
    'GET', undefined, fixture.cookies.citizen, false);
  status(citizen, 200, 'BK: citoyen proprietaire consulte son dossier');
  assert.ok(citizen.json?.reponses?.length >= 3, 'Trois reponses visibles au citoyen');
  ok(true, 'BK: workflow HTTP multi-profils, historique, notifications et rollback fixture P6');
};
