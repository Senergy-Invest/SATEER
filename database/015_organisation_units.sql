-- =========================================================
-- SATEER
-- Migration 015
-- Structure interne des organisations
-- =========================================================


BEGIN;


-- =========================================================
-- 1. UNITÉS INTERNES D'UNE ORGANISATION
-- =========================================================

CREATE TABLE IF NOT EXISTS organisation_units (

    id SERIAL PRIMARY KEY,

    organisation_id INTEGER NOT NULL,

    parent_unit_id INTEGER NULL,

    code VARCHAR(100) NOT NULL,

    nom VARCHAR(255) NOT NULL,

    type VARCHAR(100) NOT NULL,

    actif BOOLEAN NOT NULL DEFAULT TRUE,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    date_creation TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    date_modification TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_organisation_unit_organisation
        FOREIGN KEY (
            organisation_id
        )
        REFERENCES organisations(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_organisation_unit_parent
        FOREIGN KEY (
            parent_unit_id
        )
        REFERENCES organisation_units(id)
        ON DELETE SET NULL,

    CONSTRAINT uq_organisation_unit_code
        UNIQUE (
            organisation_id,
            code
        )
);


CREATE INDEX IF NOT EXISTS idx_organisation_units_organisation
    ON organisation_units (
        organisation_id
    );


CREATE INDEX IF NOT EXISTS idx_organisation_units_parent
    ON organisation_units (
        parent_unit_id
    );


CREATE INDEX IF NOT EXISTS idx_organisation_units_type
    ON organisation_units (
        type
    );


-- =========================================================
-- 2. AFFECTATION PERSONNE ↔ UNITÉ
-- =========================================================

CREATE TABLE IF NOT EXISTS relations_personne_organisation_unit (

    id SERIAL PRIMARY KEY,

    personne_id INTEGER NOT NULL,

    organisation_unit_id INTEGER NOT NULL,

    role VARCHAR(100) NOT NULL,

    principal BOOLEAN NOT NULL DEFAULT FALSE,

    actif BOOLEAN NOT NULL DEFAULT TRUE,

    date_debut TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    date_fin TIMESTAMP NULL,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    date_creation TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_relation_unit_personne
        FOREIGN KEY (
            personne_id
        )
        REFERENCES personnes(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_relation_unit_unit
        FOREIGN KEY (
            organisation_unit_id
        )
        REFERENCES organisation_units(id)
        ON DELETE CASCADE,

    CONSTRAINT uq_relation_personne_unit_role
        UNIQUE (
            personne_id,
            organisation_unit_id,
            role
        )
);


CREATE INDEX IF NOT EXISTS idx_relation_unit_personne
    ON relations_personne_organisation_unit (
        personne_id
    );


CREATE INDEX IF NOT EXISTS idx_relation_unit_unit
    ON relations_personne_organisation_unit (
        organisation_unit_id
    );


CREATE INDEX IF NOT EXISTS idx_relation_unit_role
    ON relations_personne_organisation_unit (
        role
    );


-- =========================================================
-- 3. STRUCTURE PILOTE
-- CONSULAT DU SÉNÉGAL À BORDEAUX
-- organisation_id = 1
-- =========================================================


-- =========================================================
-- BUREAU DU CONSUL
-- =========================================================

INSERT INTO organisation_units (
    organisation_id,
    parent_unit_id,
    code,
    nom,
    type
)

VALUES (
    1,
    NULL,
    'HEAD_OF_MISSION',
    'Bureau du Consul',
    'HEAD_OF_MISSION_OFFICE'
)

ON CONFLICT (
    organisation_id,
    code
)

DO NOTHING;


-- =========================================================
-- BUREAU DU VICE-CONSUL
-- =========================================================

INSERT INTO organisation_units (
    organisation_id,
    parent_unit_id,
    code,
    nom,
    type
)

SELECT
    1,
    consul.id,
    'OPERATIONAL_DEPUTY',
    'Bureau du Vice-Consul',
    'OPERATIONAL_DEPUTY_OFFICE'

FROM organisation_units consul

WHERE
    consul.organisation_id = 1
    AND consul.code = 'HEAD_OF_MISSION'

ON CONFLICT (
    organisation_id,
    code
)

DO NOTHING;


-- =========================================================
-- SECRÉTARIAT
-- =========================================================

INSERT INTO organisation_units (
    organisation_id,
    parent_unit_id,
    code,
    nom,
    type
)

SELECT
    1,
    vice_consul.id,
    'SECRETARIAT',
    'Secrétariat',
    'SECRETARIAT'

FROM organisation_units vice_consul

WHERE
    vice_consul.organisation_id = 1
    AND vice_consul.code = 'OPERATIONAL_DEPUTY'

ON CONFLICT (
    organisation_id,
    code
)

DO NOTHING;


-- =========================================================
-- SERVICE CONSULAIRE
-- =========================================================

INSERT INTO organisation_units (
    organisation_id,
    parent_unit_id,
    code,
    nom,
    type
)

SELECT
    1,
    vice_consul.id,
    'CONSULAR_SERVICE',
    'Service consulaire',
    'SERVICE'

FROM organisation_units vice_consul

WHERE
    vice_consul.organisation_id = 1
    AND vice_consul.code = 'OPERATIONAL_DEPUTY'

ON CONFLICT (
    organisation_id,
    code
)

DO NOTHING;


-- =========================================================
-- 4. AFFECTATION D'AWA FALL AU SERVICE CONSULAIRE
-- personne_id = 3
-- =========================================================

INSERT INTO relations_personne_organisation_unit (
    personne_id,
    organisation_unit_id,
    role,
    principal
)

SELECT
    3,
    unit.id,
    'AGENT',
    TRUE

FROM organisation_units unit

WHERE
    unit.organisation_id = 1
    AND unit.code = 'CONSULAR_SERVICE'

ON CONFLICT (
    personne_id,
    organisation_unit_id,
    role
)

DO NOTHING;


COMMIT;