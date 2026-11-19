-- SUNU Courant MVP02-C3A : catalogue technique PRIVÉ au site, additif et réversible en recette.
-- Une référence de modèle ne fusionne jamais les appareils physiques, photos ni historiques.
BEGIN;
DO $$ BEGIN IF current_database()<>'sateer_test' THEN RAISE EXCEPTION 'C3_REFUSE_HORS_SATEER_TEST'; END IF; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_c3_passport_site_scope
 ON energy_equipment_passports(id,site_id,tenant_id,owner_personne_id);
CREATE TABLE IF NOT EXISTS energy_catalog_references (
 id UUID PRIMARY KEY,
 site_id BIGINT NOT NULL,
 tenant_id INTEGER NOT NULL,
 owner_personne_id INTEGER NOT NULL,
 source_passport_id BIGINT,
 request_key UUID NOT NULL,
 content_hash CHAR(64) NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'),
 famille VARCHAR(24) NOT NULL CHECK(famille IN ('ECLAIRAGE','CLIMATISATION','FROID','POMPAGE','MOTEUR','INFORMATIQUE','SOLAIRE','STOCKAGE','AUTRE')),
 sous_famille VARCHAR(80) NOT NULL CHECK(length(btrim(sous_famille))>0),
 designation VARCHAR(120) NOT NULL CHECK(length(btrim(designation))>0),
 marque VARCHAR(80), modele VARCHAR(80),
 puissance_nominale_w INTEGER CHECK(puissance_nominale_w BETWEEN 1 AND 100000000),
 tension_v INTEGER CHECK(tension_v BETWEEN 1 AND 1000000),
 empreinte CHAR(64),
 statut VARCHAR(24) NOT NULL DEFAULT 'CANDIDATE' CHECK(statut IN ('CANDIDATE','REFERENCE_INTERNE','REJETEE')),
 date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 date_decision TIMESTAMPTZ,
 CONSTRAINT fk_c3_site FOREIGN KEY(site_id,tenant_id,owner_personne_id)
 REFERENCES energy_inventory_sites(id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT fk_c3_source FOREIGN KEY(source_passport_id,site_id,tenant_id,owner_personne_id)
 REFERENCES energy_equipment_passports(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT uq_c3_request UNIQUE(site_id,owner_personne_id,request_key),
 CONSTRAINT uq_c3_site_ref UNIQUE(id,site_id,tenant_id,owner_personne_id),
 CONSTRAINT ck_c3_decision CHECK ((statut='CANDIDATE' AND date_decision IS NULL) OR
   (statut<>'CANDIDATE' AND date_decision IS NOT NULL)),
 CONSTRAINT ck_c3_internal_identity CHECK (statut<>'REFERENCE_INTERNE' OR (marque IS NOT NULL AND modele IS NOT NULL AND empreinte IS NOT NULL))
);
-- La référence identifiée ne change jamais silencieusement : une correction est une nouvelle candidate.
CREATE OR REPLACE FUNCTION energy_c3_reference_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.site_id <> OLD.site_id OR NEW.tenant_id <> OLD.tenant_id OR NEW.owner_personne_id <> OLD.owner_personne_id
 OR NEW.source_passport_id IS DISTINCT FROM OLD.source_passport_id OR NEW.request_key <> OLD.request_key
 OR NEW.content_hash <> OLD.content_hash OR NEW.famille <> OLD.famille OR NEW.sous_famille <> OLD.sous_famille
 OR NEW.designation <> OLD.designation OR NEW.marque IS DISTINCT FROM OLD.marque
 OR NEW.modele IS DISTINCT FROM OLD.modele OR NEW.puissance_nominale_w IS DISTINCT FROM OLD.puissance_nominale_w
 OR NEW.tension_v IS DISTINCT FROM OLD.tension_v THEN
  RAISE EXCEPTION 'ENERGY_C3_REFERENCE_IMMUTABLE';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tr_energy_c3_ref_immutable ON energy_catalog_references;
CREATE TRIGGER tr_energy_c3_ref_immutable BEFORE UPDATE ON energy_catalog_references
 FOR EACH ROW EXECUTE FUNCTION energy_c3_reference_immutable();
CREATE UNIQUE INDEX IF NOT EXISTS uq_c3_approved_fingerprint
 ON energy_catalog_references(site_id,owner_personne_id,empreinte) WHERE statut='REFERENCE_INTERNE';
CREATE INDEX IF NOT EXISTS ix_c3_site ON energy_catalog_references(site_id,tenant_id,owner_personne_id,date_creation DESC);
CREATE TABLE IF NOT EXISTS energy_catalog_passport_links (
 passport_id BIGINT PRIMARY KEY,
 reference_id UUID NOT NULL,
 site_id BIGINT NOT NULL,
 tenant_id INTEGER NOT NULL,
 owner_personne_id INTEGER NOT NULL,
 date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT fk_c3_link_passport FOREIGN KEY(passport_id,site_id,tenant_id,owner_personne_id)
 REFERENCES energy_equipment_passports(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT fk_c3_link_ref FOREIGN KEY(reference_id,site_id,tenant_id,owner_personne_id)
 REFERENCES energy_catalog_references(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS ix_c3_link_ref ON energy_catalog_passport_links(reference_id);
CREATE TABLE IF NOT EXISTS energy_catalog_events (
 id BIGSERIAL PRIMARY KEY,
 site_id BIGINT NOT NULL,tenant_id INTEGER NOT NULL,owner_personne_id INTEGER NOT NULL,
 actor_personne_id INTEGER NOT NULL REFERENCES personnes(id) ON DELETE RESTRICT,
 action VARCHAR(36) NOT NULL CHECK(action IN ('CatalogueCandidateCreated.v1','CatalogueReferenceReviewed.v1','CatalogueReferenceRejected.v1','CataloguePassportLinked.v1')),
 reference_id UUID NOT NULL,
 details JSONB NOT NULL CHECK(jsonb_typeof(details)='object'),
 date_evenement TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT fk_c3_event_ref FOREIGN KEY(reference_id,site_id,tenant_id,owner_personne_id)
 REFERENCES energy_catalog_references(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS ix_c3_events_ref ON energy_catalog_events(reference_id,id);
CREATE OR REPLACE FUNCTION energy_c3_event_append_only() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'ENERGY_C3_AUDIT_IMMUABLE'; END $$;
DROP TRIGGER IF EXISTS tr_energy_c3_event_immutable ON energy_catalog_events;
CREATE TRIGGER tr_energy_c3_event_immutable BEFORE UPDATE OR DELETE ON energy_catalog_events
 FOR EACH ROW EXECUTE FUNCTION energy_c3_event_append_only();
COMMENT ON TABLE energy_catalog_references IS 'Référentiel de modèles technique PRIVÉ du site ; validation interne non certifiante, sans droit de partage ni IA.';
COMMENT ON TABLE energy_catalog_passport_links IS 'Liaison modèle→appareil physique, sans duplication de photo, OCR ou passeport.';
COMMIT;
