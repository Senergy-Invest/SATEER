"use strict";
/**
 * Recette Bordeaux uniquement. Active le pilotage en lecture pour le compte
 * VICE synthétique existant (fixture associations), sans changer le compte,
 * les identifiants, les droits stratégiques, ni les autres rôles.
 * Usage: PGHOST=::1 PGPORT=5432 PGDATABASE=sateer_test node scripts/enable-vice-demo-operational.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { Client } = require("pg");

const TENANT = "P6V_3B5AC5AB9DB04657";
const SYSTEM_ID = "7699611241381229531";
const ISSUER_ID = 70;
const ORIGIN = "http://127.0.0.1:3200";
const KEY = `association-relay-${TENANT}`;
const MANIFEST = path.join(os.tmpdir(), KEY + ".json");
const CREDS = path.join(os.tmpdir(), KEY + "-credentials.txt");
const READ_ONLY_PERMISSIONS = [
  "VIEW_OPERATIONAL_DASHBOARD",
  "VIEW_ORGANISATION",
  "VIEW_ORGANISATION_ANALYTICS",
  "VIEW_SUPERVISED_UNITS",
  "VIEW_UNIT_ANALYTICS",
  "VIEW_UNIT",
  "VIEW_UNIT_MEMBERS"
];

function safeCredentials() {
  assert.equal(fs.statSync(CREDS).mode & 0o777, 0o600, "Fichier d'identifiants non protege (0600 requis)");
  const match = fs.readFileSync(CREDS, "utf8").match(/^VICE\r?\nIdentifiant : ([^\r\n]+)\r?\nMot de passe temporaire : ([^\r\n]+)/m);
  assert(match, "Compte VICE absent du fichier de recette");
  return { identifiant: match[1].trim(), motDePasse: match[2].trim() };
}
function client() {
  return new Client({ host: "::1", port: 5432, database: "sateer_test", user: process.env.PGUSER || process.env.USER,
    ...(process.env.PGPASSWORD ? { password: process.env.PGPASSWORD } : {}) });
}
async function checkDatabase(db) {
  const r = await db.query("SELECT current_database() AS db, (SELECT system_identifier::text FROM pg_control_system()) AS sid");
  assert.equal(r.rows[0]?.db, "sateer_test");
  assert.equal(r.rows[0]?.sid, SYSTEM_ID, "Instance PostgreSQL interdite");
}
async function request(cookie, endpoint) {
  const resp = await fetch(ORIGIN + endpoint, { headers: { Cookie: cookie }, redirect: "manual" });
  return { status: resp.status, body: await resp.json().catch(() => ({})) };
}
async function authenticatedCookie() {
  const credentials = safeCredentials();
  const response = await fetch(ORIGIN + "/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials), redirect: "manual"
  });
  assert.equal(response.status, 200, `Connexion VICE impossible (HTTP ${response.status})`);
  const cookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [response.headers.get("set-cookie") || ""];
  const cookie = cookies.map(x => x.split(";")[0]).find(x => x.startsWith("sateer_session="));
  assert(cookie, "Session VICE non creee");
  return cookie;
}
async function main() {
  assert.equal(process.env.PGDATABASE, "sateer_test", "PGDATABASE refuse");
  assert.equal(process.env.PGHOST, "::1", "PGHOST refuse");
  assert.equal(String(process.env.PGPORT), "5432", "PGPORT refuse");
  const m = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  assert.equal(m.state, "READY", "Fixture associative non prete");
  assert.equal(m.tenant, TENANT);
  assert.equal(Number(m.issuerId), ISSUER_ID);
  assert.equal(Number(m.organisationId), 132);
  assert(Number.isSafeInteger(Number(m.viceRoleId)) && Number(m.viceRoleId) > 0);
  assert(Number.isSafeInteger(Number(m.vicePersonId)) && Number(m.vicePersonId) > 0);
  // Le fichier d'identifiants reste sur le Mac et n'est jamais imprime ou committe.
  safeCredentials();

  const db = client();
  await db.connect();
  const inserted = [];
  try {
    await checkDatabase(db);
    const scope = await db.query(`
      SELECT r.id AS role_id, r.organisation_id, r.code, r.scope, r.metadata,
             o.type, t.code AS tenant,
             rel.personne_id, ac.id AS compte_id,
             (SELECT count(*)::int FROM relations_personne_organisation_roles x WHERE x.role_id=r.id AND x.actif=true) AS role_users
      FROM organisation_roles r
      JOIN organisations o ON o.id=r.organisation_id
      JOIN tenants t ON t.id=o.tenant_id
      JOIN relations_personne_organisation_roles rel
        ON rel.role_id=r.id AND rel.organisation_id=r.organisation_id AND rel.actif=true
      JOIN auth_accounts ac ON ac.personne_id=rel.personne_id AND ac.actif=true
      WHERE r.id=$1 AND rel.personne_id=$2 AND r.actif=true
    `, [m.viceRoleId, m.vicePersonId]);
    assert.equal(scope.rowCount, 1, "Role ou compte de recette VICE inattendu");
    const s = scope.rows[0];
    assert.equal(Number(s.organisation_id), ISSUER_ID);
    assert.equal(s.tenant, TENANT);
    assert.equal(s.type, "CONSULAT");
    assert.equal(s.scope, "ORGANISATION");
    assert.equal(s.role_users, 1, "Role partage avec un autre utilisateur : refus");
    assert.equal(s.metadata?.fixture, KEY, "Ce role n'est pas le role de fixture attendu");
    assert.equal(s.metadata?.token, m.token, "Token de fixture inattendu");
    assert(/^ASSOCIATION_RELAY_ISSUER_[A-F0-9]+$/.test(s.code), "Role de fixture inattendu");
    const current = await db.query(`SELECT p.code, rp.actif FROM role_permissions rp
      JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=$1`, [m.viceRoleId]);
    for (const mandatory of ["MANAGE_ORGANISATION_RELATIONSHIPS", "TARGET_COMMUNICATION"]) {
      assert(current.rows.some(x=>x.code===mandatory && x.actif), `Permission associative initiale absente : ${mandatory}`);
    }
    const catalog = await db.query("SELECT code, id, actif FROM permissions WHERE code = ANY($1::text[])", [READ_ONLY_PERMISSIONS]);
    assert.equal(catalog.rowCount, READ_ONLY_PERMISSIONS.length, "Catalogue de permissions incomplet");
    for (const p of catalog.rows) {
      assert.equal(p.actif, true, `Permission inactive : ${p.code}`);
      assert(!current.rows.some(x => x.code===p.code && !x.actif), `Grant existant desactive : ${p.code}`);
    }
    console.log(`PRECHECK_OK: compte VICE existant, organisation ${ISSUER_ID}, role prive ${m.viceRoleId}, tenant de recette confirme.`);

    const beforeCookie = await authenticatedCookie();
    const before = await request(beforeCookie, `/api/organisations/${ISSUER_ID}/dashboard-operationnel?tenant=${TENANT}`);
    assert([200, 403].includes(before.status), `Dashboard avant : HTTP ${before.status}`);
    console.log(`Avant correction : dashboard HTTP ${before.status}`);

    // Les seules mutations sont des INSERT pour 7 permissions de consultation,
    // sur ce role prive. On ne modifie jamais un droit preexistant.
    await db.query("BEGIN");
    try {
      for (const code of READ_ONLY_PERMISSIONS) {
        const result = await db.query(`
          INSERT INTO role_permissions(role_id, permission_id, actif)
          SELECT $1, p.id, TRUE FROM permissions p
          WHERE p.code=$2 AND p.actif=TRUE
          ON CONFLICT (role_id, permission_id) DO NOTHING RETURNING id
        `, [m.viceRoleId, code]);
        if (result.rowCount) inserted.push(Number(result.rows[0].id));
      }
      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK").catch(()=>{});
      throw error;
    }
    console.log(`GRANTS_APPLIQUES: ${inserted.length} nouvelles permissions de lecture, aucune permission strategique ou de modification.`);

    try {
      const cookie = await authenticatedCookie();
      const ops = await request(cookie, `/api/organisations/${ISSUER_ID}/dashboard-operationnel?tenant=${TENANT}`);
      assert.equal(ops.status, 200, `Dashboard central HTTP ${ops.status}: ${JSON.stringify(ops.body).slice(0,250)}`);
      const overview = await request(cookie, `/api/organisations/${ISSUER_ID}/units/overview?tenant=${TENANT}`);
      assert.equal(overview.status, 200, `Unites HTTP ${overview.status}`);
      const associations = await request(cookie, `/api/organisations/${ISSUER_ID}/association-partners?tenant=${TENANT}`);
      assert.equal(associations.status, 200, `Associations HTTP ${associations.status}`);
      const strategic = await request(cookie, `/api/organisations/${ISSUER_ID}/dashboard-strategique?tenant=${TENANT}`);
      assert.equal(strategic.status, 403, "Le dashboard strategique ne doit PAS etre accessible a ce compte");
      const outside = await request(cookie, `/api/organisations/132/association-communications?tenant=${TENANT}`);
      assert.equal(outside.status, 403, "Acces non autorise a l'organisation Association");
      console.log("VICE_OPERATIONAL_HTTP_PASS: dashboard 200, unites 200, associations 200, strategique 403, hors organisation 403.");
      const tests = spawnSync("npm", ["test"], { encoding: "utf8", maxBuffer: 5*1024*1024 });
      assert.equal(tests.status, 0, `npm test echoue : ${(tests.stdout+tests.stderr).slice(-2400)}`);
      assert(/109\/109/.test(tests.stdout) && /40\/40/.test(tests.stdout), "Controles statiques incomplets");
      console.log("CORE_STATIC_PASS: 109/109 et 40/40.");
      const ui = spawnSync("node", ["scripts/test-professional-home-access.js"], { encoding: "utf8" });
      assert.equal(ui.status, 0, `Tests accueil echoues : ${(ui.stdout+ui.stderr).slice(-1200)}`);
      console.log("ACCUEIL_UI_PASS: tests de l'acces professionnel.");
    } catch (e) {
      // Annule uniquement les nouveaux grants ajoutés par cette execution.
      // Ni les anciens grants ni les comptes ne sont modifies.
      if (inserted.length) {
        await db.query("DELETE FROM role_permissions WHERE role_id=$1 AND id=ANY($2::int[])", [m.viceRoleId, inserted]);
        console.error("ROLLBACK_GRANTS_OK: permissions ajoutees par cette execution retirees.");
      }
      throw e;
    }
    console.log("=== VICE_BORDEAUX_DASHBOARD_PASS ===");
    console.log("Identifiants existants conserves, aucune information sensible affichee.");
  } finally { await db.end(); }
}
main().catch(e=>{ console.error("VICE_BORDEAUX_ACCESS_FAILED:", e?.message || String(e)); process.exitCode=1; });
