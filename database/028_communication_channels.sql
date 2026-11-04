-- SATEER Core — Canaux institutionnels et abonnements (lot pilote 1C)
-- Sans données de démonstration, sans droits attribués implicitement.
-- A appliquer uniquement après validation sur sateer_test.
BEGIN;
CREATE TABLE IF NOT EXISTS communication_channels (
    id BIGSERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    organisation_id INTEGER NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
    code VARCHAR(100) NOT NULL,
    nom VARCHAR(180) NOT NULL,
    description TEXT,
    visibility VARCHAR(30) NOT NULL DEFAULT 'PUBLIC' CHECK (visibility IN ('PUBLIC','MEMBERS','RESTRICTED')),
    actif BOOLEAN NOT NULL DEFAULT TRUE,
    created_by INTEGER REFERENCES personnes(id) ON DELETE SET NULL,
    date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
    date_modification TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_communication_channel UNIQUE (tenant_id, organisation_id, code),
    CONSTRAINT uq_communication_channel_scope UNIQUE (id, tenant_id, organisation_id),
    CONSTRAINT ck_communication_channel_code CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{1,99}$')
);

CREATE INDEX IF NOT EXISTS idx_communication_channels_active
    ON communication_channels (tenant_id, organisation_id, actif);

-- Chaque abonnement est nominatif, contrôlable, et propre au même tenant+organisation que le canal.
CREATE TABLE IF NOT EXISTS communication_channel_subscriptions (
    id BIGSERIAL PRIMARY KEY,
    channel_id BIGINT NOT NULL,
    tenant_id INTEGER NOT NULL,
    organisation_id INTEGER NOT NULL,
    personne_id INTEGER NOT NULL REFERENCES personnes(id) ON DELETE CASCADE,
    actif BOOLEAN NOT NULL DEFAULT TRUE,
    date_abonnement TIMESTAMPTZ NOT NULL DEFAULT now(),
    date_modification TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_communication_subscription_channel_scope
        FOREIGN KEY (channel_id, tenant_id, organisation_id)
        REFERENCES communication_channels(id, tenant_id, organisation_id)
        ON DELETE CASCADE,
    CONSTRAINT uq_communication_subscription UNIQUE (channel_id, personne_id)
);

CREATE INDEX IF NOT EXISTS idx_communication_subscriptions_person
    ON communication_channel_subscriptions (tenant_id, personne_id, actif);

-- Une publication peut appartenir à un canal de SON organisation et de SON tenant.
-- Colonne facultative : les publications antérieures demeurent compatibles.
ALTER TABLE publications ADD COLUMN IF NOT EXISTS communication_channel_id BIGINT;
ALTER TABLE publications ADD CONSTRAINT fk_publication_communication_channel_scope
    FOREIGN KEY (communication_channel_id, tenant_id, organisation_id)
    REFERENCES communication_channels(id, tenant_id, organisation_id)
    ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_publications_communication_channel
    ON publications(communication_channel_id, date_publication DESC);
COMMIT;
