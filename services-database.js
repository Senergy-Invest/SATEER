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
async function enregistrerEvenementAnalyticsDatabase(
    tenantCode,
    organisationId,
    publicationId,
    personneId,
    eventType,
    channel
) {

    const resultat =
        await executerRequete(
            `
            INSERT INTO analytics_events (
                tenant_id,
                organisation_id,
                publication_id,
                personne_id,
                event_type,
                country_id,
                territory_id,
                channel
            )
            SELECT
                t.id,
                $2,
                $3,
                p.id,
                $5,
                p.residence_country_id,
                p.residence_territory_id,
                $6
            FROM tenants t
            INNER JOIN personnes p
                ON p.id = $4
            WHERE
                t.code = $1
            RETURNING
                id,
                tenant_id,
                organisation_id,
                publication_id,
                personne_id,
                event_type,
                country_id,
                territory_id,
                channel,
                date_evenement
            `,
            [
                tenantCode,
                organisationId,
                publicationId,
                personneId,
                eventType,
                channel
            ]
        );


    if (
        resultat.rows.length === 0
    ) {
        return undefined;
    }


    return resultat.rows[0];
}
async function obtenirImpactPublicationDatabase(
    publicationId,
    organisationId,
    tenantCode
) {

    const publicationResultat =
        await executerRequete(
            `
            SELECT
                p.id,
                p.titre,
                p.organisation_id,
                t.code AS tenant_code
            FROM publications p
            INNER JOIN tenants t
                ON t.id = p.tenant_id
            WHERE
                p.id = $1
                AND p.organisation_id = $2
                AND t.code = $3
            `,
            [
                publicationId,
                organisationId,
                tenantCode
            ]
        );


    if (
        publicationResultat.rows.length === 0
    ) {
        return undefined;
    }


    const statistiquesResultat =
        await executerRequete(
            `
            SELECT
                COUNT(*) FILTER (
                    WHERE event_type = 'VIEW'
                ) AS vues_totales,

                COUNT(
                    DISTINCT personne_id
                ) FILTER (
                    WHERE event_type = 'VIEW'
                ) AS vues_uniques,

                COUNT(*) FILTER (
                    WHERE event_type = 'CLICK'
                ) AS clics,

                COUNT(*) FILTER (
                    WHERE event_type = 'INTEREST'
                ) AS interets,

                COUNT(*) FILTER (
                    WHERE event_type = 'CONTACT_REQUEST'
                ) AS demandes_contact,

                COUNT(*) FILTER (
                    WHERE event_type = 'REGISTRATION'
                ) AS inscriptions,

                COUNT(*) FILTER (
                    WHERE event_type = 'CONVERSION'
                ) AS conversions

            FROM analytics_events

            WHERE
                publication_id = $1
                AND organisation_id = $2
                AND tenant_id = (
                    SELECT id
                    FROM tenants
                    WHERE code = $3
                )
            `,
            [
                publicationId,
                organisationId,
                tenantCode
            ]
        );


    const paysResultat =
        await executerRequete(
            `
            SELECT
                c.nom AS pays,
                COUNT(*) AS vues
            FROM analytics_events ae
            LEFT JOIN countries c
                ON c.id = ae.country_id
            WHERE
                ae.publication_id = $1
                AND ae.organisation_id = $2
                AND ae.event_type = 'VIEW'
                AND ae.tenant_id = (
                    SELECT id
                    FROM tenants
                    WHERE code = $3
                )
            GROUP BY
                c.nom
            ORDER BY
                vues DESC
            `,
            [
                publicationId,
                organisationId,
                tenantCode
            ]
        );


    const territoiresResultat =
        await executerRequete(
            `
            SELECT
                tr.nom AS territoire,
                COUNT(*) AS vues
            FROM analytics_events ae
            LEFT JOIN territories tr
                ON tr.id = ae.territory_id
            WHERE
                ae.publication_id = $1
                AND ae.organisation_id = $2
                AND ae.event_type = 'VIEW'
                AND ae.tenant_id = (
                    SELECT id
                    FROM tenants
                    WHERE code = $3
                )
            GROUP BY
                tr.nom
            ORDER BY
                vues DESC
            `,
            [
                publicationId,
                organisationId,
                tenantCode
            ]
        );


    return {

        publication:
            publicationResultat.rows[0],

        statistiques:
            statistiquesResultat.rows[0],

        pays:
            paysResultat.rows,

        territoires:
            territoiresResultat.rows
    };
}
async function enregistrerInteractionPublicationDatabase(
    publicationId,
    personneId,
    tenantCode,
    eventType,
    channel,
    metadata = {}
) {

    const typesAutorises = [
        "VIEW",
        "CLICK",
        "INTEREST",
        "CONTACT_REQUEST",
        "REGISTRATION",
        "CONVERSION"
    ];


    if (
        typesAutorises.includes(
            eventType
        ) === false
    ) {

        throw new Error(
            "Type d'interaction analytics non autorisé : " +
            eventType
        );
    }


    const publicationResultat =
        await executerRequete(
            `
            SELECT
                p.id,
                p.organisation_id,
                p.tenant_id
            FROM publications p
            INNER JOIN tenants t
                ON t.id = p.tenant_id
            WHERE
                p.id = $1
                AND t.code = $2
            `,
            [
                publicationId,
                tenantCode
            ]
        );


    if (
        publicationResultat.rows.length === 0
    ) {

        return undefined;
    }


    const publication =
        publicationResultat.rows[0];


    const personneResultat =
        await executerRequete(
            `
            SELECT
                id,
                residence_country_id,
                residence_territory_id
            FROM personnes
            WHERE id = $1
            `,
            [
                personneId
            ]
        );


    if (
        personneResultat.rows.length === 0
    ) {

        return undefined;
    }


    const personne =
        personneResultat.rows[0];


    const resultat =
        await executerRequete(
            `
            INSERT INTO analytics_events (
                tenant_id,
                organisation_id,
                publication_id,
                personne_id,
                event_type,
                country_id,
                territory_id,
                channel,
                metadata
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
                $9::jsonb
            )
            RETURNING
                id,
                tenant_id,
                organisation_id,
                publication_id,
                personne_id,
                event_type,
                country_id,
                territory_id,
                channel,
                metadata,
                date_evenement
            `,
            [
                publication.tenant_id,
                publication.organisation_id,
                publicationId,
                personneId,
                eventType,
                personne.residence_country_id,
                personne.residence_territory_id,
                channel,
                JSON.stringify(
                    metadata || {}
                )
            ]
        );


    return resultat.rows[0];
}
async function trouverPersonneParIdDatabase(
    personneId
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
                p.residence_country_id,
                p.residence_territory_id
            FROM personnes p
            WHERE p.id = $1
            `,
            [
                personneId
            ]
        );


    if (
        resultat.rows.length === 0
    ) {
        return undefined;
    }


    return resultat.rows[0];
}
async function creerDemandeContactPartenaireDatabase(
    publicationId,
    personneId,
    tenantCode,
    texteConsentement,
    besoin,
    channel
) {

    const resultat =
        await executerRequete(
            `
            WITH contexte AS (

                SELECT
                    t.id AS tenant_id,

                    p.id AS publication_id,

                    p.organisation_id
                        AS partner_organisation_id,

                    personne.id AS personne_id,

                    personne.residence_country_id,

                    personne.residence_territory_id,

                    sateer.id
                        AS sateer_organisation_id

                FROM publications p

                INNER JOIN tenants t
                    ON t.id = p.tenant_id

                INNER JOIN personnes personne
                    ON personne.id = $2

                INNER JOIN organisations sateer
                    ON sateer.tenant_id = t.id
                    AND sateer.type = 'SATEER'

                WHERE
                    p.id = $1
                    AND t.code = $3

                    AND EXISTS (
                        SELECT 1
                        FROM partner_agreements pa
                        WHERE
                            pa.tenant_id = t.id
                            AND pa.sateer_organisation_id =
                                sateer.id
                            AND pa.partner_organisation_id =
                                p.organisation_id
                            AND pa.statut = 'ACTIF'
                    )
            ),


            nouveau_consentement AS (

                INSERT INTO consents (
                    tenant_id,
                    personne_id,
                    organisation_id,
                    publication_id,
                    consent_type,
                    statut,
                    texte_consentement,
                    metadata
                )

                SELECT
                    tenant_id,
                    personne_id,
                    partner_organisation_id,
                    publication_id,
                    'PARTAGE_COORDONNEES',
                    'ACCORDE',
                    $4,
                    jsonb_build_object(
                        'channel',
                        $6::text
                    )

                FROM contexte

                RETURNING
                    id,
                    tenant_id,
                    personne_id,
                    organisation_id,
                    publication_id
            ),


            nouveau_lead AS (

                INSERT INTO leads (
                    tenant_id,
                    personne_id,
                    source_organisation_id,
                    publication_id,
                    partner_organisation_id,
                    consent_id,
                    type,
                    statut,
                    besoin,
                    metadata
                )

                SELECT
                    c.tenant_id,
                    c.personne_id,

                    contexte.sateer_organisation_id,

                    c.publication_id,

                    c.organisation_id,

                    c.id,

                    'CONTACT_REQUEST',

                    'NOUVEAU',

                    $5,

                    jsonb_build_object(
                        'channel',
                        $6::text,
                        'origine',
                        'PUBLICATION'
                    )

                FROM nouveau_consentement c

                INNER JOIN contexte
                    ON contexte.publication_id =
                        c.publication_id

                RETURNING
                    id,
                    tenant_id,
                    personne_id,
                    partner_organisation_id,
                    consent_id,
                    publication_id,
                    statut
            ),


            nouvel_evenement AS (

                INSERT INTO analytics_events (
                    tenant_id,
                    organisation_id,
                    publication_id,
                    personne_id,
                    event_type,
                    country_id,
                    territory_id,
                    channel,
                    metadata
                )

                SELECT
                    contexte.tenant_id,

                    contexte.partner_organisation_id,

                    contexte.publication_id,

                    contexte.personne_id,

                    'CONTACT_REQUEST',

                    contexte.residence_country_id,

                    contexte.residence_territory_id,

                    $6::text,

                    jsonb_build_object(
                        'lead_id',
                        nouveau_lead.id,
                        'consent_id',
                        nouveau_lead.consent_id
                    )

                FROM contexte

                INNER JOIN nouveau_lead
                    ON nouveau_lead.publication_id =
                        contexte.publication_id

                RETURNING
                    id
            )


            SELECT
                nouveau_lead.id AS lead_id,

                nouveau_lead.consent_id,

                nouveau_lead.publication_id,

                nouveau_lead.personne_id,

                nouveau_lead.partner_organisation_id,

                nouveau_lead.statut,

                nouvel_evenement.id
                    AS analytics_event_id

            FROM nouveau_lead

            INNER JOIN nouvel_evenement
                ON TRUE
            `,
            [
                publicationId,
                personneId,
                tenantCode,
                texteConsentement,
                besoin,
                channel
            ]
        );


    if (
        resultat.rows.length === 0
    ) {
        return undefined;
    }


    return resultat.rows[0];
}

module.exports = {
    trouverOrganisationParIdDatabase,
    trouverOrganisationParIdEtTenantDatabase,
    listerOrganisationsParTenantEtTypeDatabase,
    listerPersonnesParOrganisationEtRelationDatabase,
    trouverRelationPersonneOrganisationDatabase,
    aPermissionDatabase,
    creerPublicationDatabase,
    listerPublicationsParOrganisationEtTenantDatabase,
    enregistrerEvenementAnalyticsDatabase,
    obtenirImpactPublicationDatabase,
    enregistrerInteractionPublicationDatabase,
    trouverPersonneParIdDatabase,
    creerDemandeContactPartenaireDatabase
};