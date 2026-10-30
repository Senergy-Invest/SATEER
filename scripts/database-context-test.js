"use strict";

// Vérifie le contexte PostgreSQL transactionnel sur une base jetable.
// Ce script refuse toute base autre que sateer_test.
process.env.PGDATABASE = "sateer_test";
process.env.PGHOST = process.env.PGHOST || "localhost";
process.env.PGPORT = process.env.PGPORT || "5432";
process.env.PGUSER = process.env.PGUSER || process.env.USER;

const {
    executerRequete,
    executerTransactionDatabase,
    obtenirContexteDatabaseCourant,
    fermerDatabase
} = require("../database");

function check(condition, message) {
    if (!condition) throw new Error("ECHEC - " + message);
    console.log("PASS " + message);
}

function attendre(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function verifierContexteAttendu(tenantId, personneId, backendPid) {
    const resultat = await executerRequete(
        `
        SELECT
            current_database() AS database_name,
            current_setting('sateer.context_type', TRUE) AS context_type,
            current_setting('sateer.tenant_id', TRUE) AS tenant_id,
            current_setting('sateer.personne_id', TRUE) AS personne_id,
            pg_backend_pid() AS backend_pid
        `
    );

    const ligne = resultat.rows[0];
    check(ligne.database_name === "sateer_test",
        "Toutes les opérations visent exclusivement sateer_test");
    check(ligne.context_type === "USER",
        "Le type de contexte utilisateur est défini transactionnellement");
    check(ligne.tenant_id === String(tenantId),
        "Le tenant courant reste celui de la transaction");
    check(ligne.personne_id === String(personneId),
        "La personne courante reste celle de la transaction");
    if (backendPid !== undefined) {
        check(Number(ligne.backend_pid) === backendPid,
            "executerRequete réutilise la connexion PostgreSQL épinglée");
    }

    return Number(ligne.backend_pid);
}

async function testerConcurrenceSansFuite() {
    const contextes = [
        { type: "USER", tenantId: 1101, personneId: 2101 },
        { type: "USER", tenantId: 1102, personneId: 2102 }
    ];

    const backendPids = await Promise.all(contextes.map(async contexte => {
        return executerTransactionDatabase(contexte, async () => {
            const pid = await verifierContexteAttendu(
                contexte.tenantId,
                contexte.personneId
            );

            await attendre(40);

            await verifierContexteAttendu(
                contexte.tenantId,
                contexte.personneId,
                pid
            );

            const contexteApplicatif = obtenirContexteDatabaseCourant();
            check(
                contexteApplicatif.tenantId === contexte.tenantId
                    && contexteApplicatif.personneId === contexte.personneId,
                "AsyncLocalStorage conserve le contexte applicatif de la bonne requête"
            );

            return pid;
        });
    }));

    check(backendPids[0] !== backendPids[1],
        "Deux transactions concurrentes utilisent deux connexions distinctes");

    check(obtenirContexteDatabaseCourant() === null,
        "Le contexte applicatif est absent après la fin des transactions");

    const horsTransaction = await executerRequete(
        `
        SELECT
            current_setting('sateer.tenant_id', TRUE) AS tenant_id,
            current_setting('sateer.personne_id', TRUE) AS personne_id
        `
    );
    const ligne = horsTransaction.rows[0];

    check(
        !["1101", "1102"].includes(ligne.tenant_id)
            && !["2101", "2102"].includes(ligne.personne_id),
        "Aucun contexte tenant/personne ne fuit après COMMIT"
    );
}

async function testerRollbackEtErreurs() {
    let erreurAttendue = false;

    try {
        await executerTransactionDatabase(
            { type: "USER", tenantId: 1201, personneId: 2201 },
            async () => {
                await verifierContexteAttendu(1201, 2201);
                throw new Error("ERREUR_TEST_ROLLBACK");
            }
        );
    } catch (erreur) {
        erreurAttendue = erreur.message === "ERREUR_TEST_ROLLBACK";
    }

    check(erreurAttendue,
        "Une erreur applicative déclenche le rollback et remonte au demandeur");
    check(obtenirContexteDatabaseCourant() === null,
        "Le contexte est nettoyé après un rollback");

    let transactionImbriqueeRefusee = false;
    await executerTransactionDatabase(
        { type: "USER", tenantId: 1301, personneId: 2301 },
        async () => {
            try {
                await executerTransactionDatabase(
                    { type: "USER", tenantId: 1302, personneId: 2302 },
                    async () => {}
                );
            } catch (erreur) {
                transactionImbriqueeRefusee =
                    erreur.message === "TRANSACTION_DATABASE_IMBRIQUEE_INTERDITE";
            }
        }
    );

    check(transactionImbriqueeRefusee,
        "Une transaction imbriquée susceptible de changer le contexte est refusée");
}

async function testerValidationContexte() {
    let personneObligatoire = false;
    try {
        await executerTransactionDatabase(
            { type: "USER", tenantId: 1401 },
            async () => {}
        );
    } catch (erreur) {
        personneObligatoire =
            erreur.message === "CONTEXTE_DATABASE_PERSONNE_REQUISE";
    }

    check(personneObligatoire,
        "Un contexte utilisateur sans personne authentifiée est refusé");

    let serviceObligatoire = false;
    try {
        await executerTransactionDatabase(
            { type: "SYSTEM" },
            async () => {}
        );
    } catch (erreur) {
        serviceObligatoire =
            erreur.message === "CONTEXTE_DATABASE_SERVICE_REQUIS";
    }

    check(serviceObligatoire,
        "Un contexte système sans identité de service explicite est refusé");
}

async function main() {
    const identity = await executerRequete(
        "SELECT current_database() AS name"
    );
    check(identity.rows[0].name === "sateer_test",
        "La cible PostgreSQL est exclusivement sateer_test");

    await testerValidationContexte();
    await testerConcurrenceSansFuite();
    await testerRollbackEtErreurs();

    console.log("\nSUCCES - contexte transactionnel PostgreSQL et isolation asynchrone vérifiés.");
}

main()
    .catch(erreur => {
        console.error("\nECHEC - " + (erreur.stack || erreur.message));
        process.exitCode = 1;
    })
    .finally(async () => {
        await fermerDatabase();
    });
