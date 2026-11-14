"use strict";
/**
 * A8 - MON_AMBASSADE: création citoyenne, qualification humaine avant thème,
 * orientation manuelle existante, prise en charge et réponse dans la fixture P6.
 * Toutes les écritures sont capturées dans le client de transaction externe P6.
 * Ne pas utiliser hors de SATEER_P6_AMBASSADE_TEST sur sateer_test.
 */
module.exports = async function recetteCitoyenAmbassade(ctx) {
  const { assert, api, status, ok, client, fixture, TENANT, base, RUN } = ctx;
  if (process.env.PGDATABASE !== "sateer_test" || process.env.SATEER_P6_AMBASSADE_TEST !== "1") {
    throw new Error("A8_REQUIERT_HARNAIS_AMBASSADE_TRANSACTIONNEL");
  }
  const orgId = fixture.orgId;
  const canal = "MON_AMBASSADE";
  const objet = `QUESTION_PASSEPORT_AMBASSADE_${RUN}`;
  const form = (organisationId = orgId, typeCanal = canal) => ({
    organisationId, tenantCode: TENANT, categorie: "PASSEPORT", objet,
    message: "Quels justificatifs faut-il présenter ? Ceci est une question, pas un dossier de pièces.",
    priorite: "NORMALE", canal: typeCanal, intention: "INFORMATION"
  });
  const before = await client.query("SELECT count(*)::int AS n FROM demandes WHERE organisation_id=$1 AND canal=$2", [orgId, canal]);
  let x = await api(base, "/api/demandes", "POST", form(), fixture.cookies.citizen, false);
  status(x, 201, "A8 demande citoyenne MON_AMBASSADE enregistrée");
  assert.equal(x.json?.statut, "DEMANDE_CREEE");
  assert.equal(x.json?.orientationAutomatique?.statut, "QUALIFICATION_MANUELLE_REQUISE");
  assert.equal(x.json?.orientationAutomatique?.execution, false);
  const demandeId = Number(x.json?.demande?.id);
  assert.ok(Number.isSafeInteger(demandeId) && demandeId > 0);
  let q = await client.query(`SELECT d.id,d.canal,d.destination_unit_id,d.statut,d.tenant_id
    FROM demandes d WHERE d.id=$1 AND d.organisation_id=$2`, [demandeId, orgId]);
  assert.equal(q.rowCount, 1);
  assert.equal(q.rows[0].canal, "MON_AMBASSADE");
  assert.equal(q.rows[0].destination_unit_id, null,
    "Une question sur passeport ne doit JAMAIS être routée sur seul mot-clef");
  assert.equal(q.rows[0].statut, "NOUVELLE");
  assert.equal(Number(q.rows[0].tenant_id), fixture.tenantId);
  ok(true, "A8 intention avant thème : création sans orientation automatique");

  const after = await client.query("SELECT count(*)::int AS n FROM demandes WHERE organisation_id=$1 AND canal=$2", [orgId, canal]);
  assert.equal(after.rows[0].n, before.rows[0].n + 1);
  x = await api(base, "/api/demandes", "POST", form(fixture.org2), fixture.cookies.other, false);
  status(x, 422, "A8 le canal Ambassade est refusé pour une organisation non AMBASSADE");
  assert.equal(x.json?.statut, "CANAL_AMBASSADE_INCOMPATIBLE");
  x = await api(base, "/api/demandes", "POST", form(fixture.org2), fixture.cookies.citizen, false);
  status(x, 403, "A8 demande refusée hors organisation personnelle");
  x = await api(base, "/api/demandes", "POST", form(), null, false);
  status(x, 401, "A8 absence de session refusée");
  q = await client.query("SELECT count(*)::int AS n FROM demandes WHERE organisation_id=$1 AND canal=$2", [orgId, canal]);
  assert.equal(q.rows[0].n, after.rows[0].n, "Aucun effet de bord des refus A8");
  ok(true, "A8 accès contrôlé avant toute mutation");

  const inboxQualification = `/api/organisations/${orgId}/units/${fixture.qual}/inbox?tenant=${TENANT}`;
  x = await api(base, inboxQualification, "GET", undefined, fixture.cookies.qualObserver, false);
  status(x, 200, "A8 qualification ouverte au personnel habilité");
  assert.ok(x.json?.demandes?.some(d => Number(d.id) === demandeId), "Question non orientée visible dans la file qualifiée");
  const inboxBureau = `/api/organisations/${orgId}/units/${fixture.passport}/inbox?tenant=${TENANT}`;
  x = await api(base, inboxBureau, "GET", undefined, fixture.cookies.pass, false);
  status(x, 200, "A8 bureau peut consulter son inbox");
  assert.ok(!x.json?.demandes?.some(d => Number(d.id) === demandeId), "Question non qualifiée absente du bureau Passeports");
  x = await api(base, `/api/organisations/${orgId}/units/${fixture.qual}/cases/${demandeId}/route`, "POST",
    { tenantCode: TENANT, destinationUnitId: fixture.passport, motif: "Qualification humaine et compétence validée dans la fixture A8" },
    fixture.cookies.qualObserver, true);
  status(x, 200, "A8 orientation effectuée par la personne habilitée");
  q = await client.query("SELECT destination_unit_id FROM demandes WHERE id=$1", [demandeId]);
  assert.equal(Number(q.rows[0].destination_unit_id), fixture.passport);
  x = await api(base, `/api/agent/demandes/${demandeId}/prise-en-charge`, "POST",
    {organisationId:orgId,tenantCode:TENANT}, fixture.cookies.pass, false);
  status(x, 200, "A8 prise en charge par le bureau autorisé");
  const reponse = `Réponse de recette A8 ${RUN} : les pièces sont à confirmer auprès de la source officielle.`;
  x = await api(base, `/api/agent/demandes/${demandeId}/reponse`, "POST",
    {organisationId:orgId,tenantCode:TENANT,contenu:reponse}, fixture.cookies.pass, false);
  status(x, 200, "A8 réponse de l'agent habilité");
  x = await api(base, `/api/demandes/${demandeId}?organisationId=${orgId}&tenant=${TENANT}`,
    "GET", undefined, fixture.cookies.citizen, false);
  status(x, 200, "A8 citoyen voit la réponse depuis sa session");
  assert.ok(x.json?.reponses?.some(r => r.contenu === reponse));
  assert.equal(x.json?.demande?.statut, "EN_COURS", "Répondre ne clôture pas automatiquement la demande");
  x = await api(base, `/api/agent/demandes/${demandeId}/reponse`, "POST",
    {organisationId:orgId,tenantCode:TENANT,contenu:"Interdit"}, fixture.cookies.unqualified, false);
  status(x, 403, "A8 agent non habilité ne peut pas répondre");
  q = await client.query("SELECT COUNT(*)::int AS n FROM demande_history WHERE demande_id=$1", [demandeId]);
  assert.ok(q.rows[0].n >= 3, "Création, orientation et réponse doivent laisser un historique");
  ok(true, "A8 parcours citoyen -> qualification -> bureau -> réponse auditable");

  const page = await fetch(base + "/ambassade.html");
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.ok(html.includes('id="ambassadeDemandeLink"'));
  const formulaire = await fetch(base + "/demande.html");
  assert.equal(formulaire.status, 200);
  const controller = await fetch(base + "/demande.js");
  assert.equal(controller.status, 200);
  assert.ok((await controller.text()).includes('"AMBASSADE"'));
  ok(true, "A8 pages citoyennes effectivement servies en HTTP");
  console.log("A8_AMBASSADE_CITOYEN_MANUEL_E2E_PASS");
};
