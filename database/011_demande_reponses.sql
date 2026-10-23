-- =========================================================
-- SATEER
-- Migration 011
--
-- Réponses aux demandes citoyennes
-- =========================================================


CREATE TABLE IF NOT EXISTS demande_reponses (

    id BIGSERIAL PRIMARY KEY,

    tenant_id INTEGER NOT NULL,

    demande_id BIGINT NOT NULL,

    auteur_personne_id INTEGER NOT NULL,

    contenu TEXT NOT NULL,

    type VARCHAR(100)
        NOT NULL
        DEFAULT 'REPONSE',

    visible_citoyen BOOLEAN
        NOT NULL
        DEFAULT TRUE,

    metadata JSONB
        NOT NULL
        DEFAULT '{}'::jsonb,

    date_creation TIMESTAMP
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,


    CONSTRAINT fk_demande_reponse_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_demande_reponse_demande
        FOREIGN KEY (demande_id)
        REFERENCES demandes(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_demande_reponse_auteur
        FOREIGN KEY (auteur_personne_id)
        REFERENCES personnes(id)
        ON DELETE RESTRICT
);


CREATE INDEX IF NOT EXISTS idx_demande_reponses_demande
ON demande_reponses (
    demande_id,
    date_creation
);


CREATE INDEX IF NOT EXISTS idx_demande_reponses_tenant
ON demande_reponses (
    tenant_id,
    demande_id
);