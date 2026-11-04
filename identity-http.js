"use strict";
/** Lot 1R - Mon identité dans SATEER Core.
 * Aucun nom, numéro de CNI/passeport ou justificatif n'est enregistré ici.
 * Chaque requête se borne à la personne de la SESSION (jamais de personneId client).
 */
const express = require("express");
const { executerRequete } = require("./database");
const { exigerSession } = require("./auth-http");
const router = express.Router();
router.use((_req, res, next) => { res.set("Cache-Control", "no-store, private"); next(); });
router.use(exigerSession);

function validerOrigine(req, res, next) {
    // Une modification via navigateur doit venir de l'origine autorisée.
    const attendue = process.env.SATEER_PUBLIC_ORIGIN || "http://localhost:3000";
    if (req.get("Origin") !== attendue || !/^application\/json(?:\s*;|$)/i.test(req.get("Content-Type") || "")) {
        return res.status(403).json({ statut: "ORIGINE_OU_FORMAT_NON_AUTORISE" });
    }
    next();
}
function texteOptionnel(valeur, maximum) {
    if (valeur === null || valeur === "") return null;
    if (typeof valeur !== "string" || valeur.length > maximum) throw Error("CHAMP_INVALIDE");
    const t = valeur.trim();
    if (!t || /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(t)) throw Error("CHAMP_INVALIDE");
    return t;
}
function dateOptionnelle(valeur) {
    if (valeur === null || valeur === "") return null;
    if (typeof valeur !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valeur)) throw Error("DATE_INVALIDE");
    const [y, m, d] = valeur.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    const now = new Date();
    if (date.toISOString().slice(0, 10) !== valeur || date > now || y < now.getUTCFullYear() - 130) {
        throw Error("DATE_INVALIDE");
    }
    return valeur;
}
async function obtenirIdentite(personneId) {
    const result = await executerRequete(`
        SELECT p.id, p.prenom, p.nom, p.pays_residence,
               to_char(c.date_naissance, 'YYYY-MM-DD') AS date_naissance,
               c.nationalite_declaree, c.adresse_residence_declaree,
               c.ville_residence_declaree, c.code_postal_residence_declare,
               c.date_modification
        FROM personnes p
        LEFT JOIN citizen_identity_profiles c ON c.personne_id = p.id
        WHERE p.id = $1 LIMIT 1
    `, [personneId]);
    if (!result.rows.length) return null;
    const p = result.rows[0];
    return {
        statut: "IDENTITE_CHARGEE",
        personne: { id: p.id, prenom: p.prenom, nom: p.nom, paysResidence: p.pays_residence },
        declaration: {
            dateNaissance: p.date_naissance || "",
            nationalite: p.nationalite_declaree || "",
            adresse: p.adresse_residence_declaree || "",
            ville: p.ville_residence_declaree || "",
            codePostal: p.code_postal_residence_declare || ""
        },
        verification: { statut: "NON_VERIFIEE", organisme: null },
        documents: [
            { type: "CNI", statut: "NON_RENSEIGNE" },
            { type: "PASSEPORT", statut: "NON_RENSEIGNE" }
        ],
        dateModification: p.date_modification || null
    };
}
router.get("/", async (req, res) => {
    try {
        const identite = await obtenirIdentite(req.auth.personneId);
        if (!identite) return res.status(404).json({ statut: "PERSONNE_INTROUVABLE" });
        return res.json(identite);
    } catch (_) {
        // Ne pas journaliser les données personnelles ni le corps HTTP.
        return res.status(500).json({ statut: "ERREUR_IDENTITE" });
    }
});
router.patch("/", validerOrigine, async (req, res) => {
    try {
        const body = req.body;
        const cles = ["dateNaissance", "nationalite", "adresse", "ville", "codePostal"];
        if (!body || typeof body !== "object" || Array.isArray(body) ||
            Object.keys(body).length !== cles.length || !cles.every(k => Object.hasOwn(body, k))) {
            return res.status(400).json({ statut: "CHAMPS_IDENTITE_INVALIDES" });
        }
        const date = dateOptionnelle(body.dateNaissance);
        const nationalite = texteOptionnel(body.nationalite, 100);
        const adresse = texteOptionnel(body.adresse, 250);
        const ville = texteOptionnel(body.ville, 120);
        const codePostal = texteOptionnel(body.codePostal, 20);
        // Une seule écriture atomique ; l'ID ne provient jamais du navigateur.
        await executerRequete(`
            INSERT INTO citizen_identity_profiles
                (personne_id, date_naissance, nationalite_declaree, adresse_residence_declaree,
                 ville_residence_declaree, code_postal_residence_declare)
            VALUES ($1,$2,$3,$4,$5,$6)
            ON CONFLICT (personne_id) DO UPDATE SET
                date_naissance = EXCLUDED.date_naissance,
                nationalite_declaree = EXCLUDED.nationalite_declaree,
                adresse_residence_declaree = EXCLUDED.adresse_residence_declaree,
                ville_residence_declaree = EXCLUDED.ville_residence_declaree,
                code_postal_residence_declare = EXCLUDED.code_postal_residence_declare,
                date_modification = NOW()
        `, [req.auth.personneId, date, nationalite, adresse, ville, codePostal]);
        const identite = await obtenirIdentite(req.auth.personneId);
        if (!identite) return res.status(404).json({ statut: "PERSONNE_INTROUVABLE" });
        return res.json({ ...identite, statut: "DECLARATION_ENREGISTREE" });
    } catch (e) {
        if (["CHAMP_INVALIDE", "DATE_INVALIDE"].includes(e.message)) {
            return res.status(400).json({ statut: e.message });
        }
        return res.status(500).json({ statut: "ERREUR_ENREGISTREMENT_IDENTITE" });
    }
});
module.exports = { identityRouter: router };
