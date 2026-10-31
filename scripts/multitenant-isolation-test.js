"use strict";

// Black-box multi-tenant isolation test.
// SAFETY: this script refuses to write unless PostgreSQL database is exactly sateer_test.
process.env.PGDATABASE = "sateer_test";
process.env.PGHOST = process.env.PGHOST || "localhost";
process.env.PGPORT = process.env.PGPORT || "5432";
process.env.PGUSER = process.env.PGUSER || process.env.USER;

const { spawn } = require("node:child_process");
const net = require("node:net");
const { randomBytes } = require("node:crypto");
const { setTimeout: delay } = require("node:timers/promises");
const { executerRequete, fermerDatabase } = require("../database");
const { creerCompteAuthentificationDatabase } = require("../auth-database");

const RUN = randomBytes(6).toString("hex").toUpperCase();
const TENANT_A = "ISO_A_" + RUN;
const TENANT_B = "ISO_B_" + RUN;
const EMAIL_A = "tenant-a-" + RUN.toLowerCase() + "@sateer.test";
const EMAIL_B = "tenant-b-" + RUN.toLowerCase() + "@sateer.test";
const PASSWORD_A = randomBytes(24).toString("base64url") + "Aa1!";
const PASSWORD_B = randomBytes(24).toString("base64url") + "Bb2!";

let port = 0;
let baseUrl = "";
let server = null;
let tenantIds = [];
let organisationIds = [];
let personneIds = [];
let roleIds = [];
let createdAccounts = false;
let cookies = {};

function check(condition, message) {
    if (!condition) throw new Error("ECHEC - " + message);
    console.log("PASS " + message);
}

async function choosePort() {
    const probe = net.createServer();
    await new Promise((resolve, reject) => {
        probe.once("error", reject);
        probe.listen(0, "127.0.0.1", resolve);
    });
    const address = probe.address();
    const selected = address && typeof address === "object" ? address.port : 0;
    await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
    if (!selected) throw new Error("Impossible de sélectionner un port de test.");
    return selected;
}

async function api(path, options = {}, cookie = null) {
    const response = await fetch(baseUrl + path, {
        ...options,
        headers: {
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...(cookie ? { Cookie: cookie } : {}),
            ...(options.headers || {})
        }
    });
    return response;
}

async function waitForServer() {
    for (let attempt = 0; attempt < 50; attempt += 1) {
        if (server && server.exitCode !== null) {
            throw new Error("Le serveur SATEER s'est arrêté avant de répondre.");
        }
        try {
            const response = await fetch(baseUrl + "/api/auth/me");
            if (response.status === 401) return;
            if (response.status >= 500) {
                throw new Error("Le serveur répond HTTP " + response.status);
            }
        } catch (error) {
            if (error.message.startsWith("Le serveur répond")) throw error;
        }
        await delay(200);
    }
    throw new Error("Délai dépassé au démarrage du serveur.");
}

async function login(key, email, password) {
    const response = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifiant: email, motDePasse: password })
    });
    check(response.status === 200, "Authentification HTTP du tenant " + key);
    const setCookies = typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : [response.headers.get("set-cookie") || ""];
    const cookie = setCookies.map(value => value.split(";")[0])
        .find(value => value.startsWith("sateer_session="));
    check(Boolean(cookie), "Cookie de session créé pour le tenant " + key);
    cookies[key] = cookie;
}

async function expectStatus(response, expected, message) {
    check(response.status === expected, message + " (HTTP " + response.status + ", attendu " + expected + ")");
}

async function provision() {
    const db = await executerRequete("SELECT current_database() AS name");
    check(db.rows[0].name === "sateer_test",
        "La cible PostgreSQL est exclusivement sateer_test");

    const permission = await executerRequete(
        "SELECT id FROM permissions WHERE code = 'VIEW_ORGANISATION' AND actif = TRUE LIMIT 1"
    );
    check(permission.rows.length === 1, "Permission VIEW_ORGANISATION disponible");

    const tenantA = await executerRequete(
        "INSERT INTO tenants (code, nom, type, actif) VALUES ($1, $2, 'ISOLATION_TEST', TRUE) RETURNING id",
        [TENANT_A, "Tenant de test A " + RUN]
    );
    tenantIds.push(Number(tenantA.rows[0].id));

    const tenantB = await executerRequete(
        "INSERT INTO tenants (code, nom, type, actif) VALUES ($1, $2, 'ISOLATION_TEST', TRUE) RETURNING id",
        [TENANT_B, "Tenant de test B " + RUN]
    );
    tenantIds.push(Number(tenantB.rows[0].id));

    const orgA = await executerRequete(
        "INSERT INTO organisations (nom, type, tenant_id) VALUES ($1, 'ORGANISATION_TEST', $2) RETURNING id",
        ["Organisation A " + RUN, tenantIds[0]]
    );
    organisationIds.push(Number(orgA.rows[0].id));

    const orgB = await executerRequete(
        "INSERT INTO organisations (nom, type, tenant_id) VALUES ($1, 'ORGANISATION_TEST', $2) RETURNING id",
        ["Organisation B " + RUN, tenantIds[1]]
    );
    organisationIds.push(Number(orgB.rows[0].id));

    const personA = await executerRequete(
        "INSERT INTO personnes (prenom, nom, pays_residence, profil) VALUES ('TestA', $1, 'France', 'TEST') RETURNING id",
        ["TenantA-" + RUN]
    );
    personneIds.push(Number(personA.rows[0].id));

    const personB = await executerRequete(
        "INSERT INTO personnes (prenom, nom, pays_residence, profil) VALUES ('TestB', $1, 'France', 'TEST') RETURNING id",
        ["TenantB-" + RUN]
    );
    personneIds.push(Number(personB.rows[0].id));

    await executerRequete(
        "INSERT INTO relations_personne_organisation (personne_id, organisation_id, type) VALUES ($1, $2, 'TEST_MEMBER'), ($3, $4, 'TEST_MEMBER')",
        [personneIds[0], organisationIds[0], personneIds[1], organisationIds[1]]
    );

    const roleA = await executerRequete(
        "INSERT INTO organisation_roles (organisation_id, code, nom, scope, actif) VALUES ($1, $2, 'Tenant A Test Admin', 'ORGANISATION', TRUE) RETURNING id",
        [organisationIds[0], "ISO_ADMIN_" + RUN]
    );
    roleIds.push(Number(roleA.rows[0].id));

    const roleB = await executerRequete(
        "INSERT INTO organisation_roles (organisation_id, code, nom, scope, actif) VALUES ($1, $2, 'Tenant B Test Admin', 'ORGANISATION', TRUE) RETURNING id",
        [organisationIds[1], "ISO_ADMIN_" + RUN]
    );
    roleIds.push(Number(roleB.rows[0].id));

    await executerRequete(
        "INSERT INTO role_permissions (role_id, permission_id, actif) VALUES ($1, $3, TRUE), ($2, $3, TRUE)",
        [roleIds[0], roleIds[1], Number(permission.rows[0].id)]
    );

    await executerRequete(
        "INSERT INTO relations_personne_organisation_roles (personne_id, organisation_id, role_id, actif) VALUES ($1, $2, $3, TRUE), ($4, $5, $6, TRUE)",
        [personneIds[0], organisationIds[0], roleIds[0], personneIds[1], organisationIds[1], roleIds[1]]
    );

    const accountA = await creerCompteAuthentificationDatabase(personneIds[0], EMAIL_A, PASSWORD_A);
    const accountB = await creerCompteAuthentificationDatabase(personneIds[1], EMAIL_B, PASSWORD_B);
    check(accountA.succes && accountB.succes, "Deux comptes synthétiques indépendants créés");
    createdAccounts = true;
    check(true, "Deux tenants, deux organisations, deux personnes et deux rattachements provisionnés");
}

async function testContextes() {
    const contextA = await api("/api/context?tenant=" + TENANT_A, {}, cookies.a);
    await expectStatus(contextA, 200, "A consulte son contexte tenant");
    const jsonA = await contextA.json();
    check(jsonA.organisations.length === 1
        && Number(jsonA.organisations[0].id) === organisationIds[0],
        "Le contexte A ne contient que l'organisation A");

    const contextB = await api("/api/context?tenant=" + TENANT_B, {}, cookies.b);
    await expectStatus(contextB, 200, "B consulte son contexte tenant");
    const jsonB = await contextB.json();
    check(jsonB.organisations.length === 1
        && Number(jsonB.organisations[0].id) === organisationIds[1],
        "Le contexte B ne contient que l'organisation B");

    const switchedA = await api("/api/context?tenant=" + TENANT_B, {}, cookies.a);
    await expectStatus(switchedA, 200, "A demande explicitement le contexte B");
    const switchedAJson = await switchedA.json();
    check(switchedAJson.organisations.length === 0,
        "Changer le paramètre tenant ne révèle aucune organisation à A");

    const switchedB = await api("/api/context?tenant=" + TENANT_A, {}, cookies.b);
    await expectStatus(switchedB, 200, "B demande explicitement le contexte A");
    const switchedBJson = await switchedB.json();
    check(switchedBJson.organisations.length === 0,
        "Changer le paramètre tenant ne révèle aucune organisation à B");
}

async function testAccesOrganisation() {
    const ownA = await api(
        "/api/organisations/" + organisationIds[0] + "/structure?tenant=" + TENANT_A,
        {},
        cookies.a
    );
    await expectStatus(ownA, 200, "A accède à sa propre organisation");

    const ownB = await api(
        "/api/organisations/" + organisationIds[1] + "/structure?tenant=" + TENANT_B,
        {},
        cookies.b
    );
    await expectStatus(ownB, 200, "B accède à sa propre organisation");

    const crossAtoB = await api(
        "/api/organisations/" + organisationIds[1] + "/structure?tenant=" + TENANT_B,
        {},
        cookies.a
    );
    await expectStatus(crossAtoB, 403, "A ne peut pas lire l'organisation B même en déclarant le tenant B");

    const crossBtoA = await api(
        "/api/organisations/" + organisationIds[0] + "/structure?tenant=" + TENANT_A,
        {},
        cookies.b
    );
    await expectStatus(crossBtoA, 403, "B ne peut pas lire l'organisation A même en déclarant le tenant A");

    const mismatchedTenantA = await api(
        "/api/organisations/" + organisationIds[0] + "/structure?tenant=" + TENANT_B,
        {},
        cookies.a
    );
    await expectStatus(mismatchedTenantA, 403, "A ne peut pas utiliser son organisation avec le mauvais tenant");

    const mismatchedTenantB = await api(
        "/api/organisations/" + organisationIds[1] + "/structure?tenant=" + TENANT_A,
        {},
        cookies.b
    );
    await expectStatus(mismatchedTenantB, 403, "B ne peut pas utiliser son organisation avec le mauvais tenant");
}

async function cleanup() {
    for (const cookie of Object.values(cookies)) {
        try {
            await api("/api/auth/logout", { method: "POST" }, cookie);
        } catch {}
    }

    if (server && server.exitCode === null) {
        server.kill("SIGTERM");
        await Promise.race([
            new Promise(resolve => server.once("exit", resolve)),
            delay(2500)
        ]);
        if (server.exitCode === null) server.kill("SIGKILL");
    }

    if (personneIds.length) {
        const ids = personneIds;
        await executerRequete(
            "DELETE FROM auth_accounts WHERE personne_id = ANY($1::integer[])",
            [ids]
        );
        await executerRequete(
            "DELETE FROM relations_personne_organisation_roles WHERE personne_id = ANY($1::integer[])",
            [ids]
        );
        await executerRequete(
            "DELETE FROM relations_personne_organisation WHERE personne_id = ANY($1::integer[])",
            [ids]
        );
    }

    if (organisationIds.length) {
        await executerRequete(
            "DELETE FROM organisations WHERE id = ANY($1::integer[])",
            [organisationIds]
        );
    }

    if (personneIds.length) {
        await executerRequete(
            "DELETE FROM personnes WHERE id = ANY($1::integer[])",
            [personneIds]
        );
    }

    if (tenantIds.length) {
        await executerRequete(
            "DELETE FROM tenants WHERE id = ANY($1::integer[])",
            [tenantIds]
        );
    }
}

async function main() {
    await provision();
    port = await choosePort();
    baseUrl = "http://127.0.0.1:" + port;

    server = spawn(process.execPath, ["server.js"], {
        cwd: process.cwd(),
        env: {
            ...process.env,
            PGDATABASE: "sateer_test",
            PGHOST: process.env.PGHOST || "localhost",
            PGPORT: process.env.PGPORT || "5432",
            PGUSER: process.env.PGUSER || process.env.USER,
            PORT: String(port),
            NODE_ENV: "test"
        },
        stdio: ["ignore", "pipe", "pipe"]
    });
    server.stdout.on("data", chunk => process.stdout.write("[SATEER] " + chunk));
    server.stderr.on("data", chunk => process.stderr.write("[SATEER] " + chunk));
    await waitForServer();

    await login("a", EMAIL_A, PASSWORD_A);
    await login("b", EMAIL_B, PASSWORD_B);

    await testContextes();
    await testAccesOrganisation();

    console.log("\nSUCCES - Isolation multi-tenant vérifiée pour deux tenants indépendants.");
}

main()
    .catch(error => {
        console.error("\nECHEC - " + (error.stack || error.message));
        process.exitCode = 1;
    })
    .finally(async () => {
        try {
            await cleanup();
        } catch (error) {
            console.error("ECHEC - Nettoyage des données temporaires :", error.message);
            process.exitCode = 1;
        }
        await fermerDatabase();
    });
