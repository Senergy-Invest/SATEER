-- E-METER-1A : données CANONIQUES déclaratives. À installer sur sateer_test seulement,
-- via la commande de recette après accord explicite. Pas de calcul de consommation.
DO $$ BEGIN
 IF current_database() <> 'sateer_test' OR
    (SELECT system_identifier::text FROM pg_control_system()) <> '7699611241381229531'
 THEN RAISE EXCEPTION 'E_METER_REFUS_BASE_OU_CLUSTER'; END IF;
END $$;
CREATE TABLE IF NOT EXISTS energy_meter_points (
 id UUID PRIMARY KEY, site_id BIGINT NOT NULL, tenant_id INTEGER NOT NULL,
 owner_personne_id INTEGER NOT NULL, nom VARCHAR(120) NOT NULL CHECK (length(btrim(nom))>0),
 energie VARCHAR(20) NOT NULL CHECK(energie IN ('ELECTRICITE','GAZ','EAU','CHALEUR','AUTRE')),
 type_point VARCHAR(20) NOT NULL CHECK(type_point IN ('GENERAL','SECONDAIRE','AUTRE')),
 request_key UUID NOT NULL, content_hash CHAR(64) NOT NULL,
 date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
 CONSTRAINT fk_meter_point_site FOREIGN KEY(site_id,tenant_id,owner_personne_id)
 REFERENCES energy_inventory_sites(id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT uq_meter_point_scope UNIQUE(id,site_id,tenant_id,owner_personne_id),
 CONSTRAINT uq_meter_point_request UNIQUE(site_id,owner_personne_id,request_key)
);
CREATE INDEX IF NOT EXISTS ix_meter_points_site ON energy_meter_points(site_id,date_creation,id);
CREATE TABLE IF NOT EXISTS energy_meter_devices (
 id UUID PRIMARY KEY, point_id UUID NOT NULL, site_id BIGINT NOT NULL, tenant_id INTEGER NOT NULL,
 owner_personne_id INTEGER NOT NULL, nom VARCHAR(120) NOT NULL CHECK(length(btrim(nom))>0),
 technologie VARCHAR(20) NOT NULL CHECK(technologie IN ('MECANIQUE','ELECTRONIQUE','COMMUNICANT','INCONNUE')),
 mode_commercial VARCHAR(20) NOT NULL CHECK(mode_commercial IN ('PREPAYE','POSTPAYE','SANS_CONTRAT','INCONNU')),
 numero_serie VARCHAR(80), actif BOOLEAN NOT NULL DEFAULT TRUE,
 date_installation TIMESTAMPTZ NOT NULL DEFAULT now(), date_retrait TIMESTAMPTZ,
 request_key UUID NOT NULL, content_hash CHAR(64) NOT NULL,
 CONSTRAINT fk_meter_device_point FOREIGN KEY(point_id,site_id,tenant_id,owner_personne_id)
 REFERENCES energy_meter_points(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT uq_meter_device_scope UNIQUE(id,point_id,site_id,tenant_id,owner_personne_id),
 CONSTRAINT uq_meter_device_request UNIQUE(site_id,owner_personne_id,request_key),
 CONSTRAINT ck_meter_device_history CHECK (date_retrait IS NULL OR date_retrait >= date_installation)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_meter_active_per_point ON energy_meter_devices(point_id) WHERE actif=TRUE;
CREATE INDEX IF NOT EXISTS ix_meter_devices_point ON energy_meter_devices(point_id,date_installation,id);
CREATE TABLE IF NOT EXISTS energy_meter_registers (
 id UUID PRIMARY KEY, meter_id UUID NOT NULL, point_id UUID NOT NULL,site_id BIGINT NOT NULL,
 tenant_id INTEGER NOT NULL,owner_personne_id INTEGER NOT NULL,
 code VARCHAR(32) NOT NULL CHECK(code ~ '^[A-Z0-9][A-Z0-9_-]{0,31}$'),
 unite VARCHAR(12) NOT NULL CHECK(unite IN ('KWH','KVARH','KVAH','M3','L','KG','H','UNITE')),
 date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
 request_key UUID NOT NULL, content_hash CHAR(64) NOT NULL,
 CONSTRAINT fk_meter_register_device FOREIGN KEY(meter_id,point_id,site_id,tenant_id,owner_personne_id)
 REFERENCES energy_meter_devices(id,point_id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT uq_meter_register_scope UNIQUE(id,meter_id,point_id,site_id,tenant_id,owner_personne_id),
 CONSTRAINT uq_meter_register_code UNIQUE(meter_id,code),
 CONSTRAINT uq_meter_register_request UNIQUE(site_id,owner_personne_id,request_key)
);
CREATE TABLE IF NOT EXISTS energy_meter_readings (
 id UUID PRIMARY KEY, register_id UUID NOT NULL, meter_id UUID NOT NULL, point_id UUID NOT NULL,
 site_id BIGINT NOT NULL, tenant_id INTEGER NOT NULL, owner_personne_id INTEGER NOT NULL,
 valeur_index NUMERIC(20,6) NOT NULL CHECK(valeur_index>=0),
 unite_snapshot VARCHAR(12) NOT NULL,
 releve_le TIMESTAMPTZ NOT NULL, provenance VARCHAR(24) NOT NULL DEFAULT 'SAISIE_MANUELLE' CHECK(provenance='SAISIE_MANUELLE'),
 qualification VARCHAR(24) NOT NULL DEFAULT 'DECLARE_A_VERIFIER' CHECK(qualification='DECLARE_A_VERIFIER'),
 observation VARCHAR(240), auteur_personne_id INTEGER NOT NULL REFERENCES personnes(id) ON DELETE RESTRICT,
 request_key UUID NOT NULL, content_hash CHAR(64) NOT NULL,
 date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
 CONSTRAINT fk_meter_reading_register FOREIGN KEY(register_id,meter_id,point_id,site_id,tenant_id,owner_personne_id)
 REFERENCES energy_meter_registers(id,meter_id,point_id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT uq_meter_reading_request UNIQUE(site_id,owner_personne_id,request_key),
 CONSTRAINT uq_meter_reading_instant UNIQUE(register_id,releve_le)
);
CREATE INDEX IF NOT EXISTS ix_meter_readings_history ON energy_meter_readings(register_id,releve_le DESC,id);
CREATE TABLE IF NOT EXISTS energy_meter_events (
 id BIGSERIAL PRIMARY KEY, site_id BIGINT NOT NULL, tenant_id INTEGER NOT NULL, owner_personne_id INTEGER NOT NULL,
 acteur_personne_id INTEGER NOT NULL REFERENCES personnes(id) ON DELETE RESTRICT,
 action VARCHAR(48) NOT NULL CHECK (action IN ('MeterPointDeclared.v1','MeterDeviceDeclared.v1','MeterRegisterDeclared.v1','MeterReadingDeclared.v1')),
 entity_id UUID NOT NULL, details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(details)='object'),
 date_evenement TIMESTAMPTZ NOT NULL DEFAULT now(),
 CONSTRAINT fk_meter_event_site FOREIGN KEY(site_id,tenant_id,owner_personne_id)
 REFERENCES energy_inventory_sites(id,tenant_id,owner_personne_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS ix_meter_events_site ON energy_meter_events(site_id,date_evenement,id);
-- Les mesures et événements validés en écriture sont append-only.
CREATE OR REPLACE FUNCTION energy_meter_append_only_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'E_METER_HISTORIQUE_IMMUABLE'; END $$;
DROP TRIGGER IF EXISTS tr_meter_reading_append_only ON energy_meter_readings;
CREATE TRIGGER tr_meter_reading_append_only BEFORE UPDATE OR DELETE ON energy_meter_readings
 FOR EACH ROW EXECUTE FUNCTION energy_meter_append_only_guard();
DROP TRIGGER IF EXISTS tr_meter_event_append_only ON energy_meter_events;
CREATE TRIGGER tr_meter_event_append_only BEFORE UPDATE OR DELETE ON energy_meter_events
 FOR EACH ROW EXECUTE FUNCTION energy_meter_append_only_guard();
