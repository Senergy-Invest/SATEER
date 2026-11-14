"use strict";
/** A9 : vrais appels HTTP + cookies, fixtures A8, transaction P6 et ROLLBACK global. */
module.exports = async function recetteIntentionsAmbassade(ctx) {
  const { assert, api, status, ok, client, fixture, TENANT, base, RUN } = ctx;
  if (process.env.PGDATABASE !== "sateer_test" || process.env.SATEER_P6_AMBASSADE_TEST !== "1") {
    throw new Error("A9_REQUIERT_HARNAIS_AMBASSADE_TRANSACTIONNEL");
  }
  const orgId = fixture.orgId;
  const canal = "MON_AMBASSADE";
  const form = (intention, categorie, suffix = "OK", overrides = {}) => ({
    organisationId: orgId, tenantCode: TENANT, canal,
    categorie, objet: `A9_${suffix}_${RUN}`,
    message: "Message fictif de recette A9; aucun dossier ni pièce réels.",
    priorite: "NORMALE", ...(intention === undefined ? {} : { intention }), ...overrides
  });
  const count = async () => Number((await client.query(
    "SELECT COUNT(*)::int AS n FROM demandes WHERE organisation_id=$1 AND canal=$2 AND objet LIKE $3",
    [orgId, canal, `A9_%_${RUN}`])).rows[0].n);
  const initial = await count();
  const ids = [];
  for (const [intention, categorie] of [
    ["INFORMATION", "PASSEPORT"], ["DEMARCHE", "PASSEPORT"], ["INCERTAIN", "AUTRE"]
  ]) {
    const x = await api(base, "/api/demandes", "POST", form(intention, categorie, intention), fixture.cookies.citizen, false);
    status(x, 201, `A9 ${intention} créée avec vrai HTTP`);
    assert.equal(x.json?.demande?.intention, intention);
    assert.equal(x.json?.orientationAutomatique?.statut, "QUALIFICATION_MANUELLE_REQUISE");
    assert.equal(x.json?.orientationAutomatique?.execution, false);
    const demandeId = Number(x.json?.demande?.id);
    assert.ok(Number.isSafeInteger(demandeId) && demandeId > 0);
    ids.push(demandeId);
    const sql = await client.query(`SELECT d.categorie,d.statut,d.destination_unit_id,h.metadata,h.action
      FROM demandes d JOIN demande_history h ON h.demande_id=d.id
      WHERE d.id=$1 AND d.organisation_id=$2 AND h.action='CREATION'`, [demandeId, orgId]);
    assert.equal(sql.rowCount, 1);
    assert.equal(sql.rows[0].categorie, categorie);
    assert.equal(sql.rows[0].statut, "NOUVELLE");
    assert.equal(sql.rows[0].destination_unit_id, null);
    assert.equal(sql.rows[0].metadata?.intention, intention);
    assert.equal(sql.rows[0].metadata?.source, canal);
    const detail = await api(base, `/api/demandes/${demandeId}?organisationId=${orgId}&tenant=${TENANT}`,
      "GET", undefined, fixture.cookies.citizen, false);
    status(detail, 200, `A9 historique accessible à l'auteur ${intention}`);
    assert.ok(detail.json?.historique?.some(h => h.action === "CREATION" && h.metadata?.intention === intention));
    const other = await api(base, `/api/demandes/${demandeId}?organisationId=${orgId}&tenant=${TENANT}`,
      "GET", undefined, fixture.cookies.other, false);
    status(other, 404, `A9 lecture transversale interdite ${intention}`);
  }
  assert.equal(await count(), initial + 3);
  for (const [name, body] of [
    ["sans intention", form(undefined, "PASSEPORT", "ABSENT")],
    ["intention inconnue", form("DOSSIER_PASSEPORT", "PASSEPORT", "INVALIDE")],
    ["intention null", form(null, "ETAT_CIVIL", "NULL")]
  ]) {
    const x = await api(base, "/api/demandes", "POST", body, fixture.cookies.citizen, false);
    status(x, 400, `A9 refus ${name}`);
    assert.equal(x.json?.statut, "INTENTION_AMBASSADE_INVALIDE");
  }
  assert.equal(await count(), initial + 3, "Refus A9 sans effet de bord PostgreSQL");
  status(await api(base, "/api/demandes", "POST", form("INFORMATION", "PASSEPORT", "HORS_ORG",
    { organisationId: fixture.org2 }), fixture.cookies.citizen, false), 403, "A9 hors organisation refusé");
  status(await api(base, "/api/demandes", "POST", form("INFORMATION", "PASSEPORT", "HORS_TENANT",
    { tenantCode: `${TENANT}_X` }), fixture.cookies.citizen, false), 403, "A9 hors tenant refusé");
  status(await api(base, "/api/demandes", "POST", form("INFORMATION", "PASSEPORT", "MAUVAIS_TYPE",
    { organisationId: fixture.org2 }), fixture.cookies.other, false), 422, "A9 type d'organisation incompatible");
  status(await api(base, "/api/demandes", "POST", form("DEMARCHE", "ETAT_CIVIL", "ANONYME"), null, false),
    401, "A9 session obligatoire");
  assert.equal(await count(), initial + 3);
  const qualified = await api(base,
    `/api/organisations/${orgId}/units/${fixture.qual}/inbox?tenant=${TENANT}`,
    "GET", undefined, fixture.cookies.qualObserver, false);
  status(qualified, 200, "A9 file de qualification accessible à un agent habilité");
  assert.ok(ids.every(id => qualified.json?.demandes?.some(d => Number(d.id) === id)),
    "Toutes les intentions doivent attendre la qualification humaine");
  const passportInbox = await api(base,
    `/api/organisations/${orgId}/units/${fixture.passport}/inbox?tenant=${TENANT}`,
    "GET", undefined, fixture.cookies.pass, false);
  status(passportInbox, 200, "A9 bureau Passeports accessible à son agent");
  assert.ok(ids.every(id => !passportInbox.json?.demandes?.some(d => Number(d.id) === id)),
    "Aucune intention n'est routée automatiquement par thème");
  // L'agent habilité conserve l'orientation manuelle du Workflow, sans moteur dupliqué.
  const routed = await api(base,
    `/api/organisations/${orgId}/units/${fixture.qual}/cases/${ids[1]}/route`, "POST",
    {tenantCode: TENANT, destinationUnitId: fixture.passport, motif: "Qualification humaine de la DEMARCHE fictive A9"},
    fixture.cookies.qualObserver, true);
  status(routed, 200, "A9 qualification puis orientation humaine DEMARCHE");
  const db = await client.query("SELECT destination_unit_id FROM demandes WHERE id=$1", [ids[1]]);
  assert.equal(Number(db.rows[0].destination_unit_id), fixture.passport);
  ok(true, "A9 intentions séparées du thème, historique atomique, RBAC et routage humain");
  console.log("A9_AMBASSADE_INTENTIONS_E2E_PASS");
};
