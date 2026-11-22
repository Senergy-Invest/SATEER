-- E-PARTICIPATION-1 R1 — MIGRATION ADDITIVE, recette fictive uniquement.
-- Fichier volontairement SANS BEGIN/COMMIT : le lanceur contrôle la transaction et ROLLBACK.
-- Ne jamais lancer automatiquement sur production. Pas de mutation des 8 relevés existants.
DO $$ BEGIN
 IF current_database()<>'sateer_test' OR
    (SELECT system_identifier::text FROM pg_control_system())<>'7699611241381229531' THEN
  RAISE EXCEPTION 'EP1_REFUS_BASE_OU_CLUSTER';
 END IF;
END $$;

CREATE TABLE energy_meter_participation_links (
 point_id UUID PRIMARY KEY,
 site_id BIGINT NOT NULL,
 tenant_id INTEGER NOT NULL,
 owner_personne_id INTEGER NOT NULL,
 scope_node_id UUID NOT NULL,
 created_by INTEGER NOT NULL REFERENCES personnes(id) ON DELETE RESTRICT,
 request_key UUID NOT NULL,
 content_hash CHAR(64) NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT uq_ep1_link_scope UNIQUE(point_id,site_id,tenant_id,owner_personne_id),
 CONSTRAINT uq_ep1_link_request UNIQUE(site_id,owner_personne_id,request_key),
 CONSTRAINT fk_ep1_link_point FOREIGN KEY(point_id,site_id,tenant_id,owner_personne_id)
  REFERENCES energy_meter_points(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT fk_ep1_link_node FOREIGN KEY(scope_node_id,site_id,tenant_id,owner_personne_id)
  REFERENCES energy_scope_nodes(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT
);
COMMENT ON TABLE energy_meter_participation_links IS 'Lien explicite point canonique → périmètre C1, non inféré et immuable en tranche R1';

CREATE TABLE energy_meter_participation_missions (
 id UUID PRIMARY KEY,
 site_id BIGINT NOT NULL,
 tenant_id INTEGER NOT NULL,
 owner_personne_id INTEGER NOT NULL,
 point_id UUID NOT NULL,
 meter_id UUID NOT NULL,
 register_id UUID NOT NULL,
 assignee_grant_id UUID NOT NULL,
 assigned_by INTEGER NOT NULL REFERENCES personnes(id) ON DELETE RESTRICT,
 request_key UUID NOT NULL,
 content_hash CHAR(64) NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'),
 statut VARCHAR(12) NOT NULL DEFAULT 'A_FAIRE' CHECK(statut IN ('A_FAIRE','A_REVOIR','INTEGREE','REFUSEE')),
 valeur_index NUMERIC(20,6),
 releve_le TIMESTAMPTZ,
 observation VARCHAR(240),
 submit_key UUID,
 submit_hash CHAR(64),
 review_key UUID,
 review_hash CHAR(64),
 canonical_reading_id UUID UNIQUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 submitted_at TIMESTAMPTZ,
 reviewed_at TIMESTAMPTZ,
 CONSTRAINT fk_ep1_mission_link FOREIGN KEY(point_id,site_id,tenant_id,owner_personne_id)
  REFERENCES energy_meter_participation_links(point_id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT fk_ep1_mission_register FOREIGN KEY(register_id,meter_id,point_id,site_id,tenant_id,owner_personne_id)
  REFERENCES energy_meter_registers(id,meter_id,point_id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT fk_ep1_mission_grant FOREIGN KEY(assignee_grant_id,site_id,tenant_id,owner_personne_id)
  REFERENCES energy_scope_grants(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT fk_ep1_mission_reading FOREIGN KEY(canonical_reading_id)
  REFERENCES energy_meter_readings(id) ON DELETE RESTRICT,
 CONSTRAINT uq_ep1_mission_request UNIQUE(site_id,owner_personne_id,request_key),
 CONSTRAINT ck_ep1_mission_state CHECK (
 (statut='A_FAIRE' AND valeur_index IS NULL AND releve_le IS NULL AND submit_key IS NULL AND submit_hash IS NULL AND submitted_at IS NULL AND review_key IS NULL AND review_hash IS NULL AND canonical_reading_id IS NULL AND reviewed_at IS NULL)
 OR (statut='A_REVOIR' AND valeur_index IS NOT NULL AND releve_le IS NOT NULL AND submit_key IS NOT NULL AND submit_hash IS NOT NULL AND submitted_at IS NOT NULL AND review_key IS NULL AND review_hash IS NULL AND canonical_reading_id IS NULL AND reviewed_at IS NULL)
 OR (statut='INTEGREE' AND valeur_index IS NOT NULL AND releve_le IS NOT NULL AND submit_key IS NOT NULL AND submit_hash IS NOT NULL AND submitted_at IS NOT NULL AND review_key IS NOT NULL AND review_hash IS NOT NULL AND canonical_reading_id IS NOT NULL AND reviewed_at IS NOT NULL)
 OR (statut='REFUSEE' AND valeur_index IS NOT NULL AND releve_le IS NOT NULL AND submit_key IS NOT NULL AND submit_hash IS NOT NULL AND submitted_at IS NOT NULL AND review_key IS NOT NULL AND review_hash IS NOT NULL AND canonical_reading_id IS NULL AND reviewed_at IS NOT NULL)
 )
);
CREATE UNIQUE INDEX uq_ep1_open_mission ON energy_meter_participation_missions(register_id,assignee_grant_id)
 WHERE statut IN ('A_FAIRE','A_REVOIR');
CREATE INDEX ix_ep1_mission_grant ON energy_meter_participation_missions(assignee_grant_id,created_at DESC,id);
CREATE INDEX ix_ep1_mission_site ON energy_meter_participation_missions(site_id,created_at DESC,id);

CREATE TABLE energy_meter_participation_events (
 id BIGSERIAL PRIMARY KEY,
 site_id BIGINT NOT NULL,
 tenant_id INTEGER NOT NULL,
 owner_personne_id INTEGER NOT NULL,
 actor_personne_id INTEGER NOT NULL REFERENCES personnes(id) ON DELETE RESTRICT,
 action VARCHAR(32) NOT NULL CHECK (action IN ('MeterPointScoped.v1','MeterMissionAssigned.v1','MeterMissionSubmitted.v1','MeterMissionIntegrated.v1','MeterMissionRefused.v1')),
 entity_id UUID NOT NULL,
 details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(details)='object'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT fk_ep1_event_site FOREIGN KEY(site_id,tenant_id,owner_personne_id)
  REFERENCES energy_inventory_sites(id,tenant_id,owner_personne_id) ON DELETE RESTRICT
);
CREATE INDEX ix_ep1_event_site ON energy_meter_participation_events(site_id,id);
CREATE OR REPLACE FUNCTION energy_meter_participation_immutable_066() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'EP1_HISTORIQUE_IMMUABLE'; END $$;
CREATE TRIGGER tr_ep1_links_immutable BEFORE UPDATE OR DELETE ON energy_meter_participation_links
 FOR EACH ROW EXECUTE FUNCTION energy_meter_participation_immutable_066();
CREATE TRIGGER tr_ep1_events_immutable BEFORE UPDATE OR DELETE ON energy_meter_participation_events
 FOR EACH ROW EXECUTE FUNCTION energy_meter_participation_immutable_066();
-- Les missions peuvent uniquement progresser par statut via API ; pas de DELETE applicatif.
CREATE OR REPLACE FUNCTION energy_meter_participation_no_delete_066() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'EP1_MISSION_SUPPRESSION_REFUSEE'; END $$;
CREATE TRIGGER tr_ep1_mission_no_delete BEFORE DELETE ON energy_meter_participation_missions
 FOR EACH ROW EXECUTE FUNCTION energy_meter_participation_no_delete_066();
