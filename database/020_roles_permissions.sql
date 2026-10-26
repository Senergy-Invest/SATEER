-- =========================================================
-- SATEER
-- Migration 020
-- Rôles et permissions configurables
-- =========================================================
--
-- Doctrine :
--
-- Un rôle est une configuration.
-- Une permission représente une autorisation fonctionnelle.
--
-- Le moteur SATEER ne doit jamais dépendre directement
-- d'un nom comme :
--
-- AGENT
-- SECRETARY
-- VICE_CONSUL
-- CONSUL
--
-- Ces noms peuvent exister comme configuration d'une
-- organisation, mais aucune logique métier générique
-- ne doit les tester directement.
--
-- =========================================================


BEGIN;


-- =========================================================
-- 1. CATALOGUE CANONIQUE DES PERMISSIONS
-- =========================================================

CREATE TABLE IF NOT EXISTS permissions (

    id SERIAL PRIMARY KEY,

    code VARCHAR(100)
        NOT NULL
        UNIQUE,

    nom VARCHAR(255)
        NOT NULL,

    description TEXT,

    actif BOOLEAN
        NOT NULL
        DEFAULT TRUE,

    date_creation TIMESTAMP WITHOUT TIME ZONE
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    date_modification TIMESTAMP WITHOUT TIME ZONE
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP
);


-- =========================================================
-- 2. PERMISSIONS GÉNÉRIQUES
-- =========================================================

INSERT INTO permissions (
    code,
    nom,
    description
)
VALUES

(
    'VIEW_ORGANISATION',
    'Consulter l organisation',
    'Permet de consulter la structure générale d une organisation.'
),

(
    'VIEW_UNIT',
    'Consulter une unité',
    'Permet de consulter une unité organisationnelle autorisée.'
),

(
    'CREATE_UNIT',
    'Créer une unité',
    'Permet de créer une unité ou sous-unité organisationnelle.'
),

(
    'UPDATE_UNIT',
    'Modifier une unité',
    'Permet de modifier une unité organisationnelle.'
),

(
    'MOVE_UNIT',
    'Déplacer une unité',
    'Permet de rattacher une unité à une autre unité parente.'
),

(
    'DISABLE_UNIT',
    'Désactiver une unité',
    'Permet de désactiver une unité sans supprimer son historique.'
),

(
    'VIEW_UNIT_MEMBERS',
    'Consulter les membres d une unité',
    'Permet de consulter les personnes affectées à une unité.'
),

(
    'ASSIGN_MEMBER',
    'Affecter un membre',
    'Permet d affecter une personne à une unité.'
),

(
    'REMOVE_MEMBER',
    'Retirer un membre',
    'Permet de mettre fin à l affectation d une personne à une unité.'
),

(
    'CHANGE_MEMBER_ROLE',
    'Modifier le rôle d un membre',
    'Permet de modifier le rôle d une personne dans une unité.'
),

(
    'VIEW_INCOMING',
    'Consulter les éléments entrants',
    'Permet de consulter les demandes, messages ou dossiers entrants autorisés.'
),

(
    'ROUTE_CASE',
    'Orienter un dossier',
    'Permet d orienter ou réorienter un dossier vers une destination autorisée.'
),

(
    'ASSIGN_CASE',
    'Affecter un dossier',
    'Permet d affecter un dossier à une personne autorisée.'
),

(
    'TAKE_CASE',
    'Prendre en charge un dossier',
    'Permet à une personne de prendre en charge un dossier.'
),

(
    'VIEW_CASE',
    'Consulter un dossier',
    'Permet de consulter un dossier dans le périmètre autorisé.'
),

(
    'PROCESS_CASE',
    'Traiter un dossier',
    'Permet de travailler sur un dossier affecté ou accessible.'
),

(
    'RESPOND_CASE',
    'Répondre à un dossier',
    'Permet de préparer ou envoyer une réponse liée à un dossier.'
),

(
    'REOPEN_CASE',
    'Rouvrir un dossier',
    'Permet de rouvrir un dossier clôturé lorsque cela est autorisé.'
),

(
    'ESCALATE_CASE',
    'Escalader un dossier',
    'Permet de transmettre un dossier vers un niveau de supervision.'
),

(
    'VIEW_UNIT_ANALYTICS',
    'Consulter les statistiques d une unité',
    'Permet de consulter les indicateurs d activité d une unité.'
),

(
    'VIEW_ORGANISATION_ANALYTICS',
    'Consulter les statistiques globales',
    'Permet de consulter les indicateurs consolidés de l organisation.'
),

(
    'VIEW_SUPERVISED_UNITS',
    'Consulter les unités supervisées',
    'Permet de consulter les unités comprises dans le périmètre de supervision.'
),

(
    'MANAGE_PROJECTS',
    'Gérer des projets',
    'Permet de créer et administrer des projets autorisés.'
),

(
    'VIEW_PROJECTS',
    'Consulter des projets',
    'Permet de consulter les projets autorisés.'
),

(
    'MANAGE_PUBLICATIONS',
    'Gérer les publications',
    'Permet de créer et administrer des publications institutionnelles.'
),

(
    'TARGET_COMMUNICATION',
    'Gérer la communication ciblée',
    'Permet de préparer une communication vers des publics autorisés.'
),

(
    'USE_AI_ASSISTANT',
    'Utiliser un assistant IA',
    'Permet d utiliser un assistant IA dans le périmètre autorisé.'
),

(
    'CONFIGURE_UNIT_CAPABILITIES',
    'Configurer les capacités d une unité',
    'Permet d activer ou désactiver les capacités d une unité.'
),

(
    'MANAGE_ROLES',
    'Gérer les rôles',
    'Permet de créer et modifier les rôles configurables de l organisation.'
),

(
    'MANAGE_ROLE_PERMISSIONS',
    'Configurer les permissions des rôles',
    'Permet de modifier les permissions associées aux rôles.'
)

ON CONFLICT (code)

DO UPDATE SET

    nom = EXCLUDED.nom,

    description = EXCLUDED.description,

    actif = TRUE,

    date_modification = CURRENT_TIMESTAMP;


-- =========================================================
-- 3. RÔLES CONFIGURABLES PAR ORGANISATION
-- =========================================================

CREATE TABLE IF NOT EXISTS organisation_roles (

    id SERIAL PRIMARY KEY,

    organisation_id INTEGER
        NOT NULL,

    code VARCHAR(100)
        NOT NULL,

    nom VARCHAR(255)
        NOT NULL,

    description TEXT,

    scope VARCHAR(50)
        NOT NULL
        DEFAULT 'UNIT',

    actif BOOLEAN
        NOT NULL
        DEFAULT TRUE,

    metadata JSONB
        NOT NULL
        DEFAULT '{}'::jsonb,

    date_creation TIMESTAMP WITHOUT TIME ZONE
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    date_modification TIMESTAMP WITHOUT TIME ZONE
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,


    CONSTRAINT fk_organisation_role_organisation

        FOREIGN KEY (
            organisation_id
        )

        REFERENCES organisations(id)

        ON DELETE CASCADE,


    CONSTRAINT uq_organisation_role_code

        UNIQUE (
            organisation_id,
            code
        ),


    CONSTRAINT chk_organisation_role_scope

        CHECK (
            scope IN (
                'ORGANISATION',
                'UNIT',
                'BOTH'
            )
        )
);


CREATE INDEX IF NOT EXISTS
idx_organisation_roles_organisation

ON organisation_roles (
    organisation_id
);


-- =========================================================
-- 4. RELATION RÔLE ↔ PERMISSION
-- =========================================================

CREATE TABLE IF NOT EXISTS role_permissions (

    id SERIAL PRIMARY KEY,

    role_id INTEGER
        NOT NULL,

    permission_id INTEGER
        NOT NULL,

    actif BOOLEAN
        NOT NULL
        DEFAULT TRUE,

    configuration JSONB
        NOT NULL
        DEFAULT '{}'::jsonb,

    date_creation TIMESTAMP WITHOUT TIME ZONE
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,


    CONSTRAINT fk_role_permission_role

        FOREIGN KEY (
            role_id
        )

        REFERENCES organisation_roles(id)

        ON DELETE CASCADE,


    CONSTRAINT fk_role_permission_permission

        FOREIGN KEY (
            permission_id
        )

        REFERENCES permissions(id)

        ON DELETE CASCADE,


    CONSTRAINT uq_role_permission

        UNIQUE (
            role_id,
            permission_id
        )
);


CREATE INDEX IF NOT EXISTS
idx_role_permissions_role

ON role_permissions (
    role_id
);


CREATE INDEX IF NOT EXISTS
idx_role_permissions_permission

ON role_permissions (
    permission_id
);


-- =========================================================
-- 5. LE RÔLE DEVIENT UNE VRAIE RELATION
-- =========================================================
--
-- Le champ texte "role" existant reste temporairement
-- pour ne rien casser dans le pilote actuel.
--
-- Le futur moteur devra utiliser role_id.
--
-- =========================================================

ALTER TABLE relations_personne_organisation_unit

ADD COLUMN IF NOT EXISTS role_id INTEGER;


DO $$
BEGIN

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_relation_unit_role'
    ) THEN

        ALTER TABLE relations_personne_organisation_unit

        ADD CONSTRAINT fk_relation_unit_role

        FOREIGN KEY (
            role_id
        )

        REFERENCES organisation_roles(id)

        ON DELETE SET NULL;

    END IF;

END
$$;


CREATE INDEX IF NOT EXISTS
idx_relation_unit_role_id

ON relations_personne_organisation_unit (
    role_id
);


-- =========================================================
-- 6. CONFIGURATION INITIALE BORDEAUX
-- =========================================================
--
-- IMPORTANT :
--
-- Ces rôles sont uniquement des données initiales du pilote.
--
-- Aucun code applicatif générique ne devra faire :
--
-- if role.code === 'AGENT'
--
-- =========================================================


INSERT INTO organisation_roles (
    organisation_id,
    code,
    nom,
    description,
    scope
)
VALUES

(
    1,
    'HEAD_OF_MISSION',
    'Chef de mission',
    'Responsable stratégique de la représentation.',
    'ORGANISATION'
),

(
    1,
    'OPERATIONAL_DEPUTY',
    'Responsable opérationnel',
    'Responsable de la supervision opérationnelle et de l organisation interne.',
    'ORGANISATION'
),

(
    1,
    'UNIT_MANAGER',
    'Responsable d unité',
    'Responsable opérationnel d une unité organisationnelle.',
    'UNIT'
),

(
    1,
    'INTAKE_ROUTER',
    'Agent d accueil et d orientation',
    'Personne autorisée à recevoir et orienter les éléments entrants.',
    'UNIT'
),

(
    1,
    'CASE_AGENT',
    'Agent de traitement',
    'Personne autorisée à prendre en charge et traiter des dossiers.',
    'UNIT'
),

(
    1,
    'PROJECT_AGENT',
    'Agent projet',
    'Personne autorisée à travailler sur les projets de son unité.',
    'UNIT'
)

ON CONFLICT (
    organisation_id,
    code
)

DO UPDATE SET

    nom = EXCLUDED.nom,

    description = EXCLUDED.description,

    scope = EXCLUDED.scope,

    actif = TRUE,

    date_modification = CURRENT_TIMESTAMP;


-- =========================================================
-- 7. PERMISSIONS DU CHEF DE MISSION
-- =========================================================

INSERT INTO role_permissions (
    role_id,
    permission_id
)

SELECT
    r.id,
    p.id

FROM organisation_roles r

CROSS JOIN permissions p

WHERE
    r.organisation_id = 1

    AND r.code = 'HEAD_OF_MISSION'

    AND p.code IN (
        'VIEW_ORGANISATION',
        'VIEW_SUPERVISED_UNITS',
        'VIEW_ORGANISATION_ANALYTICS',
        'VIEW_UNIT_ANALYTICS',
        'VIEW_PROJECTS'
    )

ON CONFLICT (
    role_id,
    permission_id
)

DO NOTHING;


-- =========================================================
-- 8. PERMISSIONS DU RESPONSABLE OPÉRATIONNEL
-- =========================================================

INSERT INTO role_permissions (
    role_id,
    permission_id
)

SELECT
    r.id,
    p.id

FROM organisation_roles r

CROSS JOIN permissions p

WHERE
    r.organisation_id = 1

    AND r.code = 'OPERATIONAL_DEPUTY'

    AND p.code IN (
        'VIEW_ORGANISATION',
        'VIEW_UNIT',
        'CREATE_UNIT',
        'UPDATE_UNIT',
        'MOVE_UNIT',
        'DISABLE_UNIT',
        'VIEW_UNIT_MEMBERS',
        'ASSIGN_MEMBER',
        'REMOVE_MEMBER',
        'CHANGE_MEMBER_ROLE',
        'VIEW_INCOMING',
        'ROUTE_CASE',
        'ASSIGN_CASE',
        'VIEW_CASE',
        'ESCALATE_CASE',
        'VIEW_UNIT_ANALYTICS',
        'VIEW_ORGANISATION_ANALYTICS',
        'VIEW_SUPERVISED_UNITS',
        'VIEW_PROJECTS',
        'TARGET_COMMUNICATION',
        'USE_AI_ASSISTANT',
        'CONFIGURE_UNIT_CAPABILITIES',
        'MANAGE_ROLES',
        'MANAGE_ROLE_PERMISSIONS'
    )

ON CONFLICT (
    role_id,
    permission_id
)

DO NOTHING;


-- =========================================================
-- 9. PERMISSIONS RESPONSABLE D'UNITÉ
-- =========================================================

INSERT INTO role_permissions (
    role_id,
    permission_id
)

SELECT
    r.id,
    p.id

FROM organisation_roles r

CROSS JOIN permissions p

WHERE
    r.organisation_id = 1

    AND r.code = 'UNIT_MANAGER'

    AND p.code IN (
        'VIEW_UNIT',
        'VIEW_UNIT_MEMBERS',
        'ASSIGN_CASE',
        'VIEW_INCOMING',
        'VIEW_CASE',
        'ROUTE_CASE',
        'ESCALATE_CASE',
        'VIEW_UNIT_ANALYTICS'
    )

ON CONFLICT (
    role_id,
    permission_id
)

DO NOTHING;


-- =========================================================
-- 10. PERMISSIONS ACCUEIL / ORIENTATION
-- =========================================================

INSERT INTO role_permissions (
    role_id,
    permission_id
)

SELECT
    r.id,
    p.id

FROM organisation_roles r

CROSS JOIN permissions p

WHERE
    r.organisation_id = 1

    AND r.code = 'INTAKE_ROUTER'

    AND p.code IN (
        'VIEW_UNIT',
        'VIEW_INCOMING',
        'VIEW_CASE',
        'ROUTE_CASE',
        'ESCALATE_CASE',
        'USE_AI_ASSISTANT'
    )

ON CONFLICT (
    role_id,
    permission_id
)

DO NOTHING;


-- =========================================================
-- 11. PERMISSIONS AGENT DE TRAITEMENT
-- =========================================================

INSERT INTO role_permissions (
    role_id,
    permission_id
)

SELECT
    r.id,
    p.id

FROM organisation_roles r

CROSS JOIN permissions p

WHERE
    r.organisation_id = 1

    AND r.code = 'CASE_AGENT'

    AND p.code IN (
        'VIEW_UNIT',
        'VIEW_INCOMING',
        'VIEW_CASE',
        'TAKE_CASE',
        'PROCESS_CASE',
        'RESPOND_CASE',
        'ESCALATE_CASE'
    )

ON CONFLICT (
    role_id,
    permission_id
)

DO NOTHING;


-- =========================================================
-- 12. PERMISSIONS AGENT PROJET
-- =========================================================

INSERT INTO role_permissions (
    role_id,
    permission_id
)

SELECT
    r.id,
    p.id

FROM organisation_roles r

CROSS JOIN permissions p

WHERE
    r.organisation_id = 1

    AND r.code = 'PROJECT_AGENT'

    AND p.code IN (
        'VIEW_UNIT',
        'VIEW_PROJECTS',
        'MANAGE_PROJECTS'
    )

ON CONFLICT (
    role_id,
    permission_id
)

DO NOTHING;


-- =========================================================
-- 13. MIGRATION DES ANCIENS RÔLES CONNUS
-- =========================================================
--
-- On traduit uniquement les anciennes données connues.
--
-- Ce bloc est une migration de compatibilité.
-- Ce n'est PAS de la logique métier future.
--
-- =========================================================


UPDATE relations_personne_organisation_unit relation

SET role_id = role_config.id

FROM organisation_units unit,

     organisation_roles role_config

WHERE
    relation.organisation_unit_id = unit.id

    AND role_config.organisation_id = unit.organisation_id

    AND relation.role_id IS NULL

    AND (

        (
            relation.role = 'HEAD_OF_MISSION'
            AND role_config.code = 'HEAD_OF_MISSION'
        )

        OR

        (
            relation.role = 'OPERATIONAL_DEPUTY'
            AND role_config.code = 'OPERATIONAL_DEPUTY'
        )

        OR

        (
            relation.role = 'RESPONSABLE'
            AND role_config.code = 'UNIT_MANAGER'
        )

        OR

        (
            relation.role = 'AGENT'
            AND role_config.code = 'CASE_AGENT'
        )

    );


COMMIT;