"use strict";

// P6 API validation. All application database operations are pinned to one
// PostgreSQL client and one real outer transaction; nested route transactions
// are represented by PostgreSQL savepoints. No application COMMIT can escape.
const assert = require("node:assert/strict");
const { randomUUID, randomBytes } = require("node:crypto");
const { Pool } = require("pg");
const express = require("express");

const DB_NAME = "sateer_test";
const AUTHORIZED_SYSTEM_ID = "7699611241381229531";
const RUN = randomUUID().replace(/-/g, "");
const TENANT = `P6T_${RUN.slice(0, 8).toUpperCase()}`;
const EMAIL_TAG = `p6.${RUN}@sateer.test`;
const PASSWORD = `P6!${randomBytes(32).toString("base64url")}`;
const requiredConnection = ["PGHOST", "PGPORT"];
for (const name of requiredConnection) {
  if (!process.env[name]) throw new Error(`Refus P6 : ${name} doit être explicitement défini.`);
}
if (!process.env.PGUSER) process.env.PGUSER = process.env.USER;
if (process.env.PGDATABASE && process.env.PGDATABASE !== DB_NAME) throw new Error("Refus P6 : PGDATABASE doit être sateer_test.");
process.env.PGDATABASE = DB_NAME;
process.env.PORT = "0";
process.env.SATEER_LISTEN_HOST = "127.0.0.1";
process.env.NODE_ENV = "test";

const database = require("../database");
const original = {
  query: database.executerRequete,
  connect: database.obtenirClientDatabase,
  end: database.fermerDatabase
};
const verifierPool = new Pool({
  database: DB_NAME, host: process.env.PGHOST, port: Number(process.env.PGPORT),
  user: process.env.PGUSER, password: process.env.PGPASSWORD
});
let client;
let server;
let savepoint = 0;
let savepointDepth = 0;
let appQueryCount = 0;
let fixture = {};

function ok(value, message) { assert.ok(value, message); console.log(`OK - ${message}`); }
function id(value) { return Number(value); }
function routeTx(sql, values) {
  const s = String(typeof sql === "string" ? sql : sql.text || "").trim().toUpperCase();
  if (s === "BEGIN" || s.startsWith("BEGIN ")) {
    const name = `p6_sp_${++savepoint}`;
    savepointDepth += 1;
    return client.query(`SAVEPOINT ${name}`).then(r => ({ ...r, _p6Savepoint: name }));
  }
  if (s === "COMMIT") {
    if (!savepointDepth) throw new Error("COMMIT applicatif sans savepoint P6.");
    const name = `p6_sp_${savepoint}`;
    savepoint -= 1; savepointDepth -= 1;
    return client.query(`RELEASE SAVEPOINT ${name}`);
  }
  if (s === "ROLLBACK") {
    if (!savepointDepth) throw new Error("ROLLBACK applicatif sans savepoint P6.");
    const name = `p6_sp_${savepoint}`;
    savepoint -= 1; savepointDepth -= 1;
    return client.query(`ROLLBACK TO SAVEPOINT ${name}`).then(async result => {
      await client.query(`RELEASE SAVEPOINT ${name}`); return result;
    });
  }
  appQueryCount += 1;
  return client.query(sql, values);
}
const sharedClient = {
  get processID() { return client.processID; },
  query: routeTx,
  release() { /* Le client appartient au harness et reste dans la transaction. */ }
};
database.executerRequete = (sql, values) => routeTx(sql, values);
database.obtenirClientDatabase = async () => sharedClient;
database.fermerDatabase = async () => {};

async function api(base, path, method = "GET", body, cookie, origin = true) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  if (origin) headers.origin = base;
  const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch {}
  return { response, json };
}
function status(result, expected, message) {
  assert.equal(result.response.status, expected, `${message}: HTTP ${result.response.status}, attendu ${expected}`);
  console.log(`OK - ${message} (HTTP ${expected})`);
}

async function creerPersonne(label) {
  const r = await client.query("INSERT INTO personnes(prenom,nom,profil) VALUES($1,$2,$3) RETURNING id", ["Test", `${label}_${RUN}`, "P6_SYNTHETIQUE"]);
  const personId = id(r.rows[0].id); fixture.personIds.push(personId); return personId;
}
async function creerRole(orgId, tenantId, personId, code, permissions, unitId = null) {
  const role = await client.query("INSERT INTO organisation_roles(organisation_id,code,nom,scope) VALUES($1,$2,$2,$3) RETURNING id", [orgId, `P6_${code}_${RUN.slice(0,8)}`, unitId ? "UNIT" : "ORGANISATION"]);
  const roleId = id(role.rows[0].id);
  const perms = await client.query("SELECT id,code FROM permissions WHERE actif=TRUE AND code=ANY($1::text[])", [permissions]);
  const found = new Set(perms.rows.map(x => x.code));
  assert.deepEqual([...permissions].filter(x => !found.has(x)), [], "Catalogue de permissions P6 incomplet; refus avant test HTTP.");
  for (const p of perms.rows) await client.query("INSERT INTO role_permissions(role_id,permission_id) VALUES($1,$2)", [roleId, p.id]);
  if (unitId) {
    await client.query("INSERT INTO relations_personne_organisation_unit(personne_id,organisation_unit_id,role,role_id,principal,actif) VALUES($1,$2,$3,$4,TRUE,TRUE)", [personId, unitId, code, roleId]);
  } else {
    await client.query("INSERT INTO relations_personne_organisation_roles(personne_id,organisation_id,role_id,actif) VALUES($1,$2,$3,TRUE)", [personId, orgId, roleId]);
  }
}
async function main() {
  assert.equal(process.env.PGHOST, "::1", "Refus P6 : hôte PostgreSQL autorisé attendu ::1.");
  assert.equal(Number(process.env.PGPORT), 5432, "Refus P6 : port PostgreSQL autorisé attendu 5432.");
  // Bypass the application proxy only for the harness-owned physical client.
  client = await original.connect();
  const identity = await client.query("SELECT current_database() AS db, (SELECT system_identifier::text FROM pg_control_system()) AS system_id, pg_backend_pid() AS pid");
  assert.equal(identity.rows[0].db, DB_NAME, "Base confirmée avant écriture");
  assert.equal(identity.rows[0].system_id, AUTHORIZED_SYSTEM_ID, "Instance PostgreSQL non explicitement autorisée");
  const backendPid = identity.rows[0].pid;
  console.log("OK - cible sateer_test et instance PostgreSQL épinglée confirmées");
  const schema = await client.query(`SELECT to_regclass('public.organisation_routing_rules') IS NOT NULL AS rules,
    to_regclass('public.organisation_routing_rule_audit') IS NOT NULL AS audit,
    to_regclass('public.organisation_unit_capabilities') IS NOT NULL AS caps,
    to_regclass('public.demande_history') IS NOT NULL AS history`);
  assert.ok(Object.values(schema.rows[0]).every(Boolean), "Schéma P6 incomplet: aucune écriture effectuée.");
  await client.query("BEGIN");
  const caps = await client.query("SELECT id,code FROM capabilities WHERE actif=TRUE AND code=ANY($1::text[])", [["RECEIVE_INCOMING","VIEW_INBOX","TAKE_CASES","PROCESS_CASES","RESPOND_CASES","ROUTE_CASES"]]);
  const capIds = Object.fromEntries(caps.rows.map(x => [x.code, x.id]));
  assert.ok(["RECEIVE_INCOMING","VIEW_INBOX","TAKE_CASES","PROCESS_CASES","RESPOND_CASES","ROUTE_CASES"].every(x => capIds[x]), "Capacités de test manquantes.");
  const t = await client.query("INSERT INTO tenants(code,nom,type) VALUES($1,$2,'TEST_SYNTHETIQUE') RETURNING id", [TENANT, `P6 ${RUN}`]);
  fixture.tenantId = id(t.rows[0].id); fixture.personIds = []; fixture.orgIds = []; fixture.demandIds = [];
  const org = await client.query("INSERT INTO organisations(nom,type,tenant_id) VALUES($1,'TEST_SYNTHETIQUE',$2) RETURNING id", [`P6 organisation ${RUN}`, fixture.tenantId]);
  fixture.orgId = id(org.rows[0].id); fixture.orgIds.push(fixture.orgId);
  const org2 = await client.query("INSERT INTO organisations(nom,type,tenant_id) VALUES($1,'TEST_SYNTHETIQUE',$2) RETURNING id", [`P6 autre organisation ${RUN}`, fixture.tenantId]);
  fixture.org2 = id(org2.rows[0].id); fixture.orgIds.push(fixture.org2);
  const otherTenant = await client.query("INSERT INTO tenants(code,nom,type) VALUES($1,$2,'TEST_SYNTHETIQUE') RETURNING id", [`${TENANT}_X`, `P6 autre tenant ${RUN}`]);
  fixture.tenant2 = id(otherTenant.rows[0].id);
  const org3 = await client.query("INSERT INTO organisations(nom,type,tenant_id) VALUES($1,'TEST_SYNTHETIQUE',$2) RETURNING id", [`P6 autre tenant org ${RUN}`, fixture.tenant2]);
  fixture.org3 = id(org3.rows[0].id); fixture.orgIds.push(fixture.org3);
  async function unit(orgId, code, active = true, receive = true) {
    const r = await client.query("INSERT INTO organisation_units(organisation_id,code,nom,type,actif) VALUES($1,$2,$3,'TEST', $4) RETURNING id", [orgId, `${code}_${RUN.slice(0,8)}`, code, active]);
    const unitId = id(r.rows[0].id); fixture.unitIds.push(unitId);
    const wanted = receive ? ["RECEIVE_INCOMING","VIEW_INBOX","TAKE_CASES","PROCESS_CASES","RESPOND_CASES"] : ["VIEW_INBOX"];
    for (const c of wanted) await client.query("INSERT INTO organisation_unit_capabilities(organisation_unit_id,capability_id,actif) VALUES($1,$2,TRUE)", [unitId, capIds[c]]);
    return unitId;
  }
  fixture.unitIds = [];
  fixture.passport = await unit(fixture.orgId, "PASSPORT");
  fixture.civil = await unit(fixture.orgId, "CIVIL");
  fixture.qual = await unit(fixture.orgId, "QUALIFICATION");
  await client.query("INSERT INTO organisation_unit_capabilities(organisation_unit_id,capability_id,configuration,actif) VALUES($1,$2,$3::jsonb,TRUE)", [fixture.qual, capIds.ROUTE_CASES, JSON.stringify({allowedDestinationUnitIds: []})]);
  fixture.viewOnly = await unit(fixture.orgId, "VIEW_ONLY", true, false);
  fixture.inactive = await unit(fixture.orgId, "INACTIVE", false, true);
  fixture.foreignUnit = await unit(fixture.org2, "FOREIGN");
  fixture.foreignTenantUnit = await unit(fixture.org3, "FOREIGN_TENANT");
  fixture.vice = await creerPersonne("VICE"); fixture.citizen = await creerPersonne("CITIZEN");
  fixture.agentPass = await creerPersonne("AGENT_PASS"); fixture.agentCivil = await creerPersonne("AGENT_CIVIL");
  fixture.unqualified = await creerPersonne("UNQUALIFIED"); fixture.qualObserver = await creerPersonne("QUAL_OBSERVER");
  fixture.unitRouter = await creerPersonne("UNIT_ROUTER");
  fixture.otherOrgPerson = await creerPersonne("OTHER_ORG");
  for (const p of [fixture.vice, fixture.citizen, fixture.agentPass, fixture.agentCivil, fixture.unqualified, fixture.qualObserver, fixture.unitRouter]) {
    await client.query("INSERT INTO relations_personne_organisation(personne_id,organisation_id,type) VALUES($1,$2,'TEST_SYNTHETIQUE')", [p, fixture.orgId]);
  }
  await client.query("INSERT INTO relations_personne_organisation(personne_id,organisation_id,type) VALUES($1,$2,'TEST_SYNTHETIQUE')", [fixture.otherOrgPerson, fixture.org2]);
  await creerRole(fixture.orgId, fixture.tenantId, fixture.vice, "VICE", ["CREATE_UNIT","VIEW_INCOMING","ROUTE_CASE"]);
  await creerRole(fixture.orgId, fixture.tenantId, fixture.agentPass, "AGENT_PASS", ["VIEW_INCOMING","VIEW_CASE","TAKE_CASE","PROCESS_CASE","RESPOND_CASE"], fixture.passport);
  await creerRole(fixture.orgId, fixture.tenantId, fixture.agentCivil, "AGENT_CIVIL", ["VIEW_INCOMING","VIEW_CASE","TAKE_CASE","PROCESS_CASE","RESPOND_CASE"], fixture.civil);
  await creerRole(fixture.orgId, fixture.tenantId, fixture.unqualified, "VIEW_ONLY", ["VIEW_INCOMING","VIEW_CASE"], fixture.viewOnly);
  await creerRole(fixture.orgId, fixture.tenantId, fixture.qualObserver, "QUALIFICATION_VIEWER", ["VIEW_INCOMING","VIEW_CASE"], fixture.qual);
  await creerRole(fixture.orgId, fixture.tenantId, fixture.qualObserver, "QUALIFICATION_MANAGER", ["VIEW_INCOMING","ROUTE_CASE"]);
  await creerRole(fixture.orgId, fixture.tenantId, fixture.unitRouter, "QUALIFICATION_UNIT_ROUTER", ["VIEW_INCOMING","VIEW_CASE","ROUTE_CASE"], fixture.qual);
  await client.query("UPDATE organisation_unit_capabilities SET configuration=$2::jsonb WHERE organisation_unit_id=$1 AND capability_id=$3", [fixture.qual, JSON.stringify({allowedDestinationUnitIds:[fixture.passport,fixture.civil,fixture.foreignUnit,fixture.foreignTenantUnit]}), capIds.ROUTE_CASES]);
  fixture.cookies = {};

  // Prevent any nested route transaction from escaping the outer rollback.
  // Every DB module in the application imports database.js; this harness patches
  // both exported query paths before loading server.js and checks backend PID.
  const originalListen = express.application.listen;
  let capturedServer;
  express.application.listen = function (...args) {
    const listener = args.length === 2 ? originalListen.call(this, 0, "127.0.0.1", args[1]) : originalListen.call(this, 0, "127.0.0.1", args[2]);
    capturedServer = listener; return listener;
  };
  require("../server");
  express.application.listen = originalListen;
  server = capturedServer;
  await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  const address = server.address();
  assert.equal(address.address, "127.0.0.1");
  const base = `http://127.0.0.1:${address.port}`;
  const configPage = await fetch(`${base}/configuration-consulat.html`);
  assert.equal(configPage.status, 200, "La page du configurateur doit être servie par l'instance de test.");
  const configHtml = await configPage.text();
  assert.ok(configHtml.includes('data-tab="routage"') && configHtml.includes('value="__DEFAULT__"'), "Onglet P6 et catégorie de repli présents dans la page servie.");
  assert.ok(configHtml.includes('id="sx-p6-rule-form"') && configHtml.includes('id="sx-p6-save"') && configHtml.includes('type="submit"') && !configHtml.includes('sx-p4-route-preview'), "P6 possède son formulaire et n'affiche plus l'ancien aperçu P4.");
  assert.ok(configHtml.includes('<option value="PASSEPORT">Passeport</option>') && configHtml.includes('<option value="ETAT_CIVIL">État civil</option>'), "Les valeurs des options Passeport et État civil correspondent aux catégories API.");
  const uiScriptResponse = await fetch(`${base}/p6-routing-ui.js`);
  assert.equal(uiScriptResponse.status, 200, "Le script du configurateur P6 doit être servi.");
  const uiScript = await uiScriptResponse.text();
  assert.ok(uiScript.includes("Réactiver") && uiScript.includes("Désactiver") && uiScript.includes("__DEFAULT__"), "Le client P6 expose les actions de réactivation, désactivation et repli.");
  assert.ok(uiScript.includes("const categorie=String(categorySelect.value).trim();") && uiScript.includes("ruleForm?.addEventListener('submit'") && uiScript.includes("for(const r of data.regles)") && uiScript.includes("box.replaceChildren();"), "Le client soumet le formulaire une fois et rend chaque ligne renvoyée par l’API.");
  ok(true, "page et contrôleur P6 effectivement servis par HTTP");
  // Replace the earlier placeholder base used by login helper.
  async function login(personId, label) {
    const auth = require("../auth-database");
    const loginName = `${EMAIL_TAG}.${label}`;
    const made = await auth.creerCompteAuthentificationDatabase(personId, loginName, PASSWORD);
    assert.equal(made.succes, true);
    const x = await api(base, "/api/auth/login", "POST", { identifiant: loginName, motDePasse: PASSWORD }, null, false);
    status(x, 200, `session ${label}`);
    const c = (typeof x.response.headers.getSetCookie === "function" ? x.response.headers.getSetCookie() : [x.response.headers.get("set-cookie") || ""]).map(v => v.split(";")[0]).find(v => v.startsWith("sateer_session="));
    assert.ok(c); return c;
  }
  fixture.cookies.vice = await login(fixture.vice, "vice");
  fixture.cookies.citizen = await login(fixture.citizen, "citizen");
  fixture.cookies.pass = await login(fixture.agentPass, "pass-agent");
  fixture.cookies.civil = await login(fixture.agentCivil, "civil-agent");
  fixture.cookies.unqualified = await login(fixture.unqualified, "unqualified");
  fixture.cookies.qualObserver = await login(fixture.qualObserver, "qualification-observer");
  fixture.cookies.unitRouter = await login(fixture.unitRouter, "unit-router");
  fixture.cookies.other = await login(fixture.otherOrgPerson, "other-org");
  const configPath = `/api/organisations/${fixture.orgId}/routing-rules`;
  async function rule(category, destination, method = "PUT", cookie = fixture.cookies.vice, orgId = fixture.orgId, tenant = TENANT) {
    return api(base, configPath.replace(String(fixture.orgId), String(orgId)) + (method === "DELETE" ? `/${encodeURIComponent(category)}?tenant=${tenant}` : ""), method,
      method === "DELETE" ? undefined : { tenantCode: tenant, categorie: category, destinationUnitId: destination }, cookie);
  }
  async function listRules(cookie = fixture.cookies.vice, orgId = fixture.orgId, tenant = TENANT) {
    return api(base, `/api/organisations/${orgId}/routing-rules?tenant=${encodeURIComponent(tenant)}`, "GET", undefined, cookie, false);
  }
  async function submit(category) {
    const r = await api(base, "/api/demandes", "POST", { organisationId: fixture.orgId, tenantCode: TENANT, categorie: category, objet: `P6 ${category} ${RUN}`, message: `Synthétique ${RUN}`, canal: "MON_CONSULAT" }, fixture.cookies.citizen, false);
    status(r, 201, `soumission citoyenne ${category}`);
    const d = r.json?.demande;
    assert.ok(d?.id); fixture.demandIds.push(id(d.id)); return { id: id(d.id), result: r.json };
  }
  async function inbox(unitId, cookie) {
    return api(base, `/api/organisations/${fixture.orgId}/units/${unitId}/inbox?tenant=${TENANT}`, "GET", undefined, cookie, false);
  }
  const configured = await rule("PASSEPORT", fixture.passport); status(configured, 200, "Vice-Consul configure PASSEPORT");
  let listedRules = await listRules(); status(listedRules, 200, "lecture API après création de PASSEPORT");
  let passportRule = listedRules.json.regles.find(x => x.categorie === "PASSEPORT");
  assert.ok(passportRule?.actif); assert.equal(id(passportRule.destinationUnitId), fixture.passport);
  ok(true, "PASSEPORT est active et dirigée vers Bureau Passeports");
  let d = await submit("PASSEPORT");
  fixture.passportDemandId = d.id;
  console.log(`Observation P6 PASSEPORT : ${d.result.orientationAutomatique?.statut || "statut absent"}`);
  assert.equal(d.result.orientationAutomatique?.statut, "ORIENTEE", "La demande PASSEPORT doit être affectée par la règle active.");
  assert.equal(id(d.result.orientationAutomatique.destinationUnitId), fixture.passport); ok(true, "PASSEPORT routé directement au bureau compétent");
  let i = await inbox(fixture.passport, fixture.cookies.pass); status(i, 200, "inbox Passeports autorisée"); assert.ok(i.json.demandes.some(x => id(x.id) === d.id));
  i = await inbox(fixture.passport, fixture.cookies.citizen); status(i, 403, "citoyen refusé dans inbox agent");
  i = await inbox(fixture.passport, fixture.cookies.unqualified); status(i, 403, "unité sans capacités de réception refusée");
  const take = await api(base, `/api/agent/demandes/${d.id}/prise-en-charge`, "POST", { organisationId: fixture.orgId, tenantCode: TENANT }, fixture.cookies.pass, false); status(take, 200, "agent habilité prend le dossier");
  const reply = await api(base, `/api/agent/demandes/${d.id}/reponse`, "POST", { organisationId: fixture.orgId, tenantCode: TENANT, contenu: `Réponse synthétique ${RUN}` }, fixture.cookies.pass, false); status(reply, 200, "agent habilité répond au citoyen");
  if (process.env.SATEER_TEST_WORKFLOW === "1") {
    await require("./maintenance/test-bordeaux-workflow-p6-scenarios")({
      assert, api, status, ok, client, submit, fixture, TENANT, base
    });
  }
    const citizenDetail = await api(base, `/api/demandes/${d.id}?organisationId=${fixture.orgId}&tenant=${TENANT}`, "GET", undefined, fixture.cookies.citizen, false);
    status(citizenDetail, 200, "citoyen consulte le détail de sa demande");
    assert.ok(citizenDetail.json.reponses.some(x => x.contenu === `Réponse synthétique ${RUN}`), "La réponse de l'agent est visible au citoyen via l'API.");
    ok(true, "réponse de l'agent visible au citoyen");
    const refusedReply = await api(base, `/api/agent/demandes/${d.id}/reponse`, "POST", { organisationId: fixture.orgId, tenantCode: TENANT, contenu: `Réponse non autorisée ${RUN}` }, fixture.cookies.unqualified, false);
    status(refusedReply, 403, "agent non habilité ne peut pas répondre");
  const stateRule = await rule("ETAT_CIVIL", fixture.civil); status(stateRule, 200, "Vice-Consul configure ETAT_CIVIL");
  listedRules = await listRules(); status(listedRules, 200, "lecture API après création de ETAT_CIVIL");
  passportRule = listedRules.json.regles.find(x => x.categorie === "PASSEPORT");
  let civilRule = listedRules.json.regles.find(x => x.categorie === "ETAT_CIVIL");
  assert.ok(passportRule?.actif && civilRule?.actif, "Les deux catégories doivent coexister et rester actives.");
  assert.equal(id(passportRule.destinationUnitId), fixture.passport);
  assert.equal(id(civilRule.destinationUnitId), fixture.civil);
  ok(true, "PASSEPORT et ETAT_CIVIL coexistent avec leurs destinations respectives");
  let persistedRules = await client.query(`SELECT category_key,destination_unit_id,actif FROM organisation_routing_rules
    WHERE organisation_id=$1 AND tenant_id=$2 AND source='MON_CONSULAT' AND category_key=ANY($3::text[])
    ORDER BY category_key`, [fixture.orgId, fixture.tenantId, ["PASSEPORT", "ETAT_CIVIL"]]);
  assert.equal(persistedRules.rowCount, 2, "Les deux règles doivent être présentes dans la transaction PostgreSQL.");
  ok(true, "deux lignes distinctes persistées dans la transaction de test");

  const cardRule = await rule("CARTE_CONSULAIRE", fixture.passport); status(cardRule, 200, "Vice-Consul configure CARTE_CONSULAIRE");
  assert.equal(cardRule.json.regle.categorie, "CARTE_CONSULAIRE");
  assert.equal(id(cardRule.json.regle.destinationUnitId), fixture.passport);
  listedRules = await listRules(); status(listedRules, 200, "lecture API après création de CARTE_CONSULAIRE");
  const cardSaved = listedRules.json.regles.find(x => x.categorie === "CARTE_CONSULAIRE");
  passportRule = listedRules.json.regles.find(x => x.categorie === "PASSEPORT");
  civilRule = listedRules.json.regles.find(x => x.categorie === "ETAT_CIVIL");
  assert.ok(cardSaved?.actif && passportRule?.actif && civilRule?.actif);
  assert.equal(id(cardSaved.destinationUnitId), fixture.passport);
  assert.equal(id(passportRule.destinationUnitId), fixture.passport);
  assert.equal(id(civilRule.destinationUnitId), fixture.civil);
  persistedRules = await client.query(`SELECT category_key,destination_unit_id,actif FROM organisation_routing_rules
    WHERE organisation_id=$1 AND tenant_id=$2 AND source='MON_CONSULAT' AND category_key=ANY($3::text[])
    ORDER BY category_key`, [fixture.orgId, fixture.tenantId, ["PASSEPORT", "CARTE_CONSULAIRE", "ETAT_CIVIL"]]);
  assert.equal(persistedRules.rowCount, 3, "Les trois catégories doivent coexister dans la transaction PostgreSQL.");
  ok(true, "PASSEPORT, CARTE_CONSULAIRE et ETAT_CIVIL coexistent après trois sauvegardes API");

  let changedCivil = await rule("ETAT_CIVIL", fixture.passport); status(changedCivil, 200, "modification isolée de ETAT_CIVIL");
  listedRules = await listRules(); status(listedRules, 200, "lecture après modification de ETAT_CIVIL");
  passportRule = listedRules.json.regles.find(x => x.categorie === "PASSEPORT");
  civilRule = listedRules.json.regles.find(x => x.categorie === "ETAT_CIVIL");
  const cardUnchanged = listedRules.json.regles.find(x => x.categorie === "CARTE_CONSULAIRE");
  assert.equal(id(passportRule.destinationUnitId), fixture.passport);
  assert.equal(id(civilRule.destinationUnitId), fixture.passport);
  assert.equal(id(cardUnchanged.destinationUnitId), fixture.passport);
  changedCivil = await rule("ETAT_CIVIL", fixture.civil); status(changedCivil, 200, "restauration isolée de la destination ETAT_CIVIL");

  const disabledPassport = await rule("PASSEPORT", fixture.passport, "DELETE"); status(disabledPassport, 200, "désactivation isolée de PASSEPORT");
  listedRules = await listRules(); status(listedRules, 200, "lecture des règles actives et désactivées");
  passportRule = listedRules.json.regles.find(x => x.categorie === "PASSEPORT");
  civilRule = listedRules.json.regles.find(x => x.categorie === "ETAT_CIVIL");
  const cardStillActive = listedRules.json.regles.find(x => x.categorie === "CARTE_CONSULAIRE");
  assert.equal(passportRule?.actif, false); assert.equal(civilRule?.actif, true); assert.equal(cardStillActive?.actif, true);
  ok(true, "PASSEPORT désactivée reste visible et ETAT_CIVIL reste active");
  const reactivatedPassport = await rule("PASSEPORT", fixture.passport); status(reactivatedPassport, 200, "réactivation isolée de PASSEPORT");
  listedRules = await listRules(); status(listedRules, 200, "lecture après réactivation de PASSEPORT");
  passportRule = listedRules.json.regles.find(x => x.categorie === "PASSEPORT");
  civilRule = listedRules.json.regles.find(x => x.categorie === "ETAT_CIVIL");
  const cardStillUnchanged = listedRules.json.regles.find(x => x.categorie === "CARTE_CONSULAIRE");
  assert.equal(passportRule?.actif, true); assert.equal(id(passportRule.destinationUnitId), fixture.passport);
  assert.equal(civilRule?.actif, true); assert.equal(id(civilRule.destinationUnitId), fixture.civil);
  assert.equal(cardStillUnchanged?.actif, true); assert.equal(id(cardStillUnchanged.destinationUnitId), fixture.passport);
  ok(true, "réactivation de PASSEPORT ne modifie pas ETAT_CIVIL ni CARTE_CONSULAIRE");

  const crossOrgRead = await listRules(fixture.cookies.other, fixture.orgId, TENANT);
  status(crossOrgRead, 403, "lecture des règles refusée hors organisation autorisée");
  const crossTenantRead = await listRules(fixture.cookies.vice, fixture.orgId, `${TENANT}_X`);
  status(crossTenantRead, 403, "lecture des règles refusée hors tenant");
  d = await submit("ETAT_CIVIL"); assert.equal(id(d.result.orientationAutomatique.destinationUnitId), fixture.civil); ok(true, "ETAT_CIVIL routé au bureau distinct");
  const noCivil = await inbox(fixture.civil, fixture.cookies.pass); status(noCivil, 403, "agent Passeports isolé du bureau État civil");
  const fallback = await rule("__DEFAULT__", fixture.qual); status(fallback, 200, "Vice-Consul configure la file de qualification");
  d = await submit("CATEGORIE_INCONNUE"); assert.equal(id(d.result.orientationAutomatique.destinationUnitId), fixture.qual); ok(true, "catégorie inconnue routée vers __DEFAULT__");
  const oldDestination = id(d.result.orientationAutomatique.destinationUnitId);
  const moved = await rule("__DEFAULT__", fixture.passport); status(moved, 200, "Vice-Consul modifie la destination");
  const afterChange = await submit("CATEGORIE_INCONNUE"); assert.equal(id(afterChange.result.orientationAutomatique.destinationUnitId), fixture.passport); ok(oldDestination !== fixture.passport, "nouvelle règle appliquée aux nouvelles demandes");
  const previous = await client.query("SELECT destination_unit_id FROM demandes WHERE id=$1", [d.id]); assert.equal(id(previous.rows[0].destination_unit_id), oldDestination); ok(true, "demande déjà routée non réaffectée par modification de règle");
  const forbidden = await rule("XTEST", fixture.civil, "PUT", fixture.cookies.other, fixture.orgId); status(forbidden, 403, "membre non habilité refusé sur modification");
  const noSession = await rule("NOSESSION", fixture.civil, "PUT", null); status(noSession, 401, "modification de règle sans session refusée");
  const wrongOrg = await rule("XTEST", fixture.civil, "PUT", fixture.cookies.other, fixture.org2); status(wrongOrg, 403, "organisation incorrecte refusée");
  const viceWrongOrg = await rule("XTEST", fixture.civil, "PUT", fixture.cookies.vice, fixture.org2); status(viceWrongOrg, 403, "Vice-Consul synthétique refusé hors de son organisation");
  const wrongTenant = await rule("XTEST", fixture.civil, "PUT", fixture.cookies.vice, fixture.orgId, `${TENANT}_X`); status(wrongTenant, 403, "tenant incorrect refusé");
  for (const [label, unitId] of [["inactive",fixture.inactive],["foreign organization",fixture.foreignUnit],["foreign tenant",fixture.foreignTenantUnit],["missing receive capabilities",fixture.viewOnly]]) {
    const rejected = await rule(`BAD_${label.toUpperCase().replace(/[^A-Z]/g,"_")}`, unitId);
    status(rejected, 409, `destination ${label} refusée`);
  }
  const noRule = await rule("__DEFAULT__", fixture.passport, "DELETE"); status(noRule, 200, "désactivation de __DEFAULT__");
  const adminList = await api(base, configPath + `?tenant=${TENANT}`, "GET", undefined, fixture.cookies.vice, false);
  status(adminList, 200, "Vice-Consul consulte les règles actives et désactivées");
  assert.equal(adminList.json.regles.find(x=>x.categorie==="__DEFAULT__")?.actif, false, "La liste identifie la règle désactivée.");
  ok(true, "état inactif de __DEFAULT__ visible dans la liste de configuration");
  d = await submit("SANS_REGLE"); assert.equal(d.result.orientationAutomatique.statut, "AUCUNE_DESTINATION_HABILITEE"); ok(true, "absence de défaut laisse la demande sans destination");
  const unassignedId = d.id;
  const ordinaryAgentList = await api(base, `/api/agent/demandes?organisationId=${fixture.orgId}&unitId=${fixture.passport}&tenant=${TENANT}`, "GET", undefined, fixture.cookies.pass, false);
  status(ordinaryAgentList, 200, "liste API agent autorisée pour les dossiers affectés");
  assert.ok(!ordinaryAgentList.json.demandes.some(x => id(x.id) === unassignedId), "La liste API agent ne divulgue pas une demande non affectée.");
  const directDetail = await api(base, `/api/demandes/${unassignedId}?organisationId=${fixture.orgId}&tenant=${TENANT}`, "GET", undefined, fixture.cookies.pass, false);
  status(directDetail, 404, "accès détail par ID refusé à un agent non propriétaire");
  const unassignedDocuments = await api(base, `/api/pilot-procedures/dossiers/${unassignedId}/documents?organisationId=${fixture.orgId}&tenant=${TENANT}`, "GET", undefined, fixture.cookies.qualObserver, false);
  status(unassignedDocuments, 403, "accès aux pièces jointes P7 refusé tant que le dossier est non affecté");
  const unassignedDownload = await api(base, `/api/pilot-procedures/dossiers/${unassignedId}/documents/${randomUUID()}?organisationId=${fixture.orgId}&tenant=${TENANT}`, "GET", undefined, fixture.cookies.qualObserver, false);
  status(unassignedDownload, 403, "téléchargement direct refusé avant tout accès au fichier partagé");
  const unassignedTake = await api(base, `/api/agent/demandes/${unassignedId}/prise-en-charge`, "POST", { organisationId: fixture.orgId, tenantCode: TENANT }, fixture.cookies.pass, false);
  status(unassignedTake, 404, "prise en charge refusée tant que la demande n’a pas de destination");
  const unassignedReply = await api(base, `/api/agent/demandes/${unassignedId}/reponse`, "POST", { organisationId: fixture.orgId, tenantCode: TENANT, contenu: `Réponse prématurée ${RUN}` }, fixture.cookies.pass, false);
  status(unassignedReply, 404, "réponse refusée tant que la demande n’a pas de destination");
  for (const [label, unitId, cookie] of [["Passeports",fixture.passport,fixture.cookies.pass],["État civil",fixture.civil,fixture.cookies.civil],["Qualification sans permission d’organisation",fixture.qual,fixture.cookies.unitRouter]]) {
    const visible = await inbox(unitId,cookie); status(visible,200,`inbox ${label} autorisée`);
    assert.ok(!visible.json.demandes.some(x=>id(x.id)===unassignedId),`La demande non affectée est masquée dans ${label}`);
    ok(true, `demande non affectée masquée dans l’inbox ${label}`);
  }
  const qualifiedInbox = await inbox(fixture.qual, fixture.cookies.qualObserver); status(qualifiedInbox,200,"inbox Qualification accessible au gestionnaire habilité");
  assert.ok(qualifiedInbox.json.demandes.some(x=>id(x.id)===unassignedId), "Le gestionnaire d’organisation habilité voit le dossier non affecté dans la file de qualification.");
  ok(true, "gestionnaire habilité voit le dossier non affecté");
  const deputyInbox = await inbox(fixture.passport, fixture.cookies.vice); status(deputyInbox,200,"Vice-Consul consulte la file non affectée");
  assert.ok(deputyInbox.json.demandes.some(x=>id(x.id)===unassignedId));
  const ordinarySecretariat = await api(base, `/api/secretariat/demandes?organisationId=${fixture.orgId}&unitId=${fixture.qual}&tenant=${TENANT}`, "GET", undefined, fixture.cookies.unitRouter, false);
  status(ordinarySecretariat, 403, "route secrétariat réservée à la gestion organisationnelle des non-affectées");
  const authorizedSecretariat = await api(base, `/api/secretariat/demandes?organisationId=${fixture.orgId}&unitId=${fixture.qual}&tenant=${TENANT}`, "GET", undefined, fixture.cookies.qualObserver, false);
  status(authorizedSecretariat, 200, "gestionnaire organisationnel habilité consulte la file de qualification");
  assert.ok(authorizedSecretariat.json.demandes.some(x=>id(x.id)===unassignedId));
  const noReceive = await inbox(fixture.viewOnly, fixture.cookies.unqualified); status(noReceive, 200, "inbox de l’unité sans capacité RECEIVE_INCOMING consultable");
  assert.ok(!noReceive.json.demandes.some(x => id(x.id) === unassignedId), "L’unité sans capacité RECEIVE_INCOMING ne voit pas la demande non affectée.");
  ok(true, "unité sans capacité de réception exclue de la file des demandes non affectées");
  const crossOrgRoute = await api(base, `/api/organisations/${fixture.orgId}/units/${fixture.qual}/cases/${unassignedId}/route`, "POST", {tenantCode:TENANT,destinationUnitId:fixture.foreignUnit,motif:"Test synthétique"}, fixture.cookies.qualObserver);
  status(crossOrgRoute, 400, "orientation interorganisationnelle refusée même si l’ID figure dans l’allowlist de test");
  const crossTenantRoute = await api(base, `/api/organisations/${fixture.orgId}/units/${fixture.qual}/cases/${unassignedId}/route`, "POST", {tenantCode:TENANT,destinationUnitId:fixture.foreignTenantUnit,motif:"Test synthétique"}, fixture.cookies.qualObserver);
  status(crossTenantRoute, 400, "orientation intertenant refusée même si l’ID figure dans l’allowlist de test");
  const unitRouterAttempt = await api(base, `/api/organisations/${fixture.orgId}/units/${fixture.qual}/cases/${unassignedId}/route`, "POST", {tenantCode:TENANT,destinationUnitId:fixture.passport,motif:"Test synthétique"}, fixture.cookies.unitRouter);
  status(unitRouterAttempt, 403, "permission de routage limitée à l’unité insuffisante pour un dossier non affecté");
  const orgManagerRoute = await api(base, `/api/organisations/${fixture.orgId}/units/${fixture.qual}/cases/${unassignedId}/route`, "POST", {tenantCode:TENANT,destinationUnitId:fixture.passport,motif:"Qualification synthétique"}, fixture.cookies.qualObserver);
  status(orgManagerRoute, 200, "agent de qualification habilité oriente le dossier");
  assert.equal(id(orgManagerRoute.json.demande.destination_unit_id), fixture.passport);
  const routedInbox = await inbox(fixture.passport, fixture.cookies.pass); status(routedInbox,200,"inbox Passeports après orientation de qualification");
  assert.ok(routedInbox.json.demandes.some(x=>id(x.id)===unassignedId));
  const routedTake = await api(base, `/api/agent/demandes/${unassignedId}/prise-en-charge`, "POST", {organisationId:fixture.orgId,tenantCode:TENANT}, fixture.cookies.pass, false);
  status(routedTake,200,"agent Passeports prend le dossier après orientation");
  const routedReply = await api(base, `/api/agent/demandes/${unassignedId}/reponse`, "POST", {organisationId:fixture.orgId,tenantCode:TENANT,contenu:`Réponse après orientation ${RUN}`}, fixture.cookies.pass, false);
  status(routedReply,200,"agent Passeports répond après orientation");
  const reactivated = await rule("__DEFAULT__", fixture.qual); status(reactivated, 200, "réactivation de __DEFAULT__ par UPSERT Vice-Consul");
  const afterReactivate = await submit("NOUVELLE_CATEGORIE");
  assert.equal(afterReactivate.result.orientationAutomatique?.statut, "ORIENTEE");
  assert.equal(id(afterReactivate.result.orientationAutomatique.destinationUnitId), fixture.qual);
  ok(true, "une nouvelle demande utilise la règle réactivée");
  const cross = await rule("CROSS", fixture.foreignUnit); status(cross,409,"destination d’une autre organisation rejetée");
  const pid = await client.query("SELECT pg_backend_pid() AS pid"); assert.equal(pid.rows[0].pid, backendPid); ok(appQueryCount > 0, `requêtes API concentrées sur la connexion transactionnelle ${backendPid}`);
}

async function cleanup() {
  if (server) await new Promise(resolve => server.close(() => resolve()));
  let rollbackOK = false;
  if (client) {
    try { await client.query("ROLLBACK"); rollbackOK = true; }
    finally { client.release(); client = null; }
  }
  if (!rollbackOK) throw new Error("Rollback global non confirmé; vérification et réussite du test refusées.");
  const residualIdentity = await verifierPool.query("SELECT current_database() AS db, (SELECT system_identifier::text FROM pg_control_system()) AS system_id");
  assert.equal(residualIdentity.rows[0].db, DB_NAME, "Connexion de contrôle des résidus hors sateer_test.");
  assert.equal(residualIdentity.rows[0].system_id, AUTHORIZED_SYSTEM_ID, "Connexion de contrôle des résidus sur une instance non autorisée.");
  const residual = await verifierPool.query(`SELECT
    (SELECT count(*)::int FROM tenants WHERE code=ANY($1::text[])) AS tenants,
    (SELECT count(*)::int FROM organisations WHERE nom LIKE $2) AS organisations,
    (SELECT count(*)::int FROM personnes WHERE nom LIKE $2) AS personnes,
    (SELECT count(*)::int FROM auth_accounts WHERE identifiant LIKE $3) AS accounts,
    (SELECT count(*)::int FROM auth_sessions s JOIN auth_accounts a ON a.id=s.compte_id WHERE a.identifiant LIKE $3) AS sessions,
    (SELECT count(*)::int FROM relations_personne_organisation r JOIN personnes p ON p.id=r.personne_id WHERE p.nom LIKE $2) AS org_memberships,
    (SELECT count(*)::int FROM organisation_units u JOIN organisations o ON o.id=u.organisation_id WHERE o.nom LIKE $2) AS units,
    (SELECT count(*)::int FROM organisation_unit_capabilities uc JOIN organisation_units u ON u.id=uc.organisation_unit_id JOIN organisations o ON o.id=u.organisation_id WHERE o.nom LIKE $2) AS unit_capabilities,
    (SELECT count(*)::int FROM organisation_roles r JOIN organisations o ON o.id=r.organisation_id WHERE o.nom LIKE $2) AS roles,
    (SELECT count(*)::int FROM role_permissions rp JOIN organisation_roles r ON r.id=rp.role_id JOIN organisations o ON o.id=r.organisation_id WHERE o.nom LIKE $2) AS role_permissions,
    (SELECT count(*)::int FROM relations_personne_organisation_roles r JOIN personnes p ON p.id=r.personne_id WHERE p.nom LIKE $2) AS org_role_assignments,
    (SELECT count(*)::int FROM relations_personne_organisation_unit r JOIN personnes p ON p.id=r.personne_id WHERE p.nom LIKE $2) AS unit_memberships,
    (SELECT count(*)::int FROM demandes WHERE objet LIKE $2) AS demandes,
    (SELECT count(*)::int FROM demande_orientations x JOIN demandes d ON d.id=x.demande_id WHERE d.objet LIKE $2) AS orientations,
    (SELECT count(*)::int FROM demande_history h JOIN demandes d ON d.id=h.demande_id WHERE d.objet LIKE $2) AS history,
    (SELECT count(*)::int FROM demande_reponses r JOIN demandes d ON d.id=r.demande_id WHERE d.objet LIKE $2) AS replies,
    (SELECT count(*)::int FROM organisation_routing_rules r JOIN organisations o ON o.id=r.organisation_id WHERE o.nom LIKE $2) AS rules,
    (SELECT count(*)::int FROM organisation_routing_rule_audit a JOIN organisations o ON o.id=a.organisation_id WHERE o.nom LIKE $2) AS audits`, [[TENANT,`${TENANT}_X`], `%${RUN}%`, `${EMAIL_TAG}%`]);
  assert.ok(Object.values(residual.rows[0]).every(x => Number(x) === 0), "Des résidus P6 synthétiques subsistent après rollback.");
  console.log("OK - nouvelle connexion PostgreSQL : zéro résidu de fixtures P6 après rollback");
  await verifierPool.end();
  database.executerRequete = original.query; database.obtenirClientDatabase = original.connect; database.fermerDatabase = original.end;
}

main().catch(error => { process.exitCode = 1; console.error("ÉCHEC P6:", error.message); })
  .finally(() => cleanup().catch(error => { process.exitCode = 1; console.error("ÉCHEC NETTOYAGE P6:", error.message); }));
