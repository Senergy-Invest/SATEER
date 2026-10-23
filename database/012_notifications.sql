-- =========================================================
-- SATEER
-- Migration 012
--
-- Notifications utilisateur
-- =========================================================


CREATE TABLE IF NOT EXISTS notifications (

    id BIGSERIAL PRIMARY KEY,

    tenant_id INTEGER NOT NULL,

    personne_id INTEGER NOT NULL,

    organisation_id INTEGER,

    type VARCHAR(100) NOT NULL,

    titre VARCHAR(255) NOT NULL,

    message TEXT NOT NULL,

    reference_type VARCHAR(100),

    reference_id BIGINT,

    canal VARCHAR(100)
        NOT NULL
        DEFAULT 'SATEER',

    statut VARCHAR(100)
        NOT NULL
        DEFAULT 'NON_LUE',

    metadata JSONB
        NOT NULL
        DEFAULT '{}'::jsonb,

    date_creation TIMESTAMP
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    date_lecture TIMESTAMP,


    CONSTRAINT fk_notification_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_notification_personne
        FOREIGN KEY (personne_id)
        REFERENCES personnes(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_notification_organisation
        FOREIGN KEY (organisation_id)
        REFERENCES organisations(id)
        ON DELETE SET NULL
);


CREATE INDEX IF NOT EXISTS idx_notifications_personne
ON notifications (
    tenant_id,
    personne_id,
    statut,
    date_creation
);


CREATE INDEX IF NOT EXISTS idx_notifications_reference
ON notifications (
    reference_type,
    reference_id
);