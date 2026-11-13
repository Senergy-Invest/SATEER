"use strict";

/**
 * P3.3.4A : controle INTERNE de disponibilite institutionnelle.
 *
 * Ce service ne calcule AUCUNE permission utilisateur. Les trois identifiants
 * viennent obligatoirement du contexte autorise/resolu par le serveur, jamais
 * directement de req.query ou req.body. Il n'est expose par aucune route HTTP.
 *
 * Une activation institutionnelle n'accorde aucun droit de lire un dossier,
 * une piece jointe, un courriel ou une publication.
 */
const CODE_EXPERIENCE = /^[A-Z][A-Z0-9_]{1,99}$/;

const SQL_DISPONIBILITE = `
    SELECT EXISTS (
        SELECT 1
        FROM organisation_experience_activations a
        INNER JOIN organisations o
          ON o.id = a.organisation_id
         AND o.tenant_id = a.tenant_id
        INNER JOIN tenants t
          ON t.id = a.tenant_id
         AND t.actif = TRUE
        INNER JOIN experiences e
          ON e.id = a.experience_id
         AND e.actif = TRUE
        WHERE a.tenant_id = $1
          AND a.organisation_id = $2
          AND e.code = $3
          AND a.statut = 'ACTIVE'
    ) AS disponible
`;

function entierPositifStrict(value, nom) {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
        throw new TypeError(`${nom} doit etre un entier strictement positif, resolu par le serveur.`);
    }
}

function creerDisponibiliteExperienceOrganisation({ requete } = {}) {
    if (typeof requete !== "function") {
        throw new TypeError("La fonction de requete SQL parametree est obligatoire.");
    }

    async function estDisponible({ tenantId, organisationId, codeExperience } = {}) {
        entierPositifStrict(tenantId, "tenantId");
        entierPositifStrict(organisationId, "organisationId");
        if (typeof codeExperience !== "string" || !CODE_EXPERIENCE.test(codeExperience)) {
            throw new TypeError("codeExperience invalide.");
        }
        const resultat = await requete(SQL_DISPONIBILITE, [tenantId, organisationId, codeExperience]);
        const valeur = resultat?.rows?.[0]?.disponible;
        if (typeof valeur !== "boolean") {
            throw new Error("Resultat de disponibilite invalide : refus de supposer une activation.");
        }
        return valeur;
    }

    return Object.freeze({ estDisponible });
}

module.exports = { creerDisponibiliteExperienceOrganisation };
