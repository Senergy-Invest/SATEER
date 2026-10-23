-- =========================================================
-- SATEER
-- Migration 005
-- Organisation capabilities + analytics génériques
-- =========================================================


-- =========================================================
-- CAPABILITIES
--
-- Catalogue générique des capacités disponibles dans SATEER.
-- Une organisation active seulement celles dont elle a besoin.
-- =========================================================

CREATE TABLE capabilities (
    id SERIAL PRIMARY KEY,

    code VARCHAR(100) NOT NULL UNIQUE,

    nom VARCHAR(255) NOT NULL,

    description TEXT,

    actif BOOLEAN NOT NULL DEFAULT TRUE
);


-- =========================================================
-- ORGANISATION_CAPABILITIES
--
-- Relie une organisation aux capacités qui lui sont activées.
-- =========================================================

CREATE TABLE organisation_capabilities (
    id SERIAL PRIMARY KEY,

    organisation_id INTEGER NOT NULL,

    capability_id INTEGER NOT NULL,

    actif BOOLEAN NOT NULL DEFAULT TRUE,

    date_activation TIMESTAMP
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    date_desactivation TIMESTAMP,

    CONSTRAINT fk_org_capability_organisation
        FOREIGN KEY (organisation_id)
        REFERENCES organisations(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_org_capability_capability
        FOREIGN KEY (capability_id)
        REFERENCES capabilities(id)
        ON DELETE CASCADE,

    CONSTRAINT uq_organisation_capability
        UNIQUE (
            organisation_id,
            capability_id
        )
);


-- =========================================================
-- ANALYTICS_EVENTS
--
-- Événements génériques permettant de mesurer l'impact.
--
-- Exemples :
-- VIEW
-- CLICK
-- INTEREST
-- CONTACT_REQUEST
-- REGISTRATION
-- CONVERSION
--
-- Pour l'instant publication_id est notre objet mesuré.
-- Plus tard ce moteur pourra aussi supporter campagnes,
-- projets et opportunités.
-- =========================================================

CREATE TABLE analytics_events (
    id BIGSERIAL PRIMARY KEY,

    tenant_id INTEGER NOT NULL,

    organisation_id INTEGER NOT NULL,

    publication_id INTEGER,

    personne_id INTEGER,

    event_type VARCHAR(100) NOT NULL,

    country_id INTEGER,

    territory_id INTEGER,

    channel VARCHAR(100),

    metadata JSONB
        NOT NULL
        DEFAULT '{}'::jsonb,

    date_evenement TIMESTAMP
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,


    CONSTRAINT fk_analytics_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE RESTRICT,


    CONSTRAINT fk_analytics_organisation
        FOREIGN KEY (organisation_id)
        REFERENCES organisations(id)
        ON DELETE CASCADE,


    CONSTRAINT fk_analytics_publication
        FOREIGN KEY (publication_id)
        REFERENCES publications(id)
        ON DELETE CASCADE,


    CONSTRAINT fk_analytics_personne
        FOREIGN KEY (personne_id)
        REFERENCES personnes(id)
        ON DELETE SET NULL,


    CONSTRAINT fk_analytics_country
        FOREIGN KEY (country_id)
        REFERENCES countries(id)
        ON DELETE SET NULL,


    CONSTRAINT fk_analytics_territory
        FOREIGN KEY (territory_id)
        REFERENCES territories(id)
        ON DELETE SET NULL
);


-- =========================================================
-- INDEX
-- =========================================================

CREATE INDEX idx_analytics_publication
ON analytics_events(publication_id);


CREATE INDEX idx_analytics_organisation
ON analytics_events(
    tenant_id,
    organisation_id
);


CREATE INDEX idx_analytics_event_type
ON analytics_events(
    tenant_id,
    event_type
);


CREATE INDEX idx_analytics_geographie
ON analytics_events(
    country_id,
    territory_id
);


CREATE INDEX idx_analytics_date
ON analytics_events(date_evenement);


-- =========================================================
-- CAPABILITIES INITIALES
-- =========================================================

INSERT INTO capabilities (
    code,
    nom,
    description
)
VALUES

(
    'PUBLIER',
    'Publier des informations',
    'Permet à une organisation de publier dans son espace officiel.'
),

(
    'PROPOSER_DIASPORA',
    'Proposer une diffusion Diaspora',
    'Permet de soumettre une publication à SATEER Communication.'
),

(
    'GERER_DEMANDES',
    'Gérer les demandes',
    'Permet de recevoir et traiter les demandes des utilisateurs.'
),

(
    'GERER_RENDEZ_VOUS',
    'Gérer les rendez-vous',
    'Permet de proposer et gérer des rendez-vous.'
),

(
    'GERER_EVENEMENTS',
    'Gérer les événements',
    'Permet de créer et gérer des événements.'
),

(
    'ANALYTICS',
    'Consulter les statistiques',
    'Permet de consulter les statistiques d impact des contenus.'
),

(
    'RECEVOIR_LEADS',
    'Recevoir des mises en relation',
    'Permet de recevoir les personnes ayant explicitement demandé une mise en relation.'
),

(
    'BUREAU_PROJET',
    'Bureau Projet',
    'Permet de gérer des projets et leur accompagnement.'
),

(
    'SATEER_INVEST',
    'SATEER Invest',
    'Permet de participer aux parcours SATEER Invest.'
)

ON CONFLICT (code)
DO NOTHING;


-- =========================================================
-- ACTIVATION PILOTE : CONSULAT BORDEAUX
-- =========================================================

INSERT INTO organisation_capabilities (
    organisation_id,
    capability_id
)
SELECT
    1,
    id
FROM capabilities
WHERE code IN (
    'PUBLIER',
    'PROPOSER_DIASPORA',
    'GERER_DEMANDES',
    'GERER_RENDEZ_VOUS',
    'GERER_EVENEMENTS',
    'ANALYTICS',
    'BUREAU_PROJET'
)
ON CONFLICT (
    organisation_id,
    capability_id
)
DO NOTHING;


-- =========================================================
-- ACTIVATION PILOTE : AMBASSADE
-- =========================================================

INSERT INTO organisation_capabilities (
    organisation_id,
    capability_id
)
SELECT
    2,
    id
FROM capabilities
WHERE code IN (
    'PUBLIER',
    'PROPOSER_DIASPORA',
    'GERER_DEMANDES',
    'GERER_EVENEMENTS',
    'ANALYTICS'
)
ON CONFLICT (
    organisation_id,
    capability_id
)
DO NOTHING;


-- =========================================================
-- ACTIVATION PILOTE : SATEER FRANCE
-- =========================================================

INSERT INTO organisation_capabilities (
    organisation_id,
    capability_id
)
SELECT
    5,
    id
FROM capabilities
WHERE code IN (
    'PUBLIER',
    'PROPOSER_DIASPORA',
    'ANALYTICS',
    'RECEVOIR_LEADS',
    'SATEER_INVEST'
)
ON CONFLICT (
    organisation_id,
    capability_id
)
DO NOTHING;