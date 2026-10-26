-- =========================================================
-- SATEER
-- Migration 019
-- Capacités génériques des unités organisationnelles
-- =========================================================
--
-- Doctrine :
--
-- Capability = réalité canonique.
--
-- organisation_capabilities
--     → capacités disponibles pour l'organisation.
--
-- organisation_unit_capabilities
--     → capacités effectivement activées sur une unité.
--
-- Aucun nom d'unité (SECRETARIAT, CONSULAR_SERVICE...)
-- ne doit piloter la logique métier de la plateforme.
--
-- =========================================================


BEGIN;


-- =========================================================
-- 1. PORTÉE D'UNE CAPABILITY
-- =========================================================

ALTER TABLE capabilities
ADD COLUMN IF NOT EXISTS scope
    VARCHAR(50)
    NOT NULL
    DEFAULT 'ORGANISATION';


DO $$
BEGIN

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_capabilities_scope'
    ) THEN

        ALTER TABLE capabilities

        ADD CONSTRAINT chk_capabilities_scope

        CHECK (
            scope IN (
                'ORGANISATION',
                'UNIT',
                'BOTH'
            )
        );

    END IF;

END
$$;


-- =========================================================
-- 2. CAPABILITIES GÉNÉRIQUES DES UNITÉS
-- =========================================================

INSERT INTO capabilities (
    code,
    nom,
    description,
    actif,
    scope
)
VALUES

(
    'RECEIVE_INCOMING',
    'Recevoir des entrées',
    'Permet à une unité de recevoir des demandes, messages ou dossiers.',
    TRUE,
    'UNIT'
),

(
    'VIEW_INBOX',
    'Consulter une boîte de réception',
    'Permet à une unité de consulter les éléments entrants qui lui sont destinés.',
    TRUE,
    'UNIT'
),

(
    'ROUTE_CASES',
    'Orienter des dossiers',
    'Permet de transmettre ou réorienter un dossier vers une unité ou une personne autorisée.',
    TRUE,
    'UNIT'
),

(
    'PROCESS_CASES',
    'Traiter des dossiers',
    'Permet à une unité de traiter les dossiers qui lui sont affectés.',
    TRUE,
    'UNIT'
),

(
    'TAKE_CASES',
    'Prendre en charge des dossiers',
    'Permet aux membres autorisés d une unité de prendre en charge un dossier.',
    TRUE,
    'UNIT'
),

(
    'RESPOND_CASES',
    'Répondre aux dossiers',
    'Permet aux membres autorisés de préparer ou envoyer une réponse liée à un dossier.',
    TRUE,
    'UNIT'
),

(
    'MANAGE_PROJECTS',
    'Gérer des projets',
    'Permet à une unité d administrer des projets et initiatives.',
    TRUE,
    'UNIT'
),

(
    'MANAGE_PUBLICATIONS',
    'Gérer les publications',
    'Permet à une unité de préparer et gérer des publications institutionnelles.',
    TRUE,
    'UNIT'
),

(
    'TARGET_COMMUNICATION',
    'Gérer la communication ciblée',
    'Permet à une unité de préparer des communications destinées à des publics ciblés.',
    TRUE,
    'UNIT'
),

(
    'USE_AI_ASSISTANT',
    'Utiliser un assistant IA',
    'Permet à une unité d utiliser les fonctions d assistance IA autorisées.',
    TRUE,
    'UNIT'
),

(
    'VIEW_UNIT_ANALYTICS',
    'Consulter les statistiques de l unité',
    'Permet de consulter les indicateurs et statistiques liés à une unité.',
    TRUE,
    'UNIT'
),

(
    'MANAGE_UNIT_MEMBERS',
    'Gérer les membres d une unité',
    'Permet d affecter, modifier ou désactiver les membres d une unité selon les permissions.',
    TRUE,
    'UNIT'
),

(
    'MANAGE_UNIT_STRUCTURE',
    'Gérer la structure interne',
    'Permet de créer, modifier, déplacer ou désactiver des unités et sous-unités.',
    TRUE,
    'UNIT'
),

(
    'SUPERVISE_UNITS',
    'Superviser des unités',
    'Permet de superviser les unités rattachées et leurs activités.',
    TRUE,
    'UNIT'
)

ON CONFLICT (code)

DO UPDATE SET

    nom =
        EXCLUDED.nom,

    description =
        EXCLUDED.description,

    actif =
        EXCLUDED.actif,

    scope =
        EXCLUDED.scope;


-- =========================================================
-- 3. RELATION UNITÉ ↔ CAPABILITY
-- =========================================================

CREATE TABLE IF NOT EXISTS organisation_unit_capabilities (

    id SERIAL PRIMARY KEY,

    organisation_unit_id INTEGER NOT NULL,

    capability_id INTEGER NOT NULL,

    actif BOOLEAN
        NOT NULL
        DEFAULT TRUE,

    configuration JSONB
        NOT NULL
        DEFAULT '{}'::jsonb,

    date_activation TIMESTAMP WITHOUT TIME ZONE
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    date_desactivation TIMESTAMP WITHOUT TIME ZONE,

    date_modification TIMESTAMP WITHOUT TIME ZONE
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,


    CONSTRAINT fk_unit_capability_unit

        FOREIGN KEY (
            organisation_unit_id
        )

        REFERENCES organisation_units(id)

        ON DELETE CASCADE,


    CONSTRAINT fk_unit_capability_capability

        FOREIGN KEY (
            capability_id
        )

        REFERENCES capabilities(id)

        ON DELETE CASCADE,


    CONSTRAINT uq_unit_capability

        UNIQUE (
            organisation_unit_id,
            capability_id
        )
);


CREATE INDEX IF NOT EXISTS
idx_unit_capability_unit

ON organisation_unit_capabilities (
    organisation_unit_id
);


CREATE INDEX IF NOT EXISTS
idx_unit_capability_capability

ON organisation_unit_capabilities (
    capability_id
);


-- =========================================================
-- 4. CONFIGURATION INITIALE DU PILOTE BORDEAUX
-- =========================================================
--
-- IMPORTANT :
-- ceci est uniquement du seed/configuration.
--
-- Le moteur SATEER ne devra jamais faire :
--
-- if unit.code === 'SECRETARIAT'
--
-- =========================================================


-- ---------------------------------------------------------
-- SECRÉTARIAT
-- ---------------------------------------------------------

INSERT INTO organisation_unit_capabilities (
    organisation_unit_id,
    capability_id
)

SELECT
    u.id,
    c.id

FROM organisation_units u

CROSS JOIN capabilities c

WHERE
    u.organisation_id = 1

    AND u.code = 'SECRETARIAT'

    AND c.code IN (
        'RECEIVE_INCOMING',
        'VIEW_INBOX',
        'ROUTE_CASES',
        'USE_AI_ASSISTANT',
        'VIEW_UNIT_ANALYTICS'
    )

ON CONFLICT (
    organisation_unit_id,
    capability_id
)

DO NOTHING;


-- ---------------------------------------------------------
-- SERVICE CONSULAIRE
-- ---------------------------------------------------------

INSERT INTO organisation_unit_capabilities (
    organisation_unit_id,
    capability_id
)

SELECT
    u.id,
    c.id

FROM organisation_units u

CROSS JOIN capabilities c

WHERE
    u.organisation_id = 1

    AND u.code = 'CONSULAR_SERVICE'

    AND c.code IN (
        'VIEW_INBOX',
        'PROCESS_CASES',
        'TAKE_CASES',
        'RESPOND_CASES',
        'ROUTE_CASES',
        'VIEW_UNIT_ANALYTICS'
    )

ON CONFLICT (
    organisation_unit_id,
    capability_id
)

DO NOTHING;


-- ---------------------------------------------------------
-- BUREAU DE PROJET
-- ---------------------------------------------------------

INSERT INTO organisation_unit_capabilities (
    organisation_unit_id,
    capability_id
)

SELECT
    u.id,
    c.id

FROM organisation_units u

CROSS JOIN capabilities c

WHERE
    u.organisation_id = 1

    AND u.code = 'PROJECT_OFFICE'

    AND c.code IN (
        'RECEIVE_INCOMING',
        'VIEW_INBOX',
        'PROCESS_CASES',
        'ROUTE_CASES',
        'MANAGE_PROJECTS',
        'VIEW_UNIT_ANALYTICS'
    )

ON CONFLICT (
    organisation_unit_id,
    capability_id
)

DO NOTHING;


-- ---------------------------------------------------------
-- BUREAU DU VICE-CONSUL
-- ---------------------------------------------------------

INSERT INTO organisation_unit_capabilities (
    organisation_unit_id,
    capability_id
)

SELECT
    u.id,
    c.id

FROM organisation_units u

CROSS JOIN capabilities c

WHERE
    u.organisation_id = 1

    AND u.code = 'OPERATIONAL_DEPUTY'

    AND c.code IN (
        'RECEIVE_INCOMING',
        'VIEW_INBOX',
        'ROUTE_CASES',
        'SUPERVISE_UNITS',
        'MANAGE_UNIT_STRUCTURE',
        'MANAGE_UNIT_MEMBERS',
        'VIEW_UNIT_ANALYTICS'
    )

ON CONFLICT (
    organisation_unit_id,
    capability_id
)

DO NOTHING;


-- ---------------------------------------------------------
-- BUREAU DU CHEF DE MISSION
-- ---------------------------------------------------------

INSERT INTO organisation_unit_capabilities (
    organisation_unit_id,
    capability_id
)

SELECT
    u.id,
    c.id

FROM organisation_units u

CROSS JOIN capabilities c

WHERE
    u.organisation_id = 1

    AND u.code = 'HEAD_OF_MISSION'

    AND c.code IN (
        'SUPERVISE_UNITS',
        'VIEW_UNIT_ANALYTICS'
    )

ON CONFLICT (
    organisation_unit_id,
    capability_id
)

DO NOTHING;


COMMIT;