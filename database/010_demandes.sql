-- =========================================================
-- SATEER
-- Migration 010
--
-- Demandes citoyennes
--
-- Générique :
-- Consulat
-- Ambassade
-- Institution
-- =========================================================


-- =========================================================
-- 1. DEMANDES
-- =========================================================

CREATE TABLE IF NOT EXISTS demandes (

    id BIGSERIAL PRIMARY KEY,

    tenant_id INTEGER NOT NULL,

    organisation_id INTEGER NOT NULL,

    personne_id INTEGER NOT NULL,

    categorie VARCHAR(100) NOT NULL,

    objet VARCHAR(255) NOT NULL,

    description TEXT NOT NULL,

    statut VARCHAR(100)
        NOT NULL
        DEFAULT 'NOUVELLE',

    priorite VARCHAR(100)
        NOT NULL
        DEFAULT 'NORMALE',

    assignee_a INTEGER,

    canal VARCHAR(100)
        NOT NULL
        DEFAULT 'SATEER',

    metadata JSONB
        NOT NULL
        DEFAULT '{}'::jsonb,

    date_creation TIMESTAMP
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    date_modification TIMESTAMP
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    date_cloture TIMESTAMP,


    CONSTRAINT fk_demande_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_demande_organisation
        FOREIGN KEY (organisation_id)
        REFERENCES organisations(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_demande_personne
        FOREIGN KEY (personne_id)
        REFERENCES personnes(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_demande_assignee
        FOREIGN KEY (assignee_a)
        REFERENCES personnes(id)
        ON DELETE SET NULL
);


-- =========================================================
-- 2. HISTORIQUE DES DEMANDES
-- =========================================================

CREATE TABLE IF NOT EXISTS demande_history (

    id BIGSERIAL PRIMARY KEY,

    tenant_id INTEGER NOT NULL,

    demande_id BIGINT NOT NULL,

    auteur_personne_id INTEGER,

    ancien_statut VARCHAR(100),

    nouveau_statut VARCHAR(100),

    action VARCHAR(100) NOT NULL,

    commentaire TEXT,

    metadata JSONB
        NOT NULL
        DEFAULT '{}'::jsonb,

    date_action TIMESTAMP
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,


    CONSTRAINT fk_demande_history_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_demande_history_demande
        FOREIGN KEY (demande_id)
        REFERENCES demandes(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_demande_history_auteur
        FOREIGN KEY (auteur_personne_id)
        REFERENCES personnes(id)
        ON DELETE SET NULL
);


-- =========================================================
-- 3. INDEX
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_demandes_personne
ON demandes (
    tenant_id,
    personne_id,
    date_creation
);


CREATE INDEX IF NOT EXISTS idx_demandes_organisation
ON demandes (
    tenant_id,
    organisation_id,
    statut,
    date_creation
);


CREATE INDEX IF NOT EXISTS idx_demandes_assignee
ON demandes (
    tenant_id,
    assignee_a,
    statut
);


CREATE INDEX IF NOT EXISTS idx_demande_history
ON demande_history (
    demande_id,
    date_action
);