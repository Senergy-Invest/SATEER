"use strict";

// Persistent, isolated P6 browser fixture. Uses the existing auth password
// hasher/account creator and the same core records as the P6 API harness.
// Setup is limited to sateer_test on the explicitly approved PostgreSQL system.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Pool } = require("pg");

const DB = "sateer_test";
const SYSTEM_ID = "7699611241381229531";
const pool = new Pool({
  database: DB,
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT),
  user: process.env.PGUSER || process.env.USER,
  ...(process.env.PGPASSWORD ? { password: process.env.PGPASSWORD } : {})
});

function requireTarget() {
  if (process.env.PGDATABASE !== DB || process.env.PGHOST !== "::1" || Number(process.env.PGPORT) !== 5432) {
    throw new Error("Refus : définir explicitement PGDATABASE=sateer_test, PGHOST=::1 et PGPORT=5432.");
  }
}
async function verifyTarget(client) {
  const r = await client.query("SELECT current_database() db,(SELECT system_identifier::text FROM pg_control_system()) sys");
  assert.equal(r.rows[0].db, DB, "Base non autorisée");
  assert.equal(r.rows[0].sys, SYSTEM_ID, "Instance PostgreSQL non autorisée");
}
function filePaths(token) {
  const stem = path.join(os.tmpdir(), `sateer-p6-visual-${token}`);
  return { manifest: `${stem}.json`, credentials: `${stem}-credentials.txt` };
}
async function permissionIds(client, codes) {
  const r = await client.query("SELECT id,code FROM permissions WHERE actif=TRUE AND code=ANY($1::text[])", [codes]);
  const map = Object.fromEntries(r.rows.map(x => [x.code, Number(x.id)]));
  assert.ok(codes.every(code => map[code]), "Catalogue de permissions incomplet; aucune fixture persistée.");
  return map;
}
async function setup() {
  requireTarget();
  const token = crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase();
  const run = `P6V_${token}`;
  const paths = filePaths(token);
  const fixture = { token, tenantCode: run, names: {}, ids: { units: [], people: [], roles: [] } };
  const client = await pool.connect();
  try {
    await verifyTarget(client);
    await client.query("BEGIN");
    const perms = await permissionIds(client, ["CREATE_UNIT", "VIEW_INCOMING", "ROUTE_CASE", "VIEW_OPERATIONAL_DASHBOARD", "VIEW_ORGANISATION", "VIEW_CASE"]);
    const capsResult = await client.query("SELECT id,code FROM capabilities WHERE actif=TRUE AND code=ANY($1::text[])", [["RECEIVE_INCOMING", "VIEW_INBOX", "ROUTE_CASES"]]);
    const caps = Object.fromEntries(capsResult.rows.map(x => [x.code, Number(x.id)]));
    assert.ok(Object.keys(caps).length === 3, "Capacités P6 manquantes; aucune fixture persistée.");

    const tenant = await client.query("INSERT INTO tenants(code,nom,type) VALUES($1,$2,'TEST_SYNTHETIQUE') RETURNING id", [run, `Recette P6 ${token}`]);
    fixture.ids.tenant = Number(tenant.rows[0].id);
    const org = await client.query("INSERT INTO organisations(nom,type,tenant_id) VALUES($1,'CONSULAT',$2) RETURNING id", [`Organisation recette P6 ${token}`, fixture.ids.tenant]);
    fixture.ids.organisation = Number(org.rows[0].id);

    async function person(kind) {
      const r = await client.query("INSERT INTO personnes(prenom,nom,profil) VALUES($1,$2,'TEST_SYNTHETIQUE') RETURNING id", ["Recette", `${kind}_${token}`]);
      const id = Number(r.rows[0].id); fixture.ids.people.push(id); fixture.names[kind] = id; return id;
    }
    fixture.ids.vice = await person("VICE");
    fixture.ids.agent = await person("AGENT_SANS_CONFIG");
    for (const personId of fixture.ids.people) {
      await client.query("INSERT INTO relations_personne_organisation(personne_id,organisation_id,type) VALUES($1,$2,'TEST_SYNTHETIQUE')", [personId, fixture.ids.organisation]);
    }

    const root = await client.query("INSERT INTO organisation_units(organisation_id,code,nom,type,actif) VALUES($1,$2,$3,'BUREAU',TRUE) RETURNING id", [fixture.ids.organisation, `RACINE_${token}`, `Consulat recette ${token}`]);
    fixture.ids.rootUnit = Number(root.rows[0].id); fixture.ids.units.push(fixture.ids.rootUnit);
    async function unit(code, label, type) {
      const r = await client.query("INSERT INTO organisation_units(organisation_id,parent_unit_id,code,nom,type,actif) VALUES($1,$2,$3,$4,$5,TRUE) RETURNING id", [fixture.ids.organisation, fixture.ids.rootUnit, `${code}_${token}`, label, type]);
      const id = Number(r.rows[0].id); fixture.ids.units.push(id); return id;
    }
    fixture.ids.passport = await unit("PASSPORT", "Bureau Passeports", "BUREAU");
    fixture.ids.civil = await unit("ETAT_CIVIL", "Bureau État civil", "BUREAU");
    fixture.ids.qualification = await unit("QUALIFICATION", "Unité de qualification", "SERVICE");
    for (const unitId of [fixture.ids.passport, fixture.ids.civil, fixture.ids.qualification]) {
      for (const cap of ["RECEIVE_INCOMING", "VIEW_INBOX"]) {
        await client.query("INSERT INTO organisation_unit_capabilities(organisation_unit_id,capability_id,actif) VALUES($1,$2,TRUE)", [unitId, caps[cap]]);
      }
    }
    await client.query("INSERT INTO organisation_unit_capabilities(organisation_unit_id,capability_id,configuration,actif) VALUES($1,$2,$3::jsonb,TRUE)", [fixture.ids.qualification, caps.ROUTE_CASES, JSON.stringify({ allowedDestinationUnitIds: [fixture.ids.passport, fixture.ids.civil] })]);

    async function role(personId, code, codes, unitId = null) {
      const rr = await client.query("INSERT INTO organisation_roles(organisation_id,code,nom,scope) VALUES($1,$2,$3,$4) RETURNING id", [fixture.ids.organisation, `${code}_${token}`, `Recette ${code}`, unitId ? "UNIT" : "ORGANISATION"]);
      const roleId = Number(rr.rows[0].id); fixture.ids.roles.push(roleId);
      for (const code of codes) await client.query("INSERT INTO role_permissions(role_id,permission_id) VALUES($1,$2)", [roleId, perms[code]]);
      if (unitId) await client.query("INSERT INTO relations_personne_organisation_unit(personne_id,organisation_unit_id,role,role_id,principal,actif) VALUES($1,$2,$3,$4,TRUE,TRUE)", [personId, unitId, code, roleId]);
      else await client.query("INSERT INTO relations_personne_organisation_roles(personne_id,organisation_id,role_id,actif) VALUES($1,$2,$3,TRUE)", [personId, fixture.ids.organisation, roleId]);
    }
    await role(fixture.ids.vice, "VICE_CONSUL_RECETTE", ["CREATE_UNIT", "VIEW_INCOMING", "ROUTE_CASE", "VIEW_OPERATIONAL_DASHBOARD", "VIEW_ORGANISATION"]);
    await role(fixture.ids.agent, "AGENT_SANS_CONFIGURATION", ["VIEW_INCOMING", "VIEW_CASE"]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { client.release(); }

  // Persist the exact cleanup manifest before creating accounts, so a partial
  // account-creation failure remains recoverable without broad deletion.
  fs.writeFileSync(paths.manifest, JSON.stringify(fixture, null, 2), { mode: 0o600, flag: "wx" });
  fs.chmodSync(paths.manifest, 0o600);
  const auth = require("../auth-database");
  const credentials = [];
  for (const kind of ["VICE", "AGENT_SANS_CONFIG"]) {
    const login = `p6v.${token.toLowerCase()}.${kind.toLowerCase()}@sateer.test`;
    const password = `P6v!${crypto.randomBytes(27).toString("base64url")}`;
    const created = await auth.creerCompteAuthentificationDatabase(fixture.names[kind], login, password);
    assert.equal(created.succes, true, `Création du compte synthétique ${kind} échouée.`);
    credentials.push(`${kind}\nIdentifiant : ${login}\nMot de passe temporaire : ${password}`);
  }
  await require("../database").fermerDatabase();
  fs.writeFileSync(paths.credentials, `${credentials.join("\n\n")}\n`, { mode: 0o600, flag: "wx" });
  fs.chmodSync(paths.credentials, 0o600);

  const independent = await new Pool({ database: DB, host: process.env.PGHOST, port: Number(process.env.PGPORT), user: process.env.PGUSER || process.env.USER, ...(process.env.PGPASSWORD ? { password: process.env.PGPASSWORD } : {}) });
  try {
    const verifyClient = await independent.connect();
    try { await verifyTarget(verifyClient); } finally { verifyClient.release(); }
    const check = await independent.query("SELECT (SELECT COUNT(*) FROM personnes WHERE id=ANY($1::bigint[]))::int AS people,(SELECT COUNT(*) FROM organisation_units WHERE id=ANY($2::bigint[]))::int AS units,(SELECT COUNT(*) FROM auth_accounts WHERE personne_id=ANY($1::bigint[]))::int AS accounts", [fixture.ids.people, fixture.ids.units]);
    assert.equal(check.rows[0].people, 2); assert.equal(check.rows[0].units, 4); assert.equal(check.rows[0].accounts, 2);
  } finally { await independent.end(); }

  process.stdout.write(JSON.stringify({
    status: "FIXTURE_READY", tenant: fixture.tenantCode, organisationId: fixture.ids.organisation,
    rootUnitId: fixture.ids.rootUnit, units: { passport: fixture.ids.passport, civil: fixture.ids.civil, qualification: fixture.ids.qualification },
    vicePersonId: fixture.ids.vice, agentPersonId: fixture.ids.agent,
    credentialsFile: paths.credentials, cleanupManifest: paths.manifest
  }, null, 2) + "\n");
}

async function cleanup(manifestPath) {
  requireTarget();
  if (!manifestPath || !path.isAbsolute(manifestPath)) throw new Error("Fournir le chemin absolu du manifeste de cette recette.");
  const fixture = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!/^P6V_[A-F0-9]{16}$/.test(fixture.tenantCode) || fixture.token !== fixture.tenantCode.slice(4)) throw new Error("Manifeste P6 invalide.");
  const c = await pool.connect();
  try {
    await verifyTarget(c); await c.query("BEGIN");
    const owned = await c.query("SELECT id FROM tenants WHERE id=$1 AND code=$2 AND type='TEST_SYNTHETIQUE'", [fixture.ids.tenant, fixture.tenantCode]);
    assert.equal(owned.rowCount, 1, "Tenant synthétique introuvable ou incohérent; nettoyage refusé.");
    const org = await c.query("SELECT id FROM organisations WHERE id=$1 AND tenant_id=$2 AND nom=$3 AND type='CONSULAT'", [fixture.ids.organisation, fixture.ids.tenant, `Organisation recette P6 ${fixture.token}`]);
    assert.equal(org.rowCount, 1, "Organisation synthétique incohérente; nettoyage refusé.");
    const cases = await c.query("SELECT COUNT(*)::int n FROM demandes WHERE organisation_id=$1", [fixture.ids.organisation]);
    assert.equal(cases.rows[0].n, 0, "Des demandes existent dans la fixture; nettoyage suspendu pour préserver les données.");
    const personCheck = await c.query("SELECT COUNT(*)::int n FROM personnes WHERE id=ANY($1::bigint[]) AND nom LIKE $2", [fixture.ids.people, `%_${fixture.token}`]);
    assert.equal(personCheck.rows[0].n, 2, "Personnes synthétiques incohérentes; nettoyage refusé.");

    await c.query("DELETE FROM organisation_routing_rule_audit WHERE organisation_id=$1", [fixture.ids.organisation]);
    await c.query("DELETE FROM organisation_routing_rules WHERE organisation_id=$1", [fixture.ids.organisation]);
    await c.query("DELETE FROM relations_personne_organisation_roles WHERE organisation_id=$1", [fixture.ids.organisation]);
    await c.query("DELETE FROM relations_personne_organisation_unit WHERE organisation_unit_id=ANY($1::bigint[])", [fixture.ids.units]);
    await c.query("DELETE FROM relations_personne_organisation WHERE organisation_id=$1", [fixture.ids.organisation]);
    await c.query("DELETE FROM role_permissions WHERE role_id=ANY($1::bigint[])", [fixture.ids.roles]);
    await c.query("DELETE FROM auth_accounts WHERE personne_id=ANY($1::bigint[])", [fixture.ids.people]);
    await c.query("DELETE FROM organisation_unit_capabilities WHERE organisation_unit_id=ANY($1::bigint[])", [fixture.ids.units]);
    await c.query("DELETE FROM organisation_roles WHERE id=ANY($1::bigint[])", [fixture.ids.roles]);
    await c.query("DELETE FROM organisation_units WHERE id=ANY($1::bigint[])", [[fixture.ids.passport, fixture.ids.civil, fixture.ids.qualification]]);
    await c.query("DELETE FROM organisation_units WHERE id=$1", [fixture.ids.rootUnit]);
    await c.query("DELETE FROM organisations WHERE id=$1 AND tenant_id=$2", [fixture.ids.organisation, fixture.ids.tenant]);
    await c.query("DELETE FROM personnes WHERE id=ANY($1::bigint[]) AND nom LIKE $2", [fixture.ids.people, `%_${fixture.token}`]);
    await c.query("DELETE FROM tenants WHERE id=$1 AND code=$2 AND type='TEST_SYNTHETIQUE'", [fixture.ids.tenant, fixture.tenantCode]);
    await c.query("COMMIT");
  } catch (error) { await c.query("ROLLBACK").catch(() => {}); throw error; }
  finally { c.release(); }

  const independent = new Pool({ database: DB, host: process.env.PGHOST, port: Number(process.env.PGPORT), user: process.env.PGUSER || process.env.USER, ...(process.env.PGPASSWORD ? { password: process.env.PGPASSWORD } : {}) });
  try {
    const r = await independent.query("SELECT (SELECT COUNT(*) FROM tenants WHERE id=$1)::int tenants,(SELECT COUNT(*) FROM organisations WHERE id=$2)::int organisations,(SELECT COUNT(*) FROM personnes WHERE id=ANY($3::bigint[]))::int people,(SELECT COUNT(*) FROM organisation_units WHERE id=ANY($4::bigint[]))::int units,(SELECT COUNT(*) FROM auth_accounts WHERE personne_id=ANY($3::bigint[]))::int accounts,(SELECT COUNT(*) FROM auth_sessions s JOIN auth_accounts a ON a.id=s.compte_id WHERE a.personne_id=ANY($3::bigint[]))::int sessions,(SELECT COUNT(*) FROM organisation_roles WHERE id=ANY($5::bigint[]))::int roles,(SELECT COUNT(*) FROM organisation_unit_capabilities WHERE organisation_unit_id=ANY($4::bigint[]))::int capabilities,(SELECT COUNT(*) FROM relations_personne_organisation WHERE organisation_id=$2)::int orgRelations,(SELECT COUNT(*) FROM relations_personne_organisation_roles WHERE organisation_id=$2)::int roleRelations,(SELECT COUNT(*) FROM relations_personne_organisation_unit WHERE organisation_unit_id=ANY($4::bigint[]))::int unitRelations,(SELECT COUNT(*) FROM organisation_routing_rules WHERE organisation_id=$2)::int rules,(SELECT COUNT(*) FROM organisation_routing_rule_audit WHERE organisation_id=$2)::int audit", [fixture.ids.tenant, fixture.ids.organisation, fixture.ids.people, fixture.ids.units, fixture.ids.roles]);
    assert.ok(Object.values(r.rows[0]).every(x => Number(x) === 0), "Résidus détectés depuis une nouvelle connexion; manifeste conservé.");
  } finally { await independent.end(); }
  const paths = filePaths(fixture.token);
  for (const file of [paths.credentials, manifestPath]) if (fs.existsSync(file)) fs.unlinkSync(file);
  process.stdout.write("CLEANUP_VERIFIED: zéro résidu des identifiants exacts depuis une nouvelle connexion.\n");
}

(async () => {
  try {
    if (process.argv[2] === "setup") await setup();
    else if (process.argv[2] === "cleanup") await cleanup(process.argv[3]);
    else throw new Error("Usage: node scripts/p6-visual-fixture.js setup | cleanup <manifest-absolu>");
  } finally { await pool.end(); }
})().catch(error => { process.stderr.write(`P6_FIXTURE_REFUSED:${error.message}\n`); process.exitCode = 1; });
