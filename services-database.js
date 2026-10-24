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
    statut = null
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

            WHERE
                d.organisation_id = $1

                AND t.code = $2

                AND (
                    $3::text IS NULL
                    OR d.statut = $3::text
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
                statut
            ]
        );


    return resultat.rows;
}
async function prendreEnChargeDemandeDatabase(
    demandeId,
    agentPersonneId,
    organisationId,
    tenantCode
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

                    agent.id AS agent_id

                FROM demandes d

                INNER JOIN tenants t
                    ON t.id = d.tenant_id

                INNER JOIN organisations o
                    ON o.id = d.organisation_id
                    AND o.tenant_id = t.id

                INNER JOIN personnes agent
                    ON agent.id = $2

                INNER JOIN relations_personne_organisation r
                    ON r.personne_id = agent.id
                    AND r.organisation_id = o.id
                    AND r.type IN (
                        'AGENT',
                        'RESPONSABLE'
                    )

                WHERE
                    d.id = $1

                    AND d.organisation_id = $3

                    AND t.code = $4

                    AND d.statut = 'NOUVELLE'
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
                    'Demande prise en charge par un agent.'

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
async function repondreDemandeDatabase(
    demandeId,
    agentPersonneId,
    organisationId,
    tenantCode,
    contenu
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

                INNER JOIN personnes agent
                    ON agent.id = $2

                INNER JOIN relations_personne_organisation r
                    ON r.personne_id = agent.id
                    AND r.organisation_id = o.id
                    AND r.type IN (
                        'AGENT',
                        'RESPONSABLE'
                    )

                WHERE
                    d.id = $1

                    AND d.organisation_id = $3

                    AND t.code = $4

                    AND d.statut IN (
                        'EN_COURS',
                        'NOUVELLE'
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
                contenu
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
// =========================================================
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
    creerDemandeContactPartenaireDatabase,
    creerIntroductionPartenaireDatabase,
    obtenirEspacePartenaireDatabase,
    listerPublicationsVisiblesPourPersonneDatabase,
    creerDemandeDatabase,
    listerDemandesPersonneDatabase,
    listerDemandesOrganisationDatabase,
    prendreEnChargeDemandeDatabase,
    repondreDemandeDatabase,
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
    obtenirAnalyticsConsulatDatabase
};