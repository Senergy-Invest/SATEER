"use strict";

// P3.3.1 : contrat métier isolé. Non monté dans server.js pour l'instant.
// L'appelant doit fournir une requête SQL et une fonction d'autorisation réelle.
// Aucune autorisation par défaut. Les opérations refusent tout contexte non fiable.

class AccesExperienceRefuse extends Error {
    constructor() {
        super("Accès non autorisé aux activations institutionnelles.");
        this.name = "AccesExperienceRefuse";
        this.code = "EXPERIENCE_ACCES_REFUSE";
    }
}

class CibleExperienceIntrouvable extends Error {
    constructor() {
        super("Organisation ou expérience introuvable dans ce tenant.");
        this.name = "CibleExperienceIntrouvable";
        this.code = "EXPERIENCE_CIBLE_INTROUVABLE";
    }
}

function entierPositif(value, name) {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new TypeError(`${name} doit être un entier positif.`);
    }
    return value;
}

function codeValide(value) {
    if (typeof value !== "string" || !/^[A-Z][A-Z0-9_]{1,99}$/.test(value)) {
        throw new TypeError("codeExperience invalide (format CODE_MAJUSCULE). ");
    }
    return value;
}

function creerRegistreExperiencesOrganisation({ requete, autoriser } = {}) {
    if (typeof requete !== "function") throw new TypeError("requete est obligatoire.");

    async function verifierAcces({ acteur, tenantId, organisationId, action }) {
        if (!acteur || !Number.isSafeInteger(acteur.personneId) || acteur.personneId <= 0) {
            throw new AccesExperienceRefuse();
        }
        if (typeof autoriser !== "function") throw new AccesExperienceRefuse();
        const ok = await autoriser({ acteur, tenantId, organisationId, action });
        if (ok !== true) throw new AccesExperienceRefuse();
    }

    async function estActive({ acteur, tenantId, organisationId, codeExperience }) {
        entierPositif(tenantId, "tenantId");
        entierPositif(organisationId, "organisationId");
        codeValide(codeExperience);
        await verifierAcces({ acteur, tenantId, organisationId, action: "VIEW_ORGANISATION_EXPERIENCES" });
        const resultat = await requete(`
            SELECT EXISTS (
                SELECT 1
                FROM organisation_experience_activations a
                INNER JOIN organisations o
                  ON o.id = a.organisation_id AND o.tenant_id = a.tenant_id
                INNER JOIN tenants t
                  ON t.id = a.tenant_id AND t.actif = TRUE
                INNER JOIN experiences e
                  ON e.id = a.experience_id AND e.actif = TRUE
                WHERE a.tenant_id = $1
                  AND a.organisation_id = $2
                  AND e.code = $3
                  AND a.statut = 'ACTIVE'
            ) AS active
        `, [tenantId, organisationId, codeExperience]);
        return resultat.rows[0]?.active === true;
    }

    async function lister({ acteur, tenantId, organisationId }) {
        entierPositif(tenantId, "tenantId");
        entierPositif(organisationId, "organisationId");
        await verifierAcces({ acteur, tenantId, organisationId, action: "VIEW_ORGANISATION_EXPERIENCES" });
        const resultat = await requete(`
            SELECT e.id, e.code, e.nom, e.type, e.ordre,
                   COALESCE(a.statut, 'INACTIVE') AS statut
            FROM organisations o
            INNER JOIN tenants t ON t.id = o.tenant_id AND t.actif = TRUE
            CROSS JOIN experiences e
            LEFT JOIN organisation_experience_activations a
              ON a.tenant_id = o.tenant_id
             AND a.organisation_id = o.id
             AND a.experience_id = e.id
            WHERE o.id = $1 AND o.tenant_id = $2 AND e.actif = TRUE
            ORDER BY e.ordre, e.nom
        `, [organisationId, tenantId]);
        return resultat.rows;
    }

    async function definirStatut({ acteur, tenantId, organisationId, codeExperience, statut }) {
        entierPositif(tenantId, "tenantId");
        entierPositif(organisationId, "organisationId");
        codeValide(codeExperience);
        if (statut !== "ACTIVE" && statut !== "INACTIVE") {
            throw new TypeError("statut invalide.");
        }
        await verifierAcces({ acteur, tenantId, organisationId, action: "MANAGE_ORGANISATION_EXPERIENCES" });
        const resultat = await requete(`
            INSERT INTO organisation_experience_activations
                (tenant_id, organisation_id, experience_id,
                 statut, date_activation, date_desactivation, modifie_par_personne_id)
            SELECT $1, o.id, e.id, $4::text,
                   CASE WHEN $4::text = 'ACTIVE' THEN CURRENT_TIMESTAMP ELSE NULL END,
                   CASE WHEN $4::text = 'INACTIVE' THEN CURRENT_TIMESTAMP ELSE NULL END,
                   $5
            FROM organisations o
            INNER JOIN tenants t ON t.id = o.tenant_id AND t.actif = TRUE
            CROSS JOIN experiences e
            WHERE o.id = $2 AND o.tenant_id = $1
              AND e.code = $3 AND e.actif = TRUE
            ON CONFLICT (tenant_id, organisation_id, experience_id)
            DO UPDATE SET
                statut = EXCLUDED.statut,
                date_activation = CASE
                    WHEN EXCLUDED.statut = 'ACTIVE'
                    THEN CURRENT_TIMESTAMP
                    ELSE organisation_experience_activations.date_activation END,
                date_desactivation = CASE
                    WHEN EXCLUDED.statut = 'INACTIVE'
                    THEN CURRENT_TIMESTAMP ELSE NULL END,
                date_modification = CURRENT_TIMESTAMP,
                modifie_par_personne_id = EXCLUDED.modifie_par_personne_id
            RETURNING id, tenant_id, organisation_id, experience_id, statut
        `, [tenantId, organisationId, codeExperience, statut, acteur.personneId]);
        if (resultat.rows.length !== 1) throw new CibleExperienceIntrouvable();
        return resultat.rows[0];
    }

    return Object.freeze({ estActive, lister, definirStatut });
}

module.exports = {
    creerRegistreExperiencesOrganisation,
    AccesExperienceRefuse,
    CibleExperienceIntrouvable
};
