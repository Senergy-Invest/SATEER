// =========================================================
// SATEER CORE
// AUTHENTIFICATION - ACCES POSTGRESQL
// =========================================================
//
// Gestion generique :
// - creation de compte
// - verification des identifiants
// - verrouillage temporaire apres echecs
// - creation de session
// - verification de session
// - revocation de session
//
// Aucun role institutionnel n'est code en dur.
//
// IMPORTANT :
// La creation des comptes ne doit pas etre exposee
// dans une route HTTP publique.
// =========================================================

const {
    randomBytes,
    createHash
} = require("node:crypto");

const {
    executerRequete
} = require("./database");

const {
    hacherMotDePasse,
    verifierMotDePasse
} = require("./auth-passwords");


// =========================================================
// CONSTANTES
// =========================================================

const DUREE_SESSION_HEURES = 8;

const MAX_TENTATIVES = 5;

const DUREE_VERROUILLAGE_MINUTES = 15;

let empreinteFictive = null;


// =========================================================
// OUTILS
// =========================================================

function normaliserIdentifiant(valeur) {

    if (typeof valeur !== "string") {
        return null;
    }

    const identifiant =
        valeur.trim().toLowerCase();

    if (
        !/^[a-z0-9][a-z0-9._@+-]{2,189}$/.test(
            identifiant
        )
    ) {
        return null;
    }

    return identifiant;
}


function creerEmpreinteJeton(jeton) {

    if (
        typeof jeton !== "string"
        || !/^[A-Za-z0-9_-]{43}$/.test(jeton)
    ) {
        return null;
    }

    return createHash("sha256")
        .update(jeton)
        .digest("hex");
}


// Verifier un mot de passe fictif pour eviter
// un traitement trop different lorsqu'un compte
// est inexistant.

async function verifierCompteInexistant(
    motDePasse
) {

    if (!empreinteFictive) {

        empreinteFictive =
            await hacherMotDePasse(
                "SateerCompteFictifVerification2026!"
            );
    }

    await verifierMotDePasse(
        motDePasse,
        empreinteFictive
    );
}


// =========================================================
// CREER UN COMPTE
// =========================================================

async function creerCompteAuthentificationDatabase(
    personneId,
    identifiant,
    motDePasse
) {

    const personne = Number(personneId);

    const identifiantNormalise =
        normaliserIdentifiant(identifiant);

    if (
        !Number.isInteger(personne)
        || personne <= 0
        || !identifiantNormalise
    ) {

        return {
            succes: false,
            code: "DONNEES_COMPTE_INVALIDES"
        };
    }


    const empreinte =
        await hacherMotDePasse(motDePasse);


    try {

        const resultat =
            await executerRequete(
                `
                INSERT INTO auth_accounts (
                    personne_id,
                    identifiant,
                    mot_de_passe_hash,
                    actif
                )

                SELECT
                    p.id,
                    $2,
                    $3,
                    TRUE

                FROM personnes p

                WHERE p.id = $1

                RETURNING
                    id,
                    personne_id,
                    identifiant,
                    actif,
                    date_creation
                `,
                [
                    personne,
                    identifiantNormalise,
                    empreinte
                ]
            );


        if (resultat.rows.length === 0) {

            return {
                succes: false,
                code: "PERSONNE_INTROUVABLE"
            };
        }


        return {
            succes: true,
            compte: resultat.rows[0]
        };

    } catch (erreur) {

        if (erreur.code === "23505") {

            return {
                succes: false,
                code: "COMPTE_DEJA_EXISTANT"
            };
        }

        throw erreur;
    }
}


// =========================================================
// AUTHENTIFIER UN COMPTE
// =========================================================

async function authentifierCompteDatabase(
    identifiant,
    motDePasse
) {

    const identifiantNormalise =
        normaliserIdentifiant(identifiant);

    if (
        !identifiantNormalise
        || typeof motDePasse !== "string"
        || Buffer.byteLength(motDePasse) > 256
    ) {

        return {
            succes: false,
            code: "IDENTIFIANTS_INVALIDES"
        };
    }


    const resultat =
        await executerRequete(
            `
            SELECT
                id,
                personne_id,
                mot_de_passe_hash,
                actif,
                tentatives_echouees,
                verrouille_jusqua

            FROM auth_accounts

            WHERE LOWER(identifiant) = $1

            LIMIT 1
            `,
            [
                identifiantNormalise
            ]
        );


    if (resultat.rows.length === 0) {

        await verifierCompteInexistant(
            motDePasse
        );

        return {
            succes: false,
            code: "IDENTIFIANTS_INVALIDES"
        };
    }


    const compte = resultat.rows[0];


    if (!compte.actif) {

        return {
            succes: false,
            code: "IDENTIFIANTS_INVALIDES"
        };
    }


    if (
        compte.verrouille_jusqua
        && new Date(
            compte.verrouille_jusqua
        ) > new Date()
    ) {

        return {
            succes: false,
            code: "IDENTIFIANTS_INVALIDES"
        };
    }


    const motDePasseValide =
        await verifierMotDePasse(
            motDePasse,
            compte.mot_de_passe_hash
        );


    // -----------------------------------------------------
    // ECHEC : COMPTEUR ET VERROUILLAGE
    // -----------------------------------------------------

    if (!motDePasseValide) {

        await executerRequete(
            `
            UPDATE auth_accounts

            SET
                tentatives_echouees =
                    CASE
                        WHEN verrouille_jusqua
                             <= CURRENT_TIMESTAMP
                        THEN 1

                        ELSE tentatives_echouees + 1
                    END,

                verrouille_jusqua =
                    CASE
                        WHEN (
                            CASE
                                WHEN verrouille_jusqua
                                     <= CURRENT_TIMESTAMP
                                THEN 1

                                ELSE tentatives_echouees + 1
                            END
                        ) >= $2

                        THEN CURRENT_TIMESTAMP
                             + ($3 * INTERVAL '1 minute')

                        ELSE NULL
                    END,

                date_modification =
                    CURRENT_TIMESTAMP

            WHERE id = $1
            `,
            [
                compte.id,
                MAX_TENTATIVES,
                DUREE_VERROUILLAGE_MINUTES
            ]
        );


        return {
            succes: false,
            code: "IDENTIFIANTS_INVALIDES"
        };
    }


    // -----------------------------------------------------
    // SUCCES : REMISE A ZERO DES ECHECS
    // -----------------------------------------------------

    const compteValide =
        await executerRequete(
            `
            UPDATE auth_accounts

            SET
                tentatives_echouees = 0,
                verrouille_jusqua = NULL,
                derniere_connexion = CURRENT_TIMESTAMP,
                date_modification = CURRENT_TIMESTAMP

            WHERE
                id = $1
                AND actif = TRUE

            RETURNING
                id,
                personne_id
            `,
            [
                compte.id
            ]
        );


    if (compteValide.rows.length === 0) {

        return {
            succes: false,
            code: "IDENTIFIANTS_INVALIDES"
        };
    }


    // -----------------------------------------------------
    // CREATION D'UN JETON ALEATOIRE
    // -----------------------------------------------------

    const jeton =
        randomBytes(32).toString("base64url");

    const empreinteJeton =
        creerEmpreinteJeton(jeton);


    // On stocke uniquement l'empreinte du jeton.
    // Le jeton original n'est jamais stocke en base.

    const session =
        await executerRequete(
            `
            INSERT INTO auth_sessions (
                compte_id,
                empreinte_jeton,
                date_expiration
            )

            VALUES (
                $1,
                $2,
                CURRENT_TIMESTAMP
                    + ($3 * INTERVAL '1 hour')
            )

            RETURNING
                id,
                date_expiration
            `,
            [
                compte.id,
                empreinteJeton,
                DUREE_SESSION_HEURES
            ]
        );


    return {
        succes: true,

        code: "AUTHENTIFICATION_REUSSIE",

        personneId:
            compte.personne_id,

        jeton,

        sessionId:
            session.rows[0].id,

        dateExpiration:
            session.rows[0].date_expiration
    };
}


// =========================================================
// VERIFIER UNE SESSION
// =========================================================

async function verifierSessionDatabase(jeton) {

    const empreinte =
        creerEmpreinteJeton(jeton);


    if (!empreinte) {

        return {
            succes: false,
            code: "SESSION_INVALIDE"
        };
    }


    const resultat =
        await executerRequete(
            `
            SELECT
                s.id AS session_id,
                s.date_expiration,

                a.id AS compte_id,
                a.personne_id,
                a.identifiant,

                p.prenom,
                p.nom

            FROM auth_sessions s

            INNER JOIN auth_accounts a
                ON a.id = s.compte_id

            INNER JOIN personnes p
                ON p.id = a.personne_id

            WHERE
                s.empreinte_jeton = $1

                AND s.date_revocation IS NULL

                AND s.date_expiration >
                    CURRENT_TIMESTAMP

                AND a.actif = TRUE

            LIMIT 1
            `,
            [
                empreinte
            ]
        );


    if (resultat.rows.length === 0) {

        return {
            succes: false,
            code: "SESSION_INVALIDE"
        };
    }


    const session = resultat.rows[0];


    await executerRequete(
        `
        UPDATE auth_sessions

        SET date_derniere_utilisation =
            CURRENT_TIMESTAMP

        WHERE id = $1
        `,
        [
            session.session_id
        ]
    );


    return {
        succes: true,
        sessionId: session.session_id,
        compteId: session.compte_id,
        personneId: session.personne_id,
        identifiant: session.identifiant,
        prenom: session.prenom,
        nom: session.nom,
        dateExpiration: session.date_expiration
    };
}


// =========================================================
// REVOQUER UNE SESSION
// =========================================================

async function revoquerSessionDatabase(jeton) {

    const empreinte =
        creerEmpreinteJeton(jeton);


    if (!empreinte) {

        return {
            succes: false,
            code: "SESSION_INVALIDE"
        };
    }


    const resultat =
        await executerRequete(
            `
            UPDATE auth_sessions

            SET date_revocation =
                CURRENT_TIMESTAMP

            WHERE
                empreinte_jeton = $1
                AND date_revocation IS NULL

            RETURNING id
            `,
            [
                empreinte
            ]
        );


    if (resultat.rows.length === 0) {

        return {
            succes: false,
            code: "SESSION_INVALIDE"
        };
    }


    return {
        succes: true,
        code: "SESSION_REVOQUEE"
    };
}


// =========================================================
// EXPORTS
// =========================================================

module.exports = {
    creerCompteAuthentificationDatabase,
    authentifierCompteDatabase,
    verifierSessionDatabase,
    revoquerSessionDatabase
};