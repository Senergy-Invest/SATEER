"use strict";

// End-to-end pilot workflow test. All writes are restricted to sateer_test.
// Creates synthetic people, roles/memberships, accounts and one request,
// exercises the HTTP workflow, then removes all test data.

process.env.PGDATABASE = "sateer_test";
process.env.PGHOST = process.env.PGHOST || "localhost";
process.env.PGPORT = process.env.PGPORT || "5432";
process.env.PGUSER = process.env.PGUSER || process.env.USER;

const { spawn } = require("node:child_process");
const net = require("node:net");
const { randomBytes, randomUUID } = require("node:crypto");
const { setTimeout: delay } = require("node:timers/promises");
const {
    executerRequete,
    obtenirClientDatabase,
    fermerDatabase
} = require("../database");
const { creerCompteAuthentificationDatabase } = require("../auth-database");

const TENANT = "SN";
let PORT = Number(process.env.SATEER_WORKFLOW_TEST_PORT || 0);
let BASE_URL = `http://127.0.0.1:${PORT}`;
const RUN_ID = randomUUID().replace(/-/g, "").slice(0, 12);
const DEMAND_OBJECT = "Test E2E SATEER " + RUN_ID;
const PASSWORD = randomBytes(24).toString("base64url") + "Aa1!";
const ACTORS = {
    citizen: { login: `e2e.citizen.${RUN_ID}@sateer.test`, personId: null },
    secretariat: { login: `e2e.secretariat.${RUN_ID}@sateer.test`, personId: null },
    agent: { login: `e2e.agent.${RUN_ID}@sateer.test`, personId: null },
    viceConsul: { login: `e2e.viceconsul.${RUN_ID}@sateer.test`, personId: null },
    consul: { login: `e2e.consul.${RUN_ID}@sateer.test`, personId: null }
};
const createdAccounts = [];
const cookies = {};
let server = null;
let demandId = null;
let orgId = null;
let secretariatUnitId = null;
let serviceUnitId = null;
let createdPersonIds = [];
let createdMemberships = [];
let createdOrgAssignments = [];

function check(condition, message) {
    if (!condition) throw new Error(message);
    console.log("OK - " + message);
}

async function api(path, options = {}, cookie = null) {
    const headers = { ...(options.headers || {}) };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (cookie) headers.Cookie = cookie;
    const response = await fetch(BASE_URL + path, { ...options, headers });
    const raw = await response.text();
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; }
    catch { body = { raw }; }
    return { response, body };
}

function expectStatus(result, status, message) {
    check(result.response.status === status,
        `${message} (HTTP ${result.response.status}, attendu ${status})`);
}

async function login(actorKey) {
    const actor = ACTORS[actorKey];
    const result = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
            identifiant: actor.login,
            motDePasse: PASSWORD
        })
    });
    expectStatus(result, 200, `Authentification HTTP : ${actorKey}`);
    const setCookies = typeof result.response.headers.getSetCookie === "function"
        ? result.response.headers.getSetCookie()
        : [result.response.headers.get("set-cookie") || ""];
    const cookie = setCookies.map(value => value.split(";")[0])
        .find(value => value.startsWith("sateer_session="));
    check(Boolean(cookie), `Cookie de session créé : ${actorKey}`);
    cookies[actorKey] = cookie;
    const me = await api("/api/auth/me", {}, cookie);
    expectStatus(me, 200, `Identité de session vérifiée : ${actorKey}`);
    check(Number(me.body.personne.id) === Number(actor.personId),
        `Identité issue de la session correcte : ${actorKey}`);
}

async function choisirPortLibre() {
    if (PORT > 0) return PORT;
    const probe = net.createServer();
    await new Promise((resolve, reject) => {
        probe.once("error", reject);
        probe.listen(0, "127.0.0.1", resolve);
    });
    const address = probe.address();
    const port = address && typeof address === "object" ? address.port : 0;
    await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
    if (!port) throw new Error("Impossible de réserver un port HTTP de test.");
    return port;
}
async function waitForServer() {
    for (let i = 0; i < 50; i += 1) {
        if (server && server.exitCode !== null) {
            throw new Error("Le serveur SATEER s'est arrêté au démarrage.");
        }
        try {
            const result = await fetch(BASE_URL + "/api/auth/me");
            if (result.status === 401) return;
            if (result.status >= 500) throw new Error("HTTP " + result.status);
        } catch (error) {
            if (error.message.startsWith("HTTP ")) throw error;
        }
        await delay(200);
    }
    throw new Error("Délai dépassé au démarrage du serveur.");
}

async function provision() {
    const client = await obtenirClientDatabase();
    try {
        await client.query("BEGIN");

        const target = await client.query(`
            SELECT
                o.id AS organisation_id,
                sec.id AS secretariat_unit_id,
                svc.id AS service_unit_id,
                intake.id AS intake_role_id,
                agent.id AS agent_role_id,
                deputy.id AS deputy_role_id,
                head.id AS head_role_id,
                route_cap.configuration AS routing_configuration
            FROM organisations o
            INNER JOIN tenants t ON t.id = o.tenant_id
            INNER JOIN organisation_units sec
                ON sec.organisation_id = o.id
                AND sec.code = 'SECRETARIAT'
                AND sec.actif = TRUE
            INNER JOIN organisation_units svc
                ON svc.organisation_id = o.id
                AND svc.code = 'CONSULAR_SERVICE'
                AND svc.actif = TRUE
            INNER JOIN organisation_roles intake
                ON intake.organisation_id = o.id
                AND intake.code = 'INTAKE_ROUTER'
                AND intake.scope IN ('UNIT', 'BOTH')
                AND intake.actif = TRUE
            INNER JOIN organisation_roles agent
                ON agent.organisation_id = o.id
                AND agent.code = 'CASE_AGENT'
                AND agent.scope IN ('UNIT', 'BOTH')
                AND agent.actif = TRUE
            INNER JOIN organisation_roles deputy
                ON deputy.organisation_id = o.id
                AND deputy.code = 'OPERATIONAL_DEPUTY'
                AND deputy.scope IN ('ORGANISATION', 'BOTH')
                AND deputy.actif = TRUE
            INNER JOIN organisation_roles head
                ON head.organisation_id = o.id
                AND head.code = 'HEAD_OF_MISSION'
                AND head.scope IN ('ORGANISATION', 'BOTH')
                AND head.actif = TRUE
            INNER JOIN organisation_unit_capabilities route_cap
                ON route_cap.organisation_unit_id = sec.id
                AND route_cap.actif = TRUE
            INNER JOIN capabilities route_code
                ON route_code.id = route_cap.capability_id
                AND route_code.code = 'ROUTE_CASES'
                AND route_code.actif = TRUE
            WHERE t.code = $1
                AND o.type = 'CONSULAT'
            ORDER BY o.id
            LIMIT 1
        `, [TENANT]);
        check(target.rows.length === 1,
            "Configuration du Consulat pilote et des unités trouvée");

        const config = target.rows[0];
        orgId = Number(config.organisation_id);
        secretariatUnitId = Number(config.secretariat_unit_id);
        serviceUnitId = Number(config.service_unit_id);
        const allowed = config.routing_configuration
            && config.routing_configuration.allowedDestinationUnitIds;
        check(Array.isArray(allowed) && allowed.map(Number).includes(serviceUnitId),
            "Le routage Secrétariat → Service consulaire est explicitement autorisé");

        const requiredPermissions = await client.query(`
            SELECT
                r.code AS role_code,
                p.code AS permission_code
            FROM organisation_roles r
            INNER JOIN role_permissions rp ON rp.role_id = r.id AND rp.actif = TRUE
            INNER JOIN permissions p ON p.id = rp.permission_id AND p.actif = TRUE
            WHERE r.organisation_id = $1
                AND r.code IN ('INTAKE_ROUTER', 'CASE_AGENT', 'OPERATIONAL_DEPUTY', 'HEAD_OF_MISSION')
        `, [orgId]);
        const permissionSet = new Set(requiredPermissions.rows.map(
            row => row.role_code + ":" + row.permission_code
        ));
        for (const code of ["VIEW_INCOMING", "ROUTE_CASE"]) {
            check(permissionSet.has("INTAKE_ROUTER:" + code),
                "Permission Secrétariat présente : " + code);
        }
        for (const code of ["VIEW_INCOMING", "VIEW_CASE", "TAKE_CASE", "PROCESS_CASE", "RESPOND_CASE"]) {
            check(permissionSet.has("CASE_AGENT:" + code),
                "Permission agent présente : " + code);
        }
        check(permissionSet.has("OPERATIONAL_DEPUTY:VIEW_OPERATIONAL_DASHBOARD"),
            "Permission du dashboard opérationnel présente");
        check(permissionSet.has("HEAD_OF_MISSION:VIEW_STRATEGIC_DASHBOARD"),
            "Permission du dashboard stratégique présente");

        const caps = await client.query(`
            SELECT u.code AS unit_code, c.code AS capability_code
            FROM organisation_unit_capabilities uc
            INNER JOIN organisation_units u ON u.id = uc.organisation_unit_id
            INNER JOIN capabilities c ON c.id = uc.capability_id
            WHERE uc.actif = TRUE AND c.actif = TRUE
                AND u.id IN ($1, $2)
        `, [secretariatUnitId, serviceUnitId]);
        const capSet = new Set(caps.rows.map(row => row.unit_code + ":" + row.capability_code));
        for (const code of ["RECEIVE_INCOMING", "VIEW_INBOX", "ROUTE_CASES"]) {
            check(capSet.has("SECRETARIAT:" + code),
                "Capacité du Secrétariat présente : " + code);
        }
        for (const code of ["VIEW_INBOX", "TAKE_CASES", "PROCESS_CASES", "RESPOND_CASES"]) {
            check(capSet.has("CONSULAR_SERVICE:" + code),
                "Capacité du Service consulaire présente : " + code);
        }

        const actors = [
            ["citizen", "Samba", "IntegrationCitoyen", "USAGER"],
            ["secretariat", "Agent", "IntegrationSecretariat", "MEMBRE"],
            ["agent", "Agent", "IntegrationTraitement", "MEMBRE"],
            ["viceConsul", "ViceConsul", "IntegrationSupervision", "MEMBRE"],
            ["consul", "Consul", "IntegrationStrategique", "MEMBRE"]
        ];

        for (const [key, prenom, nom, relationType] of actors) {
            const person = await client.query(`
                INSERT INTO personnes (prenom, nom, pays_residence, departement, profil)
                VALUES ($1, $2, 'France', 'Bordeaux', 'SATEER_INTEGRATION_TEST')
                RETURNING id
            `, [prenom, nom + "_" + RUN_ID]);
            const personId = Number(person.rows[0].id);
            ACTORS[key].personId = personId;
            createdPersonIds.push(personId);

            await client.query(`
                INSERT INTO relations_personne_organisation
                    (personne_id, organisation_id, type)
                VALUES ($1, $2, $3)
            `, [personId, orgId, relationType]);
        }

        const roleAssignments = [
            ["viceConsul", Number(config.deputy_role_id)],
            ["consul", Number(config.head_role_id)]
        ];
        for (const [key, roleId] of roleAssignments) {
            await client.query(`
                INSERT INTO relations_personne_organisation_roles
                    (personne_id, organisation_id, role_id, actif)
                VALUES ($1, $2, $3, TRUE)
            `, [ACTORS[key].personId, orgId, roleId]);
            createdOrgAssignments.push([ACTORS[key].personId, roleId]);
        }

        const memberships = [
            ["secretariat", secretariatUnitId, Number(config.intake_role_id), "INTAKE_ROUTER"],
            ["agent", serviceUnitId, Number(config.agent_role_id), "CASE_AGENT"]
        ];
        for (const [key, unitId, roleId, roleCode] of memberships) {
            await client.query(`
                INSERT INTO relations_personne_organisation_unit
                    (personne_id, organisation_unit_id, role, role_id, principal, actif)
                VALUES ($1, $2, $3, $4, TRUE, TRUE)
            `, [ACTORS[key].personId, unitId, roleCode, roleId]);
            createdMemberships.push([ACTORS[key].personId, unitId, roleId]);
        }

        await client.query("COMMIT");
        console.log("OK - 5 acteurs synthétiques et leurs rattachements créés dans sateer_test");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }

    for (const key of Object.keys(ACTORS)) {
        const result = await creerCompteAuthentificationDatabase(
            ACTORS[key].personId,
            ACTORS[key].login,
            PASSWORD
        );
        if (!result.succes) throw new Error(
            "Création compte " + key + " impossible : " + result.code
        );
        createdAccounts.push(result.compte.id);
        console.log("OK - Compte temporaire créé : " + key);
    }
}

async function cleanup() {
    for (const key of Object.keys(cookies)) {
        try {
            await api("/api/auth/logout", { method: "POST" }, cookies[key]);
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

    if (createdPersonIds.length) {
        const client = await obtenirClientDatabase();
        try {
            await client.query("BEGIN");
            await client.query(
                "DELETE FROM notifications WHERE personne_id = ANY($1::integer[])",
                [createdPersonIds]
            );
            await client.query("DELETE FROM demandes WHERE objet = $1", [DEMAND_OBJECT]);
            await client.query(
                "DELETE FROM auth_sessions WHERE compte_id IN (SELECT id FROM auth_accounts WHERE personne_id = ANY($1::integer[]))",
                [createdPersonIds]
            );
            await client.query(
                "DELETE FROM auth_accounts WHERE personne_id = ANY($1::integer[])",
                [createdPersonIds]
            );
            await client.query(
                "DELETE FROM relations_personne_organisation_unit WHERE personne_id = ANY($1::integer[])",
                [createdPersonIds]
            );
            await client.query(
                "DELETE FROM relations_personne_organisation_roles WHERE personne_id = ANY($1::integer[])",
                [createdPersonIds]
            );
            await client.query(
                "DELETE FROM relations_personne_organisation WHERE personne_id = ANY($1::integer[])",
                [createdPersonIds]
            );
            await client.query(
                "DELETE FROM personnes WHERE id = ANY($1::integer[])",
                [createdPersonIds]
            );
            await client.query("COMMIT");
            console.log("OK - Données de test, comptes, sessions et rattachements supprimés");
        } catch (error) {
            await client.query("ROLLBACK").catch(() => {});
            console.error("ATTENTION - Nettoyage incomplet : " + error.message);
            process.exitCode = 1;
        } finally {
            client.release();
        }
    }
}

async function main() {
    const targetDb = await executerRequete("SELECT current_database() AS name");
    check(targetDb.rows[0].name === "sateer_test",
        "La base ciblée est exclusivement sateer_test");

    await provision();
    PORT = await choisirPortLibre();
    BASE_URL = `http://127.0.0.1:${PORT}`;

    server = spawn(process.execPath, ["server.js"], {
        cwd: process.cwd(),
        env: {
            ...process.env,
            PGDATABASE: "sateer_test",
            PGHOST: process.env.PGHOST,
            PGPORT: process.env.PGPORT,
            PGUSER: process.env.PGUSER,
            PORT: String(PORT),
            NODE_ENV: "test"
        },
        stdio: ["ignore", "pipe", "pipe"]
    });
    server.stdout.on("data", chunk => process.stdout.write("[SATEER] " + chunk));
    server.stderr.on("data", chunk => process.stderr.write("[SATEER] " + chunk));
    await waitForServer();

    for (const key of Object.keys(ACTORS)) await login(key);

    // Citizen creates a request.
    const create = await api("/api/demandes", {
        method: "POST",
        body: JSON.stringify({
            organisationId: orgId,
            tenantCode: TENANT,
            categorie: "DEMANDE_INFORMATION",
            objet: DEMAND_OBJECT,
            message: "Demande synthétique de test du circuit institutionnel " + RUN_ID,
            priorite: "NORMALE",
            canal: "MON_SATEER"
        })
    }, cookies.citizen);
    expectStatus(create, 201, "Samba crée une demande depuis Mon SATEER");
    check(create.body.statut === "DEMANDE_CREEE", "La demande est confirmée par l'API");
    demandId = Number(create.body.demande.id);
    check(Number.isSafeInteger(demandId) && demandId > 0, "Identifiant de demande créé");

    const privateForCitizen = await api(
        `/api/demandes/${demandId}?organisationId=${orgId}&tenant=${TENANT}`,
        {},
        cookies.citizen
    );
    expectStatus(privateForCitizen, 200, "Samba consulte sa propre demande");
    check(privateForCitizen.body.demande.statut === "NOUVELLE",
        "La demande démarre au statut NOUVELLE");

    const citizenInbox = await api(
        `/api/secretariat/demandes?organisationId=${orgId}&unitId=${secretariatUnitId}&tenant=${TENANT}`,
        {},
        cookies.citizen
    );
    expectStatus(citizenInbox, 403, "Le citoyen ne peut pas accéder à l'inbox du secrétariat");

    // Secretariat receives and routes the request.
    const secretariatInbox = await api(
        `/api/secretariat/demandes?organisationId=${orgId}&unitId=${secretariatUnitId}&tenant=${TENANT}`,
        {},
        cookies.secretariat
    );
    expectStatus(secretariatInbox, 200, "Le secrétariat ouvre sa boîte de réception");
    check(secretariatInbox.body.demandes.some(item => Number(item.id) === demandId),
        "La demande de Samba apparaît dans l'inbox du secrétariat");

    const route = await api(
        `/api/organisations/${orgId}/units/${secretariatUnitId}/cases/${demandId}/route`,
        {
            method: "POST",
            body: JSON.stringify({
                tenantCode: TENANT,
                destinationUnitId: serviceUnitId,
                motif: "Orientation vers le service consulaire — test automatisé"
            })
        },
        cookies.secretariat
    );
    expectStatus(route, 200, "Le secrétariat oriente la demande vers le service consulaire");
    check(route.body.statut === "DOSSIER_ORIENTE"
        && Number(route.body.demande.destination_unit_id) === serviceUnitId,
        "La destination est enregistrée correctement");

    // Agent receives, takes and responds.
    const agentInbox = await api(
        `/api/agent/demandes?organisationId=${orgId}&unitId=${serviceUnitId}&tenant=${TENANT}`,
        {},
        cookies.agent
    );
    expectStatus(agentInbox, 200, "L'agent ouvre l'inbox du service consulaire");
    check(agentInbox.body.demandes.some(item => Number(item.id) === demandId),
        "La demande orientée apparaît dans l'inbox de l'agent");

    const secretariatCannotTake = await api(
        `/api/organisations/${orgId}/units/${serviceUnitId}/cases/${demandId}/take`,
        { method: "POST", body: JSON.stringify({ tenantCode: TENANT }) },
        cookies.secretariat
    );
    expectStatus(secretariatCannotTake, 403,
        "Le secrétariat ne peut pas prendre en charge un dossier du service sans permission");

    const take = await api(
        `/api/organisations/${orgId}/units/${serviceUnitId}/cases/${demandId}/take`,
        { method: "POST", body: JSON.stringify({ tenantCode: TENANT }) },
        cookies.agent
    );
    expectStatus(take, 200, "L'agent prend en charge le dossier");
    check(take.body.statut === "DOSSIER_PRISE_EN_CHARGE"
        && take.body.demande.statut === "EN_COURS",
        "Le statut passe à EN_COURS");

    const respond = await api(
        `/api/organisations/${orgId}/units/${serviceUnitId}/cases/${demandId}/respond`,
        {
            method: "POST",
            body: JSON.stringify({
                tenantCode: TENANT,
                contenu: "Réponse officielle synthétique — test SATEER " + RUN_ID
            })
        },
        cookies.agent
    );
    expectStatus(respond, 200, "L'agent envoie une réponse au citoyen");
    check(respond.body.statut === "REPONSE_ENVOYEE",
        "La réponse est confirmée par l'API");

    // Citizen sees the response and history; another actor cannot see citizen detail.
    const citizenDetail = await api(
        `/api/demandes/${demandId}?organisationId=${orgId}&tenant=${TENANT}`,
        {},
        cookies.citizen
    );
    expectStatus(citizenDetail, 200, "Samba retrouve sa demande après traitement");
    check(citizenDetail.body.demande.statut === "TRAITEE",
        "Le dossier est clôturé au statut TRAITEE");
    check(citizenDetail.body.reponses.length === 1
        && citizenDetail.body.reponses[0].contenu.includes(RUN_ID),
        "Samba reçoit la réponse visible dans son espace");
    check(citizenDetail.body.historique.some(item => item.nouveau_statut === "NOUVELLE")
        && citizenDetail.body.historique.some(item => item.nouveau_statut === "EN_COURS")
        && citizenDetail.body.historique.some(item => item.nouveau_statut === "TRAITEE"),
        "L'historique conserve les trois étapes du traitement");

    const agentCannotReadCitizenDetail = await api(
        `/api/demandes/${demandId}?organisationId=${orgId}&tenant=${TENANT}`,
        {},
        cookies.agent
    );
    expectStatus(agentCannotReadCitizenDetail, 404,
        "Un autre acteur ne peut pas lire le détail privé du citoyen");

    // Operational and strategic views are distinct and permission-scoped.
    const operational = await api(
        `/api/organisations/${orgId}/dashboard-operationnel?tenant=${TENANT}`,
        {},
        cookies.viceConsul
    );
    expectStatus(operational, 200, "Le Vice-Consul ouvre le dashboard opérationnel");
    check(Number(operational.body.demandes.total) >= 1,
        "Le dashboard opérationnel agrège la demande traitée");

    const viceCannotOpenStrategic = await api(
        `/api/organisations/${orgId}/dashboard-strategique?tenant=${TENANT}`,
        {},
        cookies.viceConsul
    );
    expectStatus(viceCannotOpenStrategic, 403,
        "Le Vice-Consul ne reçoit pas automatiquement le dashboard stratégique");

    const agentCannotOpenOperational = await api(
        `/api/organisations/${orgId}/dashboard-operationnel?tenant=${TENANT}`,
        {},
        cookies.agent
    );
    expectStatus(agentCannotOpenOperational, 403,
        "L'agent ne peut pas consulter le dashboard opérationnel");

    const strategic = await api(
        `/api/organisations/${orgId}/dashboard-strategique?tenant=${TENANT}`,
        {},
        cookies.consul
    );
    expectStatus(strategic, 200, "Le Consul ouvre le dashboard stratégique");
    check(Number(strategic.body.indicateurs.total) >= 1
        && Number(strategic.body.indicateurs.traitees) >= 1,
        "Le dashboard stratégique reflète les résultats du circuit métier");

    const consulCannotOpenOperational = await api(
        `/api/organisations/${orgId}/dashboard-operationnel?tenant=${TENANT}`,
        {},
        cookies.consul
    );
    expectStatus(consulCannotOpenOperational, 403,
        "Le Consul ne reçoit pas automatiquement le dashboard opérationnel");

    console.log("\nRésultat : circuit citoyen → secrétariat → unité → agent → réponse → dashboards validé.");
}

main()
    .catch(error => {
        console.error("\nECHEC - " + (error.stack || error.message));
        process.exitCode = 1;
    })
    .finally(async () => {
        try { await cleanup(); }
        catch (error) {
            console.error("ATTENTION - Nettoyage final impossible : " + error.message);
            process.exitCode = 1;
        }
        await fermerDatabase();
    });
