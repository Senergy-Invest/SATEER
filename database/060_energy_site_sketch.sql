-- SUNU Courant C4B : positions D'ESQUISSE ; pas de mutation de topology C4A ou scopes C1.
-- Exclusivement recette sateer_test ; pas de plan professionnel sans mission contractuelle.
BEGIN;
DO $$ BEGIN
 IF current_database()<>'sateer_test' THEN RAISE EXCEPTION 'ENERGY_C4B_REFUSE_HORS_TEST'; END IF;
END $$;
CREATE TABLE IF NOT EXISTS energy_sketch_positions (
 id UUID PRIMARY KEY,
 site_id BIGINT NOT NULL,
 tenant_id INTEGER NOT NULL,
 owner_personne_id INTEGER NOT NULL,
 vue VARCHAR(16) NOT NULL CHECK (vue IN ('PHYSIQUE','ELECTRIQUE','FONCTIONNELLE')),
 scope_node_id UUID,
 asset_id UUID,
 equipment_id BIGINT,
 x INTEGER NOT NULL CHECK (x BETWEEN 0 AND 1000),
 y INTEGER NOT NULL CHECK (y BETWEEN 0 AND 700),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 1000000),
 updated_by INTEGER NOT NULL REFERENCES personnes(id) ON DELETE RESTRICT,
 date_modification TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT fk_sketch_site FOREIGN KEY(site_id,tenant_id,owner_personne_id)
   REFERENCES energy_inventory_sites(id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT fk_sketch_scope FOREIGN KEY(scope_node_id,site_id,tenant_id,owner_personne_id)
   REFERENCES energy_scope_nodes(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT fk_sketch_asset FOREIGN KEY(asset_id,site_id,tenant_id,owner_personne_id)
   REFERENCES energy_topology_assets(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT fk_sketch_equipment FOREIGN KEY(equipment_id,site_id,tenant_id,owner_personne_id)
   REFERENCES energy_inventory_equipements(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT ck_sketch_exactly_one CHECK((scope_node_id IS NOT NULL)::int+(asset_id IS NOT NULL)::int+(equipment_id IS NOT NULL)::int=1)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sketch_scope ON energy_sketch_positions(site_id,vue,scope_node_id) WHERE scope_node_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sketch_asset ON energy_sketch_positions(site_id,vue,asset_id) WHERE asset_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sketch_eq ON energy_sketch_positions(site_id,vue,equipment_id) WHERE equipment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_sketch_site_view ON energy_sketch_positions(site_id,vue,date_modification,id);
CREATE OR REPLACE FUNCTION energy_sketch_identity_immutable_060() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.site_id<>OLD.site_id OR NEW.tenant_id<>OLD.tenant_id OR NEW.owner_personne_id<>OLD.owner_personne_id OR
 NEW.vue<>OLD.vue OR NEW.scope_node_id IS DISTINCT FROM OLD.scope_node_id OR
 NEW.asset_id IS DISTINCT FROM OLD.asset_id OR NEW.equipment_id IS DISTINCT FROM OLD.equipment_id OR
 NEW.revision<>OLD.revision+1 THEN
 RAISE EXCEPTION 'ENERGY_SKETCH_IDENTITY_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tr_sketch_identity_immutable_060 ON energy_sketch_positions;
CREATE TRIGGER tr_sketch_identity_immutable_060 BEFORE UPDATE ON energy_sketch_positions
 FOR EACH ROW EXECUTE FUNCTION energy_sketch_identity_immutable_060();
CREATE TABLE IF NOT EXISTS energy_sketch_events (
 id BIGSERIAL PRIMARY KEY,
 site_id BIGINT NOT NULL,
 tenant_id INTEGER NOT NULL,
 owner_personne_id INTEGER NOT NULL,
 acteur_personne_id INTEGER NOT NULL REFERENCES personnes(id) ON DELETE RESTRICT,
 position_id UUID NOT NULL REFERENCES energy_sketch_positions(id) ON DELETE RESTRICT,
 vue VARCHAR(16) NOT NULL CHECK (vue IN ('PHYSIQUE','ELECTRIQUE','FONCTIONNELLE')),
 request_key UUID NOT NULL,
 content_hash CHAR(64) NOT NULL,
 revision INTEGER NOT NULL CHECK(revision>0),
 x INTEGER NOT NULL CHECK(x BETWEEN 0 AND 1000),
 y INTEGER NOT NULL CHECK(y BETWEEN 0 AND 700),
 date_evenement TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT fk_sketch_event_site FOREIGN KEY(site_id,tenant_id,owner_personne_id)
 REFERENCES energy_inventory_sites(id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT uq_sketch_event_request UNIQUE(site_id,owner_personne_id,request_key)
);
CREATE OR REPLACE FUNCTION energy_sketch_events_append_only_060() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'ENERGY_SKETCH_AUDIT_IMMUABLE'; END $$;
DROP TRIGGER IF EXISTS tr_sketch_event_immutable_060 ON energy_sketch_events;
CREATE TRIGGER tr_sketch_event_immutable_060 BEFORE UPDATE OR DELETE ON energy_sketch_events
 FOR EACH ROW EXECUTE FUNCTION energy_sketch_events_append_only_060();
COMMENT ON TABLE energy_sketch_positions IS 'Mise en page 2D seulement ; aucune relation electrique, mesure ou permission ne peut en etre deduite.';
COMMENT ON TABLE energy_sketch_events IS 'Traçabilite immutable des déplacements sur esquisse.';
COMMIT;
