"use strict";

const {
    executerTransactionDatabase,
    executerRequete,
    definirTenantContexteDatabaseCourant,
    obtenirContexteDatabaseCourant
} = require("./database");

const CODE_ROLLBACK_HTTP = "SATEER_HTTP_RESPONSE_ROLLBACK";
const CODE_CLIENT_DECONNECTE = "SATEER_HTTP_CLIENT_DISCONNECTED";

function premiereValeur(...valeurs) {
    return valeurs.find(valeur =>
        valeur !== undefined && valeur !== null && valeur !== ""
    );
}

function lireIdPositif(valeur) {
    if (valeur === undefined || valeur === null || valeur === "") {
        return null;
    }

    const id = Number(valeur);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function extraireSelecteursRequete(req) {
    const tenantBrut = premiereValeur(
        req.query?.tenant,
        req.query?.tenantCode,
        req.body?.tenantCode,
        req.body?.tenant,
        req.params?.tenantCode
    );

    const tenantCode = typeof tenantBrut === "string"
        ? tenantBrut.trim()
        : null;

    const organisationBrute = premiereValeur(
        req.params?.organisationId,
        req.query?.organisationId,
        req.query?.organisation,
        req.body?.organisationId,
        req.body?.organisation
    );

    const demandeBrute = premiereValeur(
        req.params?.demandeId,
        req.query?.demandeId,
        req.body?.demandeId
    );

    return {
        tenantCode: tenantCode && tenantCode.length <= 50
            ? tenantCode
            : null,
        organisationId: lireIdPositif(organisationBrute),
        demandeId: lireIdPositif(demandeBrute)
    };
}


// Cette resolution n'accorde aucun droit par elle-meme.
// Elle choisit le tenant seulement si la personne authentifiee
// possede deja un rattachement verifiable dans ce tenant.
async function resoudreTenantIdPourContexteAuthentifie(personneId, selecteurs = {}) {
    const personne = lireIdPositif(personneId);
    if (!personne) {
        throw new TypeError("PERSONNE_CONTEXTE_DATABASE_INVALIDE");
    }

    const tenantCode = typeof selecteurs.tenantCode === "string"
        && selecteurs.tenantCode.trim()
        ? selecteurs.tenantCode.trim()
        : null;
    const organisationId = lireIdPositif(selecteurs.organisationId);
    const demandeId = lireIdPositif(selecteurs.demandeId);

    if (tenantCode && tenantCode.length > 50) {
        return null;
    }

    if (organisationId !== null) {
        const resultat = await executerRequete(
            `
            SELECT o.tenant_id
            FROM organisations o
            INNER JOIN tenants t
                ON t.id = o.tenant_id
            WHERE
                o.id = $2
                AND t.actif = TRUE
                AND ($3::VARCHAR IS NULL OR t.code = $3)
                AND EXISTS (
                    SELECT 1
                    FROM relations_personne_organisation r
                    WHERE r.personne_id = $1
                      AND r.organisation_id = o.id
                )
                AND (
                    $4::INTEGER IS NULL
                    OR EXISTS (
                        SELECT 1
                        FROM demandes d
                        WHERE d.id = $4
                          AND d.organisation_id = o.id
                    )
                )
            LIMIT 1
            `,
            [personne, organisationId, tenantCode, demandeId]
        );

        return resultat.rows.length
            ? Number(resultat.rows[0].tenant_id)
            : null;
    }

    if (demandeId !== null) {
        const resultat = await executerRequete(
            `
            SELECT o.tenant_id
            FROM demandes d
            INNER JOIN organisations o
                ON o.id = d.organisation_id
            INNER JOIN tenants t
                ON t.id = o.tenant_id
            WHERE
                d.id = $2
                AND t.actif = TRUE
                AND ($3::VARCHAR IS NULL OR t.code = $3)
                AND (
                    d.personne_id = $1
                    OR EXISTS (
                        SELECT 1
                        FROM relations_personne_organisation r
                        WHERE r.personne_id = $1
                          AND r.organisation_id = o.id
                    )
                )
            LIMIT 1
            `,
            [personne, demandeId, tenantCode]
        );

        return resultat.rows.length
            ? Number(resultat.rows[0].tenant_id)
            : null;
    }

    if (tenantCode) {
        const resultat = await executerRequete(
            `
            SELECT t.id AS tenant_id
            FROM tenants t
            WHERE
                t.code = $1
                AND t.actif = TRUE
                AND EXISTS (
                    SELECT 1
                    FROM organisations o
                    INNER JOIN relations_personne_organisation r
                        ON r.organisation_id = o.id
                    WHERE o.tenant_id = t.id
                      AND r.personne_id = $2
                )
            LIMIT 1
            `,
            [tenantCode, personne]
        );

        return resultat.rows.length
            ? Number(resultat.rows[0].tenant_id)
            : null;
    }

    return null;
}


// Ouvre une transaction pour toute la requête authentifiee.
// res.end est intercepte pour que COMMIT/ROLLBACK ait lieu
// avant l'envoi final de la reponse HTTP.
async function executerRequeteAuthentifieeDansTransaction({
    personneId,
    req,
    res,
    next
}) {
    const personne = lireIdPositif(personneId);
    if (!personne || !req || !res || typeof next !== "function") {
        throw new TypeError("PARAMETRES_TRANSACTION_HTTP_INVALIDES");
    }

    const endOriginal = res.end;
    let finReponseDemandee = false;
    let argumentsFinReponse = null;
    let clientDeconnecte = false;
    let transactionFinalisee = false;
    let resoudreFinReponse;
    let rejeterFinReponse;

    const finReponse = new Promise((resolve, reject) => {
        resoudreFinReponse = resolve;
        rejeterFinReponse = reject;
    });
    finReponse.catch(() => {});

    const surFermeture = () => {
        if (transactionFinalisee) return;
        clientDeconnecte = true;

        if (!finReponseDemandee) {
            const erreur = new Error("CLIENT_HTTP_DECONNECTE");
            erreur.code = CODE_CLIENT_DECONNECTE;
            rejeterFinReponse(erreur);
        }
    };

    res.once("close", surFermeture);
    res.end = function (...argumentsFin) {
        if (!finReponseDemandee) {
            finReponseDemandee = true;
            argumentsFinReponse = argumentsFin;
            resoudreFinReponse();
        }
        return res;
    };

    let rollbackReponse = false;
    let erreurTransaction = null;

    try {
        await executerTransactionDatabase(
            { type: "USER", personneId: personne },
            async () => {
                const selecteurs = extraireSelecteursRequete(req);
                const tenantId = await resoudreTenantIdPourContexteAuthentifie(
                    personne,
                    selecteurs
                );

                await definirTenantContexteDatabaseCourant(tenantId);
                req.databaseContext = obtenirContexteDatabaseCourant();

                next();
                await finReponse;

                if (clientDeconnecte) {
                    const erreur = new Error("CLIENT_HTTP_DECONNECTE");
                    erreur.code = CODE_CLIENT_DECONNECTE;
                    throw erreur;
                }

                if (res.statusCode >= 400) {
                    const erreur = new Error("REPONSE_HTTP_NON_COMMITTABLE");
                    erreur.code = CODE_ROLLBACK_HTTP;
                    throw erreur;
                }
            }
        );
    } catch (erreur) {
        if (erreur.code === CODE_ROLLBACK_HTTP) {
            rollbackReponse = true;
        } else if (erreur.code !== CODE_CLIENT_DECONNECTE) {
            erreurTransaction = erreur;
        }
    } finally {
        transactionFinalisee = true;
        res.end = endOriginal;
        res.removeListener("close", surFermeture);
    }

    if (clientDeconnecte || res.destroyed) {
        return;
    }

    if (erreurTransaction) {
        console.error("Erreur transaction HTTP SATEER :", erreurTransaction);

        if (!res.headersSent) {
            res.statusCode = 500;
            res.removeHeader("Content-Length");
            res.removeHeader("ETag");
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            endOriginal.call(
                res,
                JSON.stringify({ statut: "ERREUR_TRANSACTION_DATABASE" })
            );
        } else {
            res.destroy(erreurTransaction);
        }
        return;
    }

    if (rollbackReponse || finReponseDemandee) {
        endOriginal.apply(res, argumentsFinReponse || []);
    }
}

module.exports = {
    extraireSelecteursRequete,
    resoudreTenantIdPourContexteAuthentifie,
    executerRequeteAuthentifieeDansTransaction
};
