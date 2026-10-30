"use strict";

// Integration smoke test: this script MUST only write to sateer_test.
process.env.PGDATABASE = "sateer_test";
process.env.PGHOST = process.env.PGHOST || "localhost";
process.env.PGPORT = process.env.PGPORT || "5432";
process.env.PGUSER = process.env.PGUSER || process.env.USER;

const { spawn } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const { setTimeout: delay } = require("node:timers/promises");
const { executerRequete, fermerDatabase } = require("../database");
const { creerCompteAuthentificationDatabase } = require("../auth-database");

const PORT = Number(process.env.SATEER_TEST_PORT || 3187);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const IDENTIFIANT = `integration.${process.pid}.${Date.now()}@sateer.test`;
const MOT_DE_PASSE = randomBytes(24).toString("base64url") + "Aa1!";
let serveur = null;
let compteCree = false;

function verifier(condition, message) {
    if (!condition) throw new Error(message);
    console.log("OK - " + message);
}

async function requete(path, options = {}) {
    return fetch(BASE_URL + path, {
        ...options,
        headers: {
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...(options.headers || {})
        }
    });
}

async function attendreServeur() {
    for (let i = 0; i < 40; i += 1) {
        if (serveur && serveur.exitCode !== null) {
            throw new Error("Le serveur SATEER s'est arrêté avant de répondre.");
        }
        try {
            const response = await fetch(BASE_URL + "/api/auth/me");
            if (response.status === 401) return;
            if (response.status >= 500) {
                throw new Error("Le serveur répond HTTP " + response.status);
            }
        } catch (error) {
            if (error.message.startsWith("Le serveur répond")) throw error;
        }
        await delay(250);
    }
    throw new Error("Délai dépassé au démarrage du serveur.");
}

async function main() {
    const cible = await executerRequete("SELECT current_database() AS nom");
    verifier(cible.rows[0].nom === "sateer_test",
        "La cible PostgreSQL est exclusivement sateer_test");

    // Choisir un acteur réel du pilote : rattachement actif à une
    // organisation SN et rôle organisationnel donnant VIEW_ORGANISATION.
    const personne = await executerRequete(`
        SELECT DISTINCT p.id AS personne_id, o.id AS organisation_id
        FROM personnes p
        INNER JOIN relations_personne_organisation rpo
            ON rpo.personne_id = p.id
        INNER JOIN organisations o
            ON o.id = rpo.organisation_id
        INNER JOIN tenants t
            ON t.id = o.tenant_id
        INNER JOIN relations_personne_organisation_roles rel
            ON rel.personne_id = p.id
            AND rel.organisation_id = o.id
            AND rel.actif = TRUE
        INNER JOIN organisation_roles r
            ON r.id = rel.role_id
            AND r.organisation_id = o.id
            AND r.actif = TRUE
        INNER JOIN role_permissions rp
            ON rp.role_id = r.id
            AND rp.actif = TRUE
        INNER JOIN permissions perm
            ON perm.id = rp.permission_id
            AND perm.actif = TRUE
            AND perm.code = 'VIEW_ORGANISATION'
        LEFT JOIN auth_accounts a
            ON a.personne_id = p.id
        WHERE t.code = 'SN'
            AND t.actif = TRUE
            AND a.id IS NULL
        ORDER BY p.id, o.id
        LIMIT 1
    `);
    verifier(personne.rows.length === 1,
        "Un acteur pilote sans compte, rattaché à une organisation SN et doté de VIEW_ORGANISATION est disponible");

    const personneId = personne.rows[0].personne_id;
    const organisationId = personne.rows[0].organisation_id;

    const creation = await creerCompteAuthentificationDatabase(
        personneId,
        IDENTIFIANT,
        MOT_DE_PASSE
    );
    verifier(creation.succes, "Création d'un compte technique temporaire");
    compteCree = true;

    serveur = spawn(process.execPath, ["server.js"], {
        cwd: process.cwd(),
        env: {
            ...process.env,
            PGDATABASE: "sateer_test",
            PGHOST: process.env.PGHOST || "localhost",
            PGPORT: process.env.PGPORT || "5432",
            PGUSER: process.env.PGUSER || process.env.USER,
            PORT: String(PORT),
            NODE_ENV: "test"
        },
        stdio: ["ignore", "pipe", "pipe"]
    });
    serveur.stdout.on("data", chunk => process.stdout.write("[SATEER] " + chunk));
    serveur.stderr.on("data", chunk => process.stderr.write("[SATEER] " + chunk));

    await attendreServeur();

    const sansSession = await requete("/api/context?tenant=SN");
    verifier(sansSession.status === 401,
        "Une route privée refuse un appel sans session (HTTP 401)");

    const connexion = await requete("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
            identifiant: IDENTIFIANT,
            motDePasse: MOT_DE_PASSE
        })
    });
    verifier(connexion.status === 200,
        "La connexion HTTP crée une session authentifiée");

    const cookies = typeof connexion.headers.getSetCookie === "function"
        ? connexion.headers.getSetCookie()
        : [connexion.headers.get("set-cookie") || ""];
    const cookie = cookies.map(value => value.split(";")[0])
        .find(value => value.startsWith("sateer_session="));
    verifier(Boolean(cookie), "Le serveur délivre un cookie de session");

    const me = await requete("/api/auth/me", {
        headers: { Cookie: cookie }
    });
    verifier(me.status === 200, "La session permet de récupérer l'identité connectée");

    const contexte = await requete("/api/context?tenant=SN", {
        headers: { Cookie: cookie }
    });
    verifier(contexte.status === 200,
        "Le contexte organisationnel est chargé depuis PostgreSQL");
    const contexteJson = await contexte.json();
    verifier(
        contexteJson.statut === "CONTEXTE_CHARGE"
        && contexteJson.organisations.some(org => Number(org.id) === Number(organisationId)),
        "Le contexte expose le rattachement réel de l'acteur au Consulat pilote");

    const catalogue = await requete("/api/permissions", {
        headers: { Cookie: cookie }
    });
    verifier(catalogue.status === 200,
        "Le catalogue des permissions est accessible après authentification");
    const catalogueJson = await catalogue.json();
    verifier(Array.isArray(catalogueJson.permissions) && catalogueJson.permissions.length > 0,
        "Le catalogue des permissions provient de PostgreSQL");

    const structure = await requete(
        `/api/organisations/${organisationId}/structure?tenant=SN`,
        { headers: { Cookie: cookie } }
    );
    verifier(structure.status === 200,
        "La permission VIEW_ORGANISATION autorise l'accès à la structure de l'organisation");

    const organisationHorsTenant = await executerRequete(`
        SELECT o.id
        FROM organisations o
        INNER JOIN tenants t ON t.id = o.tenant_id
        WHERE t.code <> 'SN' AND t.actif = TRUE
        ORDER BY o.id
        LIMIT 1
    `);
    if (organisationHorsTenant.rows.length > 0) {
        const refus = await requete(
            `/api/organisations/${organisationHorsTenant.rows[0].id}/structure?tenant=SN`,
            { headers: { Cookie: cookie } }
        );
        verifier(refus.status === 403,
            "Un utilisateur SN ne peut pas consulter une organisation d'un autre tenant");
    } else {
        console.log("INFO - Test inter-tenant ignoré : aucune organisation étrangère au tenant SN dans les données de test.");
    }

    const logout = await requete("/api/auth/logout", {
        method: "POST",
        headers: { Cookie: cookie }
    });
    verifier(logout.status === 200, "La déconnexion révoque la session");

    const apresLogout = await requete("/api/auth/me", {
        headers: { Cookie: cookie }
    });
    verifier(apresLogout.status === 401,
        "Une session révoquée ne permet plus d'accéder à l'identité");

    console.log("\nRésultat : tous les tests HTTP d'intégration sont réussis.");
}

main()
    .catch(error => {
        console.error("\nECHEC - " + (error.stack || error.message));
        process.exitCode = 1;
    })
    .finally(async () => {
        if (serveur && serveur.exitCode === null) {
            serveur.kill("SIGTERM");
            await Promise.race([
                new Promise(resolve => serveur.once("exit", resolve)),
                delay(3000)
            ]);
            if (serveur.exitCode === null) serveur.kill("SIGKILL");
        }

        if (compteCree) {
            try {
                await executerRequete(
                    "DELETE FROM auth_accounts WHERE LOWER(identifiant) = LOWER($1)",
                    [IDENTIFIANT]
                );
                console.log("Compte technique temporaire supprimé.");
            } catch (error) {
                console.error("ATTENTION - Nettoyage du compte temporaire impossible :", error.message);
                process.exitCode = 1;
            }
        }

        await fermerDatabase();
    });
