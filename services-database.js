const {
    executerRequete
} = require("./database");


const permissionsParRole = {

    USAGER: [
        "CREER_DOSSIER",
        "VOIR_SES_DOSSIERS",
        "SOUMETTRE_DOSSIER"
    ],

    AGENT: [
        "VOIR_DOSSIERS_ORGANISATION",
        "TRAITER_DOSSIER",
        "PUBLIER_INFORMATION"
    ],

    RESPONSABLE: [
        "VOIR_DOSSIERS_ORGANISATION",
        "TRAITER_DOSSIER",
        "GERER_AGENTS",
        "PUBLIER_INFORMATION"
    ],

    AGENT_SATEER: [
        "GERER_DIFFUSION_DIASPORA"
    ]

};


async function trouverOrganisationParIdDatabase(
    organisationId
) {

    const resultat =
        await executerRequete(
            `
            SELECT
                id,
                nom,
                type,
                tenant_id,
                country_id,
                territory_id
            FROM organisations
            WHERE id = $1
            `,
            [
                organisationId
            ]
        );


    if (
        resultat.rows.length === 0
    ) {
        return undefined;
    }


    return resultat.rows[0];
}


async function trouverOrganisationParIdEtTenantDatabase(
    organisationId,
    tenantCode
) {

    const resultat =
        await executerRequete(
            `
            SELECT
                o.id,
                o.nom,
                o.type,
                o.tenant_id,
                o.country_id,
                o.territory_id,
                t.code AS tenant_code
            FROM organisations o
            INNER JOIN tenants t
                ON t.id = o.tenant_id
            WHERE
                o.id = $1
                AND t.code = $2
            `,
            [
                organisationId,
                tenantCode
            ]
        );


    if (
        resultat.rows.length === 0
    ) {
        return undefined;
    }


    return resultat.rows[0];
}


async function listerOrganisationsParTenantEtTypeDatabase(
    tenantCode,
    typeOrganisation
) {

    const resultat =
        await executerRequete(
            `
            SELECT
                o.id,
                o.nom,
                o.type,
                t.code AS tenant_code,
                c.code_iso2 AS country_code,
                tr.nom AS territoire
            FROM organisations o
            INNER JOIN tenants t
                ON t.id = o.tenant_id
            LEFT JOIN countries c
                ON c.id = o.country_id
            LEFT JOIN territories tr
                ON tr.id = o.territory_id
            WHERE
                t.code = $1
                AND o.type = $2
            ORDER BY o.nom
            `,
            [
                tenantCode,
                typeOrganisation
            ]
        );


    return resultat.rows;
}


async function listerPersonnesParOrganisationEtRelationDatabase(
    organisationId,
    tenantCode,
    typeRelation
) {

    const resultat =
        await executerRequete(
            `
            SELECT
                p.id,
                p.prenom,
                p.nom,
                p.pays_residence,
                p.departement,
                p.profil,
                r.type AS relation_type,
                o.id AS organisation_id,
                o.nom AS organisation_nom,
                t.code AS tenant_code
            FROM relations_personne_organisation r
            INNER JOIN personnes p
                ON p.id = r.personne_id
            INNER JOIN organisations o
                ON o.id = r.organisation_id
            INNER JOIN tenants t
                ON t.id = o.tenant_id
            WHERE
                o.id = $1
                AND t.code = $2
                AND r.type = $3
            ORDER BY
                p.nom,
                p.prenom
            `,
            [
                organisationId,
                tenantCode,
                typeRelation
            ]
        );


    return resultat.rows;
}


async function trouverRelationPersonneOrganisationDatabase(
    personneId,
    organisationId,
    tenantCode
) {

    const resultat =
        await executerRequete(
            `
            SELECT
                r.id,
                r.personne_id,
                r.organisation_id,
                r.type AS relation_type,
                t.code AS tenant_code
            FROM relations_personne_organisation r
            INNER JOIN organisations o
                ON o.id = r.organisation_id
            INNER JOIN tenants t
                ON t.id = o.tenant_id
            WHERE
                r.personne_id = $1
                AND r.organisation_id = $2
                AND t.code = $3
            LIMIT 1
            `,
            [
                personneId,
                organisationId,
                tenantCode
            ]
        );


    if (
        resultat.rows.length === 0
    ) {
        return undefined;
    }


    return resultat.rows[0];
}


async function aPermissionDatabase(
    personneId,
    organisationId,
    tenantCode,
    permission
) {

    const relation =
        await trouverRelationPersonneOrganisationDatabase(
            personneId,
            organisationId,
            tenantCode
        );


    if (
        relation === undefined
    ) {
        return false;
    }


    const permissions =
        permissionsParRole[
            relation.relation_type
        ];


    if (
        permissions === undefined
    ) {
        return false;
    }


    return permissions.includes(
        permission
    );
}
async function creerPublicationDatabase(
    tenantCode,
    organisationId,
    personneId,
    titre,
    contenu,
    audienceType,
    audienceValeur,
    categorie,
    priorite,
    medias = []
) {

    const resultatTenant =
        await executerRequete(
            `
            SELECT id
            FROM tenants
            WHERE code = $1
            `,
            [
                tenantCode
            ]
        );


    if (
        resultatTenant.rows.length === 0
    ) {
        return undefined;
    }


    const tenantId =
        resultatTenant.rows[0].id;


    const resultat =
        await executerRequete(
            `
            INSERT INTO publications (
                tenant_id,
                organisation_id,
                publie_par,
                titre,
                contenu,
                categorie,
                priorite,
                audience_type,
                audience_valeur,
                medias,
                statut,
                statut_diffusion_diaspora
            )
            VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7,
                $8,
                $9,
                $10::jsonb,
                'PUBLIEE',
                'NON_DEMANDEE'
            )
            RETURNING
                id,
                tenant_id,
                organisation_id,
                publie_par,
                titre,
                contenu,
                categorie,
                priorite,
                audience_type,
                audience_valeur,
                medias,
                statut,
                statut_diffusion_diaspora,
                date_publication
            `,
            [
                tenantId,
                organisationId,
                personneId,
                titre,
                contenu,
                categorie,
                priorite,
                audienceType,
                audienceValeur,
                JSON.stringify(
                    medias || []
                )
            ]
        );


    return resultat.rows[0];
}
async function listerPublicationsParOrganisationEtTenantDatabase(
    organisationId,
    tenantCode
) {

    const resultat =
        await executerRequete(
            `
            SELECT
                p.id,
                p.tenant_id,
                p.organisation_id,
                p.publie_par,
                p.titre,
                p.contenu,
                p.categorie,
                p.priorite,
                p.audience_type,
                p.audience_valeur,
                p.medias,
                p.statut,
                p.statut_diffusion_diaspora,
                p.date_publication,

                o.nom AS organisation_nom,

                t.code AS tenant_code

            FROM publications p

            INNER JOIN organisations o
                ON o.id = p.organisation_id

            INNER JOIN tenants t
                ON t.id = p.tenant_id

            WHERE
                p.organisation_id = $1
                AND t.code = $2

            ORDER BY
                p.date_publication DESC,
                p.id DESC
            `,
            [
                organisationId,
                tenantCode
            ]
        );


    return resultat.rows;
}
module.exports = {
    trouverOrganisationParIdDatabase,
    trouverOrganisationParIdEtTenantDatabase,
    listerOrganisationsParTenantEtTypeDatabase,
    listerPersonnesParOrganisationEtRelationDatabase,
    trouverRelationPersonneOrganisationDatabase,
    aPermissionDatabase,
    creerPublicationDatabase,
    listerPublicationsParOrganisationEtTenantDatabase
};