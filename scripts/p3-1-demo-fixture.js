"use strict";

// Fixture P3.1 isolée dans une organisation P6 déjà existante.
// Les identifiants de démonstration et les secrets sont conservés dans des
// fichiers temporaires privés. La commande cleanup est ciblée et refuse toute
// suppression si des publications, notifications ou demandes ont été créées.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Pool } = require("pg");

const DATABASE = "sateer_test";
const SYSTEM_ID = "7699611241381229531";
const TENANT_CODE = "P6V_3B5AC5AB9DB04657";
const VICE_LOGIN = "p6v.3b5ac5ab9db04657.vice@sateer.test";
const AGENT_LOGIN = "p6v.3b5ac5ab9db04657.agent_sans_config@sateer.test";
const FIXTURE_STEM = path.join(os.tmpdir(), `sateer-p3-1-demo-${TENANT_CODE}`);
const MANIFEST_PATH = `${FIXTURE_STEM}.json`;
const CREDENTIALS_PATH = `${FIXTURE_STEM}-citizens.txt`;
const VICE_CREDENTIALS_PATH = path.join(os.tmpdir(), `sateer-p6-visual-${TENANT_CODE.slice(4)}-credentials.txt`);

function verifierEnvironnement() {
  if (process.env.PGDATABASE !== DATABASE || process.env.PGHOST !== "::1" || Number(process.env.PGPORT) !== 5432) {
    throw new Error("Refus : définir explicitement PGDATABASE=sateer_test, PGHOST=::1 et PGPORT=5432.");
  }
}

function nouveauPool() {
  verifierEnvironnement();
  return new Pool({ database: DATABASE, host: "::1", port: 5432,
    user: process.env.PGUSER || process.env.USER,
    ...(process.env.PGPASSWORD ? { password: process.env.PGPASSWORD } : {}) });
}

async function verifierInstance(client) {
  const r = await client.query("SELECT current_database() db,(SELECT system_identifier::text FROM pg_control_system()) sys");
  assert.equal(r.rows[0]?.db, DATABASE, "Base PostgreSQL non autorisée.");
  assert.equal(r.rows[0]?.sys, SYSTEM_ID, "Instance PostgreSQL non autorisée.");
}

function ecrirePrive(pathname, contents, exclusive = true) {
  fs.writeFileSync(pathname, contents, { encoding: "utf8", mode: 0o600, flag: exclusive ? "wx" : "w" });
  fs.chmodSync(pathname, 0o600);
}

function lireCompte(pathname, role) {
  const mode = fs.statSync(pathname).mode & 0o777;
  assert.equal(mode, 0o600, `Le fichier de credentials ${role} doit être protégé en mode 600.`);
  const lines = fs.readFileSync(pathname, "utf8").split(/\r?\n/);
  const index = lines.findIndex(line => line.trim() === role);
  assert(index >= 0, `Identifiants locaux ${role} introuvables.`);
  const identifiant = lines.slice(index + 1).find(line => line.startsWith("Identifiant : "))?.slice("Identifiant : ".length).trim();
  const motDePasse = lines.slice(index + 1).find(line => line.startsWith("Mot de passe temporaire : "))?.slice("Mot de passe temporaire : ".length).trim();
  assert(identifiant && motDePasse, `Identifiants locaux ${role} incomplets.`);
  return { identifiant, motDePasse };
}

async function setup() {
  const pool = nouveauPool();
  const token = crypto.randomUUID().replace(/-/g, "").slice(0, 14).toUpperCase();
  const manifest = {
    version: 1, state: "PREPARING", token, tenantCode: TENANT_CODE,
    manifestPath: MANIFEST_PATH, credentialsPath: CREDENTIALS_PATH,
    viceCredentialsPath: VICE_CREDENTIALS_PATH, permissionAdded: false,
    organizationId: null, vicePersonId: null, roleId: null, permissionRoleId: null,
    people: [], accounts: [], channelId: null, channelCode: null
  };
  let manifestCreated = false;
  let credentialsCreated = false;
  let transactionOpen = false;
  let committed = false;
  const client = await pool.connect();
  try {
    assert(!fs.existsSync(MANIFEST_PATH), "Une fixture de démonstration existe déjà; elle ne sera ni remplacée ni dupliquée.");
    assert(!fs.existsSync(CREDENTIALS_PATH), "Un fichier credentials citoyen existe déjà; il ne sera ni remplacé ni affiché.");
    assert(fs.existsSync(VICE_CREDENTIALS_PATH), "Le fichier local protégé du Vice-Consul synthétique est introuvable.");
    assert.equal(fs.statSync(VICE_CREDENTIALS_PATH).mode & 0o777, 0o600, "Le fichier local du Vice-Consul doit être protégé en mode 600.");

    const suffix = crypto.randomBytes(18).toString("base64url");
    const accounts = [
      { role: "CITOYEN_A", login: `p31demo.${token.toLowerCase()}.citoyen-a@sateer.test`, password: `P31!${suffix}A` },
      { role: "CITOYEN_B", login: `p31demo.${token.toLowerCase()}.citoyen-b@sateer.test`, password: `P31!${suffix}B` }
    ];
    const credentialsText = accounts.map(x => `${x.role}\nIdentifiant : ${x.login}\nMot de passe temporaire : ${x.password}`).join("\n\n") + "\n";
    const credentialsRendered = credentialsText;

    ecrirePrive(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
    manifestCreated = true;
    ecrirePrive(CREDENTIALS_PATH, credentialsRendered);
    credentialsCreated = true;

    await verifierInstance(client);
    await client.query("BEGIN");
    transactionOpen = true;
    const scope = await client.query(`
      SELECT t.id tenant_id,t.type tenant_type,o.id organisation_id,o.nom organisation_nom,
             p.id vice_id,p.prenom,p.nom,p.profil,a.id account_id,a.actif account_active
      FROM tenants t JOIN organisations o ON o.tenant_id=t.id
      JOIN relations_personne_organisation rel ON rel.organisation_id=o.id
      JOIN personnes p ON p.id=rel.personne_id
      JOIN auth_accounts a ON a.personne_id=p.id
      WHERE t.code=$1 AND o.type='CONSULAT' AND a.identifiant=$2 AND a.actif=TRUE
      FOR UPDATE OF t,o,p,a`, [TENANT_CODE, VICE_LOGIN]);
    assert.equal(scope.rowCount, 1, "Le Vice-Consul doit être l'unique compte actif rattaché correspondant à cette fixture.");
    assert.equal(scope.rows[0].tenant_type, "TEST_SYNTHETIQUE", "Le tenant cible doit être synthétique.");
    manifest.organizationId = Number(scope.rows[0].organisation_id);
    manifest.vicePersonId = Number(scope.rows[0].vice_id);

    const roles = await client.query(`
      SELECT r.id,r.code,r.scope,r.actif,r.metadata,
        (SELECT count(DISTINCT assigned.personne_id)::int FROM relations_personne_organisation_roles assigned
          WHERE assigned.organisation_id=r.organisation_id AND assigned.role_id=r.id AND assigned.actif=TRUE) AS active_assignees
      FROM relations_personne_organisation_roles rel JOIN organisation_roles r
        ON r.id=rel.role_id AND r.organisation_id=rel.organisation_id
      WHERE rel.organisation_id=$1 AND rel.personne_id=$2 AND rel.actif=TRUE
        AND r.actif=TRUE AND r.scope IN ('ORGANISATION','BOTH')
      FOR UPDATE OF r`, [manifest.organizationId, manifest.vicePersonId]);
    assert.equal(roles.rowCount, 1, "Attribution refusée : il faut un rôle organisationnel unique pour isoler cette permission.");
    const role = roles.rows[0];
    assert.equal(Number(role.active_assignees), 1, "Attribution refusée : le rôle du Vice-Consul est aussi affecté à une autre personne.");
    assert.equal(role.metadata?.systemProtected === true, false, "Attribution refusée : le rôle est protégé par le mécanisme système.");
    manifest.roleId = Number(role.id);

    const permission = await client.query("SELECT id FROM permissions WHERE code='TARGET_COMMUNICATION' AND actif=TRUE");
    assert.equal(permission.rowCount, 1, "Permission TARGET_COMMUNICATION indisponible.");
    const prior = await client.query("SELECT actif FROM role_permissions WHERE role_id=$1 AND permission_id=$2", [role.id, permission.rows[0].id]);
    assert.equal(prior.rowCount, 0, "Attribution refusée : la relation permission existe déjà dans un état qui nécessite une revue.");
    const grant = await client.query(`
      INSERT INTO role_permissions(role_id,permission_id,actif)
      SELECT r.id,p.id,TRUE FROM organisation_roles r CROSS JOIN permissions p
      WHERE r.id=$1 AND r.organisation_id=$2 AND r.actif=TRUE
        AND NOT (r.metadata @> '{"systemProtected":true}'::jsonb)
        AND p.id=$3 AND p.code='TARGET_COMMUNICATION' AND p.actif=TRUE
      RETURNING role_id,permission_id`, [role.id, manifest.organizationId, permission.rows[0].id]);
    assert.equal(grant.rowCount, 1, "La permission doit être ajoutée uniquement au rôle local non protégé.");
    manifest.permissionAdded = true;
    manifest.permissionRoleId = Number(role.id);

    const attachedAccounts = await client.query(`
      SELECT count(DISTINCT a.id)::int count FROM relations_personne_organisation rel
      JOIN auth_accounts a ON a.personne_id=rel.personne_id AND a.actif=TRUE
      WHERE rel.organisation_id=$1`, [manifest.organizationId]);
    assert.equal(attachedAccounts.rows[0].count, 2, "La fixture contient déjà d'autres comptes actifs; création citoyenne suspendue.");

    for (const citizen of accounts) {
      const person = await client.query(
        "INSERT INTO personnes(prenom,nom,profil) VALUES('Citoyen',$1,'CITOYEN_DEMO_P3_1') RETURNING id",
        [`${citizen.role}_${token}`]);
      const personId = Number(person.rows[0].id);
      await client.query("INSERT INTO relations_personne_organisation(personne_id,organisation_id,type) VALUES($1,$2,'MEMBRE_TEST')", [personId, manifest.organizationId]);
      manifest.people.push({ id: personId, role: citizen.role });
    }

    manifest.channelCode = `P31_DEMO_${token}`;
    const channel = await client.query(`
      INSERT INTO communication_channels(tenant_id,organisation_id,code,nom,description,visibility,created_by)
      VALUES($1,$2,$3,'Informations de démonstration','Canal synthétique réservé à la recette P3.1.','PUBLIC',$4)
      RETURNING id`, [scope.rows[0].tenant_id, manifest.organizationId, manifest.channelCode, manifest.vicePersonId]);
    manifest.channelId = Number(channel.rows[0].id);
    await client.query(`
      INSERT INTO communication_channel_subscriptions(channel_id,tenant_id,organisation_id,personne_id,actif)
      VALUES($1,$2,$3,$4,TRUE)`, [manifest.channelId, scope.rows[0].tenant_id, manifest.organizationId, manifest.people[0].id]);

    const database = require("../database");
    const executerOriginal = database.executerRequete;
    database.executerRequete = (sql, values = []) => client.query(sql, values);
    try {
      const { creerCompteAuthentificationDatabase } = require("../auth-database");
      for (let i = 0; i < accounts.length; i++) {
        const created = await creerCompteAuthentificationDatabase(manifest.people[i].id, accounts[i].login, accounts[i].password);
        assert.equal(created.succes, true, `Création du compte synthétique ${accounts[i].role} refusée.`);
        manifest.accounts.push({ id: Number(created.compte.id), personId: manifest.people[i].id, role: accounts[i].role, login: accounts[i].login });
      }
    } finally { database.executerRequete = executerOriginal; }

    manifest.state = "PENDING_COMMIT";
    ecrirePrive(MANIFEST_PATH, JSON.stringify(manifest, null, 2), false);
    await client.query("COMMIT");
    transactionOpen = false;
    committed = true;
    manifest.state = "READY";
    ecrirePrive(MANIFEST_PATH, JSON.stringify(manifest, null, 2), false);
    await verifierInstance(client);
    const verification = await client.query(`
      SELECT (SELECT count(*)::int FROM role_permissions WHERE role_id=$1 AND permission_id=(SELECT id FROM permissions WHERE code='TARGET_COMMUNICATION') AND actif=TRUE) AS grants,
             (SELECT count(*)::int FROM communication_channel_subscriptions WHERE channel_id=$2 AND actif=TRUE) AS active_subscriptions,
             (SELECT count(*)::int FROM auth_accounts WHERE id=ANY($3::bigint[])) AS accounts`,
      [manifest.roleId, manifest.channelId, manifest.accounts.map(x => x.id)]);
    assert.equal(verification.rows[0].grants, 1);
    assert.equal(verification.rows[0].active_subscriptions, 1);
    assert.equal(verification.rows[0].accounts, 2);
    process.stdout.write(JSON.stringify({
      status: "FIXTURE_READY", database: DATABASE, tenant: TENANT_CODE,
      organisationId: manifest.organizationId, viceLogin: VICE_LOGIN,
      permission: "TARGET_COMMUNICATION", roleCode: role.code,
      demoTitlePrefix: `DEMO P3.1 ${token} —`,
      channel: { id: manifest.channelId, name: "Informations de démonstration" },
      citizens: manifest.accounts.map(x => ({ role: x.role, login: x.login, personId: x.personId, subscribed: x.role === "CITOYEN_A" })),
      viceCredentialsPath: VICE_CREDENTIALS_PATH, citizenCredentialsPath: CREDENTIALS_PATH,
      cleanupManifest: MANIFEST_PATH
    }, null, 2) + "\n");
  } catch (error) {
    if (transactionOpen) await client.query("ROLLBACK").catch(() => {});
    if (committed && manifestCreated) {
      manifest.state = "COMMITTED_NEEDS_REVIEW";
      ecrirePrive(MANIFEST_PATH, JSON.stringify(manifest, null, 2), false);
    } else {
      if (manifestCreated) fs.unlinkSync(MANIFEST_PATH);
      if (credentialsCreated) fs.unlinkSync(CREDENTIALS_PATH);
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
    if (require.cache[require.resolve("../database")]) await require("../database").fermerDatabase().catch(() => {});
  }
}

async function verify() {
  assert(fs.existsSync(MANIFEST_PATH), "Manifeste de démonstration introuvable.");
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  assert.equal(manifest.state, "READY");
  const viceCredentials = lireCompte(VICE_CREDENTIALS_PATH, "VICE");
  const citizenA = lireCompte(CREDENTIALS_PATH, "CITOYEN_A");
  const citizenB = lireCompte(CREDENTIALS_PATH, "CITOYEN_B");
  const agentCredentials = lireCompte(VICE_CREDENTIALS_PATH, "AGENT_SANS_CONFIG");
  assert.equal(viceCredentials.identifiant, VICE_LOGIN);
  const pool = nouveauPool();
  const { authentifierCompteDatabase, revoquerSessionDatabase } = require("../auth-database");
  const sessions = [];
  async function session(credentials) {
    const result = await authentifierCompteDatabase(credentials.identifiant, credentials.motDePasse);
    assert.equal(result.succes, true, "Connexion d'un acteur de démonstration impossible.");
    sessions.push(result.jeton);
    return result.jeton;
  }
  async function api(url, token, options = {}) {
    const response = await fetch(`http://127.0.0.1:3200${url}`, {
      ...options,
      headers: { ...(options.body ? { "content-type": "application/json" } : {}), ...(options.headers || {}), cookie: `sateer_session=${token}` },
      cache: "no-store"
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }
  try {
    const client = await pool.connect();
    try { await verifierInstance(client); } finally { client.release(); }
    const vice = await session(viceCredentials);
    const agent = await session(agentCredentials);
    const a = await session(citizenA);
    const b = await session(citizenB);
    const pubPath = `/api/organisations/${manifest.organizationId}/publications?tenant=${encodeURIComponent(TENANT_CODE)}`;
    const viceList = await api(pubPath, vice);
    assert.equal(viceList.status, 200, `Le Vice-Consul doté de TARGET_COMMUNICATION doit ouvrir la gestion des publications (${viceList.body.statut || "sans statut"}).`);
    const agentList = await api(pubPath, agent);
    assert.equal(agentList.status, 403, `L'agent sans permission doit rester refusé (${agentList.body.statut || "sans statut"}).`);
    const postPath = `/api/organisations/${manifest.organizationId}/publications`;
    const validationVice = await api(postPath, vice, { method: "POST", body: JSON.stringify({ tenantCode: TENANT_CODE, titre: "", contenu: "" }) });
    assert.equal(validationVice.status, 400, `Le Vice-Consul passe le contrôle de permission et atteint la validation du payload (${validationVice.body.statut || "sans statut"}).`);
    const postAgent = await api(postPath, agent, { method: "POST", body: JSON.stringify({ tenantCode: TENANT_CODE, titre: "", contenu: "" }) });
    assert.equal(postAgent.status, 403, `L'agent sans permission reste refusé en écriture (${postAgent.body.statut || "sans statut"}).`);
    const dashboard = await api(`/api/organisations/${manifest.organizationId}/dashboard-operationnel/acces?tenant=${encodeURIComponent(TENANT_CODE)}`, vice);
    assert.equal(dashboard.status, 200);
    assert.equal(dashboard.body.peutConsulter, true, "Le Vice-Consul conserve son tableau de bord.");
    assert.equal(dashboard.body.sourceAcces, "ROLE", "L'accès du Vice-Consul reste fondé sur son rôle organisationnel.");
    const channelsPath = `/api/organisations/${manifest.organizationId}/channels?tenant=${encodeURIComponent(TENANT_CODE)}`;
    const channelA = await api(channelsPath, a);
    const channelB = await api(channelsPath, b);
    assert.equal(channelA.status, 200); assert.equal(channelB.status, 200);
    const rowA = channelA.body.canaux.find(x => Number(x.id) === manifest.channelId);
    const rowB = channelB.body.canaux.find(x => Number(x.id) === manifest.channelId);
    assert.equal(rowA?.abonne, true, "Citoyen A doit être abonné au canal synthétique.");
    assert.equal(rowB?.abonne, false, "Citoyen B doit rester non abonné.");
    const [citizenPersonA, citizenPersonB] = manifest.people.map(x => Number(x.id));
    const feedA = await api(`/api/mon-consulat/${citizenPersonA}?tenant=${encodeURIComponent(TENANT_CODE)}&organisation=${manifest.organizationId}`, a);
    const feedB = await api(`/api/mon-consulat/${citizenPersonB}?tenant=${encodeURIComponent(TENANT_CODE)}&organisation=${manifest.organizationId}`, b);
    assert.equal(feedA.status, 200); assert.equal(feedB.status, 200);
    process.stdout.write(JSON.stringify({ status: "API_ACCESS_VERIFIED", vicePublicationHistory: viceList.status,
      agentPublicationHistory: agentList.status, citizenASubscribed: rowA.abonne,
      citizenBSubscribed: rowB.abonne, monConsulatA: feedA.status, monConsulatB: feedB.status,
      vicePublicationValidation: validationVice.status, agentPublicationWrite: postAgent.status,
      viceDashboard: dashboard.status,
      publicationCount: viceList.body.publications?.length || 0 }, null, 2) + "\n");
  } finally {
    for (const token of sessions) await revoquerSessionDatabase(token).catch(() => {});
    await pool.end();
    await require("../database").fermerDatabase().catch(() => {});
  }
}

async function cleanup(manifestPath, confirmation) {
  assert.equal(path.resolve(manifestPath || ""), MANIFEST_PATH, "Cleanup refuse un manifeste hors de la fixture P6 explicitement ciblée.");
  assert.equal(confirmation, "--confirm-fixture-cleanup", "Cleanup exige une confirmation explicite.");
  assert(fs.existsSync(MANIFEST_PATH), "Manifeste introuvable; aucun nettoyage exécuté.");
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  assert.equal(manifest.tenantCode, TENANT_CODE);
  const pool = nouveauPool();
  const client = await pool.connect();
  try {
    await verifierInstance(client);
    await client.query("BEGIN");
    const channel = await client.query("SELECT id,code,tenant_id FROM communication_channels WHERE id=$1 AND organisation_id=$2", [manifest.channelId, manifest.organizationId]);
    assert.equal(channel.rowCount, 1, "Canal synthétique incohérent; nettoyage refusé.");
    const publications = await client.query("SELECT id,publie_par,titre,medias FROM publications WHERE communication_channel_id=$1 AND tenant_id=$2 AND organisation_id=$3 ORDER BY id", [manifest.channelId, channel.rows[0].tenant_id, manifest.organizationId]);
    const titlePrefix = `DEMO P3.1 ${manifest.token} —`;
    assert(publications.rows.every(p => Number(p.publie_par) === manifest.vicePersonId && typeof p.titre === "string" && p.titre.startsWith(titlePrefix) && Array.isArray(p.medias) && p.medias.length === 0),
      "Nettoyage refusé : une publication du canal ne porte pas le titre de démonstration exact, n'est pas de l'auteur attendu ou a des pièces jointes.");
    const publicationIds = publications.rows.map(x => Number(x.id));
    const targets = await client.query("SELECT count(*)::int n FROM communication_publication_targets WHERE publication_id=ANY($1::bigint[])", [publicationIds]);
    assert.equal(targets.rows[0].n, 0, "Nettoyage refusé : des cibles organisationnelles sont associées aux publications.");
    const notifications = await client.query(`
      SELECT id,type,reference_type,reference_id,tenant_id,organisation_id,personne_id,canal
      FROM notifications WHERE tenant_id=$1 AND organisation_id=$2
        AND (canal=$3 OR reference_id=ANY($4::bigint[]))`,
      [channel.rows[0].tenant_id, manifest.organizationId, manifest.channelCode, publicationIds]);
    assert(notifications.rows.every(n => n.type === "PUBLICATION_CANAL" && n.reference_type === "PUBLICATION"
      && publicationIds.includes(Number(n.reference_id)) && manifest.people.some(p => Number(p.id) === Number(n.personne_id))),
      "Nettoyage refusé : une notification du canal n'est pas une notification de démonstration attendue.");
    const personNotifications = await client.query("SELECT count(*)::int n FROM notifications WHERE personne_id=ANY($1::bigint[]) AND NOT (tenant_id=$2 AND organisation_id=$3 AND type='PUBLICATION_CANAL' AND reference_type='PUBLICATION' AND reference_id=ANY($4::bigint[]))", [manifest.people.map(x => x.id), channel.rows[0].tenant_id, manifest.organizationId, publicationIds]);
    const requests = await client.query("SELECT count(*)::int n FROM demandes WHERE personne_id=ANY($1::bigint[])", [manifest.people.map(x => x.id)]);
    const linkedRecords = await client.query(`
      SELECT
        (SELECT count(*)::int FROM analytics_events WHERE publication_id=ANY($1::bigint[]) OR personne_id=ANY($2::bigint[])) AS analytics,
        (SELECT count(*)::int FROM consents WHERE publication_id=ANY($1::bigint[]) OR personne_id=ANY($2::bigint[])) AS consents,
        (SELECT count(*)::int FROM leads WHERE publication_id=ANY($1::bigint[]) OR personne_id=ANY($2::bigint[])) AS leads`,
      [publicationIds, manifest.people.map(x => x.id)]);
    assert.equal(personNotifications.rows[0].n, 0, "Nettoyage refusé : des notifications existent pour les citoyens.");
    assert.equal(requests.rows[0].n, 0, "Nettoyage refusé : des demandes ont été créées par les citoyens.");
    assert.equal(linkedRecords.rows[0].analytics, 0, "Nettoyage refusé : des événements analytiques sont liés aux données synthétiques.");
    assert.equal(linkedRecords.rows[0].consents, 0, "Nettoyage refusé : des consentements sont liés aux données synthétiques.");
    assert.equal(linkedRecords.rows[0].leads, 0, "Nettoyage refusé : des leads sont liés aux données synthétiques.");
    const otherSubscriptions = await client.query("SELECT count(*)::int n FROM communication_channel_subscriptions WHERE channel_id=$1 AND NOT(personne_id=ANY($2::bigint[]))", [manifest.channelId, manifest.people.map(x => x.id)]);
    assert.equal(otherSubscriptions.rows[0].n, 0, "Nettoyage refusé : une autre personne s'est abonnée au canal.");
    const externalRelations = await client.query("SELECT count(*)::int n FROM relations_personne_organisation WHERE personne_id=ANY($1::bigint[]) AND organisation_id<>$2", [manifest.people.map(x => x.id), manifest.organizationId]);
    assert.equal(externalRelations.rows[0].n, 0, "Nettoyage refusé : un citoyen a reçu un autre rattachement.");
    const roleSafety = await client.query("SELECT id,metadata FROM organisation_roles WHERE id=$1 AND organisation_id=$2 FOR UPDATE", [manifest.permissionRoleId, manifest.organizationId]);
    assert.equal(roleSafety.rowCount, 1, "Nettoyage refusé : le rôle local n'est plus celui du manifeste.");
    assert.notEqual(roleSafety.rows[0].metadata?.systemProtected, true, "Nettoyage refusé : le rôle est désormais protégé.");
    const peopleSafety = await client.query("SELECT id,nom,profil FROM personnes WHERE id=ANY($1::bigint[])", [manifest.people.map(x => x.id)]);
    assert.equal(peopleSafety.rowCount, 2, "Nettoyage refusé : des comptes citoyens ont changé depuis la création.");
    assert(peopleSafety.rows.every(p => p.profil === "CITOYEN_DEMO_P3_1" && p.nom.endsWith(`_${manifest.token}`)),
      "Nettoyage refusé : les personnes ne correspondent plus aux identifiants synthétiques du manifeste.");
    if (publicationIds.length) {
      await client.query("DELETE FROM notifications WHERE tenant_id=$1 AND organisation_id=$2 AND type='PUBLICATION_CANAL' AND reference_type='PUBLICATION' AND reference_id=ANY($3::bigint[])", [channel.rows[0].tenant_id, manifest.organizationId, publicationIds]);
      await client.query("DELETE FROM publications WHERE id=ANY($1::bigint[]) AND communication_channel_id=$2 AND publie_par=$3", [publicationIds, manifest.channelId, manifest.vicePersonId]);
    }
    await client.query("DELETE FROM communication_channel_subscriptions WHERE channel_id=$1 AND personne_id=ANY($2::bigint[])", [manifest.channelId, manifest.people.map(x => x.id)]);
    await client.query("DELETE FROM communication_channels WHERE id=$1 AND organisation_id=$2", [manifest.channelId, manifest.organizationId]);
    if (manifest.permissionAdded) {
      const removed = await client.query("DELETE FROM role_permissions WHERE role_id=$1 AND permission_id=(SELECT id FROM permissions WHERE code='TARGET_COMMUNICATION') RETURNING id", [manifest.permissionRoleId]);
      assert.equal(removed.rowCount, 1, "Nettoyage refusé : la relation de permission a changé.");
    }
    await client.query("DELETE FROM auth_sessions WHERE compte_id=ANY($1::bigint[])", [manifest.accounts.map(x => x.id)]);
    const removedAccounts = await client.query("DELETE FROM auth_accounts WHERE id=ANY($1::bigint[]) AND personne_id=ANY($2::bigint[]) RETURNING id", [manifest.accounts.map(x => x.id), manifest.people.map(x => x.id)]);
    assert.equal(removedAccounts.rowCount, 2, "Nettoyage refusé : les comptes ne correspondent plus au manifeste.");
    await client.query("DELETE FROM relations_personne_organisation WHERE organisation_id=$1 AND personne_id=ANY($2::bigint[])", [manifest.organizationId, manifest.people.map(x => x.id)]);
    const removedPeople = await client.query("DELETE FROM personnes WHERE id=ANY($1::bigint[]) AND profil='CITOYEN_DEMO_P3_1' RETURNING id", [manifest.people.map(x => x.id)]);
    assert.equal(removedPeople.rowCount, 2, "Nettoyage refusé : les personnes ne correspondent plus au manifeste.");
    await client.query("COMMIT");
    process.stdout.write("CLEANUP_TARGETED: lignes exactes supprimées; aucun compte préexistant ni organisation modifié.\n");
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
  finally { client.release(); await pool.end(); }
  // Les credentials ne sont supprimés qu'après succès du cleanup autorisé.
  fs.unlinkSync(CREDENTIALS_PATH);
  fs.unlinkSync(MANIFEST_PATH);
}

(async () => {
  const command = process.argv[2];
  if (command === "setup") await setup();
  else if (command === "verify") await verify();
  else if (command === "cleanup") await cleanup(process.argv[3], process.argv[4]);
  else throw new Error("Usage: node scripts/p3-1-demo-fixture.js setup | verify | cleanup <manifest-exact>");
})().catch(error => {
  // Assertions never include credential values; retain their context without
  // serializing the credentials object or any generated password.
  process.stderr.write(`P3_1_DEMO_FIXTURE_REFUSED:${error.message}\n`);
  process.exitCode = 1;
});
