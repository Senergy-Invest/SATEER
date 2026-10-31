// =========================================================
// SATEER CORE - AUTHENTIFICATION HTTP
// =========================================================
//
// Routes :
// POST /login
// GET  /me
// POST /logout
//
// Le navigateur reçoit un cookie de session HttpOnly.
// Aucun jeton n'est transmis dans le JSON.
//
// =========================================================

const express = require("express");

const {
    authentifierCompteDatabase,
    verifierSessionDatabase,
    revoquerSessionDatabase
} = require("./auth-database");

const {
    executerRequeteAuthentifieeDansTransaction
} = require("./database-request-context");

const authRouter = express.Router();

const COOKIE_NAME = "sateer_session";

const PRODUCTION =
    process.env.NODE_ENV === "production";

const ORIGINE_AUTORISEE =
    process.env.SATEER_PUBLIC_ORIGIN
    || "http://localhost:3000";

const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: PRODUCTION,
    sameSite: "strict",
    path: "/api"
};


// =========================================================
// OUTILS
// =========================================================

function lireJetonCookie(req) {

    const cookies =
        (req.headers.cookie || "").split(";");

    for (const cookie of cookies) {

        const position = cookie.indexOf("=");

        if (position === -1) {
            continue;
        }

        const nom =
            cookie.slice(0, position).trim();

        if (nom === COOKIE_NAME) {

            return cookie
                .slice(position + 1)
                .trim();
        }
    }

    return null;
}


function verifierOrigine(req, res, next) {

    const origine = req.get("origin");

    // Les clients de test en ligne de commande
    // n'envoient pas toujours d'en-tete Origin.

    if (
        origine
        && origine !== ORIGINE_AUTORISEE
    ) {

        return res.status(403).json({
            statut: "ORIGINE_NON_AUTORISEE"
        });
    }

    next();
}


// =========================================================
// LIMITATION SIMPLE DES CONNEXIONS
// =========================================================
//
// Protection du pilote local.
// Pour la production, prevoir une limitation partagee
// entre instances et adaptee au proxy utilise.
// =========================================================

const tentativesParAdresse = new Map();

const FENETRE_MS = 15 * 60 * 1000;
const MAX_REQUETES = 10;

function limiterConnexions(req, res, next) {

    const cle = req.ip || "inconnue";
    const maintenant = Date.now();

    let entree = tentativesParAdresse.get(cle);

    if (
        !entree
        || maintenant >= entree.expiration
    ) {

        entree = {
            nombre: 0,
            expiration: maintenant + FENETRE_MS
        };

        tentativesParAdresse.set(cle, entree);
    }

    if (entree.nombre >= MAX_REQUETES) {

        return res.status(429).json({
            statut: "TROP_DE_TENTATIVES"
        });
    }

    entree.nombre += 1;

    next();
}


// =========================================================
// MIDDLEWARE - SESSION OBLIGATOIRE
// =========================================================

async function exigerSession(req, res, next) {

    try {

        const jeton = lireJetonCookie(req);

        if (!jeton) {

            return res.status(401).json({
                statut: "AUTHENTIFICATION_REQUISE"
            });
        }

        const session =
            await verifierSessionDatabase(jeton);

        if (!session.succes) {

            res.clearCookie(
                COOKIE_NAME,
                COOKIE_OPTIONS
            );

            return res.status(401).json({
                statut: "SESSION_INVALIDE"
            });
        }

        // L'identite vient de la session verifiee
        // dans PostgreSQL, jamais du body HTTP.

        req.auth = {
            compteId: session.compteId,
            sessionId: session.sessionId,
            personneId: session.personneId,
            identifiant: session.identifiant,
            prenom: session.prenom,
            nom: session.nom
        };

        await executerRequeteAuthentifieeDansTransaction({
            personneId: req.auth.personneId,
            req,
            res,
            next
        });

    } catch (erreur) {

        console.error(
            "Erreur verification session :",
            erreur
        );

        return res.status(500).json({
            statut: "ERREUR_AUTHENTIFICATION"
        });
    }
}


// =========================================================
// NE PAS METTRE EN CACHE LES REPONSES AUTH
// =========================================================

authRouter.use((req, res, next) => {

    res.set("Cache-Control", "no-store");

    next();
});


// =========================================================
// CONNEXION
// =========================================================

authRouter.post(
    "/login",
    verifierOrigine,
    limiterConnexions,
    async (req, res) => {

        try {

            const {
                identifiant,
                motDePasse
            } = req.body || {};

            if (
                typeof identifiant !== "string"
                || typeof motDePasse !== "string"
                || identifiant.length > 190
                || motDePasse.length > 256
            ) {

                return res.status(400).json({
                    statut: "DONNEES_CONNEXION_INVALIDES"
                });
            }

            const resultat =
                await authentifierCompteDatabase(
                    identifiant,
                    motDePasse
                );

            if (!resultat.succes) {

                return res.status(401).json({
                    statut: "IDENTIFIANTS_INVALIDES"
                });
            }

            res.cookie(
                COOKIE_NAME,
                resultat.jeton,
                {
                    ...COOKIE_OPTIONS,
                    maxAge: 8 * 60 * 60 * 1000
                }
            );

            return res.json({
                statut: "AUTHENTIFICATION_REUSSIE",
                personneId: resultat.personneId,
                dateExpiration:
                    resultat.dateExpiration
            });

        } catch (erreur) {

            console.error(
                "Erreur connexion SATEER :",
                erreur
            );

            return res.status(500).json({
                statut: "ERREUR_CONNEXION"
            });
        }
    }
);


// =========================================================
// IDENTITE CONNECTEE
// =========================================================

authRouter.get(
    "/me",
    exigerSession,
    (req, res) => {

        return res.json({
            statut: "SESSION_AUTHENTIFIEE",
            personne: {
                id: req.auth.personneId,
                prenom: req.auth.prenom,
                nom: req.auth.nom
            },
            identifiant: req.auth.identifiant
        });
    }
);


// =========================================================
// DECONNEXION
// =========================================================

authRouter.post(
    "/logout",
    verifierOrigine,
    async (req, res) => {

        try {

            const jeton = lireJetonCookie(req);

            if (jeton) {

                await revoquerSessionDatabase(
                    jeton
                );
            }

            res.clearCookie(
                COOKIE_NAME,
                COOKIE_OPTIONS
            );

            return res.json({
                statut: "DECONNECTE"
            });

        } catch (erreur) {

            console.error(
                "Erreur deconnexion SATEER :",
                erreur
            );

            return res.status(500).json({
                statut: "ERREUR_DECONNEXION"
            });
        }
    }
);


// =========================================================
// EXPORTS
// =========================================================

module.exports = {
    authRouter,
    exigerSession
};