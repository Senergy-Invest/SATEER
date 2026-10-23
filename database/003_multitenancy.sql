-- =========================================================
-- SATEER
-- Migration 003
-- Architecture multi-tenant / pays / territoires
-- =========================================================


-- =========================================================
-- TENANTS
-- Un tenant représente un espace logique de données SATEER.
--
-- Exemples futurs :
-- SENEGAL
-- MALI
-- GUINEE
-- ou éventuellement une institution autonome.
-- =========================================================

CREATE TABLE IF NOT EXISTS tenants (
    id SERIAL PRIMARY KEY,

    code VARCHAR(50) NOT NULL UNIQUE,

    nom VARCHAR(255) NOT NULL,

    type VARCHAR(100) NOT NULL,

    actif BOOLEAN NOT NULL DEFAULT TRUE,

    date_creation TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- =========================================================
-- COUNTRIES
-- Référentiel générique des pays.
-- =========================================================

CREATE TABLE IF NOT EXISTS countries (
    id SERIAL PRIMARY KEY,

    code_iso2 VARCHAR(2) NOT NULL UNIQUE,

    code_iso3 VARCHAR(3) UNIQUE,

    nom VARCHAR(150) NOT NULL,

    actif BOOLEAN NOT NULL DEFAULT TRUE
);


-- =========================================================
-- TERRITORIES
--
-- Permet de représenter :
-- pays / région / département / ville / autre territoire.
--
-- parent_id permet une hiérarchie :
--
-- France
--   ↓
-- Nouvelle-Aquitaine
--   ↓
-- Gironde
--   ↓
-- Bordeaux
-- =========================================================

CREATE TABLE IF NOT EXISTS territories (
    id SERIAL PRIMARY KEY,

    country_id INTEGER NOT NULL,

    parent_id INTEGER,

    code VARCHAR(100),

    nom VARCHAR(255) NOT NULL,

    type VARCHAR(100) NOT NULL,

    actif BOOLEAN NOT NULL DEFAULT TRUE,

    CONSTRAINT fk_territory_country
        FOREIGN KEY (country_id)
        REFERENCES countries(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_territory_parent
        FOREIGN KEY (parent_id)
        REFERENCES territories(id)
        ON DELETE RESTRICT
);


-- =========================================================
-- ORGANISATIONS
--
-- On enrichit la table existante.
--
-- Une organisation appartient à un tenant.
-- Elle peut être rattachée à un pays.
-- Elle peut avoir un territoire principal d'activité.
-- =========================================================

ALTER TABLE organisations
ADD COLUMN IF NOT EXISTS tenant_id INTEGER;


ALTER TABLE organisations
ADD COLUMN IF NOT EXISTS country_id INTEGER;


ALTER TABLE organisations
ADD COLUMN IF NOT EXISTS territory_id INTEGER;


ALTER TABLE organisations
ADD CONSTRAINT fk_organisation_tenant
    FOREIGN KEY (tenant_id)
    REFERENCES tenants(id)
    ON DELETE RESTRICT;


ALTER TABLE organisations
ADD CONSTRAINT fk_organisation_country
    FOREIGN KEY (country_id)
    REFERENCES countries(id)
    ON DELETE RESTRICT;


ALTER TABLE organisations
ADD CONSTRAINT fk_organisation_territory
    FOREIGN KEY (territory_id)
    REFERENCES territories(id)
    ON DELETE RESTRICT;


-- =========================================================
-- DONNÉES PILOTE
-- Le Sénégal est seulement notre première configuration.
-- =========================================================

INSERT INTO tenants (
    id,
    code,
    nom,
    type
)
VALUES (
    1,
    'SN',
    'Écosystème Sénégal',
    'COUNTRY_ECOSYSTEM'
)
ON CONFLICT (code)
DO NOTHING;


-- =========================================================
-- PAYS
-- =========================================================

INSERT INTO countries (
    id,
    code_iso2,
    code_iso3,
    nom
)
VALUES
    (
        1,
        'SN',
        'SEN',
        'Sénégal'
    ),
    (
        2,
        'FR',
        'FRA',
        'France'
    )
ON CONFLICT (code_iso2)
DO NOTHING;


-- =========================================================
-- TERRITOIRES PILOTE
-- =========================================================

INSERT INTO territories (
    id,
    country_id,
    parent_id,
    code,
    nom,
    type
)
VALUES
    (
        1,
        2,
        NULL,
        'FR',
        'France',
        'PAYS'
    ),
    (
        2,
        2,
        1,
        '33',
        'Gironde',
        'DEPARTEMENT'
    ),
    (
        3,
        2,
        2,
        'BORDEAUX',
        'Bordeaux',
        'VILLE'
    ),
    (
        4,
        1,
        NULL,
        'SN',
        'Sénégal',
        'PAYS'
    )
ON CONFLICT (id)
DO NOTHING;


-- =========================================================
-- RATTACHEMENT DES ORGANISATIONS DU PILOTE
-- =========================================================


-- Consulat du Sénégal à Bordeaux

UPDATE organisations
SET
    tenant_id = 1,
    country_id = 1,
    territory_id = 3
WHERE id = 1;


-- Ambassade du Sénégal en France

UPDATE organisations
SET
    tenant_id = 1,
    country_id = 1,
    territory_id = 1
WHERE id = 2;


-- SONAGED

UPDATE organisations
SET
    tenant_id = 1,
    country_id = 1,
    territory_id = 4
WHERE id = 3;


-- Association des étudiants sénégalais de Bordeaux

UPDATE organisations
SET
    tenant_id = 1,
    country_id = 1,
    territory_id = 3
WHERE id = 4;


-- SATEER France

UPDATE organisations
SET
    tenant_id = 1,
    country_id = 1,
    territory_id = 1
WHERE id = 5;


-- =========================================================
-- SÉQUENCES
-- =========================================================

SELECT setval(
    'tenants_id_seq',
    (SELECT MAX(id) FROM tenants)
);


SELECT setval(
    'countries_id_seq',
    (SELECT MAX(id) FROM countries)
);


SELECT setval(
    'territories_id_seq',
    (SELECT MAX(id) FROM territories)
);