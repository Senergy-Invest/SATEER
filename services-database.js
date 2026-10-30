const {
    executerRequete,
    obtenirClientDatabase
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
async function creerIntroductionPartenaireDatabase(
    leadId,
    agentSateerId,
    tenantCode,
    canal
) {

    const resultat =
        await executerRequete(
            `
            WITH contexte AS (

                SELECT
                    l.id AS lead_id,
                    l.tenant_id,
                    l.personne_id,
                    l.partner_organisation_id,
                    l.consent_id,

                    sateer.id
                        AS sateer_organisation_id

                FROM leads l

                INNER JOIN tenants t
                    ON t.id = l.tenant_id

                INNER JOIN consents c
                    ON c.id = l.consent_id
                    AND c.statut = 'ACCORDE'

                INNER JOIN organisations sateer
                    ON sateer.id =
                        l.source_organisation_id
                    AND sateer.type = 'SATEER'

                INNER JOIN relations_personne_organisation r
                    ON r.personne_id = $2
                    AND r.organisation_id = sateer.id
                    AND r.type = 'AGENT_SATEER'

                WHERE
                    l.id = $1
                    AND t.code = $3
                    AND l.statut = 'NOUVEAU'

                    AND EXISTS (
                        SELECT 1
                        FROM partner_agreements pa
                        WHERE
                            pa.tenant_id =
                                l.tenant_id
                            AND pa.sateer_organisation_id =
                                sateer.id
                            AND pa.partner_organisation_id =
                                l.partner_organisation_id
                            AND pa.statut = 'ACTIF'
                    )

                    AND NOT EXISTS (
                        SELECT 1
                        FROM introductions i
                        WHERE
                            i.lead_id = l.id
                    )
            ),


            nouvelle_introduction AS (

                INSERT INTO introductions (
                    tenant_id,
                    lead_id,
                    sateer_organisation_id,
                    partner_organisation_id,
                    statut,
                    canal,
                    date_introduction,
                    metadata
                )

                SELECT
                    tenant_id,
                    lead_id,
                    sateer_organisation_id,
                    partner_organisation_id,
                    'ENVOYEE',
                    $4::text,
                    CURRENT_TIMESTAMP,

                    jsonb_build_object(
                        'validated_by',
                        $2::integer
                    )

                FROM contexte

                RETURNING
                    id,
                    tenant_id,
                    lead_id,
                    sateer_organisation_id,
                    partner_organisation_id,
                    statut,
                    canal,
                    date_introduction
            ),


            lead_modifie AS (

                UPDATE leads l

                SET
                    statut = 'INTRODUIT',
                    date_modification =
                        CURRENT_TIMESTAMP

                FROM nouvelle_introduction i

                WHERE
                    l.id = i.lead_id

                RETURNING
                    l.id,
                    l.statut
            ),


            nouveau_suivi AS (

                INSERT INTO lead_followups (
                    tenant_id,
                    lead_id,
                    personne_agent_id,
                    statut,
                    note,
                    metadata
                )

                SELECT
                    i.tenant_id,
                    i.lead_id,
                    $2,
                    'INTRODUCTION_ENVOYEE',
                    'Mise en relation validée et envoyée au partenaire.',
                    jsonb_build_object(
                        'introduction_id',
                        i.id,
                        'canal',
                        i.canal
                    )

                FROM nouvelle_introduction i

                RETURNING
                    id,
                    lead_id,
                    statut
            )


            SELECT
                i.id AS introduction_id,

                i.lead_id,

                i.partner_organisation_id,

                i.statut AS introduction_statut,

                i.canal,

                l.statut AS lead_statut,

                s.id AS followup_id

            FROM nouvelle_introduction i

            INNER JOIN lead_modifie l
                ON l.id = i.lead_id

            INNER JOIN nouveau_suivi s
                ON s.lead_id = i.lead_id
            `,
            [
                leadId,
                agentSateerId,
                tenantCode,
                canal
            ]
        );


    if (
        resultat.rows.length === 0
    ) {
        return undefined;
    }


    return resultat.rows[0];
}
async function obtenirEspacePartenaireDatabase(
    organisationId,
    tenantCode
) {

    const organisationResultat =
        await executerRequete(
            `
            SELECT
                o.id,
                o.nom,
                o.type,
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
        organisationResultat.rows.length === 0
    ) {
        return undefined;
    }


    const introductionsResultat =
        await executerRequete(
            `
            SELECT
                i.id AS introduction_id,

                i.statut AS introduction_statut,

                i.canal,

                i.date_introduction,

                l.id AS lead_id,

                l.statut AS lead_statut,

                l.besoin,

                l.publication_id,

                p.id AS personne_id,

                p.prenom,

                p.nom,

                c.id AS consent_id,

                c.consent_type,

                c.statut AS consent_statut,

                c.date_consentement

            FROM introductions i

            INNER JOIN leads l
                ON l.id = i.lead_id
                AND l.tenant_id = i.tenant_id
                AND l.partner_organisation_id =
                    i.partner_organisation_id

            INNER JOIN personnes p
                ON p.id = l.personne_id

            INNER JOIN consents c
                ON c.id = l.consent_id
                AND c.personne_id = l.personne_id

            INNER JOIN tenants t
                ON t.id = i.tenant_id

            WHERE
                i.partner_organisation_id = $1
                AND t.code = $2

            ORDER BY
                i.date_introduction DESC
            `,
            [
                organisationId,
                tenantCode
            ]
        );


    const suivisResultat =
        await executerRequete(
            `
            SELECT
                f.id,
                f.lead_id,
                f.statut,
                f.note,
                f.date_suivi,

                p.prenom AS agent_prenom,
                p.nom AS agent_nom

            FROM lead_followups f

            INNER JOIN leads l
                ON l.id = f.lead_id

            INNER JOIN tenants t
                ON t.id = f.tenant_id

            LEFT JOIN personnes p
                ON p.id = f.personne_agent_id

            WHERE
                l.partner_organisation_id = $1
                AND t.code = $2

            ORDER BY
                f.date_suivi DESC
            `,
            [
                organisationId,
                tenantCode
            ]
        );


    return {
        organisation:
            organisationResultat.rows[0],

        introductions:
            introductionsResultat.rows,

        suivis:
            suivisResultat.rows
    };
}
async function listerPublicationsVisiblesPourPersonneDatabase(
    personneId,
    organisationId,
    tenantCode
) {

    const resultat =
        await executerRequete(
            `
            SELECT
                pub.id,
                pub.tenant_id,
                pub.organisation_id,
                pub.publie_par,
                pub.titre,
                pub.contenu,
                pub.categorie,
                pub.priorite,
                pub.audience_type,
                pub.audience_valeur,
                pub.medias,
                pub.statut,
                pub.statut_diffusion_diaspora,
                pub.date_publication,

                p.prenom,
                p.nom,
                p.profil,

                p.pays_residence,
                p.departement,

                c.nom AS pays_structure,

                tr.nom AS territoire_structure

            FROM publications pub

            INNER JOIN tenants t
                ON t.id = pub.tenant_id

            INNER JOIN personnes p
                ON p.id = $1

            LEFT JOIN countries c
                ON c.id =
                    p.residence_country_id

            LEFT JOIN territories tr
                ON tr.id =
                    p.residence_territory_id

            WHERE
                pub.organisation_id = $2

                AND t.code = $3

                AND pub.statut = 'PUBLIEE'

                AND (

                    pub.audience_type = 'TOUS'

                    OR

                    (
                        pub.audience_type =
                            'DEPARTEMENT'

                        AND (
                            pub.audience_valeur =
                                tr.nom

                            OR

                            pub.audience_valeur =
                                p.departement
                        )
                    )

                    OR

                    (
                        pub.audience_type =
                            'PROFIL'

                        AND pub.audience_valeur =
                            p.profil
                    )

                    OR

                    (
                        pub.audience_type =
                            'ASSOCIATION'

                        AND EXISTS (

                            SELECT 1

                            FROM
                                relations_personne_organisation r

                            INNER JOIN organisations o
                                ON o.id =
                                    r.organisation_id

                            WHERE
                                r.personne_id =
                                    p.id

                                AND (
                                    pub.audience_valeur =
                                        o.nom

                                    OR

                                    pub.audience_valeur =
                                        o.id::text
                                )
                        )
                    )
                )

            ORDER BY

                CASE pub.priorite

                    WHEN 'URGENTE'
                        THEN 1

                    WHEN 'IMPORTANTE'
                        THEN 2

                    ELSE 3

                END,

                pub.date_publication DESC,

                pub.id DESC
            `,
            [
                personneId,
                organisationId,
                tenantCode
            ]
        );


    return resultat.rows;
}
async function creerDemandeDatabase(
    personneId,
    organisationId,
    tenantCode,
    categorie,
    objet,
    description,
    priorite = "NORMALE",
    canal = "MON_CONSULAT"
) {

    const resultat =
        await executerRequete(
            `
            WITH contexte AS (

                SELECT
                    t.id AS tenant_id,

                    o.id AS organisation_id,

                    p.id AS personne_id

                FROM tenants t

                INNER JOIN organisations o
                    ON o.tenant_id = t.id
                    AND o.id = $2

                INNER JOIN personnes p
                    ON p.id = $1

                WHERE
                    t.code = $3
            ),


            nouvelle_demande AS (

                INSERT INTO demandes (
                    tenant_id,
                    organisation_id,
                    personne_id,
                    categorie,
                    objet,
                    description,
                    statut,
                    priorite,
                    canal
                )

                SELECT
                    tenant_id,
                    organisation_id,
                    personne_id,
                    $4::text,
                    $5::text,
                    $6::text,
                    'NOUVELLE',
                    $7::text,
                    $8::text

                FROM contexte

                RETURNING
                    id,
                    tenant_id,
                    organisation_id,
                    personne_id,
                    categorie,
                    objet,
                    description,
                    statut,
                    priorite,
                    canal,
                    date_creation
            ),


            nouvel_historique AS (

                INSERT INTO demande_history (
                    tenant_id,
                    demande_id,
                    auteur_personne_id,
                    ancien_statut,
                    nouveau_statut,
                    action,
                    commentaire
                )

                SELECT
                    tenant_id,
                    id,
                    personne_id,
                    NULL,
                    'NOUVELLE',
                    'CREATION',
                    'Demande créée par le citoyen.'

                FROM nouvelle_demande

                RETURNING
                    id,
                    demande_id
            )


            SELECT
                d.id,
                d.tenant_id,
                d.organisation_id,
                d.personne_id,
                d.categorie,
                d.objet,
                d.description,
                d.statut,
                d.priorite,
                d.canal,
                d.date_creation,

                h.id AS history_id

            FROM nouvelle_demande d

            INNER JOIN nouvel_historique h
                ON h.demande_id = d.id
            `,
            [
                personneId,
                organisationId,
                tenantCode,
                categorie,
                objet,
                description,
                priorite,
                canal
            ]
        );


    if (
        resultat.rows.length === 0
    ) {
        return undefined;
    }


    return resultat.rows[0];
}
async function listerDemandesPersonneDatabase(
    personneId,
    organisationId,
    tenantCode
) {

    const resultat =
        await executerRequete(
            `
            SELECT
                d.id,
                d.categorie,
                d.objet,
                d.description,
                d.statut,
                d.priorite,
                d.canal,
                d.date_creation,
                d.date_modification,

                o.nom AS organisation

            FROM demandes d

            INNER JOIN tenants t
                ON t.id = d.tenant_id

            INNER JOIN organisations o
                ON o.id = d.organisation_id

            WHERE
                d.personne_id = $1
                AND d.organisation_id = $2
                AND t.code = $3

            ORDER BY
                d.date_creation DESC,
                d.id DESC
            `,
            [
                personneId,
                organisationId,
                tenantCode
            ]
        );


    return resultat.rows;
}
async function listerDemandesOrganisationDatabase(
    organisationId,
    tenantCode,
    statut = null,
    destinationCode = null,
    uniquementNonOrientees = false
) {

    const resultat =
        await executerRequete(
            `
            SELECT
                d.id,
                d.categorie,
                d.objet,
                d.description,
                d.statut,
                d.priorite,
                d.canal,
                d.date_creation,
                d.date_modification,

                d.destination_unit_id,

                destination.code
                    AS destination_code,

                destination.nom
                    AS destination_nom,

                citoyen.id
                    AS personne_id,

                citoyen.prenom,

                citoyen.nom,

                pays.nom
                    AS pays,

                territoire.nom
                    AS territoire,

                agent.id
                    AS assignee_id,

                agent.prenom
                    AS assignee_prenom,

                agent.nom
                    AS assignee_nom,

                o.nom
                    AS organisation

            FROM demandes d

            INNER JOIN tenants t
                ON t.id = d.tenant_id

            INNER JOIN organisations o
                ON o.id = d.organisation_id

            INNER JOIN personnes citoyen
                ON citoyen.id = d.personne_id

            LEFT JOIN countries pays
                ON pays.id =
                    citoyen.residence_country_id

            LEFT JOIN territories territoire
                ON territoire.id =
                    citoyen.residence_territory_id

            LEFT JOIN personnes agent
                ON agent.id = d.assignee_a

            LEFT JOIN organisation_units destination
                ON destination.id =
                    d.destination_unit_id

            WHERE
                d.organisation_id = $1

                AND t.code = $2

                AND (
                    $3::text IS NULL
                    OR d.statut = $3::text
                )

                AND (
                    $4::text IS NULL
                    OR destination.code = $4::text
                )

                AND (
                    $5::boolean = FALSE
                    OR d.destination_unit_id IS NULL
                )

            ORDER BY

                CASE d.priorite

                    WHEN 'URGENTE'
                        THEN 1

                    WHEN 'IMPORTANTE'
                        THEN 2

                    ELSE 3

                END,

                d.date_creation ASC
            `,
            [
                organisationId,
                tenantCode,
                statut,
                destinationCode,
                uniquementNonOrientees
            ]
        );


    return resultat.rows;
}
// =========================================================
// SECRÉTARIAT - ORIENTER UNE DEMANDE
// =========================================================

async function orienterDemandeDatabase(
    demandeId,
    organisationId,
    tenantCode,
    destinationUnitId,
    motif,
    orienteePar = null
) {

    const client =
    await obtenirClientDatabase();


    try {

        await client.query(
            "BEGIN"
        );


        // =================================================
        // 1. VÉRIFIER LA DEMANDE ET LE TENANT
        // =================================================

        const demandeResult =
            await client.query(
                `
                SELECT
                    d.id,
                    d.destination_unit_id

                FROM demandes d

                INNER JOIN organisations o
                    ON o.id = d.organisation_id

                INNER JOIN tenants t
                    ON t.id = o.tenant_id

                WHERE
                    d.id = $1
                    AND d.organisation_id = $2
                    AND t.code = $3

                FOR UPDATE
                `,
                [
                    demandeId,
                    organisationId,
                    tenantCode
                ]
            );


        if (
            demandeResult.rowCount === 0
        ) {

            await client.query(
                "ROLLBACK"
            );


            return {
                succes: false,
                raison: "DEMANDE_INTROUVABLE"
            };
        }


        const demande =
            demandeResult.rows[0];


        // =================================================
        // 2. VÉRIFIER L'UNITÉ DE DESTINATION
        // =================================================

        const destinationResult =
            await client.query(
                `
                SELECT
                    ou.id,
                    ou.code,
                    ou.nom,
                    ou.type

                FROM organisation_units ou

                INNER JOIN organisations o
                    ON o.id = ou.organisation_id

                INNER JOIN tenants t
                    ON t.id = o.tenant_id

                WHERE
                    ou.id = $1
                    AND ou.organisation_id = $2
                    AND t.code = $3
                    AND ou.actif = TRUE
                `,
                [
                    destinationUnitId,
                    organisationId,
                    tenantCode
                ]
            );


        if (
            destinationResult.rowCount === 0
        ) {

            await client.query(
                "ROLLBACK"
            );


            return {
                succes: false,
                raison: "DESTINATION_INVALIDE"
            };
        }


        const destination =
            destinationResult.rows[0];


        // =================================================
        // 3. METTRE À JOUR LA DESTINATION ACTUELLE
        // =================================================

        const updateResult =
            await client.query(
                `
                UPDATE demandes

                SET
                    destination_unit_id = $1,
                    orientee_par = $2,
                    motif_orientation = $3,
                    date_orientation = CURRENT_TIMESTAMP,
                    date_modification = CURRENT_TIMESTAMP

                WHERE
                    id = $4

                RETURNING
                    id,
                    objet,
                    statut,
                    priorite,
                    destination_unit_id,
                    orientee_par,
                    motif_orientation,
                    date_orientation
                `,
                [
                    destinationUnitId,
                    orienteePar,
                    motif,
                    demandeId
                ]
            );


        // =================================================
        // 4. HISTORIQUE DE L'ORIENTATION
        // =================================================

        await client.query(
            `
            INSERT INTO demande_orientations (
                demande_id,
                ancienne_unit_id,
                nouvelle_unit_id,
                orientee_par,
                motif
            )

            VALUES (
                $1,
                $2,
                $3,
                $4,
                $5
            )
            `,
            [
                demandeId,
                demande.destination_unit_id,
                destinationUnitId,
                orienteePar,
                motif
            ]
        );


        await client.query(
            "COMMIT"
        );


        return {

            succes:
                true,

            demande:
                updateResult.rows[0],

            destination:
                destination
        };


    } catch (erreur) {

        await client.query(
            "ROLLBACK"
        );


        throw erreur;

    } finally {

        client.release();
    }
}
async function prendreEnChargeDemandeDatabase(
    demandeId,
    agentPersonneId,
    organisationId,
    tenantCode,
    unitId = null
) {

    const resultat =
        await executerRequete(
            `
            WITH contexte AS (

                SELECT
                    d.id AS demande_id,
                    d.tenant_id,
                    d.organisation_id,
                    d.statut AS ancien_statut,
                    d.destination_unit_id,

                    agent.id AS agent_id

                FROM demandes d

                INNER JOIN tenants t
                    ON t.id = d.tenant_id

                INNER JOIN organisations o
                    ON o.id = d.organisation_id
                    AND o.tenant_id = t.id

                INNER JOIN organisation_units destination
                    ON destination.id = d.destination_unit_id
                    AND destination.organisation_id = o.id
                    AND destination.actif = TRUE

                INNER JOIN personnes agent
                    ON agent.id = $2

                WHERE
                    d.id = $1

                    AND d.organisation_id = $3

                    AND t.code = $4

                    AND d.statut = 'NOUVELLE'

                    AND (
                        $5::integer IS NULL
                        OR d.destination_unit_id = $5::integer
                    )
            ),


            demande_modifiee AS (

                UPDATE demandes d

                SET
                    assignee_a =
                        contexte.agent_id,

                    statut =
                        'EN_COURS',

                    date_modification =
                        CURRENT_TIMESTAMP

                FROM contexte

                WHERE
                    d.id =
                        contexte.demande_id

                RETURNING
                    d.id,
                    d.tenant_id,
                    d.organisation_id,
                    d.personne_id,
                    d.categorie,
                    d.objet,
                    d.description,
                    d.statut,
                    d.priorite,
                    d.assignee_a,
                    d.destination_unit_id,
                    d.date_modification
            ),


            nouvel_historique AS (

                INSERT INTO demande_history (
                    tenant_id,
                    demande_id,
                    auteur_personne_id,
                    ancien_statut,
                    nouveau_statut,
                    action,
                    commentaire
                )

                SELECT
                    dm.tenant_id,
                    dm.id,
                    dm.assignee_a,
                    contexte.ancien_statut,
                    'EN_COURS',
                    'PRISE_EN_CHARGE',
                    'Dossier pris en charge par un membre de l unité destinataire.'

                FROM demande_modifiee dm

                INNER JOIN contexte
                    ON contexte.demande_id =
                        dm.id

                RETURNING
                    id,
                    demande_id
            )


            SELECT
                dm.id,
                dm.organisation_id,
                dm.personne_id,
                dm.categorie,
                dm.objet,
                dm.statut,
                dm.priorite,
                dm.assignee_a,
                dm.destination_unit_id,
                dm.date_modification,

                h.id AS history_id

            FROM demande_modifiee dm

            INNER JOIN nouvel_historique h
                ON h.demande_id =
                    dm.id
            `,
            [
                demandeId,
                agentPersonneId,
                organisationId,
                tenantCode,
                unitId
            ]
        );


    if (
        resultat.rows.length === 0
    ) {

        return undefined;
    }


    return resultat.rows[0];
}
async function repondreDemandeDatabase(
    demandeId,
    agentPersonneId,
    organisationId,
    tenantCode,
    contenu,
    unitId = null
) {

    const resultat =
        await executerRequete(
            `
            WITH contexte AS (

                SELECT
                    d.id AS demande_id,
                    d.tenant_id,
                    d.organisation_id,
                    d.personne_id,
                    d.objet,
                    d.statut AS ancien_statut,

                    agent.id AS agent_id

                FROM demandes d

                INNER JOIN tenants t
                    ON t.id = d.tenant_id

                INNER JOIN organisations o
                    ON o.id = d.organisation_id
                    AND o.tenant_id = t.id

                INNER JOIN organisation_units destination
                    ON destination.id = d.destination_unit_id
                    AND destination.organisation_id = o.id
                    AND destination.actif = TRUE

                INNER JOIN personnes agent
                    ON agent.id = $2

                WHERE
                    d.id = $1

                    AND d.organisation_id = $3

                    AND t.code = $4

                    AND d.statut = 'EN_COURS'

                    AND (
                        $6::integer IS NULL
                        OR d.destination_unit_id = $6::integer
                    )
            ),


            nouvelle_reponse AS (

                INSERT INTO demande_reponses (
                    tenant_id,
                    demande_id,
                    auteur_personne_id,
                    contenu,
                    type,
                    visible_citoyen
                )

                SELECT
                    tenant_id,
                    demande_id,
                    agent_id,
                    $5::text,
                    'REPONSE',
                    TRUE

                FROM contexte

                RETURNING
                    id,
                    tenant_id,
                    demande_id,
                    auteur_personne_id,
                    contenu,
                    date_creation
            ),


            demande_modifiee AS (

                UPDATE demandes d

                SET
                    statut = 'TRAITEE',

                    assignee_a =
                        contexte.agent_id,

                    date_modification =
                        CURRENT_TIMESTAMP,

                    date_cloture =
                        CURRENT_TIMESTAMP

                FROM contexte

                WHERE
                    d.id =
                        contexte.demande_id

                RETURNING
                    d.id,
                    d.statut,
                    d.assignee_a,
                    d.date_modification,
                    d.date_cloture
            ),


            nouvel_historique AS (

                INSERT INTO demande_history (
                    tenant_id,
                    demande_id,
                    auteur_personne_id,
                    ancien_statut,
                    nouveau_statut,
                    action,
                    commentaire
                )

                SELECT
                    contexte.tenant_id,

                    contexte.demande_id,

                    contexte.agent_id,

                    contexte.ancien_statut,

                    'TRAITEE',

                    'REPONSE_ENVOYEE',

                    'Une réponse a été envoyée au citoyen.'

                FROM contexte

                RETURNING
                    id,
                    demande_id
            ),


            nouvelle_notification AS (

                INSERT INTO notifications (
                    tenant_id,
                    personne_id,
                    organisation_id,
                    type,
                    titre,
                    message,
                    reference_type,
                    reference_id,
                    canal,
                    statut
                )

                SELECT
                    contexte.tenant_id,

                    contexte.personne_id,

                    contexte.organisation_id,

                    'REPONSE_DEMANDE',

                    'Votre demande a reçu une réponse',

                    'Une réponse est disponible pour votre demande : '
                        || contexte.objet,

                    'DEMANDE',

                    contexte.demande_id,

                    'MON_SATEER',

                    'NON_LUE'

                FROM contexte

                RETURNING
                    id,
                    personne_id,
                    statut
            )


            SELECT
                r.id AS reponse_id,

                r.demande_id,

                r.auteur_personne_id,

                r.contenu,

                r.date_creation,

                d.statut AS demande_statut,

                d.assignee_a,

                d.date_cloture,

                h.id AS history_id,

                n.id AS notification_id,

                n.statut AS notification_statut

            FROM nouvelle_reponse r

            INNER JOIN demande_modifiee d
                ON d.id = r.demande_id

            INNER JOIN nouvel_historique h
                ON h.demande_id = r.demande_id

            INNER JOIN nouvelle_notification n
                ON TRUE
            `,
            [
                demandeId,
                agentPersonneId,
                organisationId,
                tenantCode,
                contenu,
                unitId
            ]
        );


    if (
        resultat.rows.length === 0
    ) {
        return undefined;
    }


    return resultat.rows[0];
}
async function listerReponsesDemandeCitoyenDatabase(
    demandeId,
    personneId,
    organisationId,
    tenantCode
) {

    const resultat =
        await executerRequete(
            `
            SELECT
                r.id,
                r.demande_id,
                r.contenu,
                r.type,
                r.date_creation,

                agent.prenom AS auteur_prenom,
                agent.nom AS auteur_nom,

                d.statut AS demande_statut

            FROM demande_reponses r

            INNER JOIN demandes d
                ON d.id = r.demande_id

            INNER JOIN tenants t
                ON t.id = d.tenant_id

            INNER JOIN personnes agent
                ON agent.id =
                    r.auteur_personne_id

            WHERE
                r.demande_id = $1

                AND d.personne_id = $2

                AND d.organisation_id = $3

                AND t.code = $4

                AND r.visible_citoyen = TRUE

            ORDER BY
                r.date_creation ASC,
                r.id ASC
            `,
            [
                demandeId,
                personneId,
                organisationId,
                tenantCode
            ]
        );


    return resultat.rows;
}

async function listerNotificationsPersonneDatabase(
    personneId,
    tenantCode,
    statut = null
) {

    const resultat =
        await executerRequete(
            `
            SELECT
                n.id,
                n.type,
                n.titre,
                n.message,
                n.reference_type,
                n.reference_id,
                n.canal,
                n.statut,
                n.date_creation,
                n.date_lecture,

                o.nom AS organisation

            FROM notifications n

            INNER JOIN tenants t
                ON t.id = n.tenant_id

            LEFT JOIN organisations o
                ON o.id = n.organisation_id

            WHERE
                n.personne_id = $1

                AND t.code = $2

                AND (
                    $3::text IS NULL
                    OR n.statut = $3::text
                )

            ORDER BY
                n.date_creation DESC,
                n.id DESC
            `,
            [
                personneId,
                tenantCode,
                statut
            ]
        );


    return resultat.rows;
}

async function obtenirDashboardConsulatDatabase(
    organisationId,
    tenantCode
) {

    const organisationResultat =
        await executerRequete(
            `
            SELECT
                o.id,
                o.nom,
                o.type,
                t.code AS tenant_code
            FROM organisations o
            INNER JOIN tenants t
                ON t.id = o.tenant_id
            WHERE
                o.id = $1
                AND t.code = $2
                AND o.type = 'CONSULAT'
            `,
            [
                organisationId,
                tenantCode
            ]
        );


    if (
        organisationResultat.rows.length === 0
    ) {
        return undefined;
    }


    // =====================================================
    // DEMANDES
    // =====================================================

    const demandesResultat =
        await executerRequete(
            `
            SELECT

                COUNT(*) AS total,

                COUNT(*) FILTER (
                    WHERE statut = 'NOUVELLE'
                ) AS nouvelles,

                COUNT(*) FILTER (
                    WHERE statut = 'EN_COURS'
                ) AS en_cours,

                COUNT(*) FILTER (
                    WHERE statut = 'TRAITEE'
                ) AS traitees,

                COUNT(*) FILTER (
                    WHERE priorite = 'URGENTE'
                ) AS urgentes,

                COUNT(*) FILTER (
                    WHERE priorite = 'IMPORTANTE'
                ) AS importantes

            FROM demandes d

            INNER JOIN tenants t
                ON t.id = d.tenant_id

            WHERE
                d.organisation_id = $1
                AND t.code = $2
            `,
            [
                organisationId,
                tenantCode
            ]
        );


    // =====================================================
    // DÉLAI MOYEN DE TRAITEMENT
    // =====================================================

    const delaiResultat =
    await executerRequete(
        `
        SELECT

            ROUND(
                AVG(
                    EXTRACT(
                        EPOCH FROM (
                            d.date_cloture -
                            d.date_creation
                        )
                    ) / 3600
                )::numeric,
                2
            ) AS heures_moyennes,

            COUNT(*) AS demandes_mesurees

        FROM demandes d

        INNER JOIN tenants t
            ON t.id = d.tenant_id

        WHERE
            d.organisation_id = $1
            AND t.code = $2
            AND d.statut = 'TRAITEE'
            AND d.date_cloture IS NOT NULL
        `,
        [
            organisationId,
            tenantCode
        ]
    );


    // =====================================================
    // DEMANDES PAR CATÉGORIE
    // =====================================================

    const categoriesResultat =
        await executerRequete(
            `
            SELECT
                d.categorie,

                COUNT(*) AS total,

                COUNT(*) FILTER (
                    WHERE d.statut = 'NOUVELLE'
                ) AS nouvelles,

                COUNT(*) FILTER (
                    WHERE d.statut = 'EN_COURS'
                ) AS en_cours,

                COUNT(*) FILTER (
                    WHERE d.statut = 'TRAITEE'
                ) AS traitees

            FROM demandes d

            INNER JOIN tenants t
                ON t.id = d.tenant_id

            WHERE
                d.organisation_id = $1
                AND t.code = $2

            GROUP BY
                d.categorie

            ORDER BY
                total DESC,
                d.categorie ASC
            `,
            [
                organisationId,
                tenantCode
            ]
        );


    // =====================================================
    // DEMANDES PAR TERRITOIRE
    // =====================================================

    const demandesTerritoiresResultat =
        await executerRequete(
            `
            SELECT

                COALESCE(
                    tr.nom,
                    p.departement,
                    'Non renseigné'
                ) AS territoire,

                COUNT(*) AS total,

                COUNT(*) FILTER (
                    WHERE d.statut = 'NOUVELLE'
                ) AS nouvelles,

                COUNT(*) FILTER (
                    WHERE d.statut = 'EN_COURS'
                ) AS en_cours,

                COUNT(*) FILTER (
                    WHERE d.statut = 'TRAITEE'
                ) AS traitees

            FROM demandes d

            INNER JOIN tenants t
                ON t.id = d.tenant_id

            INNER JOIN personnes p
                ON p.id = d.personne_id

            LEFT JOIN territories tr
                ON tr.id =
                    p.residence_territory_id

            WHERE
                d.organisation_id = $1
                AND t.code = $2

            GROUP BY
                COALESCE(
                    tr.nom,
                    p.departement,
                    'Non renseigné'
                )

            ORDER BY
                total DESC,
                territoire ASC
            `,
            [
                organisationId,
                tenantCode
            ]
        );


    // =====================================================
    // DEMANDES À SURVEILLER
    //
    // Pour le pilote :
    // - urgente
    // - importante
    // - ou ouverte depuis plus de 3 jours
    // =====================================================

    const surveillanceResultat =
        await executerRequete(
            `
            SELECT
                d.id,
                d.objet,
                d.categorie,
                d.statut,
                d.priorite,
                d.date_creation,

                p.prenom,
                p.nom,

                COALESCE(
                    tr.nom,
                    p.departement,
                    'Non renseigné'
                ) AS territoire,

                ROUND(
                    EXTRACT(
                        EPOCH FROM (
                            CURRENT_TIMESTAMP -
                            d.date_creation
                        )
                    ) / 86400,
                    1
                ) AS age_jours

            FROM demandes d

            INNER JOIN tenants t
                ON t.id = d.tenant_id

            INNER JOIN personnes p
                ON p.id = d.personne_id

            LEFT JOIN territories tr
                ON tr.id =
                    p.residence_territory_id

            WHERE
                d.organisation_id = $1
                AND t.code = $2

                AND d.statut <> 'TRAITEE'

                AND (
                    d.priorite IN (
                        'URGENTE',
                        'IMPORTANTE'
                    )

                    OR

                    d.date_creation <
                        CURRENT_TIMESTAMP -
                        INTERVAL '3 days'
                )

            ORDER BY

                CASE d.priorite

                    WHEN 'URGENTE'
                        THEN 1

                    WHEN 'IMPORTANTE'
                        THEN 2

                    ELSE 3

                END,

                d.date_creation ASC
            `,
            [
                organisationId,
                tenantCode
            ]
        );


    // =====================================================
    // PUBLICATIONS
    // =====================================================

    const publicationsResultat =
        await executerRequete(
            `
            SELECT

                COUNT(*) AS total,

                COUNT(*) FILTER (
                    WHERE statut = 'PUBLIEE'
                ) AS publiees,

                COUNT(*) FILTER (
                    WHERE priorite = 'IMPORTANTE'
                ) AS importantes,

                COUNT(*) FILTER (
                    WHERE priorite = 'URGENTE'
                ) AS urgentes,

                COUNT(*) FILTER (
                    WHERE statut_diffusion_diaspora =
                        'SOUMISE'
                ) AS soumises_diaspora,

                COUNT(*) FILTER (
                    WHERE statut_diffusion_diaspora =
                        'DIFFUSEE'
                ) AS diffusees_diaspora

            FROM publications p

            INNER JOIN tenants t
                ON t.id = p.tenant_id

            WHERE
                p.organisation_id = $1
                AND t.code = $2
            `,
            [
                organisationId,
                tenantCode
            ]
        );


    // =====================================================
    // USAGERS / DIASPORA LIÉS AU CONSULAT
    // =====================================================

    const diasporaResultat =
        await executerRequete(
            `
            SELECT

                COUNT(
                    DISTINCT r.personne_id
                ) AS total_usagers,

                COUNT(
                    DISTINCT r.personne_id
                ) FILTER (
                    WHERE p.residence_country_id
                        IS NOT NULL
                ) AS avec_pays,

                COUNT(
                    DISTINCT r.personne_id
                ) FILTER (
                    WHERE p.residence_territory_id
                        IS NOT NULL
                ) AS avec_territoire

            FROM relations_personne_organisation r

            INNER JOIN organisations o
                ON o.id = r.organisation_id

            INNER JOIN tenants t
                ON t.id = o.tenant_id

            INNER JOIN personnes p
                ON p.id = r.personne_id

            WHERE
                r.organisation_id = $1
                AND t.code = $2
                AND r.type = 'USAGER'
            `,
            [
                organisationId,
                tenantCode
            ]
        );


    // =====================================================
    // RÉPARTITION TERRITORIALE DES USAGERS
    // =====================================================

    const territoiresResultat =
        await executerRequete(
            `
            SELECT

                COALESCE(
                    tr.nom,
                    p.departement,
                    'Non renseigné'
                ) AS territoire,

                COUNT(
                    DISTINCT p.id
                ) AS personnes

            FROM relations_personne_organisation r

            INNER JOIN organisations o
                ON o.id = r.organisation_id

            INNER JOIN tenants t
                ON t.id = o.tenant_id

            INNER JOIN personnes p
                ON p.id = r.personne_id

            LEFT JOIN territories tr
                ON tr.id =
                    p.residence_territory_id

            WHERE
                r.organisation_id = $1
                AND t.code = $2
                AND r.type = 'USAGER'

            GROUP BY
                COALESCE(
                    tr.nom,
                    p.departement,
                    'Non renseigné'
                )

            ORDER BY
                personnes DESC,
                territoire ASC
            `,
            [
                organisationId,
                tenantCode
            ]
        );


    // =====================================================
    // DERNIÈRES DEMANDES
    // =====================================================

    const dernieresDemandesResultat =
        await executerRequete(
            `
            SELECT
                d.id,
                d.objet,
                d.categorie,
                d.statut,
                d.priorite,
                d.date_creation,

                p.prenom,
                p.nom

            FROM demandes d

            INNER JOIN tenants t
                ON t.id = d.tenant_id

            INNER JOIN personnes p
                ON p.id = d.personne_id

            WHERE
                d.organisation_id = $1
                AND t.code = $2

            ORDER BY
                d.date_creation DESC,
                d.id DESC

            LIMIT 5
            `,
            [
                organisationId,
                tenantCode
            ]
        );


    // =====================================================
    // DERNIÈRES PUBLICATIONS
    // =====================================================

    const dernieresPublicationsResultat =
        await executerRequete(
            `
            SELECT
                p.id,
                p.titre,
                p.categorie,
                p.priorite,
                p.statut,
                p.statut_diffusion_diaspora,
                p.date_publication

            FROM publications p

            INNER JOIN tenants t
                ON t.id = p.tenant_id

            WHERE
                p.organisation_id = $1
                AND t.code = $2

            ORDER BY
                p.date_publication DESC,
                p.id DESC

            LIMIT 5
            `,
            [
                organisationId,
                tenantCode
            ]
        );


    return {

        organisation:
            organisationResultat.rows[0],

        demandes:
            demandesResultat.rows[0],

        delaiTraitement:
            delaiResultat.rows[0],

        demandesParCategorie:
            categoriesResultat.rows,

        demandesParTerritoire:
            demandesTerritoiresResultat.rows,

        demandesASurveiller:
            surveillanceResultat.rows,

        publications:
            publicationsResultat.rows[0],

        diaspora:
            diasporaResultat.rows[0],

        territoires:
            territoiresResultat.rows,

        activiteRecente: {

            demandes:
                dernieresDemandesResultat.rows,

            publications:
                dernieresPublicationsResultat.rows
        }
    };
}
async function soumettrePublicationADiasporaDatabase(
    publicationId,
    personneId,
    organisationId,
    tenantCode
) {

    const resultat =
        await executerRequete(
            `
            UPDATE publications pub

            SET
                statut_diffusion_diaspora =
                    'SOUMISE',

                date_soumission_diaspora =
                    CURRENT_TIMESTAMP,

                validee_par_sateer =
                    NULL,

                rejetee_par_sateer =
                    NULL,

                motif_rejet_diaspora =
                    NULL,

                date_rejet_diaspora =
                    NULL

            FROM tenants t

            WHERE
                pub.id = $1

                AND pub.organisation_id = $3

                AND pub.tenant_id = t.id

                AND t.code = $4

                AND pub.statut = 'PUBLIEE'

                AND pub.statut_diffusion_diaspora
                    IN (
                        'NON_DEMANDEE',
                        'REJETEE'
                    )

                AND EXISTS (

                    SELECT 1

                    FROM relations_personne_organisation r

                    WHERE
                        r.personne_id = $2

                        AND r.organisation_id = $3

                        AND r.type IN (
                            'AGENT',
                            'RESPONSABLE'
                        )
                )

            RETURNING
                pub.id,
                pub.organisation_id,
                pub.titre,
                pub.categorie,
                pub.priorite,
                pub.audience_type,
                pub.audience_valeur,
                pub.statut,
                pub.statut_diffusion_diaspora,
                pub.date_soumission_diaspora
            `,
            [
                publicationId,
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
async function listerSoumissionsDiasporaDatabase(
    tenantCode
) {

    const resultat =
        await executerRequete(
            `
            SELECT
                pub.id,
                pub.titre,
                pub.contenu,
                pub.categorie,
                pub.priorite,
                pub.audience_type,
                pub.audience_valeur,
                pub.statut_diffusion_diaspora,
                pub.date_soumission_diaspora,

                o.id AS organisation_id,
                o.nom AS organisation,
                o.type AS organisation_type

            FROM publications pub

            INNER JOIN tenants t
                ON t.id = pub.tenant_id

            INNER JOIN organisations o
                ON o.id = pub.organisation_id

            WHERE
                t.code = $1

                AND pub.statut =
                    'PUBLIEE'

                AND pub.statut_diffusion_diaspora =
                    'SOUMISE'

            ORDER BY
                pub.date_soumission_diaspora ASC,
                pub.id ASC
            `,
            [
                tenantCode
            ]
        );


    return resultat.rows;
}
async function approuverDiffusionDiasporaDatabase(
    publicationId,
    agentSateerId,
    tenantCode
) {

    const resultat =
        await executerRequete(
            `
            UPDATE publications pub

            SET
                statut_diffusion_diaspora =
                    'DIFFUSEE',

                date_diffusion_diaspora =
                    CURRENT_TIMESTAMP,

                validee_par_sateer =
                    $2,

                rejetee_par_sateer =
                    NULL,

                motif_rejet_diaspora =
                    NULL,

                date_rejet_diaspora =
                    NULL

            FROM tenants t

            WHERE
                pub.id = $1

                AND pub.tenant_id = t.id

                AND t.code = $3

                AND pub.statut_diffusion_diaspora =
                    'SOUMISE'

                AND EXISTS (

                    SELECT 1

                    FROM relations_personne_organisation r

                    INNER JOIN organisations o
                        ON o.id =
                            r.organisation_id

                    WHERE
                        r.personne_id = $2

                        AND r.type =
                            'AGENT_SATEER'

                        AND o.type =
                            'SATEER'

                        AND o.tenant_id =
                            t.id
                )

            RETURNING
                pub.id,
                pub.organisation_id,
                pub.titre,
                pub.statut_diffusion_diaspora,
                pub.date_diffusion_diaspora,
                pub.validee_par_sateer
            `,
            [
                publicationId,
                agentSateerId,
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
async function rejeterDiffusionDiasporaDatabase(
    publicationId,
    agentSateerId,
    tenantCode,
    motif
) {

    const resultat =
        await executerRequete(
            `
            UPDATE publications pub

            SET
                statut_diffusion_diaspora =
                    'REJETEE',

                rejetee_par_sateer =
                    $2,

                validee_par_sateer =
                    NULL,

                motif_rejet_diaspora =
                    $4::text,

                date_rejet_diaspora =
                    CURRENT_TIMESTAMP,

                date_diffusion_diaspora =
                    NULL

            FROM tenants t

            WHERE
                pub.id = $1

                AND pub.tenant_id = t.id

                AND t.code = $3

                AND pub.statut_diffusion_diaspora =
                    'SOUMISE'

                AND EXISTS (

                    SELECT 1

                    FROM relations_personne_organisation r

                    INNER JOIN organisations o
                        ON o.id =
                            r.organisation_id

                    WHERE
                        r.personne_id = $2

                        AND r.type =
                            'AGENT_SATEER'

                        AND o.type =
                            'SATEER'

                        AND o.tenant_id =
                            t.id
                )

            RETURNING
                pub.id,
                pub.titre,
                pub.statut_diffusion_diaspora,
                pub.motif_rejet_diaspora,
                pub.rejetee_par_sateer,
                pub.date_rejet_diaspora
            `,
            [
                publicationId,
                agentSateerId,
                tenantCode,
                motif
            ]
        );


    if (
        resultat.rows.length === 0
    ) {
        return undefined;
    }


    return resultat.rows[0];
}

async function listerPublicationsDiasporaPourPersonneDatabase(
    personneId,
    tenantCode
) {

    const resultat =
        await executerRequete(
            `
            SELECT
                pub.id,
                pub.titre,
                pub.contenu,
                pub.categorie,
                pub.priorite,
                pub.audience_type,
                pub.audience_valeur,
                pub.medias,
                pub.date_publication,
                pub.date_diffusion_diaspora,
                pub.statut_diffusion_diaspora,

                source.id AS organisation_id,
                source.nom AS organisation,
                source.type AS organisation_type

            FROM publications pub

            INNER JOIN tenants t
                ON t.id = pub.tenant_id

            INNER JOIN organisations source
                ON source.id =
                    pub.organisation_id

            INNER JOIN personnes personne
                ON personne.id = $1

            LEFT JOIN territories territoire
                ON territoire.id =
                    personne.residence_territory_id

            WHERE
                t.code = $2

                AND pub.statut =
                    'PUBLIEE'

                AND pub.statut_diffusion_diaspora =
                    'DIFFUSEE'

                AND (

                    pub.audience_type = 'TOUS'

                    OR

                    (
                        pub.audience_type =
                            'DEPARTEMENT'

                        AND (
                            pub.audience_valeur =
                                territoire.nom

                            OR

                            pub.audience_valeur =
                                personne.departement
                        )
                    )

                    OR

                    (
                        pub.audience_type =
                            'PROFIL'

                        AND pub.audience_valeur =
                            personne.profil
                    )

                    OR

                    (
                        pub.audience_type =
                            'ASSOCIATION'

                        AND EXISTS (

                            SELECT 1

                            FROM relations_personne_organisation r

                            INNER JOIN organisations association
                                ON association.id =
                                    r.organisation_id

                            WHERE
                                r.personne_id =
                                    personne.id

                                AND (
                                    pub.audience_valeur =
                                        association.nom

                                    OR

                                    pub.audience_valeur =
                                        association.id::text
                                )
                        )
                    )
                )

            ORDER BY

                CASE pub.priorite

                    WHEN 'URGENTE'
                        THEN 1

                    WHEN 'IMPORTANTE'
                        THEN 2

                    ELSE 3

                END,

                pub.date_diffusion_diaspora DESC,

                pub.id DESC
            `,
            [
                personneId,
                tenantCode
            ]
        );


    return resultat.rows;
}
async function obtenirMonSateerDatabase(
    personneId,
    tenantCode
) {

    // =====================================================
    // PERSONNE
    // =====================================================

    const personneResultat =
        await executerRequete(
            `
            SELECT
                p.id,
                p.prenom,
                p.nom,
                p.profil,

                c.nom AS pays,

                tr.nom AS territoire

            FROM personnes p

            LEFT JOIN countries c
                ON c.id =
                    p.residence_country_id

            LEFT JOIN territories tr
                ON tr.id =
                    p.residence_territory_id

            WHERE
                p.id = $1
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


    // =====================================================
    // TENANT
    // =====================================================

    const tenantResultat =
        await executerRequete(
            `
            SELECT
                id,
                code,
                nom
            FROM tenants
            WHERE code = $1
            `,
            [
                tenantCode
            ]
        );


    if (
        tenantResultat.rows.length === 0
    ) {
        return undefined;
    }


    // =====================================================
    // EXPÉRIENCES ACTIVES
    // =====================================================

    const experiencesResultat =
        await executerRequete(
            `
            SELECT
                e.id,
                e.code,
                e.nom,
                e.description,
                e.type,
                e.ordre

            FROM experience_activations ea

            INNER JOIN tenants t
                ON t.id =
                    ea.tenant_id

            INNER JOIN experiences e
                ON e.id =
                    ea.experience_id

            WHERE
                ea.personne_id = $1

                AND t.code = $2

                AND ea.statut =
                    'ACTIVE'

                AND e.actif =
                    TRUE

            ORDER BY
                e.ordre ASC,
                e.nom ASC
            `,
            [
                personneId,
                tenantCode
            ]
        );


    // =====================================================
    // DEMANDES RÉCENTES
    // =====================================================

    const demandesResultat =
        await executerRequete(
            `
            SELECT
                d.id,
                d.objet,
                d.categorie,
                d.statut,
                d.priorite,
                d.date_creation,
                d.date_modification,

                o.nom AS organisation,
                o.type AS organisation_type

            FROM demandes d

            INNER JOIN tenants t
                ON t.id =
                    d.tenant_id

            INNER JOIN organisations o
                ON o.id =
                    d.organisation_id

            WHERE
                d.personne_id = $1

                AND t.code = $2

            ORDER BY
                d.date_modification DESC,
                d.id DESC

            LIMIT 5
            `,
            [
                personneId,
                tenantCode
            ]
        );


    // =====================================================
    // NOTIFICATIONS
    // =====================================================

    const notificationsResultat =
        await executerRequete(
            `
            SELECT
                n.id,
                n.type,
                n.titre,
                n.message,
                n.reference_type,
                n.reference_id,
                n.statut,
                n.date_creation,

                o.nom AS organisation

            FROM notifications n

            INNER JOIN tenants t
                ON t.id =
                    n.tenant_id

            LEFT JOIN organisations o
                ON o.id =
                    n.organisation_id

            WHERE
                n.personne_id = $1

                AND t.code = $2

            ORDER BY
                CASE n.statut
                    WHEN 'NON_LUE'
                        THEN 1
                    ELSE 2
                END,

                n.date_creation DESC,

                n.id DESC

            LIMIT 10
            `,
            [
                personneId,
                tenantCode
            ]
        );


    // =====================================================
    // COMPTEUR NOTIFICATIONS NON LUES
    // =====================================================

    const compteurNotificationsResultat =
        await executerRequete(
            `
            SELECT
                COUNT(*) AS non_lues

            FROM notifications n

            INNER JOIN tenants t
                ON t.id =
                    n.tenant_id

            WHERE
                n.personne_id = $1

                AND t.code = $2

                AND n.statut =
                    'NON_LUE'
            `,
            [
                personneId,
                tenantCode
            ]
        );


    return {

        personne:
            personneResultat.rows[0],

        tenant:
            tenantResultat.rows[0],

        experiences:
            experiencesResultat.rows,

        demandes:
            demandesResultat.rows,

        notifications:
            notificationsResultat.rows,

        compteurs: {

            experiences:
                experiencesResultat.rows.length,

            demandes:
                demandesResultat.rows.length,

            notificationsNonLues:
                compteurNotificationsResultat
                    .rows[0]
                    .non_lues
        }
    };
}
async function listerPublicationsAmbassadePourPersonneDatabase(
    personneId,
    organisationId,
    tenantCode
) {

    const resultat =
        await executerRequete(
            `
            SELECT
                pub.id,
                pub.titre,
                pub.contenu,
                pub.categorie,
                pub.priorite,
                pub.audience_type,
                pub.audience_valeur,
                pub.medias,
                pub.date_publication,

                o.id AS organisation_id,
                o.nom AS organisation,
                o.type AS organisation_type

            FROM publications pub

            INNER JOIN tenants t
                ON t.id = pub.tenant_id

            INNER JOIN organisations o
                ON o.id = pub.organisation_id

            INNER JOIN personnes p
                ON p.id = $1

            LEFT JOIN territories tr
                ON tr.id =
                    p.residence_territory_id

            WHERE
                pub.organisation_id = $2

                AND t.code = $3

                AND o.type = 'AMBASSADE'

                AND pub.statut = 'PUBLIEE'

                AND (

                    pub.audience_type = 'TOUS'

                    OR

                    (
                        pub.audience_type = 'DEPARTEMENT'

                        AND (
                            pub.audience_valeur = tr.nom

                            OR

                            pub.audience_valeur = p.departement
                        )
                    )

                    OR

                    (
                        pub.audience_type = 'PROFIL'

                        AND pub.audience_valeur = p.profil
                    )
                )

            ORDER BY

                CASE pub.priorite

                    WHEN 'URGENTE'
                        THEN 1

                    WHEN 'IMPORTANTE'
                        THEN 2

                    ELSE 3

                END,

                pub.date_publication DESC,

                pub.id DESC
            `,
            [
                personneId,
                organisationId,
                tenantCode
            ]
        );


    return resultat.rows;
}
async function obtenirContexteIASecretariatDatabase(
    demandeId,
    organisationId,
    tenantCode
) {

    // =====================================================
    // DEMANDE
    // =====================================================

    const demandeResultat =
        await executerRequete(
            `
            SELECT
                d.id,
                d.categorie,
                d.objet,
                d.description,
                d.statut,
                d.priorite,
                d.date_creation,

                citoyen.id AS personne_id,
                citoyen.prenom,
                citoyen.nom,
                citoyen.profil,

                territoire.nom AS territoire,

                o.id AS organisation_id,
                o.nom AS organisation

            FROM demandes d

            INNER JOIN tenants t
                ON t.id = d.tenant_id

            INNER JOIN organisations o
                ON o.id = d.organisation_id
                AND o.tenant_id = t.id

            INNER JOIN personnes citoyen
                ON citoyen.id = d.personne_id

            LEFT JOIN territories territoire
                ON territoire.id =
                    citoyen.residence_territory_id

            WHERE
                d.id = $1

                AND d.organisation_id = $2

                AND t.code = $3
            `,
            [
                demandeId,
                organisationId,
                tenantCode
            ]
        );


    if (
        demandeResultat.rows.length === 0
    ) {
        return undefined;
    }


    const demande =
        demandeResultat.rows[0];


    // =====================================================
    // CONFIGURATION IA
    // =====================================================

    const configurationResultat =
        await executerRequete(
            `
            SELECT
                ai.id,
                ai.code,
                ai.nom,
                ai.use_case,
                ai.actif,
                ai.human_validation_required,
                ai.configuration

            FROM ai_configurations ai

            INNER JOIN tenants t
                ON t.id = ai.tenant_id

            WHERE
                ai.organisation_id = $1

                AND t.code = $2

                AND ai.use_case = 'SECRETARIAT'

                AND ai.actif = TRUE

            ORDER BY
                ai.id ASC

            LIMIT 1
            `,
            [
                organisationId,
                tenantCode
            ]
        );


    if (
        configurationResultat.rows.length === 0
    ) {
        return undefined;
    }


    // =====================================================
    // CONNAISSANCES VALIDÉES
    // =====================================================

    const connaissancesResultat =
        await executerRequete(
            `
            SELECT
                ka.id,
                ka.code,
                ka.titre,
                ka.contenu,
                ka.langue,
                ka.version,
                ka.statut,

                ks.code AS source_code,
                ks.nom AS source_nom,
                ks.type AS source_type

            FROM knowledge_articles ka

            INNER JOIN knowledge_sources ks
                ON ks.id =
                    ka.knowledge_source_id

            INNER JOIN tenants t
                ON t.id =
                    ks.tenant_id

            WHERE
                ks.organisation_id = $1

                AND t.code = $2

                AND ks.actif = TRUE

                AND ka.statut = 'VALIDE'

                AND (
                    ka.date_debut_validite IS NULL

                    OR

                    ka.date_debut_validite <=
                        CURRENT_TIMESTAMP
                )

                AND (
                    ka.date_fin_validite IS NULL

                    OR

                    ka.date_fin_validite >
                        CURRENT_TIMESTAMP
                )

                AND (
                    ka.code ILIKE
                        $3::text || '%'

                    OR

                    ka.titre ILIKE
                        '%' || $3::text || '%'
                )

            ORDER BY
                ka.version DESC,
                ka.id DESC
            `,
            [
                organisationId,
                tenantCode,
                demande.categorie
            ]
        );


    return {

        demande:
            demande,

        configurationIA:
            configurationResultat.rows[0],

        connaissances:
            connaissancesResultat.rows
    };
}
async function obtenirContexteIACitoyenDatabase(
    personneId,
    organisationId,
    tenantCode
) {

    // =====================================================
    // PERSONNE + ORGANISATION
    // =====================================================

    const contexteResultat =
        await executerRequete(
            `
            SELECT
                p.id AS personne_id,
                p.prenom,
                p.nom,

                o.id AS organisation_id,
                o.nom AS organisation,

                t.id AS tenant_id,
                t.code AS tenant_code

            FROM personnes p

            CROSS JOIN organisations o

            INNER JOIN tenants t
                ON t.id = o.tenant_id

            WHERE
                p.id = $1

                AND o.id = $2

                AND t.code = $3
            `,
            [
                personneId,
                organisationId,
                tenantCode
            ]
        );


    if (
        contexteResultat.rows.length === 0
    ) {
        return undefined;
    }


    // =====================================================
    // CONFIGURATION IA CITOYEN
    // =====================================================

    const configurationResultat =
        await executerRequete(
            `
            SELECT
                ai.id,
                ai.code,
                ai.nom,
                ai.use_case,
                ai.actif,
                ai.human_validation_required,
                ai.configuration

            FROM ai_configurations ai

            INNER JOIN tenants t
                ON t.id = ai.tenant_id

            WHERE
                ai.organisation_id = $1

                AND t.code = $2

                AND ai.use_case =
                    'CITIZEN_ASSISTANT'

                AND ai.actif = TRUE

            ORDER BY
                ai.id ASC

            LIMIT 1
            `,
            [
                organisationId,
                tenantCode
            ]
        );


    if (
        configurationResultat.rows.length === 0
    ) {
        return undefined;
    }


    // =====================================================
    // CONNAISSANCES VALIDÉES DE L'INSTITUTION
    // =====================================================

    const connaissancesResultat =
        await executerRequete(
            `
            SELECT
                ka.id,
                ka.code,
                ka.titre,
                ka.contenu,
                ka.langue,
                ka.version,
                ka.statut,

                ks.code AS source_code,
                ks.nom AS source_nom,
                ks.type AS source_type

            FROM knowledge_articles ka

            INNER JOIN knowledge_sources ks
                ON ks.id =
                    ka.knowledge_source_id

            INNER JOIN tenants t
                ON t.id =
                    ks.tenant_id

            WHERE
                ks.organisation_id = $1

                AND t.code = $2

                AND ks.actif = TRUE

                AND ka.statut = 'VALIDE'

                AND (
                    ka.date_debut_validite IS NULL

                    OR

                    ka.date_debut_validite <=
                        CURRENT_TIMESTAMP
                )

                AND (
                    ka.date_fin_validite IS NULL

                    OR

                    ka.date_fin_validite >
                        CURRENT_TIMESTAMP
                )

            ORDER BY
                ka.version DESC,
                ka.id DESC
            `,
            [
                organisationId,
                tenantCode
            ]
        );


    return {

        contexte:
            contexteResultat.rows[0],

        configurationIA:
            configurationResultat.rows[0],

        connaissances:
            connaissancesResultat.rows
    };
}
async function obtenirAnalyticsConsulatDatabase(
    organisationId,
    tenantCode
) {

    // =====================================================
    // VÉRIFIER LE CONSULAT
    // =====================================================

    const organisationResultat =
        await executerRequete(
            `
            SELECT
                o.id,
                o.nom,
                o.type,
                t.id AS tenant_id,
                t.code AS tenant_code

            FROM organisations o

            INNER JOIN tenants t
                ON t.id = o.tenant_id

            WHERE
                o.id = $1
                AND t.code = $2
                AND o.type = 'CONSULAT'
            `,
            [
                organisationId,
                tenantCode
            ]
        );


    if (
        organisationResultat.rows.length === 0
    ) {
        return undefined;
    }


    // =====================================================
    // INDICATEURS GLOBAUX
    // =====================================================

    const globalResultat =
        await executerRequete(
            `
            SELECT

                COUNT(*) FILTER (
                    WHERE ae.event_type = 'VIEW'
                ) AS vues_totales,

                COUNT(
                    DISTINCT ae.personne_id
                ) FILTER (
                    WHERE ae.event_type = 'VIEW'
                ) AS personnes_uniques,

                COUNT(*) FILTER (
                    WHERE ae.event_type = 'CLICK'
                ) AS clics,

                COUNT(*) FILTER (
                    WHERE ae.event_type = 'INTEREST'
                ) AS interets,

                COUNT(*) FILTER (
                    WHERE ae.event_type = 'CONTACT_REQUEST'
                ) AS demandes_contact,

                COUNT(*) FILTER (
                    WHERE ae.event_type = 'REGISTRATION'
                ) AS inscriptions,

                COUNT(*) FILTER (
                    WHERE ae.event_type = 'CONVERSION'
                ) AS conversions

            FROM analytics_events ae

            INNER JOIN tenants t
                ON t.id = ae.tenant_id

            WHERE
                ae.organisation_id = $1
                AND t.code = $2
            `,
            [
                organisationId,
                tenantCode
            ]
        );


    // =====================================================
    // ANALYTICS PAR PUBLICATION
    // =====================================================

    const publicationsResultat =
        await executerRequete(
            `
            SELECT
                p.id,
                p.titre,
                p.categorie,
                p.priorite,
                p.statut_diffusion_diaspora,

                COUNT(ae.id) FILTER (
                    WHERE ae.event_type = 'VIEW'
                ) AS vues,

                COUNT(
                    DISTINCT ae.personne_id
                ) FILTER (
                    WHERE ae.event_type = 'VIEW'
                ) AS vues_uniques,

                COUNT(ae.id) FILTER (
                    WHERE ae.event_type = 'CLICK'
                ) AS clics,

                COUNT(ae.id) FILTER (
                    WHERE ae.event_type = 'INTEREST'
                ) AS interets,

                COUNT(ae.id) FILTER (
                    WHERE ae.event_type = 'CONTACT_REQUEST'
                ) AS demandes_contact

            FROM publications p

            INNER JOIN tenants t
                ON t.id = p.tenant_id

            LEFT JOIN analytics_events ae
                ON ae.publication_id = p.id
                AND ae.organisation_id = p.organisation_id
                AND ae.tenant_id = p.tenant_id

            WHERE
                p.organisation_id = $1
                AND t.code = $2

            GROUP BY
                p.id,
                p.titre,
                p.categorie,
                p.priorite,
                p.statut_diffusion_diaspora

            ORDER BY
                vues DESC,
                p.id DESC
            `,
            [
                organisationId,
                tenantCode
            ]
        );


    // =====================================================
    // PAR CANAL
    // =====================================================

    const canauxResultat =
        await executerRequete(
            `
            SELECT
                COALESCE(
                    ae.channel,
                    'NON_RENSEIGNE'
                ) AS channel,

                COUNT(*) FILTER (
                    WHERE ae.event_type = 'VIEW'
                ) AS vues,

                COUNT(
                    DISTINCT ae.personne_id
                ) FILTER (
                    WHERE ae.event_type = 'VIEW'
                ) AS vues_uniques

            FROM analytics_events ae

            INNER JOIN tenants t
                ON t.id = ae.tenant_id

            WHERE
                ae.organisation_id = $1
                AND t.code = $2

            GROUP BY
                COALESCE(
                    ae.channel,
                    'NON_RENSEIGNE'
                )

            ORDER BY
                vues DESC,
                channel ASC
            `,
            [
                organisationId,
                tenantCode
            ]
        );


    // =====================================================
    // PAR TERRITOIRE
    // =====================================================

    const territoiresResultat =
        await executerRequete(
            `
            SELECT
                COALESCE(
                    tr.nom,
                    'Non renseigné'
                ) AS territoire,

                COUNT(*) FILTER (
                    WHERE ae.event_type = 'VIEW'
                ) AS vues,

                COUNT(
                    DISTINCT ae.personne_id
                ) FILTER (
                    WHERE ae.event_type = 'VIEW'
                ) AS personnes_uniques

            FROM analytics_events ae

            INNER JOIN tenants t
                ON t.id = ae.tenant_id

            LEFT JOIN territories tr
                ON tr.id = ae.territory_id

            WHERE
                ae.organisation_id = $1
                AND t.code = $2

            GROUP BY
                COALESCE(
                    tr.nom,
                    'Non renseigné'
                )

            ORDER BY
                vues DESC,
                territoire ASC
            `,
            [
                organisationId,
                tenantCode
            ]
        );


    return {

        organisation:
            organisationResultat.rows[0],

        global:
            globalResultat.rows[0],

        publications:
            publicationsResultat.rows,

        canaux:
            canauxResultat.rows,

        territoires:
            territoiresResultat.rows
    };
}
/// =========================================================
// HISTORIQUE D'UNE DEMANDE CITOYEN
// =========================================================

async function listerHistoriqueDemandeCitoyenDatabase(
    demandeId,
    personneId,
    organisationId,
    tenantCode
) {

    const resultat =
        await executerRequete(
            `
            SELECT
                h.id,
                h.demande_id,
                h.ancien_statut,
                h.nouveau_statut,
                h.action,
                h.commentaire,
                h.metadata,
                h.date_action,

                auteur.id AS auteur_id,
                auteur.prenom AS auteur_prenom,
                auteur.nom AS auteur_nom

            FROM demande_history h

            INNER JOIN demandes d
                ON d.id = h.demande_id

            INNER JOIN tenants t
                ON t.id = d.tenant_id

            LEFT JOIN personnes auteur
                ON auteur.id = h.auteur_personne_id

            WHERE
                h.demande_id = $1
                AND d.personne_id = $2
                AND d.organisation_id = $3
                AND t.code = $4

            ORDER BY
                h.date_action ASC,
                h.id ASC
            `,
            [
                demandeId,
                personneId,
                organisationId,
                tenantCode
            ]
        );


    return resultat.rows;
}


// =========================================================
// STRUCTURE INTERNE D'UNE ORGANISATION
// =========================================================
//
// Retourne :
// - l'organisation
// - ses unités internes
// - les personnes affectées à chaque unité
//
// Cette fonction reste générique.
// Elle pourra servir pour :
// - un Consulat
// - une Ambassade
// - un Ministère
// - une entreprise
// - toute organisation SATEER
//
// =========================================================

async function obtenirStructureOrganisationDatabase(
    organisationId,
    tenantCode
) {

    // -----------------------------------------------------
    // 1. Vérifier que l'organisation appartient au tenant
    // -----------------------------------------------------

    const organisationResultat =
        await executerRequete(
            `
            SELECT
                o.id,
                o.nom,
                o.type

            FROM organisations o

            INNER JOIN tenants t
                ON t.id = o.tenant_id

            WHERE
                o.id = $1
                AND t.code = $2

            LIMIT 1
            `,
            [
                organisationId,
                tenantCode
            ]
        );


    if (organisationResultat.rows.length === 0) {

        return null;
    }


    // -----------------------------------------------------
    // 2. Récupérer les unités internes
    // -----------------------------------------------------

    const unitsResultat =
        await executerRequete(
            `
            SELECT
                u.id,
                u.organisation_id,
                u.parent_unit_id,
                u.code,
                u.nom,
                u.type,
                u.actif,
                u.metadata,
                u.date_creation,
                u.date_modification

            FROM organisation_units u

            WHERE
                u.organisation_id = $1
                AND u.actif = TRUE

            ORDER BY
                u.id ASC
            `,
            [
                organisationId
            ]
        );


    // -----------------------------------------------------
    // 3. Récupérer les personnes affectées aux unités
    // -----------------------------------------------------

    const membresResultat =
        await executerRequete(
            `
            SELECT
                r.id AS relation_id,

                r.organisation_unit_id,

                r.role,
                r.principal,
                r.actif,

                p.id AS personne_id,
                p.prenom,
                p.nom

            FROM relations_personne_organisation_unit r

            INNER JOIN personnes p
                ON p.id = r.personne_id

            INNER JOIN organisation_units u
                ON u.id = r.organisation_unit_id

            WHERE
                u.organisation_id = $1
                AND r.actif = TRUE
                AND u.actif = TRUE

            ORDER BY
                u.id ASC,
                r.principal DESC,
                p.prenom ASC,
                p.nom ASC
            `,
            [
                organisationId
            ]
        );

    const capabilitiesResultat =
        await executerRequete(
            `
            SELECT
                uc.organisation_unit_id,
                c.id,
                c.code,
                c.nom,
                c.description,
                uc.configuration
            FROM organisation_unit_capabilities uc
            INNER JOIN capabilities c
                ON c.id = uc.capability_id
            INNER JOIN organisation_units u
                ON u.id = uc.organisation_unit_id
            WHERE
                u.organisation_id = $1
                AND u.actif = TRUE
                AND uc.actif = TRUE
                AND c.actif = TRUE
            ORDER BY
                uc.organisation_unit_id,
                c.nom,
                c.code
            `,
            [organisationId]
        );


    // -----------------------------------------------------
    // 4. Ajouter les membres et capacités à leur unité
    // -----------------------------------------------------

    const units =
        unitsResultat.rows.map(
            (unit) => {

                const membres =
                    membresResultat.rows
                        .filter(
                            (membre) =>
                                Number(membre.organisation_unit_id) === Number(unit.id)
                        )
                        .map(
                            (membre) => ({
                                relationId:
                                    membre.relation_id,

                                personneId:
                                    membre.personne_id,

                                prenom:
                                    membre.prenom,

                                nom:
                                    membre.nom,

                                role:
                                    membre.role,

                                principal:
                                    membre.principal
                            })
                        );

                const capabilities =
                    capabilitiesResultat.rows
                        .filter(
                            (capability) =>
                                Number(capability.organisation_unit_id) === Number(unit.id)
                        )
                        .map(
                            (capability) => ({
                                id: capability.id,
                                code: capability.code,
                                nom: capability.nom,
                                description: capability.description,
                                configuration: capability.configuration
                            })
                        );


                return {
                    ...unit,
                    membres,
                    capabilities
                };
            }
        );


    // -----------------------------------------------------
    // 5. Retour final
    // -----------------------------------------------------

    return {

        organisation:
            organisationResultat.rows[0],

        units
    };
}
// =========================================================
// ADMINISTRATION GÉNÉRIQUE DES UNITÉS ORGANISATIONNELLES
// =========================================================
//
// Ces fonctions ne connaissent aucun métier particulier.
//
// Elles fonctionnent pour :
// - Consulat
// - Ambassade
// - Ministère
// - entreprise
// - association
// - toute organisation SATEER
//
// Une unité peut être rattachée à une autre unité,
// sans profondeur imposée.
//
// =========================================================


// =========================================================
// CRÉER UNE UNITÉ OU SOUS-UNITÉ
// =========================================================

async function creerOrganisationUnitDatabase(
    organisationId,
    tenantCode,
    donnees
) {

    const {
        parentUnitId = null,
        code,
        nom,
        type,
        metadata = {}
    } = donnees;


    // -----------------------------------------------------
    // 1. Vérifier l'organisation et le tenant
    // -----------------------------------------------------

    const organisationResultat =
        await executerRequete(
            `
            SELECT
                o.id

            FROM organisations o

            INNER JOIN tenants t
                ON t.id = o.tenant_id

            WHERE
                o.id = $1
                AND t.code = $2

            LIMIT 1
            `,
            [
                organisationId,
                tenantCode
            ]
        );


    if (organisationResultat.rows.length === 0) {

        return {
            succes: false,
            code: "ORGANISATION_INTROUVABLE"
        };
    }


    // -----------------------------------------------------
    // 2. Vérifier le parent s'il existe
    // -----------------------------------------------------

    if (parentUnitId !== null) {

        const parentResultat =
            await executerRequete(
                `
                SELECT
                    id

                FROM organisation_units

                WHERE
                    id = $1
                    AND organisation_id = $2
                    AND actif = TRUE

                LIMIT 1
                `,
                [
                    parentUnitId,
                    organisationId
                ]
            );


        if (parentResultat.rows.length === 0) {

            return {
                succes: false,
                code: "UNITE_PARENT_INVALIDE"
            };
        }
    }


    // -----------------------------------------------------
    // 3. Vérifier le code dans l'organisation
    // -----------------------------------------------------

    const codeExistant =
        await executerRequete(
            `
            SELECT
                id

            FROM organisation_units

            WHERE
                organisation_id = $1
                AND code = $2

            LIMIT 1
            `,
            [
                organisationId,
                code
            ]
        );


    if (codeExistant.rows.length > 0) {

        return {
            succes: false,
            code: "CODE_UNITE_EXISTANT"
        };
    }


    // -----------------------------------------------------
    // 4. Créer l'unité
    // -----------------------------------------------------

    const resultat =
        await executerRequete(
            `
            INSERT INTO organisation_units (
                organisation_id,
                parent_unit_id,
                code,
                nom,
                type,
                actif,
                metadata
            )

            VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                TRUE,
                $6::jsonb
            )

            RETURNING
                id,
                organisation_id,
                parent_unit_id,
                code,
                nom,
                type,
                actif,
                metadata,
                date_creation,
                date_modification
            `,
            [
                organisationId,
                parentUnitId,
                code,
                nom,
                type,
                JSON.stringify(metadata)
            ]
        );


    return {
        succes: true,
        unite: resultat.rows[0]
    };
}


// =========================================================
// MODIFIER UNE UNITÉ
// =========================================================

async function modifierOrganisationUnitDatabase(
    organisationId,
    unitId,
    tenantCode,
    donnees
) {

    const {
        nom,
        type,
        metadata
    } = donnees;


    // -----------------------------------------------------
    // 1. Vérifier organisation + tenant + unité
    // -----------------------------------------------------

    const uniteResultat =
        await executerRequete(
            `
            SELECT
                u.id

            FROM organisation_units u

            INNER JOIN organisations o
                ON o.id = u.organisation_id

            INNER JOIN tenants t
                ON t.id = o.tenant_id

            WHERE
                u.id = $1
                AND u.organisation_id = $2
                AND t.code = $3
                AND u.actif = TRUE

            LIMIT 1
            `,
            [
                unitId,
                organisationId,
                tenantCode
            ]
        );


    if (uniteResultat.rows.length === 0) {

        return {
            succes: false,
            code: "UNITE_INTROUVABLE"
        };
    }


    // -----------------------------------------------------
    // 2. Modifier uniquement les champs fournis
    // -----------------------------------------------------

    const resultat =
        await executerRequete(
            `
            UPDATE organisation_units

            SET
                nom =
                    COALESCE(
                        $3,
                        nom
                    ),

                type =
                    COALESCE(
                        $4,
                        type
                    ),

                metadata =
                    CASE
                        WHEN $5::jsonb IS NULL
                            THEN metadata
                        ELSE $5::jsonb
                    END,

                date_modification =
                    CURRENT_TIMESTAMP

            WHERE
                id = $1
                AND organisation_id = $2

            RETURNING
                id,
                organisation_id,
                parent_unit_id,
                code,
                nom,
                type,
                actif,
                metadata,
                date_creation,
                date_modification
            `,
            [
                unitId,
                organisationId,
                nom ?? null,
                type ?? null,
                metadata === undefined
                    ? null
                    : JSON.stringify(metadata)
            ]
        );


    return {
        succes: true,
        unite: resultat.rows[0]
    };
}


// =========================================================
// DÉPLACER UNE UNITÉ
// =========================================================

async function deplacerOrganisationUnitDatabase(
    organisationId,
    unitId,
    tenantCode,
    nouveauParentUnitId
) {

    // -----------------------------------------------------
    // 1. Vérifier l'unité
    // -----------------------------------------------------

    const uniteResultat =
        await executerRequete(
            `
            SELECT
                u.id

            FROM organisation_units u

            INNER JOIN organisations o
                ON o.id = u.organisation_id

            INNER JOIN tenants t
                ON t.id = o.tenant_id

            WHERE
                u.id = $1
                AND u.organisation_id = $2
                AND t.code = $3
                AND u.actif = TRUE

            LIMIT 1
            `,
            [
                unitId,
                organisationId,
                tenantCode
            ]
        );


    if (uniteResultat.rows.length === 0) {

        return {
            succes: false,
            code: "UNITE_INTROUVABLE"
        };
    }


    // -----------------------------------------------------
    // 2. Une unité ne peut pas être son propre parent
    // -----------------------------------------------------

    if (
        nouveauParentUnitId !== null
        && Number(nouveauParentUnitId) === Number(unitId)
    ) {

        return {
            succes: false,
            code: "PARENT_IDENTIQUE_UNITE"
        };
    }


    // -----------------------------------------------------
    // 3. Si parent demandé : vérifier même organisation
    // -----------------------------------------------------

    if (nouveauParentUnitId !== null) {

        const parentResultat =
            await executerRequete(
                `
                SELECT
                    id

                FROM organisation_units

                WHERE
                    id = $1
                    AND organisation_id = $2
                    AND actif = TRUE

                LIMIT 1
                `,
                [
                    nouveauParentUnitId,
                    organisationId
                ]
            );


        if (parentResultat.rows.length === 0) {

            return {
                succes: false,
                code: "UNITE_PARENT_INVALIDE"
            };
        }


        // -------------------------------------------------
        // 4. Empêcher les boucles
        //
        // Exemple interdit :
        //
        // A
        // └── B
        //     └── C
        //
        // puis déplacer A dans C.
        // -------------------------------------------------

        const boucleResultat =
            await executerRequete(
                `
                WITH RECURSIVE descendants AS (

                    SELECT
                        id,
                        parent_unit_id

                    FROM organisation_units

                    WHERE
                        parent_unit_id = $1
                        AND organisation_id = $2
                        AND actif = TRUE


                    UNION ALL


                    SELECT
                        enfant.id,
                        enfant.parent_unit_id

                    FROM organisation_units enfant

                    INNER JOIN descendants parent
                        ON enfant.parent_unit_id = parent.id

                    WHERE
                        enfant.organisation_id = $2
                        AND enfant.actif = TRUE
                )

                SELECT
                    id

                FROM descendants

                WHERE
                    id = $3

                LIMIT 1
                `,
                [
                    unitId,
                    organisationId,
                    nouveauParentUnitId
                ]
            );


        if (boucleResultat.rows.length > 0) {

            return {
                succes: false,
                code: "BOUCLE_ORGANISATION_INTERDITE"
            };
        }
    }


    // -----------------------------------------------------
    // 5. Effectuer le déplacement
    // -----------------------------------------------------

    const resultat =
        await executerRequete(
            `
            UPDATE organisation_units

            SET
                parent_unit_id = $3,
                date_modification = CURRENT_TIMESTAMP

            WHERE
                id = $1
                AND organisation_id = $2

            RETURNING
                id,
                organisation_id,
                parent_unit_id,
                code,
                nom,
                type,
                actif,
                metadata,
                date_creation,
                date_modification
            `,
            [
                unitId,
                organisationId,
                nouveauParentUnitId
            ]
        );


    return {
        succes: true,
        unite: resultat.rows[0]
    };
}


// =========================================================
// DÉSACTIVER UNE UNITÉ
// =========================================================

async function desactiverOrganisationUnitDatabase(
    organisationId,
    unitId,
    tenantCode
) {

    // -----------------------------------------------------
    // 1. Vérifier l'unité
    // -----------------------------------------------------

    const uniteResultat =
        await executerRequete(
            `
            SELECT
                u.id

            FROM organisation_units u

            INNER JOIN organisations o
                ON o.id = u.organisation_id

            INNER JOIN tenants t
                ON t.id = o.tenant_id

            WHERE
                u.id = $1
                AND u.organisation_id = $2
                AND t.code = $3
                AND u.actif = TRUE

            LIMIT 1
            `,
            [
                unitId,
                organisationId,
                tenantCode
            ]
        );


    if (uniteResultat.rows.length === 0) {

        return {
            succes: false,
            code: "UNITE_INTROUVABLE"
        };
    }


    // -----------------------------------------------------
    // 2. Empêcher la désactivation si des sous-unités
    //    actives existent encore
    // -----------------------------------------------------

    const enfantsResultat =
        await executerRequete(
            `
            SELECT
                COUNT(*)::integer AS total

            FROM organisation_units

            WHERE
                parent_unit_id = $1
                AND organisation_id = $2
                AND actif = TRUE
            `,
            [
                unitId,
                organisationId
            ]
        );


    if (enfantsResultat.rows[0].total > 0) {

        return {
            succes: false,
            code: "UNITE_CONTIENT_SOUS_UNITES_ACTIVES"
        };
    }


    // -----------------------------------------------------
    // 3. Empêcher la désactivation si des membres actifs
    //    sont encore affectés
    // -----------------------------------------------------

    const membresResultat =
        await executerRequete(
            `
            SELECT
                COUNT(*)::integer AS total

            FROM relations_personne_organisation_unit

            WHERE
                organisation_unit_id = $1
                AND actif = TRUE
            `,
            [
                unitId
            ]
        );


    if (membresResultat.rows[0].total > 0) {

        return {
            succes: false,
            code: "UNITE_CONTIENT_MEMBRES_ACTIFS"
        };
    }


    // -----------------------------------------------------
    // 4. Désactivation logique
    // -----------------------------------------------------

    const resultat =
        await executerRequete(
            `
            UPDATE organisation_units

            SET
                actif = FALSE,
                date_modification = CURRENT_TIMESTAMP

            WHERE
                id = $1
                AND organisation_id = $2

            RETURNING
                id,
                organisation_id,
                parent_unit_id,
                code,
                nom,
                type,
                actif,
                metadata,
                date_creation,
                date_modification
            `,
            [
                unitId,
                organisationId
            ]
        );


    return {
        succes: true,
        unite: resultat.rows[0]
    };
}
// =========================================================
// ADMINISTRATION GÉNÉRIQUE DES MEMBRES D'UNE UNITÉ
// =========================================================
//
// Doctrine :
//
// Personne
//     ↓
// Affectation à une unité
//     ↓
// Rôle configurable
//     ↓
// Permissions
//
// Aucun nom métier particulier n'est connu ici.
//
// "principal" = affectation principale de la personne
// dans cette organisation.
//
// Le responsable d'une unité est déterminé par son rôle,
// pas par le champ "principal".
//
// =========================================================


// =========================================================
// LISTER LES MEMBRES D'UNE UNITÉ
// =========================================================

async function listerMembresOrganisationUnitDatabase(
    organisationId,
    unitId,
    tenantCode
) {

    // -----------------------------------------------------
    // 1. Vérifier l'unité et le tenant
    // -----------------------------------------------------

    const uniteResultat =
        await executerRequete(
            `
            SELECT
                u.id,
                u.organisation_id,
                u.parent_unit_id,
                u.code,
                u.nom,
                u.type,
                u.actif

            FROM organisation_units u

            INNER JOIN organisations o
                ON o.id = u.organisation_id

            INNER JOIN tenants t
                ON t.id = o.tenant_id

            WHERE
                u.id = $1
                AND u.organisation_id = $2
                AND t.code = $3
                AND u.actif = TRUE

            LIMIT 1
            `,
            [
                unitId,
                organisationId,
                tenantCode
            ]
        );


    if (uniteResultat.rows.length === 0) {

        return {
            succes: false,
            code: "UNITE_INTROUVABLE"
        };
    }


    // -----------------------------------------------------
    // 2. Récupérer les membres actifs
    // -----------------------------------------------------

    const membresResultat =
        await executerRequete(
            `
            SELECT
                relation.id AS relation_id,

                relation.personne_id,
                relation.organisation_unit_id,

                relation.role AS role_legacy,
                relation.role_id,

                role_config.code AS role_code,
                role_config.nom AS role_nom,
                role_config.scope AS role_scope,

                relation.principal,
                relation.actif,
                relation.date_debut,
                relation.date_fin,
                relation.metadata,
                relation.date_creation,
                relation.date_modification,

                p.prenom,
                p.nom

            FROM relations_personne_organisation_unit relation

            INNER JOIN personnes p
                ON p.id = relation.personne_id

            LEFT JOIN organisation_roles role_config
                ON role_config.id = relation.role_id

            WHERE
                relation.organisation_unit_id = $1
                AND relation.actif = TRUE

            ORDER BY
                relation.principal DESC,
                p.prenom ASC,
                p.nom ASC
            `,
            [
                unitId
            ]
        );


    return {
        succes: true,
        unite: uniteResultat.rows[0],
        membres: membresResultat.rows
    };
}


// =========================================================
// AFFECTER UNE PERSONNE À UNE UNITÉ
// =========================================================

async function affecterMembreOrganisationUnitDatabase(
    organisationId,
    unitId,
    tenantCode,
    donnees
) {

    const {
        personneId,
        roleId,
        principal = false,
        metadata = {}
    } = donnees;


    const client =
        await obtenirClientDatabase();


    try {

        await client.query("BEGIN");


        // -------------------------------------------------
        // 1. Vérifier l'unité
        // -------------------------------------------------

        const uniteResultat =
            await client.query(
                `
                SELECT
                    u.id

                FROM organisation_units u

                INNER JOIN organisations o
                    ON o.id = u.organisation_id

                INNER JOIN tenants t
                    ON t.id = o.tenant_id

                WHERE
                    u.id = $1
                    AND u.organisation_id = $2
                    AND t.code = $3
                    AND u.actif = TRUE

                LIMIT 1
                `,
                [
                    unitId,
                    organisationId,
                    tenantCode
                ]
            );


        if (uniteResultat.rows.length === 0) {

            await client.query("ROLLBACK");

            return {
                succes: false,
                code: "UNITE_INTROUVABLE"
            };
        }


        // -------------------------------------------------
        // 2. Vérifier que la personne appartient
        //    à l'organisation
        // -------------------------------------------------

        const personneResultat =
            await client.query(
                `
                SELECT
                    p.id,
                    p.prenom,
                    p.nom

                FROM personnes p

                INNER JOIN relations_personne_organisation relation_org
                    ON relation_org.personne_id = p.id

                WHERE
                    p.id = $1
                    AND relation_org.organisation_id = $2

                LIMIT 1
                `,
                [
                    personneId,
                    organisationId
                ]
            );


        if (personneResultat.rows.length === 0) {

            await client.query("ROLLBACK");

            return {
                succes: false,
                code: "PERSONNE_HORS_ORGANISATION"
            };
        }


        // -------------------------------------------------
        // 3. Vérifier le rôle configurable
        // -------------------------------------------------

        const roleResultat =
            await client.query(
                `
                SELECT
                    id,
                    code,
                    nom,
                    scope

                FROM organisation_roles

                WHERE
                    id = $1
                    AND organisation_id = $2
                    AND actif = TRUE
                    AND scope IN (
                        'UNIT',
                        'BOTH'
                    )

                LIMIT 1
                `,
                [
                    roleId,
                    organisationId
                ]
            );


        if (roleResultat.rows.length === 0) {

            await client.query("ROLLBACK");

            return {
                succes: false,
                code: "ROLE_UNITE_INVALIDE"
            };
        }


        // -------------------------------------------------
        // 4. Rechercher une ancienne affectation identique
        // -------------------------------------------------

        const existanteResultat =
            await client.query(
                `
                SELECT
                    id,
                    actif

                FROM relations_personne_organisation_unit

                WHERE
                    personne_id = $1
                    AND organisation_unit_id = $2
                    AND role_id = $3

                LIMIT 1
                `,
                [
                    personneId,
                    unitId,
                    roleId
                ]
            );


        if (
            existanteResultat.rows.length > 0
            && existanteResultat.rows[0].actif === true
        ) {

            await client.query("ROLLBACK");

            return {
                succes: false,
                code: "AFFECTATION_EXISTANTE"
            };
        }


        // -------------------------------------------------
        // 5. Si principal :
        //    retirer le principal aux autres affectations
        //    de cette personne dans la même organisation
        // -------------------------------------------------

        if (principal === true) {

            await client.query(
                `
                UPDATE relations_personne_organisation_unit relation

                SET
                    principal = FALSE,
                    date_modification = CURRENT_TIMESTAMP

                FROM organisation_units unit

                WHERE
                    relation.organisation_unit_id = unit.id
                    AND relation.personne_id = $1
                    AND unit.organisation_id = $2
                    AND relation.actif = TRUE
                `,
                [
                    personneId,
                    organisationId
                ]
            );
        }


        let affectationResultat;


        // -------------------------------------------------
        // 6A. Réactiver une ancienne affectation
        // -------------------------------------------------

        if (existanteResultat.rows.length > 0) {

            affectationResultat =
                await client.query(
                    `
                    UPDATE relations_personne_organisation_unit

                    SET
                        actif = TRUE,
                        principal = $2,
                        date_debut = CURRENT_TIMESTAMP,
                        date_fin = NULL,
                        metadata = $3::jsonb,
                        role = NULL,
                        date_modification = CURRENT_TIMESTAMP

                    WHERE
                        id = $1

                    RETURNING
                        id,
                        personne_id,
                        organisation_unit_id,
                        role,
                        role_id,
                        principal,
                        actif,
                        date_debut,
                        date_fin,
                        metadata,
                        date_creation,
                        date_modification
                    `,
                    [
                        existanteResultat.rows[0].id,
                        principal,
                        JSON.stringify(metadata)
                    ]
                );

        } else {

            // ---------------------------------------------
            // 6B. Nouvelle affectation
            // ---------------------------------------------

            affectationResultat =
                await client.query(
                    `
                    INSERT INTO relations_personne_organisation_unit (
                        personne_id,
                        organisation_unit_id,
                        role,
                        role_id,
                        principal,
                        actif,
                        metadata
                    )

                    VALUES (
                        $1,
                        $2,
                        NULL,
                        $3,
                        $4,
                        TRUE,
                        $5::jsonb
                    )

                    RETURNING
                        id,
                        personne_id,
                        organisation_unit_id,
                        role,
                        role_id,
                        principal,
                        actif,
                        date_debut,
                        date_fin,
                        metadata,
                        date_creation,
                        date_modification
                    `,
                    [
                        personneId,
                        unitId,
                        roleId,
                        principal,
                        JSON.stringify(metadata)
                    ]
                );
        }


        await client.query("COMMIT");


        return {
            succes: true,
            affectation: affectationResultat.rows[0],
            personne: personneResultat.rows[0],
            role: roleResultat.rows[0]
        };


    } catch (erreur) {

        await client.query("ROLLBACK");

        throw erreur;

    } finally {

        client.release();
    }
}


// =========================================================
// MODIFIER UNE AFFECTATION
// =========================================================

async function modifierMembreOrganisationUnitDatabase(
    organisationId,
    unitId,
    relationId,
    tenantCode,
    donnees
) {

    const {
        roleId,
        principal,
        metadata
    } = donnees;


    const client =
        await obtenirClientDatabase();


    try {

        await client.query("BEGIN");


        // -------------------------------------------------
        // 1. Vérifier l'affectation
        // -------------------------------------------------

        const relationResultat =
            await client.query(
                `
                SELECT
                    relation.id,
                    relation.personne_id,
                    relation.organisation_unit_id,
                    relation.role_id

                FROM relations_personne_organisation_unit relation

                INNER JOIN organisation_units unit
                    ON unit.id = relation.organisation_unit_id

                INNER JOIN organisations organisation
                    ON organisation.id = unit.organisation_id

                INNER JOIN tenants tenant
                    ON tenant.id = organisation.tenant_id

                WHERE
                    relation.id = $1
                    AND relation.organisation_unit_id = $2
                    AND unit.organisation_id = $3
                    AND tenant.code = $4
                    AND relation.actif = TRUE
                    AND unit.actif = TRUE

                LIMIT 1
                `,
                [
                    relationId,
                    unitId,
                    organisationId,
                    tenantCode
                ]
            );


        if (relationResultat.rows.length === 0) {

            await client.query("ROLLBACK");

            return {
                succes: false,
                code: "AFFECTATION_INTROUVABLE"
            };
        }


        const relation =
            relationResultat.rows[0];


        let nouveauRoleId =
            relation.role_id;


        // -------------------------------------------------
        // 2. Vérifier le nouveau rôle s'il est fourni
        // -------------------------------------------------

        if (roleId !== undefined) {

            const roleResultat =
                await client.query(
                    `
                    SELECT
                        id

                    FROM organisation_roles

                    WHERE
                        id = $1
                        AND organisation_id = $2
                        AND actif = TRUE
                        AND scope IN (
                            'UNIT',
                            'BOTH'
                        )

                    LIMIT 1
                    `,
                    [
                        roleId,
                        organisationId
                    ]
                );


            if (roleResultat.rows.length === 0) {

                await client.query("ROLLBACK");

                return {
                    succes: false,
                    code: "ROLE_UNITE_INVALIDE"
                };
            }


            nouveauRoleId =
                Number(roleId);


            // ---------------------------------------------
            // Empêcher deux affectations identiques
            // ---------------------------------------------

            const doublonResultat =
                await client.query(
                    `
                    SELECT
                        id

                    FROM relations_personne_organisation_unit

                    WHERE
                        personne_id = $1
                        AND organisation_unit_id = $2
                        AND role_id = $3
                        AND id <> $4

                    LIMIT 1
                    `,
                    [
                        relation.personne_id,
                        unitId,
                        nouveauRoleId,
                        relationId
                    ]
                );


            if (doublonResultat.rows.length > 0) {

                await client.query("ROLLBACK");

                return {
                    succes: false,
                    code: "AFFECTATION_ROLE_EXISTANTE"
                };
            }
        }


        // -------------------------------------------------
        // 3. Si on rend cette affectation principale,
        //    retirer principal aux autres affectations
        // -------------------------------------------------

        if (principal === true) {

            await client.query(
                `
                UPDATE relations_personne_organisation_unit autre

                SET
                    principal = FALSE,
                    date_modification = CURRENT_TIMESTAMP

                FROM organisation_units unit

                WHERE
                    autre.organisation_unit_id = unit.id
                    AND autre.personne_id = $1
                    AND unit.organisation_id = $2
                    AND autre.id <> $3
                    AND autre.actif = TRUE
                `,
                [
                    relation.personne_id,
                    organisationId,
                    relationId
                ]
            );
        }


        // -------------------------------------------------
        // 4. Modifier l'affectation
        // -------------------------------------------------

        const resultat =
            await client.query(
                `
                UPDATE relations_personne_organisation_unit

                SET
                    role_id = $2,

                    role = NULL,

                    principal =
                        CASE
                            WHEN $3::boolean IS NULL
                                THEN principal
                            ELSE $3::boolean
                        END,

                    metadata =
                        CASE
                            WHEN $4::jsonb IS NULL
                                THEN metadata
                            ELSE $4::jsonb
                        END,

                    date_modification =
                        CURRENT_TIMESTAMP

                WHERE
                    id = $1

                RETURNING
                    id,
                    personne_id,
                    organisation_unit_id,
                    role,
                    role_id,
                    principal,
                    actif,
                    date_debut,
                    date_fin,
                    metadata,
                    date_creation,
                    date_modification
                `,
                [
                    relationId,
                    nouveauRoleId,
                    principal === undefined
                        ? null
                        : principal,
                    metadata === undefined
                        ? null
                        : JSON.stringify(metadata)
                ]
            );


        await client.query("COMMIT");


        return {
            succes: true,
            affectation: resultat.rows[0]
        };


    } catch (erreur) {

        await client.query("ROLLBACK");

        throw erreur;

    } finally {

        client.release();
    }
}


// =========================================================
// DÉSACTIVER UNE AFFECTATION
// =========================================================

async function desactiverMembreOrganisationUnitDatabase(
    organisationId,
    unitId,
    relationId,
    tenantCode
) {

    const resultat =
        await executerRequete(
            `
            UPDATE relations_personne_organisation_unit relation

            SET
                actif = FALSE,
                principal = FALSE,
                date_fin = CURRENT_TIMESTAMP,
                date_modification = CURRENT_TIMESTAMP

            FROM organisation_units unit

            INNER JOIN organisations organisation
                ON organisation.id = unit.organisation_id

            INNER JOIN tenants tenant
                ON tenant.id = organisation.tenant_id

            WHERE
                relation.id = $1
                AND relation.organisation_unit_id = $2
                AND relation.organisation_unit_id = unit.id
                AND unit.organisation_id = $3
                AND tenant.code = $4
                AND relation.actif = TRUE

            RETURNING
                relation.id,
                relation.personne_id,
                relation.organisation_unit_id,
                relation.role,
                relation.role_id,
                relation.principal,
                relation.actif,
                relation.date_debut,
                relation.date_fin,
                relation.metadata,
                relation.date_creation,
                relation.date_modification
            `,
            [
                relationId,
                unitId,
                organisationId,
                tenantCode
            ]
        );


    if (resultat.rows.length === 0) {

        return {
            succes: false,
            code: "AFFECTATION_INTROUVABLE"
        };
    }


    return {
        succes: true,
        affectation: resultat.rows[0]
    };
}
// =========================================================
// ADMINISTRATION GÉNÉRIQUE DES CAPABILITIES D'UNE UNITÉ
// =========================================================
//
// Une capability décrit ce qu'une unité peut faire.
//
// Le nom ou le code métier de l'unité ne pilote jamais
// la logique applicative.
//
// =========================================================


// =========================================================
// LISTER LE CATALOGUE DES CAPABILITIES POUR UNITÉS
// =========================================================

async function listerCapabilitiesUnitDatabase(
    organisationId,
    tenantCode
) {

    const organisationResultat =
        await executerRequete(
            `
            SELECT
                o.id

            FROM organisations o

            INNER JOIN tenants t
                ON t.id = o.tenant_id

            WHERE
                o.id = $1
                AND t.code = $2

            LIMIT 1
            `,
            [
                organisationId,
                tenantCode
            ]
        );


    if (organisationResultat.rows.length === 0) {

        return {
            succes: false,
            code: "ORGANISATION_INTROUVABLE"
        };
    }


    const resultat =
        await executerRequete(
            `
            SELECT
                id,
                code,
                nom,
                description,
                scope,
                actif

            FROM capabilities

            WHERE
                actif = TRUE
                AND scope IN (
                    'UNIT',
                    'BOTH'
                )

            ORDER BY
                nom ASC,
                code ASC
            `
        );


    return {
        succes: true,
        capabilities: resultat.rows
    };
}


// =========================================================
// LISTER LES CAPABILITIES D'UNE UNITÉ
// =========================================================

async function listerCapabilitiesOrganisationUnitDatabase(
    organisationId,
    unitId,
    tenantCode
) {

    const uniteResultat =
        await executerRequete(
            `
            SELECT
                u.id,
                u.organisation_id,
                u.parent_unit_id,
                u.code,
                u.nom,
                u.type,
                u.actif

            FROM organisation_units u

            INNER JOIN organisations o
                ON o.id = u.organisation_id

            INNER JOIN tenants t
                ON t.id = o.tenant_id

            WHERE
                u.id = $1
                AND u.organisation_id = $2
                AND t.code = $3
                AND u.actif = TRUE

            LIMIT 1
            `,
            [
                unitId,
                organisationId,
                tenantCode
            ]
        );


    if (uniteResultat.rows.length === 0) {

        return {
            succes: false,
            code: "UNITE_INTROUVABLE"
        };
    }


    const capabilitiesResultat =
        await executerRequete(
            `
            SELECT
                uc.id AS relation_id,

                c.id AS capability_id,
                c.code,
                c.nom,
                c.description,
                c.scope,

                uc.actif,
                uc.configuration,
                uc.date_activation,
                uc.date_desactivation,
                uc.date_modification

            FROM organisation_unit_capabilities uc

            INNER JOIN capabilities c
                ON c.id = uc.capability_id

            WHERE
                uc.organisation_unit_id = $1
                AND uc.actif = TRUE
                AND c.actif = TRUE

            ORDER BY
                c.nom ASC,
                c.code ASC
            `,
            [
                unitId
            ]
        );


    return {
        succes: true,
        unite: uniteResultat.rows[0],
        capabilities: capabilitiesResultat.rows
    };
}


// =========================================================
// ACTIVER UNE CAPABILITY SUR UNE UNITÉ
// =========================================================

async function activerCapabilityOrganisationUnitDatabase(
    organisationId,
    unitId,
    tenantCode,
    capabilityId,
    configuration = {}
) {

    // -----------------------------------------------------
    // 1. Vérifier l'unité
    // -----------------------------------------------------

    const uniteResultat =
        await executerRequete(
            `
            SELECT
                u.id

            FROM organisation_units u

            INNER JOIN organisations o
                ON o.id = u.organisation_id

            INNER JOIN tenants t
                ON t.id = o.tenant_id

            WHERE
                u.id = $1
                AND u.organisation_id = $2
                AND t.code = $3
                AND u.actif = TRUE

            LIMIT 1
            `,
            [
                unitId,
                organisationId,
                tenantCode
            ]
        );


    if (uniteResultat.rows.length === 0) {

        return {
            succes: false,
            code: "UNITE_INTROUVABLE"
        };
    }


    // -----------------------------------------------------
    // 2. Vérifier la capability
    // -----------------------------------------------------

    const capabilityResultat =
        await executerRequete(
            `
            SELECT
                id,
                code,
                nom,
                scope

            FROM capabilities

            WHERE
                id = $1
                AND actif = TRUE
                AND scope IN (
                    'UNIT',
                    'BOTH'
                )

            LIMIT 1
            `,
            [
                capabilityId
            ]
        );


    if (capabilityResultat.rows.length === 0) {

        return {
            succes: false,
            code: "CAPABILITY_UNITE_INVALIDE"
        };
    }


    // -----------------------------------------------------
    // 3. Créer ou réactiver
    // -----------------------------------------------------

    const resultat =
        await executerRequete(
            `
            INSERT INTO organisation_unit_capabilities (
                organisation_unit_id,
                capability_id,
                actif,
                configuration,
                date_activation,
                date_desactivation,
                date_modification
            )

            VALUES (
                $1,
                $2,
                TRUE,
                $3::jsonb,
                CURRENT_TIMESTAMP,
                NULL,
                CURRENT_TIMESTAMP
            )

            ON CONFLICT (
                organisation_unit_id,
                capability_id
            )

            DO UPDATE SET

                actif = TRUE,

                configuration =
                    EXCLUDED.configuration,

                date_activation =
                    CURRENT_TIMESTAMP,

                date_desactivation =
                    NULL,

                date_modification =
                    CURRENT_TIMESTAMP

            RETURNING
                id,
                organisation_unit_id,
                capability_id,
                actif,
                configuration,
                date_activation,
                date_desactivation,
                date_modification
            `,
            [
                unitId,
                capabilityId,
                JSON.stringify(configuration)
            ]
        );


    return {
        succes: true,
        capability:
            capabilityResultat.rows[0],
        affectation:
            resultat.rows[0]
    };
}


// =========================================================
// MODIFIER LA CONFIGURATION D'UNE CAPABILITY
// =========================================================

async function modifierCapabilityOrganisationUnitDatabase(
    organisationId,
    unitId,
    capabilityId,
    tenantCode,
    configuration
) {

    const resultat =
        await executerRequete(
            `
            UPDATE organisation_unit_capabilities uc

            SET
                configuration = $5::jsonb,
                date_modification = CURRENT_TIMESTAMP

            FROM organisation_units u

            INNER JOIN organisations o
                ON o.id = u.organisation_id

            INNER JOIN tenants t
                ON t.id = o.tenant_id

            INNER JOIN capabilities c
                ON c.id = $3

            WHERE
                uc.organisation_unit_id = $2
                AND uc.capability_id = $3

                AND u.id = uc.organisation_unit_id
                AND u.organisation_id = $1

                AND t.code = $4

                AND u.actif = TRUE
                AND uc.actif = TRUE

                AND c.actif = TRUE
                AND c.scope IN (
                    'UNIT',
                    'BOTH'
                )

            RETURNING
                uc.id,
                uc.organisation_unit_id,
                uc.capability_id,
                uc.actif,
                uc.configuration,
                uc.date_activation,
                uc.date_desactivation,
                uc.date_modification
            `,
            [
                organisationId,
                unitId,
                capabilityId,
                tenantCode,
                JSON.stringify(configuration)
            ]
        );


    if (resultat.rows.length === 0) {

        return {
            succes: false,
            code: "CAPABILITY_UNITE_INTROUVABLE"
        };
    }


    return {
        succes: true,
        affectation: resultat.rows[0]
    };
}


// =========================================================
// DÉSACTIVER UNE CAPABILITY D'UNE UNITÉ
// =========================================================

async function desactiverCapabilityOrganisationUnitDatabase(
    organisationId,
    unitId,
    capabilityId,
    tenantCode
) {

    const resultat =
        await executerRequete(
            `
            UPDATE organisation_unit_capabilities uc

            SET
                actif = FALSE,
                date_desactivation = CURRENT_TIMESTAMP,
                date_modification = CURRENT_TIMESTAMP

            FROM organisation_units u

            INNER JOIN organisations o
                ON o.id = u.organisation_id

            INNER JOIN tenants t
                ON t.id = o.tenant_id

            WHERE
                uc.organisation_unit_id = $2
                AND uc.capability_id = $3

                AND u.id = uc.organisation_unit_id
                AND u.organisation_id = $1

                AND t.code = $4

                AND uc.actif = TRUE

            RETURNING
                uc.id,
                uc.organisation_unit_id,
                uc.capability_id,
                uc.actif,
                uc.configuration,
                uc.date_activation,
                uc.date_desactivation,
                uc.date_modification
            `,
            [
                organisationId,
                unitId,
                capabilityId,
                tenantCode
            ]
        );


    if (resultat.rows.length === 0) {

        return {
            succes: false,
            code: "CAPABILITY_UNITE_INTROUVABLE"
        };
    }


    return {
        succes: true,
        affectation: resultat.rows[0]
    };
}
// =========================================================
// ADMINISTRATION GÉNÉRIQUE DES RÔLES ET PERMISSIONS
// =========================================================
//
// Les rôles appartiennent à une organisation.
//
// Les permissions constituent un catalogue canonique global.
//
// Un rôle n'a aucune signification codée en dur dans SATEER.
// Son comportement dépend uniquement des permissions qui
// lui sont associées.
//
// =========================================================


// =========================================================
// LISTER LES RÔLES D'UNE ORGANISATION
// =========================================================

async function roleOrganisationEstProtegeDatabase(
    organisationId,
    roleId,
    tenantCode
) {
    const resultat = await executerRequete(
        `
        SELECT
            r.id,
            r.code,
            r.nom,
            r.metadata,
            (r.metadata @> '{"systemProtected": true}'::jsonb) AS protege
        FROM organisation_roles r
        INNER JOIN organisations o
            ON o.id = r.organisation_id
        INNER JOIN tenants t
            ON t.id = o.tenant_id
        WHERE
            r.id = $1
            AND r.organisation_id = $2
            AND t.code = $3
        LIMIT 1
        `,
        [roleId, organisationId, tenantCode]
    );

    if (resultat.rows.length === 0) {
        return { succes: false, code: "ROLE_INTROUVABLE" };
    }

    return {
        succes: true,
        protege: resultat.rows[0].protege === true,
        role: resultat.rows[0]
    };
}


async function listerRolesOrganisationDatabase(
    organisationId,
    tenantCode
) {

    const resultat =
        await executerRequete(
            `
            SELECT
                r.id,
                r.organisation_id,
                r.code,
                r.nom,
                r.description,
                r.scope,
                r.actif,
                r.metadata,
                r.date_creation,
                r.date_modification,

                COUNT(rel.id)
                    FILTER (
                        WHERE rel.actif = TRUE
                    ) AS affectations_actives

            FROM organisation_roles r

            INNER JOIN organisations o
                ON o.id = r.organisation_id

            INNER JOIN tenants t
                ON t.id = o.tenant_id

            LEFT JOIN relations_personne_organisation_unit rel
                ON rel.role_id = r.id

            WHERE
                r.organisation_id = $1
                AND t.code = $2

            GROUP BY
                r.id

            ORDER BY
                r.actif DESC,
                r.nom ASC,
                r.code ASC
            `,
            [
                organisationId,
                tenantCode
            ]
        );


    return {
        succes: true,
        roles: resultat.rows
    };
}


// =========================================================
// CRÉER UN RÔLE
// =========================================================

async function creerRoleOrganisationDatabase(
    organisationId,
    tenantCode,
    donnees
) {

    const {
        code,
        nom,
        description = null,
        scope = "UNIT",
        metadata = {}
    } = donnees;


    if (
        !code
        || !nom
    ) {

        return {
            succes: false,
            code: "DONNEES_ROLE_INVALIDES"
        };
    }


    if (
        ![
            "ORGANISATION",
            "UNIT",
            "BOTH"
        ].includes(scope)
    ) {

        return {
            succes: false,
            code: "SCOPE_ROLE_INVALIDE"
        };
    }


    const organisationResultat =
        await executerRequete(
            `
            SELECT
                o.id

            FROM organisations o

            INNER JOIN tenants t
                ON t.id = o.tenant_id

            WHERE
                o.id = $1
                AND t.code = $2

            LIMIT 1
            `,
            [
                organisationId,
                tenantCode
            ]
        );


    if (organisationResultat.rows.length === 0) {

        return {
            succes: false,
            code: "ORGANISATION_INTROUVABLE"
        };
    }


    const roleExistant =
        await executerRequete(
            `
            SELECT
                id

            FROM organisation_roles

            WHERE
                organisation_id = $1
                AND code = $2

            LIMIT 1
            `,
            [
                organisationId,
                code.trim().toUpperCase()
            ]
        );


    if (roleExistant.rows.length > 0) {

        return {
            succes: false,
            code: "ROLE_CODE_EXISTANT"
        };
    }


    const resultat =
        await executerRequete(
            `
            INSERT INTO organisation_roles (
                organisation_id,
                code,
                nom,
                description,
                scope,
                actif,
                metadata,
                date_creation,
                date_modification
            )

            VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                TRUE,
                $6::jsonb,
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            )

            RETURNING
                id,
                organisation_id,
                code,
                nom,
                description,
                scope,
                actif,
                metadata,
                date_creation,
                date_modification
            `,
            [
                organisationId,
                code.trim().toUpperCase(),
                nom.trim(),
                description,
                scope,
                JSON.stringify(metadata)
            ]
        );


    return {
        succes: true,
        role: resultat.rows[0]
    };
}


// =========================================================
// MODIFIER UN RÔLE
// =========================================================

async function modifierRoleOrganisationDatabase(
    organisationId,
    roleId,
    tenantCode,
    donnees
) {

    const roleActuel =
        await executerRequete(
            `
            SELECT
                r.*

            FROM organisation_roles r

            INNER JOIN organisations o
                ON o.id = r.organisation_id

            INNER JOIN tenants t
                ON t.id = o.tenant_id

            WHERE
                r.id = $1
                AND r.organisation_id = $2
                AND t.code = $3

            LIMIT 1
            `,
            [
                roleId,
                organisationId,
                tenantCode
            ]
        );


    if (roleActuel.rows.length === 0) {

        return {
            succes: false,
            code: "ROLE_INTROUVABLE"
        };
    }


    const role =
        roleActuel.rows[0];


    const nouveauCode =
        donnees.code !== undefined
            ? donnees.code.trim().toUpperCase()
            : role.code;


    const nouveauNom =
        donnees.nom !== undefined
            ? donnees.nom.trim()
            : role.nom;


    const nouvelleDescription =
        donnees.description !== undefined
            ? donnees.description
            : role.description;


    const nouveauScope =
        donnees.scope !== undefined
            ? donnees.scope
            : role.scope;


    const nouveauMetadata =
        donnees.metadata !== undefined
            ? donnees.metadata
            : role.metadata;


    if (
        !nouveauCode
        || !nouveauNom
    ) {

        return {
            succes: false,
            code: "DONNEES_ROLE_INVALIDES"
        };
    }


    if (
        ![
            "ORGANISATION",
            "UNIT",
            "BOTH"
        ].includes(nouveauScope)
    ) {

        return {
            succes: false,
            code: "SCOPE_ROLE_INVALIDE"
        };
    }


    const doublon =
        await executerRequete(
            `
            SELECT
                id

            FROM organisation_roles

            WHERE
                organisation_id = $1
                AND code = $2
                AND id <> $3

            LIMIT 1
            `,
            [
                organisationId,
                nouveauCode,
                roleId
            ]
        );


    if (doublon.rows.length > 0) {

        return {
            succes: false,
            code: "ROLE_CODE_EXISTANT"
        };
    }


    const resultat =
        await executerRequete(
            `
            UPDATE organisation_roles

            SET
                code = $3,
                nom = $4,
                description = $5,
                scope = $6,
                metadata = $7::jsonb,
                date_modification = CURRENT_TIMESTAMP

            WHERE
                id = $1
                AND organisation_id = $2

            RETURNING
                id,
                organisation_id,
                code,
                nom,
                description,
                scope,
                actif,
                metadata,
                date_creation,
                date_modification
            `,
            [
                roleId,
                organisationId,
                nouveauCode,
                nouveauNom,
                nouvelleDescription,
                nouveauScope,
                JSON.stringify(nouveauMetadata)
            ]
        );


    return {
        succes: true,
        role: resultat.rows[0]
    };
}


// =========================================================
// DÉSACTIVER UN RÔLE
// =========================================================

async function desactiverRoleOrganisationDatabase(
    organisationId,
    roleId,
    tenantCode
) {

    const roleResultat =
        await executerRequete(
            `
            SELECT
                r.id,
                r.code,
                r.nom,
                r.actif

            FROM organisation_roles r

            INNER JOIN organisations o
                ON o.id = r.organisation_id

            INNER JOIN tenants t
                ON t.id = o.tenant_id

            WHERE
                r.id = $1
                AND r.organisation_id = $2
                AND t.code = $3

            LIMIT 1
            `,
            [
                roleId,
                organisationId,
                tenantCode
            ]
        );


    if (roleResultat.rows.length === 0) {

        return {
            succes: false,
            code: "ROLE_INTROUVABLE"
        };
    }


    const affectations =
        await executerRequete(
            `
            SELECT
                COUNT(*)::integer AS total

            FROM relations_personne_organisation_unit

            WHERE
                role_id = $1
                AND actif = TRUE
            `,
            [
                roleId
            ]
        );


    if (
        affectations.rows[0].total > 0
    ) {

        return {
            succes: false,
            code: "ROLE_UTILISE_PAR_AFFECTATIONS_ACTIVES",
            affectationsActives:
                affectations.rows[0].total
        };
    }


    const resultat =
        await executerRequete(
            `
            UPDATE organisation_roles

            SET
                actif = FALSE,
                date_modification = CURRENT_TIMESTAMP

            WHERE
                id = $1
                AND organisation_id = $2

            RETURNING
                id,
                organisation_id,
                code,
                nom,
                description,
                scope,
                actif,
                metadata,
                date_creation,
                date_modification
            `,
            [
                roleId,
                organisationId
            ]
        );


    return {
        succes: true,
        role: resultat.rows[0]
    };
}


// =========================================================
// RÉACTIVER UN RÔLE
// =========================================================

async function reactiverRoleOrganisationDatabase(
    organisationId,
    roleId,
    tenantCode
) {

    const resultat =
        await executerRequete(
            `
            UPDATE organisation_roles r

            SET
                actif = TRUE,
                date_modification = CURRENT_TIMESTAMP

            FROM organisations o

            INNER JOIN tenants t
                ON t.id = o.tenant_id

            WHERE
                r.id = $1
                AND r.organisation_id = $2
                AND o.id = r.organisation_id
                AND t.code = $3

            RETURNING
                r.id,
                r.organisation_id,
                r.code,
                r.nom,
                r.description,
                r.scope,
                r.actif,
                r.metadata,
                r.date_creation,
                r.date_modification
            `,
            [
                roleId,
                organisationId,
                tenantCode
            ]
        );


    if (resultat.rows.length === 0) {

        return {
            succes: false,
            code: "ROLE_INTROUVABLE"
        };
    }


    return {
        succes: true,
        role: resultat.rows[0]
    };
}


// =========================================================
// LISTER LE CATALOGUE GLOBAL DES PERMISSIONS
// =========================================================

async function listerPermissionsDatabase() {

    const resultat =
        await executerRequete(
            `
            SELECT
                id,
                code,
                nom,
                description,
                actif,
                date_creation,
                date_modification

            FROM permissions

            WHERE
                actif = TRUE

            ORDER BY
                nom ASC,
                code ASC
            `
        );


    return {
        succes: true,
        permissions: resultat.rows
    };
}


// =========================================================
// LISTER LES PERMISSIONS D'UN RÔLE
// =========================================================

async function listerPermissionsRoleOrganisationDatabase(
    organisationId,
    roleId,
    tenantCode
) {

    const roleResultat =
        await executerRequete(
            `
            SELECT
                r.id,
                r.code,
                r.nom,
                r.scope,
                r.actif

            FROM organisation_roles r

            INNER JOIN organisations o
                ON o.id = r.organisation_id

            INNER JOIN tenants t
                ON t.id = o.tenant_id

            WHERE
                r.id = $1
                AND r.organisation_id = $2
                AND t.code = $3

            LIMIT 1
            `,
            [
                roleId,
                organisationId,
                tenantCode
            ]
        );


    if (roleResultat.rows.length === 0) {

        return {
            succes: false,
            code: "ROLE_INTROUVABLE"
        };
    }


    const permissionsResultat =
        await executerRequete(
            `
            SELECT
                rp.id AS relation_id,

                p.id AS permission_id,
                p.code,
                p.nom,
                p.description,

                rp.actif,
                rp.configuration,
                rp.date_creation

            FROM role_permissions rp

            INNER JOIN permissions p
                ON p.id = rp.permission_id

            WHERE
                rp.role_id = $1
                AND rp.actif = TRUE
                AND p.actif = TRUE

            ORDER BY
                p.nom ASC,
                p.code ASC
            `,
            [
                roleId
            ]
        );


    return {
        succes: true,
        role: roleResultat.rows[0],
        permissions: permissionsResultat.rows
    };
}


// =========================================================
// AJOUTER / RÉACTIVER UNE PERMISSION SUR UN RÔLE
// =========================================================

async function ajouterPermissionRoleOrganisationDatabase(
    organisationId,
    roleId,
    permissionId,
    tenantCode,
    configuration = {}
) {

    const roleResultat =
        await executerRequete(
            `
            SELECT
                r.id

            FROM organisation_roles r

            INNER JOIN organisations o
                ON o.id = r.organisation_id

            INNER JOIN tenants t
                ON t.id = o.tenant_id

            WHERE
                r.id = $1
                AND r.organisation_id = $2
                AND t.code = $3
                AND r.actif = TRUE

            LIMIT 1
            `,
            [
                roleId,
                organisationId,
                tenantCode
            ]
        );


    if (roleResultat.rows.length === 0) {

        return {
            succes: false,
            code: "ROLE_INTROUVABLE"
        };
    }


    const permissionResultat =
        await executerRequete(
            `
            SELECT
                id,
                code,
                nom

            FROM permissions

            WHERE
                id = $1
                AND actif = TRUE

            LIMIT 1
            `,
            [
                permissionId
            ]
        );


    if (permissionResultat.rows.length === 0) {

        return {
            succes: false,
            code: "PERMISSION_INTROUVABLE"
        };
    }


    const resultat =
        await executerRequete(
            `
            INSERT INTO role_permissions (
                role_id,
                permission_id,
                actif,
                configuration,
                date_creation
            )

            VALUES (
                $1,
                $2,
                TRUE,
                $3::jsonb,
                CURRENT_TIMESTAMP
            )

            ON CONFLICT (
                role_id,
                permission_id
            )

            DO UPDATE SET
                actif = TRUE,
                configuration =
                    EXCLUDED.configuration

            RETURNING
                id,
                role_id,
                permission_id,
                actif,
                configuration,
                date_creation
            `,
            [
                roleId,
                permissionId,
                JSON.stringify(configuration)
            ]
        );


    return {
        succes: true,
        permission:
            permissionResultat.rows[0],
        affectation:
            resultat.rows[0]
    };
}


// =========================================================
// MODIFIER LA CONFIGURATION D'UNE PERMISSION DE RÔLE
// =========================================================

async function modifierPermissionRoleOrganisationDatabase(
    organisationId,
    roleId,
    permissionId,
    tenantCode,
    configuration
) {

    const resultat =
        await executerRequete(
            `
            UPDATE role_permissions rp

            SET
                configuration = $5::jsonb

            FROM organisation_roles r

            INNER JOIN organisations o
                ON o.id = r.organisation_id

            INNER JOIN tenants t
                ON t.id = o.tenant_id

            WHERE
                rp.role_id = $2
                AND rp.permission_id = $3

                AND r.id = rp.role_id
                AND r.organisation_id = $1

                AND t.code = $4

                AND r.actif = TRUE
                AND rp.actif = TRUE

            RETURNING
                rp.id,
                rp.role_id,
                rp.permission_id,
                rp.actif,
                rp.configuration,
                rp.date_creation
            `,
            [
                organisationId,
                roleId,
                permissionId,
                tenantCode,
                JSON.stringify(configuration)
            ]
        );


    if (resultat.rows.length === 0) {

        return {
            succes: false,
            code: "PERMISSION_ROLE_INTROUVABLE"
        };
    }


    return {
        succes: true,
        affectation: resultat.rows[0]
    };
}


// =========================================================
// RETIRER / DÉSACTIVER UNE PERMISSION D'UN RÔLE
// =========================================================

async function desactiverPermissionRoleOrganisationDatabase(
    organisationId,
    roleId,
    permissionId,
    tenantCode
) {

    const resultat =
        await executerRequete(
            `
            UPDATE role_permissions rp

            SET
                actif = FALSE

            FROM organisation_roles r

            INNER JOIN organisations o
                ON o.id = r.organisation_id

            INNER JOIN tenants t
                ON t.id = o.tenant_id

            WHERE
                rp.role_id = $2
                AND rp.permission_id = $3

                AND r.id = rp.role_id
                AND r.organisation_id = $1

                AND t.code = $4

                AND rp.actif = TRUE

            RETURNING
                rp.id,
                rp.role_id,
                rp.permission_id,
                rp.actif,
                rp.configuration,
                rp.date_creation
            `,
            [
                organisationId,
                roleId,
                permissionId,
                tenantCode
            ]
        );


    if (resultat.rows.length === 0) {

        return {
            succes: false,
            code: "PERMISSION_ROLE_INTROUVABLE"
        };
    }


    return {
        succes: true,
        affectation: resultat.rows[0]
    };
}

// =========================================================
// PERMISSIONS EFFECTIVES D'UNE PERSONNE
// =========================================================
//
// Cette fonction récupère les permissions réellement
// accordées par les rôles configurés en base.
//
// Elle distingue :
// - les permissions organisationnelles
// - les permissions propres à chaque unité
//
// Elle ne réalise aucune authentification.
// Elle ne prend aucune décision d'autorisation HTTP.
//
// =========================================================

async function obtenirPermissionsEffectivesDatabase(
    personneId,
    organisationId,
    tenantCode
) {

    // -----------------------------------------------------
    // 1. Vérifier les identifiants
    // -----------------------------------------------------

    const personne =
        Number(personneId);

    const organisation =
        Number(organisationId);

    if (
        !Number.isInteger(personne)
        || personne <= 0
        || !Number.isInteger(organisation)
        || organisation <= 0
        || !tenantCode
    ) {

        return {
            succes: false,
            code: "PARAMETRES_INVALIDES"
        };
    }


    // -----------------------------------------------------
    // 2. Vérifier l'appartenance à l'organisation
    // -----------------------------------------------------

    const appartenance =
        await executerRequete(
            `
            SELECT
                rpo.personne_id,
                rpo.organisation_id

            FROM relations_personne_organisation rpo

            INNER JOIN organisations o
                ON o.id = rpo.organisation_id

            INNER JOIN tenants t
                ON t.id = o.tenant_id

            WHERE
                rpo.personne_id = $1
                AND rpo.organisation_id = $2
                AND t.code = $3

            LIMIT 1
            `,
            [
                personne,
                organisation,
                tenantCode
            ]
        );


    if (appartenance.rows.length === 0) {

        return {
            succes: false,
            code: "PERSONNE_HORS_ORGANISATION"
        };
    }


    // -----------------------------------------------------
    // 3. Permissions des rôles organisationnels
    // -----------------------------------------------------

    const resultatOrganisation =
        await executerRequete(
            `
            SELECT DISTINCT
                p.code

            FROM relations_personne_organisation_roles rel

            INNER JOIN organisation_roles r
                ON r.id = rel.role_id
                AND r.organisation_id = rel.organisation_id

            INNER JOIN role_permissions rp
                ON rp.role_id = r.id

            INNER JOIN permissions p
                ON p.id = rp.permission_id

            WHERE
                rel.personne_id = $1
                AND rel.organisation_id = $2

                AND rel.actif = TRUE
                AND r.actif = TRUE
                AND rp.actif = TRUE
                AND p.actif = TRUE

                AND r.scope IN (
                    'ORGANISATION',
                    'BOTH'
                )

                AND rel.date_debut <= CURRENT_TIMESTAMP

                AND (
                    rel.date_fin IS NULL
                    OR rel.date_fin > CURRENT_TIMESTAMP
                )

            ORDER BY
                p.code
            `,
            [
                personne,
                organisation
            ]
        );


    // -----------------------------------------------------
    // 4. Accès opérationnel délégué nominativement
    // -----------------------------------------------------
    // Une délégation ne confère que la consultation du
    // dashboard opérationnel. Elle ne crée aucun rôle et
    // n'accorde aucune permission de traitement.

    const resultatDelegations =
        await executerRequete(
            `
            SELECT EXISTS (
                SELECT 1
                FROM organisation_dashboard_access_delegations d
                WHERE
                    d.personne_id = $1
                    AND d.organisation_id = $2
                    AND d.actif = TRUE
                    AND d.date_debut <= CURRENT_TIMESTAMP
                    AND (
                        d.date_fin IS NULL
                        OR d.date_fin > CURRENT_TIMESTAMP
                    )
                    AND EXISTS (
                        SELECT 1
                        FROM relations_personne_organisation_roles rel
                        INNER JOIN organisation_roles r
                            ON r.id = rel.role_id
                            AND r.organisation_id = rel.organisation_id
                        WHERE
                            rel.personne_id = d.personne_id
                            AND rel.organisation_id = d.organisation_id
                            AND rel.actif = TRUE
                            AND r.actif = TRUE
                            AND r.scope IN ('ORGANISATION', 'BOTH')
                            AND rel.date_debut <= d.date_debut
                            AND rel.date_debut <= CURRENT_TIMESTAMP
                            AND (rel.date_fin IS NULL OR rel.date_fin > CURRENT_TIMESTAMP)
                    )
            ) AS acces_actif
            `,
            [
                personne,
                organisation
            ]
        );


    // -----------------------------------------------------
    // 5. Permissions des rôles affectés aux unités
    // -----------------------------------------------------

    const resultatUnites =
        await executerRequete(
            `
            SELECT DISTINCT

                u.id AS unite_id,
                u.code AS unite_code,
                u.nom AS unite_nom,

                p.code AS permission_code

            FROM relations_personne_organisation_unit rel

            INNER JOIN organisation_units u
                ON u.id = rel.organisation_unit_id

            INNER JOIN organisation_roles r
                ON r.id = rel.role_id
                AND r.organisation_id = u.organisation_id

            LEFT JOIN role_permissions rp
                ON rp.role_id = r.id
                AND rp.actif = TRUE

            LEFT JOIN permissions p
                ON p.id = rp.permission_id
                AND p.actif = TRUE

            WHERE
                rel.personne_id = $1
                AND u.organisation_id = $2

                AND rel.actif = TRUE
                AND u.actif = TRUE
                AND r.actif = TRUE

                AND r.scope IN (
                    'UNIT',
                    'BOTH'
                )

                AND rel.date_debut <= CURRENT_TIMESTAMP

                AND (
                    rel.date_fin IS NULL
                    OR rel.date_fin > CURRENT_TIMESTAMP
                )

            ORDER BY
                u.id,
                p.code
            `,
            [
                personne,
                organisation
            ]
        );


    // -----------------------------------------------------
    // 5. Organiser les permissions par unité
    // -----------------------------------------------------

    const unitesMap =
        new Map();


    for (
        const ligne of resultatUnites.rows
    ) {

        if (
            !unitesMap.has(ligne.unite_id)
        ) {

            unitesMap.set(
                ligne.unite_id,
                {
                    uniteId: ligne.unite_id,
                    code: ligne.unite_code,
                    nom: ligne.unite_nom,
                    permissions: []
                }
            );
        }


        if (
            ligne.permission_code !== null
        ) {

            unitesMap
                .get(ligne.unite_id)
                .permissions
                .push(ligne.permission_code);
        }
    }


    // -----------------------------------------------------
    // 6. Résultat
    // -----------------------------------------------------

    return {

        succes: true,

        personneId: personne,

        organisationId: organisation,

        permissionsOrganisation: Array.from(
            new Set([
                ...resultatOrganisation.rows.map(
                    ligne => ligne.code
                ),
                ...(resultatDelegations.rows[0]?.acces_actif
                    ? ["VIEW_OPERATIONAL_DASHBOARD"]
                    : [])
            ])
        ).sort(),

        permissionsOrganisationRole:
            resultatOrganisation.rows.map(
                ligne => ligne.code
            ),

        permissionsDelegueesOrganisation:
            resultatDelegations.rows[0]?.acces_actif
                ? ["VIEW_OPERATIONAL_DASHBOARD"]
                : [],

        permissionsParUnite:
            Array.from(unitesMap.values())

    };
}
// =========================================================
// ÉCOSYSTÈME D'UNE ORGANISATION
// =========================================================
//
// Cette fonction retourne automatiquement :
//
// - les organisations reliées
// - les usagers / citoyens reliés
// - les territoires représentés
// - les demandes de rattachement en attente
// - les invitations en attente
// - un résumé pour le dashboard
//
// Exemple :
//
// Consulat Bordeaux
// ├── citoyens
// ├── associations
// ├── partenaires
// ├── territoires
// └── rattachements en attente
//
// La logique reste générique pour toute organisation SATEER.
//
// =========================================================

// =========================================================
// DASHBOARD STRATEGIQUE — VUE CONSUL
// =========================================================
// Cette vue ne retourne que des indicateurs agrégés.
// Aucun nom de citoyen ni dossier individuel n'est exposé.

async function obtenirDashboardStrategiqueConsulatDatabase(
    organisationId,
    tenantCode
) {
    const organisationResultat = await executerRequete(
        `
        SELECT o.id, o.nom, o.type, t.code AS tenant_code
        FROM organisations o
        INNER JOIN tenants t ON t.id = o.tenant_id
        WHERE o.id = $1 AND t.code = $2 AND o.type = 'CONSULAT'
        LIMIT 1
        `,
        [organisationId, tenantCode]
    );

    if (organisationResultat.rows.length === 0) return undefined;

    const [demandesResultat, delaiResultat, evolutionResultat,
        publicationsResultat, diasporaResultat, territoiresResultat,
        categoriesResultat, unitesResultat] = await Promise.all([
        executerRequete(
            `
            SELECT
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE statut = 'NOUVELLE')::int AS nouvelles,
                COUNT(*) FILTER (WHERE statut = 'EN_COURS')::int AS en_cours,
                COUNT(*) FILTER (WHERE statut = 'TRAITEE')::int AS traitees,
                COUNT(*) FILTER (WHERE statut <> 'TRAITEE' AND priorite = 'URGENTE')::int AS urgentes_ouvertes,
                COUNT(*) FILTER (WHERE statut <> 'TRAITEE' AND priorite = 'IMPORTANTE')::int AS importantes_ouvertes,
                COALESCE(
                    ROUND(
                        100.0 * COUNT(*) FILTER (WHERE statut = 'TRAITEE')
                        / NULLIF(COUNT(*), 0),
                        1
                    ),
                    0
                ) AS taux_traitement
            FROM demandes d
            INNER JOIN tenants t ON t.id = d.tenant_id
            WHERE d.organisation_id = $1 AND t.code = $2
            `,
            [organisationId, tenantCode]
        ),
        executerRequete(
            `
            SELECT
                ROUND(
                    AVG(EXTRACT(EPOCH FROM (d.date_cloture - d.date_creation)) / 3600)::numeric,
                    1
                ) AS heures_moyennes,
                COUNT(*)::int AS demandes_mesurees
            FROM demandes d
            INNER JOIN tenants t ON t.id = d.tenant_id
            WHERE
                d.organisation_id = $1
                AND t.code = $2
                AND d.statut = 'TRAITEE'
                AND d.date_cloture IS NOT NULL
            `,
            [organisationId, tenantCode]
        ),
        executerRequete(
            `
            WITH mois AS (
                SELECT generate_series(
                    date_trunc('month', CURRENT_DATE) - INTERVAL '5 months',
                    date_trunc('month', CURRENT_DATE),
                    INTERVAL '1 month'
                ) AS debut
            )
            SELECT
                to_char(m.debut, 'YYYY-MM') AS periode,
                COALESCE(recues.total, 0)::int AS demandes_recues,
                COALESCE(cloturees.total, 0)::int AS demandes_cloturees
            FROM mois m
            LEFT JOIN LATERAL (
                SELECT COUNT(*) AS total
                FROM demandes d
                INNER JOIN tenants t ON t.id = d.tenant_id
                WHERE d.organisation_id = $1 AND t.code = $2
                    AND d.date_creation >= m.debut
                    AND d.date_creation < m.debut + INTERVAL '1 month'
            ) recues ON TRUE
            LEFT JOIN LATERAL (
                SELECT COUNT(*) AS total
                FROM demandes d
                INNER JOIN tenants t ON t.id = d.tenant_id
                WHERE d.organisation_id = $1 AND t.code = $2
                    AND d.statut = 'TRAITEE'
                    AND d.date_cloture >= m.debut
                    AND d.date_cloture < m.debut + INTERVAL '1 month'
            ) cloturees ON TRUE
            ORDER BY m.debut
            `,
            [organisationId, tenantCode]
        ),
        executerRequete(
            `
            SELECT
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE statut = 'PUBLIEE')::int AS publiees,
                COUNT(*) FILTER (WHERE statut_diffusion_diaspora = 'SOUMISE')::int AS soumises_diaspora,
                COUNT(*) FILTER (WHERE statut_diffusion_diaspora = 'DIFFUSEE')::int AS diffusees_diaspora
            FROM publications p
            INNER JOIN tenants t ON t.id = p.tenant_id
            WHERE p.organisation_id = $1 AND t.code = $2
            `,
            [organisationId, tenantCode]
        ),
        executerRequete(
            `
            SELECT COUNT(DISTINCT r.personne_id)::int AS total_usagers
            FROM relations_personne_organisation r
            INNER JOIN organisations o ON o.id = r.organisation_id
            INNER JOIN tenants t ON t.id = o.tenant_id
            WHERE r.organisation_id = $1 AND t.code = $2 AND r.type = 'USAGER'
            `,
            [organisationId, tenantCode]
        ),
        executerRequete(
            `
            SELECT
                COALESCE(tr.nom, p.departement, 'Non renseigné') AS territoire,
                COUNT(DISTINCT p.id)::int AS personnes
            FROM relations_personne_organisation r
            INNER JOIN organisations o ON o.id = r.organisation_id
            INNER JOIN tenants t ON t.id = o.tenant_id
            INNER JOIN personnes p ON p.id = r.personne_id
            LEFT JOIN territories tr ON tr.id = p.residence_territory_id
            WHERE r.organisation_id = $1 AND t.code = $2 AND r.type = 'USAGER'
            GROUP BY COALESCE(tr.nom, p.departement, 'Non renseigné')
            ORDER BY personnes DESC, territoire ASC
            `,
            [organisationId, tenantCode]
        ),
        executerRequete(
            `
            SELECT
                COALESCE(d.categorie, 'Non renseignée') AS categorie,
                COUNT(*)::int AS total
            FROM demandes d
            INNER JOIN tenants t ON t.id = d.tenant_id
            WHERE d.organisation_id = $1 AND t.code = $2
            GROUP BY COALESCE(d.categorie, 'Non renseignée')
            ORDER BY total DESC, categorie ASC
            LIMIT 6
            `,
            [organisationId, tenantCode]
        ),
        executerRequete(
            `
            SELECT COUNT(*)::int AS unites_actives
            FROM organisation_units u
            INNER JOIN organisations o ON o.id = u.organisation_id
            INNER JOIN tenants t ON t.id = o.tenant_id
            WHERE u.organisation_id = $1 AND t.code = $2 AND u.actif = TRUE
            `,
            [organisationId, tenantCode]
        )
    ]);

    return {
        organisation: organisationResultat.rows[0],
        indicateurs: {
            ...demandesResultat.rows[0],
            delai_moyen_heures: delaiResultat.rows[0].heures_moyennes,
            demandes_mesurees: delaiResultat.rows[0].demandes_mesurees,
            usagers: diasporaResultat.rows[0].total_usagers,
            territoires_couverts: territoiresResultat.rows.length,
            publications_total: publicationsResultat.rows[0].total,
            publications_publiees: publicationsResultat.rows[0].publiees,
            publications_soumises_diaspora: publicationsResultat.rows[0].soumises_diaspora,
            publications_diffusees_diaspora: publicationsResultat.rows[0].diffusees_diaspora,
            unites_actives: unitesResultat.rows[0].unites_actives
        },
        evolution_mensuelle: evolutionResultat.rows,
        demandes_par_categorie: categoriesResultat.rows,
        couverture_territoriale: territoiresResultat.rows
    };
}


// =========================================================
// DELEGATIONS D'ACCES AU DASHBOARD OPERATIONNEL
// =========================================================

async function listerDelegationsDashboardOperationnelDatabase(
    organisationId,
    tenantCode
) {
    const resultat = await executerRequete(
        `
        SELECT
            p.id AS personne_id,
            p.prenom,
            p.nom,
            string_agg(DISTINCT r.nom, ' · ' ORDER BY r.nom) AS roles,
            BOOL_OR(EXISTS (
                SELECT 1
                FROM role_permissions rp
                INNER JOIN permissions perm ON perm.id = rp.permission_id
                WHERE rp.role_id = r.id
                    AND rp.actif = TRUE
                    AND perm.actif = TRUE
                    AND perm.code = 'VIEW_OPERATIONAL_DASHBOARD'
            )) AS via_role,
            EXISTS (
                SELECT 1
                FROM organisation_dashboard_access_delegations d
                WHERE d.organisation_id = $1
                    AND d.personne_id = p.id
                    AND d.actif = TRUE
                    AND d.date_debut <= CURRENT_TIMESTAMP
                    AND (d.date_fin IS NULL OR d.date_fin > CURRENT_TIMESTAMP)
                    AND EXISTS (
                        SELECT 1
                        FROM relations_personne_organisation_roles rel_cible
                        INNER JOIN organisation_roles r_cible
                            ON r_cible.id = rel_cible.role_id
                            AND r_cible.organisation_id = rel_cible.organisation_id
                        WHERE rel_cible.personne_id = d.personne_id
                            AND rel_cible.organisation_id = d.organisation_id
                            AND rel_cible.actif = TRUE
                            AND r_cible.actif = TRUE
                            AND r_cible.scope IN ('ORGANISATION', 'BOTH')
                            AND rel_cible.date_debut <= d.date_debut
                            AND rel_cible.date_debut <= CURRENT_TIMESTAMP
                            AND (rel_cible.date_fin IS NULL OR rel_cible.date_fin > CURRENT_TIMESTAMP)
                    )
            ) AS via_delegation
        FROM relations_personne_organisation_roles rel
        INNER JOIN personnes p ON p.id = rel.personne_id
        INNER JOIN organisation_roles r
            ON r.id = rel.role_id AND r.organisation_id = rel.organisation_id
        INNER JOIN organisations o ON o.id = rel.organisation_id
        INNER JOIN tenants t ON t.id = o.tenant_id
        WHERE rel.organisation_id = $1
            AND t.code = $2
            AND rel.actif = TRUE
            AND r.actif = TRUE
            AND rel.date_debut <= CURRENT_TIMESTAMP
            AND (rel.date_fin IS NULL OR rel.date_fin > CURRENT_TIMESTAMP)
        GROUP BY p.id, p.prenom, p.nom
        ORDER BY p.nom, p.prenom, p.id
        `,
        [organisationId, tenantCode]
    );

    return {
        succes: true,
        membres: resultat.rows.map(ligne => {
            const viaRole = ligne.via_role === true;
            const viaDelegation = ligne.via_delegation === true;
            return {
                ...ligne,
                peutConsulter: viaRole || viaDelegation,
                sourceAcces: viaRole ? "ROLE" : (viaDelegation ? "DELEGATION" : "AUCUN")
            };
        })
    };
}


async function accorderAccesDashboardOperationnelDatabase(
    organisationId,
    personneId,
    accordeParPersonneId,
    tenantCode,
    motif = null
) {
    const cible = await executerRequete(
        `
        SELECT p.id
        FROM personnes p
        INNER JOIN relations_personne_organisation_roles rel
            ON rel.personne_id = p.id
        INNER JOIN organisation_roles r
            ON r.id = rel.role_id AND r.organisation_id = rel.organisation_id
        INNER JOIN organisations o ON o.id = rel.organisation_id
        INNER JOIN tenants t ON t.id = o.tenant_id
        WHERE p.id = $1
            AND rel.organisation_id = $2
            AND t.code = $3
            AND rel.actif = TRUE
            AND r.actif = TRUE
            AND r.scope IN ('ORGANISATION', 'BOTH')
            AND rel.date_debut <= CURRENT_TIMESTAMP
            AND (rel.date_fin IS NULL OR rel.date_fin > CURRENT_TIMESTAMP)
        LIMIT 1
        `,
        [personneId, organisationId, tenantCode]
    );

    if (cible.rows.length === 0) {
        return { succes: false, code: "PERSONNE_NON_AFFECTEE_A_L_ORGANISATION" };
    }

    const dejaAutoriseParRole = await executerRequete(
        `
        SELECT EXISTS (
            SELECT 1
            FROM relations_personne_organisation_roles rel
            INNER JOIN organisation_roles r ON r.id = rel.role_id
            INNER JOIN role_permissions rp ON rp.role_id = r.id AND rp.actif = TRUE
            INNER JOIN permissions p ON p.id = rp.permission_id AND p.actif = TRUE
            WHERE rel.personne_id = $1
                AND rel.organisation_id = $2
                AND rel.actif = TRUE
                AND r.actif = TRUE
                AND p.code = 'VIEW_OPERATIONAL_DASHBOARD'
                AND rel.date_debut <= CURRENT_TIMESTAMP
                AND (rel.date_fin IS NULL OR rel.date_fin > CURRENT_TIMESTAMP)
        ) AS deja_autorise
        `,
        [personneId, organisationId]
    );

    if (dejaAutoriseParRole.rows[0].deja_autorise) {
        return { succes: true, dejaAutorise: true, source: "ROLE" };
    }

    await executerRequete(
        `
        UPDATE organisation_dashboard_access_delegations d
        SET
            actif = FALSE,
            date_fin = CURRENT_TIMESTAMP,
            revoked_by_personne_id = $3,
            date_modification = CURRENT_TIMESTAMP
        WHERE d.organisation_id = $1
            AND d.personne_id = $2
            AND d.actif = TRUE
            AND NOT EXISTS (
                SELECT 1
                FROM relations_personne_organisation_roles rel
                INNER JOIN organisation_roles r
                    ON r.id = rel.role_id
                    AND r.organisation_id = rel.organisation_id
                WHERE rel.personne_id = d.personne_id
                    AND rel.organisation_id = d.organisation_id
                    AND rel.actif = TRUE
                    AND r.actif = TRUE
                    AND r.scope IN ('ORGANISATION', 'BOTH')
                    AND rel.date_debut <= d.date_debut
                    AND rel.date_debut <= CURRENT_TIMESTAMP
                    AND (rel.date_fin IS NULL OR rel.date_fin > CURRENT_TIMESTAMP)
            )
        `,
        [organisationId, personneId, accordeParPersonneId]
    );

    const resultat = await executerRequete(
        `
        INSERT INTO organisation_dashboard_access_delegations (
            organisation_id,
            personne_id,
            granted_by_personne_id,
            actif,
            date_debut,
            motif
        )
        VALUES ($1, $2, $3, TRUE, CURRENT_TIMESTAMP, $4)
        ON CONFLICT (organisation_id, personne_id) WHERE actif = TRUE
        DO NOTHING
        RETURNING id, organisation_id, personne_id,
            granted_by_personne_id, actif, date_debut, date_fin, motif
        `,
        [organisationId, personneId, accordeParPersonneId, motif]
    );

    if (resultat.rows.length > 0) {
        return { succes: true, delegation: resultat.rows[0] };
    }

    const delegationExistante = await executerRequete(
        `
        SELECT id, organisation_id, personne_id,
            granted_by_personne_id, actif, date_debut, date_fin, motif
        FROM organisation_dashboard_access_delegations
        WHERE organisation_id = $1 AND personne_id = $2 AND actif = TRUE
        LIMIT 1
        `,
        [organisationId, personneId]
    );

    return { succes: true, dejaAutorise: true, source: "DELEGATION", delegation: delegationExistante.rows[0] || null };
}


async function revoquerAccesDashboardOperationnelDatabase(
    organisationId,
    personneId,
    retireParPersonneId,
    tenantCode
) {
    const resultat = await executerRequete(
        `
        UPDATE organisation_dashboard_access_delegations d
        SET
            actif = FALSE,
            date_fin = CURRENT_TIMESTAMP,
            revoked_by_personne_id = $3,
            date_modification = CURRENT_TIMESTAMP
        FROM organisations o
        INNER JOIN tenants t ON t.id = o.tenant_id
        WHERE d.organisation_id = $1
            AND d.personne_id = $2
            AND o.id = d.organisation_id
            AND t.code = $4
            AND d.actif = TRUE
        RETURNING d.id, d.organisation_id, d.personne_id,
            d.granted_by_personne_id, d.revoked_by_personne_id,
            d.actif, d.date_debut, d.date_fin, d.motif
        `,
        [organisationId, personneId, retireParPersonneId, tenantCode]
    );

    if (resultat.rows.length === 0) {
        return { succes: false, code: "DELEGATION_ACTIVE_INTROUVABLE" };
    }

    return { succes: true, delegation: resultat.rows[0] };
}


async function obtenirEcosystemeOrganisationDatabase(
    organisationId,
    tenantCode
) {

    // =====================================================
    // 1. ORGANISATION PRINCIPALE
    // =====================================================

    const organisationResultat =
        await executerRequete(
            `
            SELECT
                o.id,
                o.nom,
                o.type,
                t.code AS tenant_code

            FROM organisations o

            INNER JOIN tenants t
                ON t.id = o.tenant_id

            WHERE
                o.id = $1
                AND t.code = $2

            LIMIT 1
            `,
            [
                organisationId,
                tenantCode
            ]
        );


    if (
        organisationResultat.rows.length === 0
    ) {

        return null;
    }


    // =====================================================
    // 2. ORGANISATIONS RELIÉES
    // =====================================================
    //
    // Dans notre modèle :
    //
    // Association
    //      ↓
    // COMMUNITY_MEMBER
    //      ↓
    // Consulat
    //
    // source = organisation membre
    // target = institution
    //
    // =====================================================

    const organisationsResultat =
        await executerRequete(
            `
            SELECT
                r.id AS relation_id,

                r.type AS relation_type,
                r.statut AS relation_statut,

                o.id AS organisation_id,
                o.nom,
                o.type,

                r.date_debut

            FROM organisation_relationships r

            INNER JOIN organisations o
                ON o.id = r.source_organisation_id

            INNER JOIN tenants t
                ON t.id = r.tenant_id

            WHERE
                r.target_organisation_id = $1
                AND t.code = $2
                AND r.actif = TRUE
                AND r.statut = 'ACTIVE'

            ORDER BY
                o.type ASC,
                o.nom ASC
            `,
            [
                organisationId,
                tenantCode
            ]
        );


    // =====================================================
    // 3. USAGERS / CITOYENS RELIÉS
    // =====================================================

    const usagersResultat =
        await executerRequete(
            `
            SELECT
                p.id,
                p.prenom,
                p.nom,

                COALESCE(
                    tr.nom,
                    p.departement,
                    'Non renseigné'
                ) AS territoire

            FROM relations_personne_organisation r

            INNER JOIN personnes p
                ON p.id = r.personne_id

            INNER JOIN organisations o
                ON o.id = r.organisation_id

            INNER JOIN tenants t
                ON t.id = o.tenant_id

            LEFT JOIN territories tr
                ON tr.id = p.residence_territory_id

            WHERE
                r.organisation_id = $1
                AND t.code = $2
                AND r.type = 'USAGER'

            ORDER BY
                p.prenom ASC,
                p.nom ASC
            `,
            [
                organisationId,
                tenantCode
            ]
        );


    // =====================================================
    // 4. TERRITOIRES REPRÉSENTÉS
    // =====================================================

    const territoiresResultat =
        await executerRequete(
            `
            SELECT

                COALESCE(
                    tr.nom,
                    p.departement,
                    'Non renseigné'
                ) AS territoire,

                COUNT(
                    DISTINCT p.id
                ) AS personnes

            FROM relations_personne_organisation r

            INNER JOIN personnes p
                ON p.id = r.personne_id

            INNER JOIN organisations o
                ON o.id = r.organisation_id

            INNER JOIN tenants t
                ON t.id = o.tenant_id

            LEFT JOIN territories tr
                ON tr.id = p.residence_territory_id

            WHERE
                r.organisation_id = $1
                AND t.code = $2
                AND r.type = 'USAGER'

            GROUP BY
                COALESCE(
                    tr.nom,
                    p.departement,
                    'Non renseigné'
                )

            ORDER BY
                personnes DESC,
                territoire ASC
            `,
            [
                organisationId,
                tenantCode
            ]
        );


    // =====================================================
    // 5. DEMANDES DE RATTACHEMENT EN ATTENTE
    // =====================================================

    const rattachementsResultat =
        await executerRequete(
            `
            SELECT
                jr.id,

                jr.type_relation,
                jr.statut,
                jr.message,
                jr.date_creation,

                o.id AS organisation_id,
                o.nom,
                o.type

            FROM organisation_join_requests jr

            INNER JOIN organisations o
                ON o.id =
                    jr.organisation_demandeuse_id

            INNER JOIN tenants t
                ON t.id = jr.tenant_id

            WHERE
                jr.organisation_cible_id = $1
                AND t.code = $2
                AND jr.statut = 'EN_ATTENTE'

            ORDER BY
                jr.date_creation DESC
            `,
            [
                organisationId,
                tenantCode
            ]
        );


    // =====================================================
    // 6. INVITATIONS EN ATTENTE
    // =====================================================

    const invitationsResultat =
        await executerRequete(
            `
            SELECT
                i.id,
                i.email,
                i.nom_organisation,
                i.type_relation,
                i.statut,
                i.date_expiration,
                i.date_creation

            FROM organisation_invitations i

            INNER JOIN tenants t
                ON t.id = i.tenant_id

            WHERE
                i.organisation_source_id = $1
                AND t.code = $2
                AND i.statut = 'EN_ATTENTE'

            ORDER BY
                i.date_creation DESC
            `,
            [
                organisationId,
                tenantCode
            ]
        );


    // =====================================================
    // 7. RÉSUMÉ DES ORGANISATIONS
    // =====================================================

    const resumeOrganisationsResultat =
        await executerRequete(
            `
            SELECT
                o.type,

                COUNT(*) AS total

            FROM organisation_relationships r

            INNER JOIN organisations o
                ON o.id = r.source_organisation_id

            INNER JOIN tenants t
                ON t.id = r.tenant_id

            WHERE
                r.target_organisation_id = $1
                AND t.code = $2
                AND r.actif = TRUE
                AND r.statut = 'ACTIVE'

            GROUP BY
                o.type

            ORDER BY
                total DESC,
                o.type ASC
            `,
            [
                organisationId,
                tenantCode
            ]
        );


    // =====================================================
    // 8. RETOUR FINAL
    // =====================================================

    return {

        organisation:
            organisationResultat.rows[0],


        resume: {

            usagers:
                usagersResultat.rows.length,

            organisations:
                organisationsResultat.rows.length,

            territoires:
                territoiresResultat.rows.length,

            rattachementsEnAttente:
                rattachementsResultat.rows.length,

            invitationsEnAttente:
                invitationsResultat.rows.length
        },


        organisations:
            organisationsResultat.rows,


        organisationsParType:
            resumeOrganisationsResultat.rows,


        usagers:
            usagersResultat.rows,


        territoires:
            territoiresResultat.rows,


        rattachementsEnAttente:
            rattachementsResultat.rows,


        invitationsEnAttente:
            invitationsResultat.rows
    };
}
// =========================================================
// EXPORTS
// =========================================================


// =========================================================
// SATEER CORE - DONNEES GENERIQUES DU UNIT WORKSPACE
// =========================================================

async function obtenirUnitesWorkspaceOverviewDatabase(
    organisationId,
    tenantCode
) {
    const resultat = await executerRequete(
        `
        SELECT
            u.id,
            u.organisation_id,
            u.parent_unit_id,
            u.code,
            u.nom,
            u.type,
            u.metadata,

            COALESCE(m.members_count, 0)::integer AS members_count,

            COALESCE(cases.total_cases, 0)::integer AS total_cases,
            COALESCE(cases.new_cases, 0)::integer AS new_cases,
            COALESCE(cases.in_progress_cases, 0)::integer AS in_progress_cases,
            COALESCE(cases.treated_cases, 0)::integer AS treated_cases,
            COALESCE(cases.urgent_cases, 0)::integer AS urgent_cases,

            COALESCE(capabilities.codes, ARRAY[]::text[]) AS capabilities

        FROM organisation_units u

        INNER JOIN organisations o
            ON o.id = u.organisation_id

        INNER JOIN tenants t
            ON t.id = o.tenant_id

        LEFT JOIN LATERAL (
            SELECT COUNT(*)::integer AS members_count
            FROM relations_personne_organisation_unit relation
            WHERE relation.organisation_unit_id = u.id
                AND relation.actif = TRUE
                AND relation.date_debut <= CURRENT_TIMESTAMP
                AND (
                    relation.date_fin IS NULL
                    OR relation.date_fin > CURRENT_TIMESTAMP
                )
        ) m ON TRUE

        LEFT JOIN LATERAL (
            SELECT
                COUNT(*) AS total_cases,
                COUNT(*) FILTER (
                    WHERE d.statut = 'NOUVELLE'
                ) AS new_cases,
                COUNT(*) FILTER (
                    WHERE d.statut = 'EN_COURS'
                ) AS in_progress_cases,
                COUNT(*) FILTER (
                    WHERE d.statut = 'TRAITEE'
                ) AS treated_cases,
                COUNT(*) FILTER (
                    WHERE d.priorite = 'URGENTE'
                        AND d.statut IN ('NOUVELLE', 'EN_COURS')
                ) AS urgent_cases
            FROM demandes d
            INNER JOIN tenants demande_tenant
                ON demande_tenant.id = d.tenant_id
            WHERE d.organisation_id = u.organisation_id
                AND d.destination_unit_id = u.id
                AND demande_tenant.code = $2
        ) cases ON TRUE

        LEFT JOIN LATERAL (
            SELECT ARRAY_AGG(c.code::text ORDER BY c.code) AS codes
            FROM organisation_unit_capabilities uc
            INNER JOIN capabilities c
                ON c.id = uc.capability_id
            WHERE uc.organisation_unit_id = u.id
                AND uc.actif = TRUE
                AND c.actif = TRUE
        ) capabilities ON TRUE

        WHERE
            u.organisation_id = $1
            AND t.code = $2
            AND u.actif = TRUE

        ORDER BY
            u.parent_unit_id NULLS FIRST,
            u.id
        `,
        [Number(organisationId), tenantCode]
    );

    return resultat.rows;
}


async function listerDemandesWorkspaceUnitDatabase(
    organisationId,
    tenantCode,
    unitId,
    includeUnassigned = false,
    statut = null
) {
    const resultat = await executerRequete(
        `
        SELECT
            d.id,
            d.categorie,
            d.objet,
            d.description,
            d.statut,
            d.priorite,
            d.canal,
            d.date_creation,
            d.date_modification,
            d.destination_unit_id,

            destination.code AS destination_code,
            destination.nom AS destination_nom,

            citoyen.id AS personne_id,
            citoyen.prenom,
            citoyen.nom,

            pays.nom AS pays,
            territoire.nom AS territoire,

            agent.id AS assignee_id,
            agent.prenom AS assignee_prenom,
            agent.nom AS assignee_nom,

            o.nom AS organisation

        FROM demandes d

        INNER JOIN tenants t
            ON t.id = d.tenant_id

        INNER JOIN organisations o
            ON o.id = d.organisation_id
            AND o.tenant_id = t.id

        INNER JOIN personnes citoyen
            ON citoyen.id = d.personne_id

        LEFT JOIN countries pays
            ON pays.id = citoyen.residence_country_id

        LEFT JOIN territories territoire
            ON territoire.id = citoyen.residence_territory_id

        LEFT JOIN personnes agent
            ON agent.id = d.assignee_a

        LEFT JOIN organisation_units destination
            ON destination.id = d.destination_unit_id
            AND destination.organisation_id = d.organisation_id

        WHERE
            d.organisation_id = $1
            AND t.code = $2
            AND (
                d.destination_unit_id = $3
                OR (
                    $4::boolean = TRUE
                    AND d.destination_unit_id IS NULL
                    AND d.statut = 'NOUVELLE'
                )
            )
            AND (
                $5::text IS NULL
                OR d.statut = $5::text
            )

        ORDER BY
            CASE d.priorite
                WHEN 'URGENTE' THEN 1
                WHEN 'IMPORTANTE' THEN 2
                ELSE 3
            END,
            d.date_creation ASC
        `,
        [
            Number(organisationId),
            tenantCode,
            Number(unitId),
            includeUnassigned === true,
            statut || null
        ]
    );

    return resultat.rows;
}


async function orienterDemandeWorkspaceUnitDatabase(
    demandeId,
    organisationId,
    tenantCode,
    sourceUnitId,
    destinationUnitId,
    motif,
    orienteePar
) {
    const client = await obtenirClientDatabase();

    try {
        await client.query("BEGIN");

        const demandeResult = await client.query(
            `
            SELECT
                d.id,
                d.destination_unit_id,
                d.statut,
                d.tenant_id
            FROM demandes d
            INNER JOIN organisations o
                ON o.id = d.organisation_id
                AND o.tenant_id = d.tenant_id
            INNER JOIN tenants t
                ON t.id = o.tenant_id
            WHERE
                d.id = $1
                AND d.organisation_id = $2
                AND t.code = $3
            FOR UPDATE
            `,
            [
                Number(demandeId),
                Number(organisationId),
                tenantCode
            ]
        );

        if (demandeResult.rowCount === 0) {
            await client.query("ROLLBACK");
            return { succes: false, code: "DEMANDE_INTROUVABLE" };
        }

        const demande = demandeResult.rows[0];

        if (!["NOUVELLE", "EN_COURS"].includes(demande.statut)) {
            await client.query("ROLLBACK");
            return { succes: false, code: "DOSSIER_NON_ORIENTABLE" };
        }

        const sourceResult = await client.query(
            `
            SELECT
                u.id,
                u.nom,
                EXISTS (
                    SELECT 1
                    FROM organisation_unit_capabilities uc
                    INNER JOIN capabilities c
                        ON c.id = uc.capability_id
                    WHERE uc.organisation_unit_id = u.id
                        AND uc.actif = TRUE
                        AND c.actif = TRUE
                        AND c.code = 'RECEIVE_INCOMING'
                ) AS peut_recevoir_non_oriente,
                COALESCE((
                    SELECT uc.configuration
                    FROM organisation_unit_capabilities uc
                    INNER JOIN capabilities c
                        ON c.id = uc.capability_id
                    WHERE uc.organisation_unit_id = u.id
                        AND uc.actif = TRUE
                        AND c.actif = TRUE
                        AND c.code = 'ROUTE_CASES'
                    LIMIT 1
                ), '{}'::jsonb) AS routing_configuration
            FROM organisation_units u
            INNER JOIN organisations o
                ON o.id = u.organisation_id
            INNER JOIN tenants t
                ON t.id = o.tenant_id
            WHERE
                u.id = $1
                AND u.organisation_id = $2
                AND t.code = $3
                AND u.actif = TRUE
            LIMIT 1
            `,
            [
                Number(sourceUnitId),
                Number(organisationId),
                tenantCode
            ]
        );

        if (sourceResult.rowCount === 0) {
            await client.query("ROLLBACK");
            return { succes: false, code: "UNITE_SOURCE_INTROUVABLE" };
        }

        const source = sourceResult.rows[0];
        const allowedDestinationUnitIds =
            source.routing_configuration
            && source.routing_configuration.allowedDestinationUnitIds;

        if (
            !Array.isArray(allowedDestinationUnitIds)
            || !allowedDestinationUnitIds.map(Number).includes(Number(destinationUnitId))
        ) {
            await client.query("ROLLBACK");
            return { succes: false, code: "DESTINATION_NON_AUTORISEE" };
        }

        if (
            demande.destination_unit_id !== null
            && Number(demande.destination_unit_id) !== Number(sourceUnitId)
        ) {
            await client.query("ROLLBACK");
            return { succes: false, code: "DOSSIER_HORS_UNITE_SOURCE" };
        }

        if (
            demande.destination_unit_id === null
            && !source.peut_recevoir_non_oriente
        ) {
            await client.query("ROLLBACK");
            return { succes: false, code: "UNITE_SOURCE_NON_HABILITEE_A_RECEVOIR" };
        }

        const destinationResult = await client.query(
            `
            SELECT
                u.id,
                u.code,
                u.nom,
                u.type
            FROM organisation_units u
            INNER JOIN organisations o
                ON o.id = u.organisation_id
            INNER JOIN tenants t
                ON t.id = o.tenant_id
            WHERE
                u.id = $1
                AND u.organisation_id = $2
                AND t.code = $3
                AND u.actif = TRUE
                AND u.id <> $4
                AND EXISTS (
                    SELECT 1
                    FROM organisation_unit_capabilities uc
                    INNER JOIN capabilities c
                        ON c.id = uc.capability_id
                    WHERE uc.organisation_unit_id = u.id
                        AND uc.actif = TRUE
                        AND c.actif = TRUE
                        AND c.code IN (
                            'RECEIVE_INCOMING',
                            'TAKE_CASES',
                            'PROCESS_CASES',
                            'RESPOND_CASES'
                        )
                )
            LIMIT 1
            `,
            [
                Number(destinationUnitId),
                Number(organisationId),
                tenantCode,
                Number(sourceUnitId)
            ]
        );

        if (destinationResult.rowCount === 0) {
            await client.query("ROLLBACK");
            return { succes: false, code: "DESTINATION_INVALIDE" };
        }

        const updateResult = await client.query(
            `
            UPDATE demandes
            SET
                destination_unit_id = $1,
                assignee_a = NULL,
                statut = CASE
                    WHEN statut = 'EN_COURS' THEN 'NOUVELLE'
                    ELSE statut
                END,
                orientee_par = $2,
                motif_orientation = $3,
                date_orientation = CURRENT_TIMESTAMP,
                date_modification = CURRENT_TIMESTAMP
            WHERE
                id = $4
                AND organisation_id = $5
            RETURNING
                id,
                objet,
                statut,
                priorite,
                destination_unit_id,
                orientee_par,
                motif_orientation,
                date_orientation
            `,
            [
                Number(destinationUnitId),
                Number(orienteePar),
                motif ? String(motif).trim() : null,
                Number(demandeId),
                Number(organisationId)
            ]
        );

        await client.query(
            `
            INSERT INTO demande_history (
                tenant_id,
                demande_id,
                auteur_personne_id,
                ancien_statut,
                nouveau_statut,
                action,
                commentaire
            )
            VALUES ($1, $2, $3, $4, $5, 'DOSSIER_REORIENTE', $6)
            `,
            [
                demande.tenant_id,
                Number(demandeId),
                Number(orienteePar),
                demande.statut,
                updateResult.rows[0].statut,
                `Dossier réorienté vers l unité ${destinationResult.rows[0].nom}.`
                    + (motif ? ` Motif : ${String(motif).trim()}` : "")
            ]
        );

        await client.query(
            `
            INSERT INTO demande_orientations (
                demande_id,
                ancienne_unit_id,
                nouvelle_unit_id,
                orientee_par,
                motif
            )
            VALUES ($1, $2, $3, $4, $5)
            `,
            [
                Number(demandeId),
                demande.destination_unit_id,
                Number(destinationUnitId),
                Number(orienteePar),
                motif ? String(motif).trim() : null
            ]
        );

        await client.query("COMMIT");

        return {
            succes: true,
            demande: updateResult.rows[0],
            destination: destinationResult.rows[0]
        };
    } catch (erreur) {
        await client.query("ROLLBACK");
        throw erreur;
    } finally {
        client.release();
    }
}



// =========================================================
// CONTEXTE INSTITUTIONNEL DE LA PERSONNE CONNECTEE
// =========================================================
// Retourne uniquement les organisations auxquelles la personne
// est explicitement rattachee dans le tenant demande.
// L'identite provient de la session, jamais du navigateur.
async function listerOrganisationsPersonneDatabase(personneId, tenantCode) {
    const resultat = await executerRequete(
        `
        SELECT DISTINCT
            o.id,
            o.nom,
            o.type,
            t.code AS tenant_code
        FROM relations_personne_organisation rel
        INNER JOIN organisations o
            ON o.id = rel.organisation_id
        INNER JOIN tenants t
            ON t.id = o.tenant_id
        WHERE
            rel.personne_id = $1
            AND t.code = $2
            AND t.actif = TRUE
        ORDER BY o.nom, o.id
        `,
        [Number(personneId), String(tenantCode)]
    );
    return resultat.rows;
}

module.exports = {
    listerOrganisationsPersonneDatabase,
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
    creerDemandeContactPartenaireDatabase,
    creerIntroductionPartenaireDatabase,
    obtenirEspacePartenaireDatabase,
    listerPublicationsVisiblesPourPersonneDatabase,
    creerDemandeDatabase,
    listerDemandesPersonneDatabase,
    listerDemandesOrganisationDatabase,
    prendreEnChargeDemandeDatabase,
    repondreDemandeDatabase,
    orienterDemandeDatabase,
    listerReponsesDemandeCitoyenDatabase,
    listerHistoriqueDemandeCitoyenDatabase,
    listerNotificationsPersonneDatabase,
    obtenirDashboardConsulatDatabase,
    soumettrePublicationADiasporaDatabase,
    listerSoumissionsDiasporaDatabase,
    approuverDiffusionDiasporaDatabase,
    rejeterDiffusionDiasporaDatabase,
    listerPublicationsDiasporaPourPersonneDatabase,
    obtenirMonSateerDatabase,
    listerPublicationsAmbassadePourPersonneDatabase,
    obtenirContexteIASecretariatDatabase,
    obtenirContexteIACitoyenDatabase,
    obtenirAnalyticsConsulatDatabase,

    // Structure organisationnelle
    obtenirStructureOrganisationDatabase,

    // Administration générique des unités
    creerOrganisationUnitDatabase,
    modifierOrganisationUnitDatabase,
    deplacerOrganisationUnitDatabase,
    desactiverOrganisationUnitDatabase,

    // Administration générique des membres
    listerMembresOrganisationUnitDatabase,
    affecterMembreOrganisationUnitDatabase,
    modifierMembreOrganisationUnitDatabase,
    desactiverMembreOrganisationUnitDatabase,

    // Administration générique des capabilities
    listerCapabilitiesUnitDatabase,
    listerCapabilitiesOrganisationUnitDatabase,
    activerCapabilityOrganisationUnitDatabase,
    modifierCapabilityOrganisationUnitDatabase,
    desactiverCapabilityOrganisationUnitDatabase,

    // Administration générique des rôles et permissions
    roleOrganisationEstProtegeDatabase,
    listerRolesOrganisationDatabase,
    creerRoleOrganisationDatabase,
    modifierRoleOrganisationDatabase,
    desactiverRoleOrganisationDatabase,
    reactiverRoleOrganisationDatabase,
    listerPermissionsDatabase,
    listerPermissionsRoleOrganisationDatabase,
    ajouterPermissionRoleOrganisationDatabase,
    modifierPermissionRoleOrganisationDatabase,
    desactiverPermissionRoleOrganisationDatabase,

    // Calcul générique des permissions effectives
    obtenirPermissionsEffectivesDatabase,

    // Dashboards et délégations d'accès
    obtenirDashboardStrategiqueConsulatDatabase,
    listerDelegationsDashboardOperationnelDatabase,
    accorderAccesDashboardOperationnelDatabase,
    revoquerAccesDashboardOperationnelDatabase,

    // Réseau / écosystème
    obtenirEcosystemeOrganisationDatabase,

    // Unit Workspace Engine
    obtenirUnitesWorkspaceOverviewDatabase,
    listerDemandesWorkspaceUnitDatabase,
    orienterDemandeWorkspaceUnitDatabase
};