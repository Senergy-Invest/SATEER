-- =========================================================
-- SATEER
-- Migration 013
--
-- Expériences utilisateur
-- Mon SATEER
-- =========================================================


-- =========================================================
-- 1. CATALOGUE DES EXPÉRIENCES
-- =========================================================

CREATE TABLE IF NOT EXISTS experiences (

    id SERIAL PRIMARY KEY,

    code VARCHAR(100)
        NOT NULL
        UNIQUE,

    nom VARCHAR(255)
        NOT NULL,

    description TEXT,

    type VARCHAR(100)
        NOT NULL,

    actif BOOLEAN
        NOT NULL
        DEFAULT TRUE,

    ordre INTEGER
        NOT NULL
        DEFAULT 100,

    configuration JSONB
        NOT NULL
        DEFAULT '{}'::jsonb
);


-- =========================================================
-- 2. ACTIVATION PAR PERSONNE / TENANT
-- =========================================================

CREATE TABLE IF NOT EXISTS experience_activations (

    id BIGSERIAL PRIMARY KEY,

    tenant_id INTEGER NOT NULL,

    personne_id INTEGER NOT NULL,

    experience_id INTEGER NOT NULL,

    statut VARCHAR(100)
        NOT NULL
        DEFAULT 'ACTIVE',

    date_activation TIMESTAMP
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    date_desactivation TIMESTAMP,

    metadata JSONB
        NOT NULL
        DEFAULT '{}'::jsonb,


    CONSTRAINT fk_experience_activation_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_experience_activation_personne
        FOREIGN KEY (personne_id)
        REFERENCES personnes(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_experience_activation_experience
        FOREIGN KEY (experience_id)
        REFERENCES experiences(id)
        ON DELETE CASCADE,

    CONSTRAINT uq_experience_activation
        UNIQUE (
            tenant_id,
            personne_id,
            experience_id
        )
);


-- =========================================================
-- 3. EXPÉRIENCES PILOTE
-- =========================================================

INSERT INTO experiences (
    code,
    nom,
    description,
    type,
    ordre
)
VALUES

(
    'MON_CONSULAT',
    'Mon Consulat',
    'Informations, services et demandes auprès du Consulat.',
    'INSTITUTIONNELLE',
    10
),

(
    'MON_AMBASSADE',
    'Mon Ambassade',
    'Informations et services de l''Ambassade.',
    'INSTITUTIONNELLE',
    20
),

(
    'DIASPORA',
    'Diaspora',
    'Informations, événements et opportunités destinés à la diaspora.',
    'COMMUNAUTAIRE',
    30
)

ON CONFLICT (code)
DO NOTHING;


-- =========================================================
-- 4. ACTIVATIONS PILOTE FATOU
-- =========================================================

INSERT INTO experience_activations (
    tenant_id,
    personne_id,
    experience_id,
    statut
)
SELECT
    t.id,
    1,
    e.id,
    'ACTIVE'

FROM tenants t

CROSS JOIN experiences e

WHERE
    t.code = 'SN'

    AND e.code IN (
        'MON_CONSULAT',
        'MON_AMBASSADE',
        'DIASPORA'
    )

ON CONFLICT (
    tenant_id,
    personne_id,
    experience_id
)
DO NOTHING;


-- =========================================================
-- 5. ACTIVATIONS PILOTE MAMADOU
-- =========================================================

INSERT INTO experience_activations (
    tenant_id,
    personne_id,
    experience_id,
    statut
)
SELECT
    t.id,
    2,
    e.id,
    'ACTIVE'

FROM tenants t

CROSS JOIN experiences e

WHERE
    t.code = 'SN'

    AND e.code IN (
        'MON_CONSULAT',
        'MON_AMBASSADE',
        'DIASPORA'
    )

ON CONFLICT (
    tenant_id,
    personne_id,
    experience_id
)
DO NOTHING;


-- =========================================================
-- 6. INDEX
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_experience_activations_personne
ON experience_activations (
    tenant_id,
    personne_id,
    statut
);