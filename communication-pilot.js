"use strict";

// SATEER Core pilot: publish to an authorised organisation channel.
// Distribution here is IN-APP only, not SMTP/IMAP/push, and is limited to
// identified organisation members or members of a validated partner association.
const { executerRequete } = require("./database");

const TYPES_AUDIENCE = new Set(["TOUS", "PROFIL", "DEPARTEMENT", "ASSOCIATION"]);
const PRIORITES = new Set(["NORMALE", "IMPORTANTE", "URGENTE"]);

function champTexte(input, max) {
    return typeof input === "string" ? input.trim().slice(0, max + 1) : "";
}

async function publierDansCanalInstitutionnel({
    organisationId, tenantId, personneId, titre, contenu,
    categorie = "INFORMATION", priorite = "NORMALE",
    audienceType = "TOUS", audienceValeur = null
}) {
    const heading = champTexte(titre, 255);
    const body = champTexte(contenu, 20000);
    const category = champTexte(categorie, 100).toUpperCase();
    const priority = champTexte(priorite, 100).toUpperCase();
    const audience = champTexte(audienceType, 100).toUpperCase();
    const value = audienceValeur == null ? null : champTexte(String(audienceValeur), 255);

    if (!heading || heading.length > 255 || !body || body.length > 20000
        || !category || category.length > 100 || !PRIORITES.has(priority)
        || !TYPES_AUDIENCE.has(audience)
        || (audience !== "TOUS" && !value)
        || (audience === "TOUS" && value)) {
        return {succes:false,code:"PUBLICATION_INVALIDE"};
    }

    const validOrg = await executerRequete(
        "SELECT id FROM organisations WHERE id = $1 AND tenant_id = $2",
        [organisationId, tenantId]
    );
    if (!validOrg.rows.length) return {succes:false,code:"ORGANISATION_INTROUVABLE"};

    let associationId = null;
    if (audience === "ASSOCIATION") {
        associationId = Number(value);
        if (!Number.isSafeInteger(associationId) || associationId <= 0) {
            return {succes:false,code:"ASSOCIATION_INVALIDE"};
        }
        const relation = await executerRequete(
            `SELECT 1
             FROM organisation_relationships rel
             INNER JOIN organisations assoc ON assoc.id = $3 AND assoc.tenant_id = $2
             WHERE rel.tenant_id = $2 AND rel.actif = TRUE AND rel.statut = 'ACTIVE'
               AND ((rel.source_organisation_id = $1 AND rel.target_organisation_id = $3)
                 OR (rel.target_organisation_id = $1 AND rel.source_organisation_id = $3))
             LIMIT 1`,
            [organisationId, tenantId, associationId]
        );
        if (!relation.rows.length) {
            return {succes:false,code:"ASSOCIATION_NON_CONNECTEE"};
        }
    }

    const publication = (await executerRequete(
        `INSERT INTO publications (
            tenant_id, organisation_id, publie_par, titre, contenu,
            categorie, priorite, audience_type, audience_valeur,
            statut, statut_diffusion_diaspora
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'PUBLIEE','NON_DEMANDEE')
        RETURNING id,organisation_id,titre,contenu,categorie,priorite,
          audience_type,audience_valeur,statut,date_publication`,
        [tenantId,organisationId,personneId,heading,body,category,priority,audience,
            value]
    )).rows[0];

    // Every recipient is calculated from verified relationships and profile data.
    // The DISTINCT removes duplicates without exposing individual recipients.
    const delivered = await executerRequete(
        `INSERT INTO notifications (
            tenant_id,personne_id,organisation_id,type,titre,message,
            reference_type,reference_id,canal,statut,metadata
        )
        SELECT DISTINCT pub.tenant_id,member.personne_id,pub.organisation_id,
            'PUBLICATION',pub.titre,LEFT(pub.contenu,2000),'PUBLICATION',pub.id,
            'SATEER','NON_LUE',
            jsonb_build_object('audience_type',pub.audience_type)
        FROM publications pub
        INNER JOIN relations_personne_organisation member
          ON member.organisation_id =
             CASE WHEN pub.audience_type = 'ASSOCIATION' THEN $2 ELSE pub.organisation_id END
        INNER JOIN personnes person ON person.id = member.personne_id
        WHERE pub.id = $1
          AND (
            pub.audience_type IN ('TOUS','ASSOCIATION')
            OR (pub.audience_type = 'PROFIL' AND person.profil = pub.audience_valeur)
            OR (pub.audience_type = 'DEPARTEMENT' AND person.departement = pub.audience_valeur)
          )
        RETURNING id`,
        [publication.id, associationId]
    );

    return {succes:true,publication,notificationsCreees:delivered.rowCount};
}

module.exports = {publierDansCanalInstitutionnel, TYPES_AUDIENCE};
