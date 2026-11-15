-- SATEER Diaspora D2B-B : territoire volontaire et ciblage des notifications.
-- Aucun compte, abonnement ou ciblage initial implicite.
-- Usage : sateer_test uniquement avec autorisation de recette explicite.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS ux_diaspora_publication_scope
  ON publications(id,tenant_id,organisation_id);

CREATE TABLE IF NOT EXISTS diaspora_geo_preferences (
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  personne_id INTEGER NOT NULL REFERENCES personnes(id) ON DELETE CASCADE,
  territory_id INTEGER NOT NULL REFERENCES territories(id) ON DELETE RESTRICT,
  actif BOOLEAN NOT NULL DEFAULT TRUE,
  date_creation TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  date_modification TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(tenant_id,personne_id,territory_id)
);
CREATE INDEX IF NOT EXISTS ix_diaspora_geo_preference_active
  ON diaspora_geo_preferences(tenant_id,personne_id,actif,territory_id);

CREATE TABLE IF NOT EXISTS diaspora_publication_geo_targets (
  publication_id INTEGER PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  organisation_id INTEGER NOT NULL,
  territory_id INTEGER NOT NULL REFERENCES territories(id) ON DELETE RESTRICT,
  defini_par INTEGER NOT NULL REFERENCES personnes(id) ON DELETE RESTRICT,
  date_modification TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_diaspora_geo_publication_scope
    FOREIGN KEY(publication_id,tenant_id,organisation_id)
    REFERENCES publications(id,tenant_id,organisation_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS ix_diaspora_geo_target_territory
  ON diaspora_publication_geo_targets(tenant_id,territory_id,publication_id);
COMMIT;
