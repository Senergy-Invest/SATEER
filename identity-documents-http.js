"use strict";
/** SATEER Lot 1S - références déclaratives chiffrées, titulaire uniquement.
 * Pilote sateer_test : aucun scan, aucun numéro en réponse, aucune vérification officielle.
 */
const express = require("express");
const { executerRequete } = require("./database");
const { exigerSession } = require("./auth-http");
const { chargerCle, chiffrerNumero, dechiffrerNumero } = require("./identity-documents-crypto");
const router = express.Router();
const TYPES = new Set(["CNI", "PASSEPORT"]);

router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store, private");
    res.set("Pragma", "no-cache");
    res.set("X-Content-Type-Options", "nosniff");
    if (process.env.PGDATABASE !== "sateer_test") {
        return res.status(503).json({ statut: "LOT_PILOTE_DESACTIVE" });
    }
    next();
});
router.use(exigerSession);
function origineAutorisee(req, res, next) {
    const origine = process.env.SATEER_PUBLIC_ORIGIN || "http://localhost:3000";
    if (req.get("Origin") !== origine ||
        !/^application\/json(?:\s*;|$)/i.test(req.get("Content-Type") || "")) {
        return res.status(403).json({ statut: "ORIGINE_OU_FORMAT_NON_AUTORISE" });
    }
    next();
}
function typeCorrect(t) { return TYPES.has(t); }
function dateOptionnelle(s) {
    if (s === "" || s === null) return null;
    if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) throw Error("DATE_DOCUMENT_INVALIDE");
    const [an, mois, jour] = s.split("-").map(Number);
    if (an < 1900 || an > 2100) throw Error("DATE_DOCUMENT_INVALIDE");
    const d = new Date(Date.UTC(an, mois - 1, jour));
    if (d.toISOString().slice(0, 10) !== s) throw Error("DATE_DOCUMENT_INVALIDE");
    return s;
}
function obtenirNumero(s) {
    if (typeof s !== "string" || s.length > 64) throw Error("NUMERO_DOCUMENT_INVALIDE");
    const n = s.trim().toUpperCase().replace(/[ -]/g, "");
    if (!/^[A-Z0-9]{5,32}$/.test(n)) throw Error("NUMERO_DOCUMENT_INVALIDE");
    return n;
}
function formatDate(d) {
    return d instanceof Date ? d.toISOString().slice(0, 10) :
        typeof d === "string" ? d.slice(0, 10) : null;
}
function afficherDocument(ligne, personneId, cle) {
    const numero = dechiffrerNumero(ligne.numero_chiffre, personneId, ligne.type_document, cle);
    const expiration = formatDate(ligne.date_expiration);
    const aujourdHui = new Date().toISOString().slice(0, 10);
    return {
        type: ligne.type_document,
        statut: "DECLARE_NON_VERIFIE",
        numeroMasque: "•••• " + numero.slice(-4),
        paysEmetteur: ligne.pays_emetteur || null,
        dateDelivrance: formatDate(ligne.date_delivrance),
        dateExpiration: expiration,
        validite: expiration && expiration < aujourdHui ? "EXPIRE" : "NON_CONTROLEE",
        dateModification: ligne.date_modification || null
    };
}
async function lister(personneId, cle) {
    const r = await executerRequete(`
        SELECT type_document, numero_chiffre, pays_emetteur,
               date_delivrance, date_expiration, date_modification
        FROM citizen_identity_documents
        WHERE personne_id = $1 ORDER BY type_document
    `, [personneId]);
    return r.rows.map(ligne => afficherDocument(ligne, personneId, cle));
}
router.get("/", async (req, res) => {
    try {
        const cle = chargerCle();
        return res.json({ statut: "DOCUMENTS_CHARGES", verification: "NON_VERIFIEE",
            documents: await lister(req.auth.personneId, cle) });
    } catch (_) {
        return res.status(503).json({ statut: "DOCUMENTS_INDISPONIBLES" });
    }
});
router.put("/:type", origineAutorisee, async (req, res) => {
    const type = req.params.type;
    if (!typeCorrect(type)) return res.status(400).json({ statut: "TYPE_DOCUMENT_INVALIDE" });
    const body = req.body;
    const keys = ["numero", "paysEmetteur", "dateDelivrance", "dateExpiration"];
    if (!body || typeof body !== "object" || Array.isArray(body) ||
        Object.keys(body).length !== keys.length || !keys.every(k => Object.hasOwn(body, k))) {
        return res.status(400).json({ statut: "CHAMPS_DOCUMENT_INVALIDES" });
    }
    try {
        const numero = obtenirNumero(body.numero);
        const pays = body.paysEmetteur === "" || body.paysEmetteur === null ? null : body.paysEmetteur;
        if (pays !== null && (typeof pays !== "string" || !/^[A-Z]{2}$/.test(pays))) {
            throw Error("PAYS_EMETTEUR_INVALIDE");
        }
        const delivrance = dateOptionnelle(body.dateDelivrance);
        const expiration = dateOptionnelle(body.dateExpiration);
        const aujourdhui = new Date().toISOString().slice(0, 10);
        const anMax = String(new Date().getUTCFullYear() + 30) + "-12-31";
        if ((delivrance && delivrance > aujourdhui) || (expiration && expiration > anMax) ||
            (delivrance && expiration && delivrance > expiration)) {
            throw Error("DATE_DOCUMENT_INVALIDE");
        }
        const cle = chargerCle();
        const chiffre = chiffrerNumero(numero, req.auth.personneId, type, cle);
        await executerRequete(`
            INSERT INTO citizen_identity_documents
               (personne_id, type_document, numero_chiffre, pays_emetteur, date_delivrance, date_expiration)
            VALUES ($1,$2,$3,$4,$5,$6)
            ON CONFLICT (personne_id, type_document) DO UPDATE SET
               numero_chiffre = EXCLUDED.numero_chiffre,
               pays_emetteur = EXCLUDED.pays_emetteur,
               date_delivrance = EXCLUDED.date_delivrance,
               date_expiration = EXCLUDED.date_expiration,
               date_modification = NOW()
        `, [req.auth.personneId, type, chiffre, pays, delivrance, expiration]);
        // Jamais de numéro en réponse, même si le citoyen l'a envoyé.
        return res.json({ statut: "DOCUMENT_DECLARE", document: {
            type, statut: "DECLARE_NON_VERIFIE", numeroMasque: "•••• " + numero.slice(-4),
            paysEmetteur: pays, dateDelivrance: delivrance, dateExpiration: expiration
        }});
    } catch (e) {
        if (["NUMERO_DOCUMENT_INVALIDE", "PAYS_EMETTEUR_INVALIDE", "DATE_DOCUMENT_INVALIDE"].includes(e.message)) {
            return res.status(400).json({ statut: e.message });
        }
        return res.status(503).json({ statut: "ENREGISTREMENT_DOCUMENT_INDISPONIBLE" });
    }
});
router.delete("/:type", origineAutorisee, async (req, res) => {
    if (!typeCorrect(req.params.type)) return res.status(400).json({ statut: "TYPE_DOCUMENT_INVALIDE" });
    try {
        await executerRequete(`
            DELETE FROM citizen_identity_documents WHERE personne_id = $1 AND type_document = $2
        `, [req.auth.personneId, req.params.type]);
        return res.json({ statut: "REFERENCE_SUPPRIMEE" });
    } catch (_) {
        return res.status(503).json({ statut: "SUPPRESSION_DOCUMENT_INDISPONIBLE" });
    }
});
module.exports = { identityDocumentsRouter: router };
