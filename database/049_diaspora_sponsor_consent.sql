-- SATEER Diaspora D2B-C1 : communications sponsorisees, consentement personnel distinct.
-- Aucune activation implicite, aucun paiement, aucune association verifiee implicitement.
-- Migration à effectuer sur sateer_test UNIQUEMENT après autorisation de recette.
BEGIN;
CREATE TABLE IF NOT EXISTS diaspora_sponsor_optins (
 tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
 personne_id INTEGER NOT NULL REFERENCES personnes(id) ON DELETE CASCADE,
 actif BOOLEAN NOT NULL DEFAULT FALSE,
 consent_version VARCHAR(24) NOT NULL DEFAULT 'D2BC1',
 date_consentement TIMESTAMPTZ,
 date_retrait TIMESTAMPTZ,
 date_modification TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(tenant_id,personne_id)
);
CREATE INDEX IF NOT EXISTS ix_diaspora_sponsor_optins_active
 ON diaspora_sponsor_optins(tenant_id,actif,personne_id);

CREATE TABLE IF NOT EXISTS diaspora_sponsored_publications (
 publication_id INTEGER PRIMARY KEY,
 tenant_id INTEGER NOT NULL,
 organisation_id INTEGER NOT NULL,
 sponsor_organisation_id INTEGER NOT NULL,
 defini_par INTEGER NOT NULL REFERENCES personnes(id) ON DELETE RESTRICT,
 date_declaration TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT ck_diaspora_sponsor_is_source CHECK(sponsor_organisation_id=organisation_id),
 CONSTRAINT fk_diaspora_sponsor_scope FOREIGN KEY(publication_id,tenant_id,organisation_id)
   REFERENCES publications(id,tenant_id,organisation_id) ON DELETE RESTRICT,
 CONSTRAINT fk_diaspora_sponsor_org_scope FOREIGN KEY(sponsor_organisation_id,tenant_id)
   REFERENCES organisations(id,tenant_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS ix_diaspora_sponsored_publications_tenant
 ON diaspora_sponsored_publications(tenant_id,organisation_id);
COMMIT;
