-- SATEER Energy MVP02-A -- inventaire privé rattaché aux dossiers MVP01.
-- À exécuter UNIQUEMENT sur sateer_test après autorisation explicite (pas dans le lot A).
BEGIN;
DO $$ BEGIN
 IF current_database() <> 'sateer_test' THEN RAISE EXCEPTION 'ENERGY_INVENTORY_REFUSE_HORS_SATEER_TEST'; END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_energy_cases_owner_scope
 ON energy_cases(id,tenant_id,owner_personne_id);
CREATE TABLE IF NOT EXISTS energy_inventory_sites (
 id BIGSERIAL PRIMARY KEY,
 public_id UUID NOT NULL UNIQUE,
 tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
 owner_personne_id INTEGER NOT NULL REFERENCES personnes(id) ON DELETE RESTRICT,
 energy_case_id BIGINT NOT NULL UNIQUE,
 nom VARCHAR(120) NOT NULL CHECK (length(btrim(nom)) > 0),
 pays CHAR(2) NOT NULL CHECK (pays ~ '^[A-Z]{2}$'),
 type_site VARCHAR(30) NOT NULL,
 origine VARCHAR(20) NOT NULL DEFAULT 'ENERGY_CASE' CHECK (origine='ENERGY_CASE'),
 date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT fk_inventory_energy_case_scope FOREIGN KEY(energy_case_id,tenant_id,owner_personne_id)
 REFERENCES energy_cases(id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT uq_inventory_site_scope UNIQUE(id,tenant_id,owner_personne_id)
);
CREATE INDEX IF NOT EXISTS ix_inventory_site_owner ON energy_inventory_sites(tenant_id,owner_personne_id,date_creation DESC);
CREATE TABLE IF NOT EXISTS energy_inventory_zones (
 id BIGSERIAL PRIMARY KEY,
 public_id UUID NOT NULL UNIQUE,
 site_id BIGINT NOT NULL,
 tenant_id INTEGER NOT NULL,
 owner_personne_id INTEGER NOT NULL,
 parent_id BIGINT,
 request_key UUID NOT NULL,
 content_hash CHAR(64) NOT NULL,
 type_zone VARCHAR(20) NOT NULL CHECK(type_zone IN ('BATIMENT','ETAGE','PIECE','ZONE','EXTERIEUR')),
 nom VARCHAR(120) NOT NULL CHECK(length(btrim(nom)) > 0),
 provenance VARCHAR(20) NOT NULL DEFAULT 'DECLAREE' CHECK(provenance='DECLAREE'),
 date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT fk_inventory_zone_site FOREIGN KEY(site_id,tenant_id,owner_personne_id)
 REFERENCES energy_inventory_sites(id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT uq_inventory_zone_scope UNIQUE(id,site_id,tenant_id,owner_personne_id),
 CONSTRAINT fk_inventory_zone_parent_same_site FOREIGN KEY(parent_id,site_id,tenant_id,owner_personne_id)
 REFERENCES energy_inventory_zones(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT uq_inventory_zone_request UNIQUE(site_id,owner_personne_id,request_key)
);
CREATE INDEX IF NOT EXISTS ix_inventory_zone_site ON energy_inventory_zones(site_id,date_creation,id);
CREATE TABLE IF NOT EXISTS energy_inventory_equipements (
 id BIGSERIAL PRIMARY KEY,
 public_id UUID NOT NULL UNIQUE,
 site_id BIGINT NOT NULL,
 zone_id BIGINT NOT NULL,
 tenant_id INTEGER NOT NULL,
 owner_personne_id INTEGER NOT NULL,
 request_key UUID NOT NULL,
 content_hash CHAR(64) NOT NULL,
 nom VARCHAR(120) NOT NULL CHECK(length(btrim(nom))>0),
 famille VARCHAR(24) NOT NULL CHECK(famille IN ('ECLAIRAGE','CLIMATISATION','FROID','POMPAGE','MOTEUR','INFORMATIQUE','SOLAIRE','STOCKAGE','AUTRE')),
 quantite INTEGER NOT NULL CHECK(quantite BETWEEN 1 AND 10000),
 puissance_unitaire_w INTEGER CHECK(puissance_unitaire_w BETWEEN 1 AND 100000000),
 provenance VARCHAR(20) NOT NULL DEFAULT 'DECLAREE' CHECK(provenance='DECLAREE'),
 date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT fk_inventory_equipment_site FOREIGN KEY(site_id,tenant_id,owner_personne_id)
 REFERENCES energy_inventory_sites(id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT fk_inventory_equipment_zone_same_site FOREIGN KEY(zone_id,site_id,tenant_id,owner_personne_id)
 REFERENCES energy_inventory_zones(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT uq_inventory_equipment_request UNIQUE(site_id,owner_personne_id,request_key)
);
CREATE INDEX IF NOT EXISTS ix_inventory_equipment_site ON energy_inventory_equipements(site_id,zone_id,date_creation,id);
CREATE TABLE IF NOT EXISTS energy_inventory_events (
 id BIGSERIAL PRIMARY KEY,
 site_id BIGINT NOT NULL,
 tenant_id INTEGER NOT NULL,
 actor_personne_id INTEGER NOT NULL,
 entity_public_id UUID NOT NULL,
 event_type VARCHAR(48) NOT NULL CHECK(event_type IN ('InventorySiteCreated.v1','InventoryZoneDeclared.v1','InventoryEquipmentDeclared.v1')),
 payload JSONB NOT NULL CHECK(jsonb_typeof(payload)='object'),
 date_evenement TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT fk_inventory_event_scope FOREIGN KEY(site_id,tenant_id,actor_personne_id)
 REFERENCES energy_inventory_sites(id,tenant_id,owner_personne_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS ix_inventory_events_site ON energy_inventory_events(site_id,date_evenement,id);
COMMIT;
