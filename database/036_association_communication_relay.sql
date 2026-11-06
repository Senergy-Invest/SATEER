-- Association communication relay: explicit permissions and publication-level
-- authorizations. Existing publication and organization relationship records
-- remain the canonical sources; this migration adds only relay history.
BEGIN;

DO $$
BEGIN
  IF current_database() <> 'sateer_test' THEN
    RAISE EXCEPTION 'MIGRATION_036_REFUSED_DATABASE: %', current_database();
  END IF;
  IF (SELECT system_identifier::text FROM pg_control_system()) <> '7699611241381229531' THEN
    RAISE EXCEPTION 'MIGRATION_036_REFUSED_POSTGRES_INSTANCE';
  END IF;
  IF to_regclass('communication_publication_relay_authorizations') IS NOT NULL
     OR to_regclass('communication_publication_relays') IS NOT NULL THEN
    RAISE EXCEPTION 'MIGRATION_036_REFUSED_PARTIAL_OR_EXISTING_SCHEMA';
  END IF;
END;
$$;

INSERT INTO permissions (code, nom, description, actif)
VALUES
  ('MANAGE_ORGANISATION_RELATIONSHIPS', 'Gérer les relations entre organisations',
   'Accepter ou refuser les invitations et demandes de relation de cette organisation.', TRUE),
  ('RELAY_ASSOCIATION_COMMUNICATION', 'Relayer une communication autorisée',
   'Relayer aux membres de cette organisation une publication que son émetteur a explicitement autorisée.', TRUE)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS communication_publication_relay_authorizations (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  source_organisation_id INTEGER NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  target_organisation_id INTEGER NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  publication_id INTEGER NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  authorized_by_personne_id INTEGER NOT NULL REFERENCES personnes(id) ON DELETE RESTRICT,
  authorized_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_by_personne_id INTEGER REFERENCES personnes(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT uq_publication_relay_authorization UNIQUE (publication_id, target_organisation_id),
  CONSTRAINT ck_publication_relay_distinct_orgs CHECK (source_organisation_id <> target_organisation_id)
);

CREATE INDEX IF NOT EXISTS idx_publication_relay_authorization_target
  ON communication_publication_relay_authorizations
  (tenant_id, target_organisation_id, revoked_at);

CREATE TABLE IF NOT EXISTS communication_publication_relays (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  source_organisation_id INTEGER NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  target_organisation_id INTEGER NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  publication_id INTEGER NOT NULL REFERENCES publications(id) ON DELETE RESTRICT,
  relation_id INTEGER NOT NULL REFERENCES organisation_relationships(id) ON DELETE RESTRICT,
  relayed_by_personne_id INTEGER NOT NULL REFERENCES personnes(id) ON DELETE RESTRICT,
  association_comment TEXT,
  date_relais TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_publication_association_relay UNIQUE (publication_id, target_organisation_id),
  CONSTRAINT ck_publication_relay_distinct_orgs CHECK (source_organisation_id <> target_organisation_id),
  CONSTRAINT ck_publication_relay_comment CHECK (association_comment IS NULL OR length(association_comment) <= 1000)
);

CREATE INDEX IF NOT EXISTS idx_publication_association_relay_members
  ON communication_publication_relays (tenant_id, target_organisation_id, date_relais DESC);

COMMIT;
