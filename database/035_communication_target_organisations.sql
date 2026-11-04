-- P3.1: identité de destinataires générique, organisation émettrice -> organisations cibles.
-- Aucun ID, type d'organisation ou pays codé en dur.
BEGIN;
CREATE TABLE IF NOT EXISTS communication_publication_targets (
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    publication_id INTEGER NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
    organisation_id INTEGER NOT NULL REFERENCES organisations(id),
    target_organisation_id INTEGER NOT NULL REFERENCES organisations(id),
    date_creation TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (publication_id, target_organisation_id),
    CHECK (organisation_id <> target_organisation_id)
);
CREATE INDEX IF NOT EXISTS idx_communication_targets_personnel
    ON communication_publication_targets(tenant_id, organisation_id, target_organisation_id);
COMMIT;
