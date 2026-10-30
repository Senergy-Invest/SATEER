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
let sequenceSavepoint = 0;

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

async function executerTransactionDatabase(contexteEntree, callback) {
    if (typeof callback !== "function") {
        throw new TypeError("CALLBACK_TRANSACTION_DATABASE_REQUISE");
    }

    if (contexteDatabaseAsync.getStore()?.actif) {
        throw new Error("TRANSACTION_DATABASE_IMBRIQUEE_INTERDITE");
    }

    const contexteNormalise = normaliserContexteDatabase(contexteEntree);
    const client = await pool.connect();
    let transactionOuverte = false;
    let contexteActif = null;
    let erreurRollback = null;

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
                contexteNormalise.type,
                contexteNormalise.tenantId === null ? "" : String(contexteNormalise.tenantId),
                contexteNormalise.personneId === null ? "" : String(contexteNormalise.personneId),
                contexteNormalise.service || "",
                contexteNormalise.requestId
            ]
        );

        contexteActif = {
            client,
            contexte: contexteNormalise,
            actif: true
        };

        const resultat = await contexteDatabaseAsync.run(
            contexteActif,
            () => callback(client, contexteNormalise)
        );

        await client.query("COMMIT");
        transactionOuverte = false;

        return resultat;
    } catch (erreur) {
        if (transactionOuverte) {
            await client.query("ROLLBACK").catch(erreurErreurRollback => {
                erreurRollback = erreurErreurRollback;
                console.error(
                    "Erreur rollback transaction SATEER :",
                    erreurErreurRollback
                );
            });
        }
        throw erreur;
    } finally {
        if (contexteActif) {
            contexteActif.actif = false;
        }
        // Un rollback impossible invalide la connexion au lieu de la remettre
        // dans le pool dans un etat transactionnel inconnu.
        client.release(erreurRollback || undefined);
    }
}


// Met a jour le tenant uniquement apres resolution et verification
// de l'appartenance dans la transaction courante.
async function definirTenantContexteDatabaseCourant(tenantId) {
    const actif = contexteDatabaseAsync.getStore();
    if (!actif || !actif.actif) {
        throw new Error("CONTEXTE_DATABASE_TRANSACTION_REQUIS");
    }

    const tenantNormalise = entierPositifOuNull(tenantId, "tenant_id");
    await actif.client.query(
        "SELECT set_config('sateer.tenant_id', $1, TRUE)",
        [tenantNormalise === null ? "" : String(tenantNormalise)]
    );

    actif.contexte = Object.freeze({
        ...actif.contexte,
        tenantId: tenantNormalise
    });

    return tenantNormalise;
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

// Les anciennes fonctions metier ouvrent parfois leur propre transaction
// avec obtenirClientDatabase(). Dans une requete deja transactionnelle,
// on leur fournit un client compatible qui traduit BEGIN/COMMIT/ROLLBACK
// en SAVEPOINT/RELEASE/ROLLBACK TO SAVEPOINT sur le client epingle.
async function obtenirClientDatabase() {
    const actif = contexteDatabaseAsync.getStore();

    if (!actif) {
        return pool.connect();
    }

    if (!actif.actif) {
        throw new Error("CONTEXTE_DATABASE_TRANSACTION_TERMINE");
    }

    const savepoint = "sateer_nested_" + (++sequenceSavepoint);
    await actif.client.query("SAVEPOINT " + savepoint);

    let etat = "ACTIVE";
    let beginRecu = false;

    return {
        async query(requete, valeurs = []) {
            if (etat !== "ACTIVE") {
                throw new Error("SAVEPOINT_DATABASE_TERMINE");
            }

            const texte = typeof requete === "string"
                ? requete
                : requete && typeof requete.text === "string"
                    ? requete.text
                    : "";
            const commande = texte.trim().replace(/;+$/, "").trim().toUpperCase();

            if (commande === "BEGIN" || commande === "BEGIN TRANSACTION") {
                if (beginRecu) {
                    throw new Error("SAVEPOINT_DATABASE_DEJA_DEMARRE");
                }
                beginRecu = true;
                return { command: "BEGIN", rowCount: 0, rows: [] };
            }

            if (
                commande === "COMMIT"
                || commande === "COMMIT TRANSACTION"
                || commande === "END"
            ) {
                const resultat = await actif.client.query(
                    "RELEASE SAVEPOINT " + savepoint
                );
                etat = "COMMITTED";
                return resultat;
            }

            if (commande === "ROLLBACK" || commande === "ROLLBACK TRANSACTION") {
                await actif.client.query(
                    "ROLLBACK TO SAVEPOINT " + savepoint
                );
                const resultat = await actif.client.query(
                    "RELEASE SAVEPOINT " + savepoint
                );
                etat = "ROLLED_BACK";
                return resultat;
            }

            return actif.client.query(requete, valeurs);
        },

        async release() {
            if (etat !== "ACTIVE") return;

            await actif.client.query(
                "ROLLBACK TO SAVEPOINT " + savepoint
            );
            await actif.client.query(
                "RELEASE SAVEPOINT " + savepoint
            );
            etat = "ROLLED_BACK";
        }
    };
}


async function fermerDatabase() {
    await pool.end();
}


module.exports = {
    executerRequete,
    executerTransactionDatabase,
    obtenirContexteDatabaseCourant,
    definirTenantContexteDatabaseCourant,
    obtenirClientDatabase,
    fermerDatabase
};
