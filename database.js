const { AsyncLocalStorage } = require("node:async_hooks");
const { Pool } = require("pg");

// La base par defaut reste "sateer" pour preserver le comportement existant.
// Les tests et environnements distincts peuvent choisir leur cible via PG*.
const pool = new Pool({
    user: process.env.PGUSER || process.env.USER,
    host: process.env.PGHOST || "localhost",
    database: process.env.PGDATABASE || "sateer",
    port: Number(process.env.PGPORT || 5432),
    ...(process.env.PGPASSWORD
        ? { password: process.env.PGPASSWORD }
        : {})
});

// Le contexte suit uniquement la chaine asynchrone de la transaction.
// Il n'est jamais stocke dans une variable globale partagee entre requetes.
const contexteDatabaseAsync = new AsyncLocalStorage();

function entierPositifOuNull(valeur, nom) {
    if (valeur === undefined || valeur === null || valeur === "") {
        return null;
    }

    const nombre = Number(valeur);
    if (!Number.isSafeInteger(nombre) || nombre <= 0) {
        throw new TypeError("CONTEXTE_DATABASE_" + nom.toUpperCase() + "_INVALIDE");
    }

    return nombre;
}

function normaliserContexteDatabase(contexte = {}) {
    if (!contexte || typeof contexte !== "object" || Array.isArray(contexte)) {
        throw new TypeError("CONTEXTE_DATABASE_INVALIDE");
    }

    const type = contexte.type || "USER";
    if (!["USER", "SYSTEM"].includes(type)) {
        throw new TypeError("TYPE_CONTEXTE_DATABASE_INVALIDE");
    }

    const tenantId = entierPositifOuNull(contexte.tenantId, "tenant_id");
    const personneId = entierPositifOuNull(contexte.personneId, "personne_id");

    let service = null;
    if (type === "USER" && !personneId) {
        throw new TypeError("CONTEXTE_DATABASE_PERSONNE_REQUISE");
    }

    if (type === "SYSTEM") {
        service = typeof contexte.service === "string"
            ? contexte.service.trim()
            : "";
        if (!service || service.length > 100) {
            throw new TypeError("CONTEXTE_DATABASE_SERVICE_REQUIS");
        }
        if (personneId) {
            throw new TypeError("CONTEXTE_DATABASE_SYSTEME_SANS_PERSONNE");
        }
    }

    const requestId = typeof contexte.requestId === "string"
        ? contexte.requestId.trim().slice(0, 128)
        : "";

    return Object.freeze({
        type,
        tenantId,
        personneId,
        service,
        requestId
    });
}


// =========================================================
// REQUETES — CONTEXTE TRANSACTIONNEL AUTOMATIQUE
// =========================================================

async function executerRequete(texte, valeurs = []) {
    const contexteActif = contexteDatabaseAsync.getStore();

    if (contexteActif) {
        if (!contexteActif.actif) {
            throw new Error("CONTEXTE_DATABASE_TRANSACTION_TERMINE");
        }

        // Toutes les fonctions metier existantes qui utilisent
        // executerRequete() reutilisent le meme client dans la transaction.
        return contexteActif.client.query(texte, valeurs);
    }

    // Compatibilite : hors transaction, comportement historique conserve.
    return pool.query(texte, valeurs);
}


// =========================================================
// TRANSACTION AVEC CONTEXTE LOCAL POSTGRESQL
// =========================================================

async function executerTransactionDatabase(contexte, callback) {
    if (typeof callback !== "function") {
        throw new TypeError("CALLBACK_TRANSACTION_DATABASE_REQUISE");
    }

    if (contexteDatabaseAsync.getStore()?.actif) {
        throw new Error("TRANSACTION_DATABASE_IMBRIQUEE_INTERDITE");
    }

    const contexte = normaliserContexteDatabase(contexte);
    const client = await pool.connect();
    let transactionOuverte = false;
    let contexteActif = null;

    try {
        await client.query("BEGIN");
        transactionOuverte = true;

        // set_config(..., true) equivaut a un SET LOCAL :
        // les valeurs disparaissent au COMMIT/ROLLBACK et ne fuient
        // jamais vers la requete suivante reutilisant cette connexion.
        await client.query(
            `
            SELECT
                set_config('sateer.context_type', $1, TRUE),
                set_config('sateer.tenant_id', $2, TRUE),
                set_config('sateer.personne_id', $3, TRUE),
                set_config('sateer.service', $4, TRUE),
                set_config('sateer.request_id', $5, TRUE)
            `,
            [
                contexte.type,
                contexte.tenantId === null ? "" : String(contexte.tenantId),
                contexte.personneId === null ? "" : String(contexte.personneId),
                contexte.service || "",
                contexte.requestId
            ]
        );

        contexteActif = {
            client,
            contexte,
            actif: true
        };

        const resultat = await contexteDatabaseAsync.run(
            contexteActif,
            () => callback(client, contexte)
        );

        await client.query("COMMIT");
        transactionOuverte = false;

        return resultat;
    } catch (erreur) {
        if (transactionOuverte) {
            await client.query("ROLLBACK").catch(erreurRollback => {
                console.error(
                    "Erreur rollback transaction SATEER :",
                    erreurRollback
                );
            });
        }
        throw erreur;
    } finally {
        if (contexteActif) {
            contexteActif.actif = false;
        }
        client.release();
    }
}


// =========================================================
// CONTEXTE COURANT — OBSERVABILITE / TESTS
// =========================================================

function obtenirContexteDatabaseCourant() {
    const actif = contexteDatabaseAsync.getStore();
    if (!actif || !actif.actif) {
        return null;
    }

    return { ...actif.contexte };
}


// =========================================================
// CLIENT TRANSACTIONNEL BAS NIVEAU — COMPATIBILITE
// =========================================================

async function obtenirClientDatabase() {
    return pool.connect();
}


async function fermerDatabase() {
    await pool.end();
}


module.exports = {
    executerRequete,
    executerTransactionDatabase,
    obtenirContexteDatabaseCourant,
    obtenirClientDatabase,
    fermerDatabase
};
