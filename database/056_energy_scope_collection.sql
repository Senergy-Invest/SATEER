-- SATEER ENERGY MVP02-C2 : collecte par affectation C1, validations ascendantes.
-- Ajout seul, exclusivement sateer_test, aucune modification de 050-055 ni Core.
BEGIN;
DO $$ BEGIN
 IF current_database()<>'sateer_test' THEN RAISE EXCEPTION 'ENERGY_C2_REFUSE_HORS_TEST'; END IF;
END $$;
CREATE TABLE IF NOT EXISTS energy_scope_proposals (
 id UUID PRIMARY KEY,
 site_id BIGINT NOT NULL,
 tenant_id INTEGER NOT NULL,
 owner_personne_id INTEGER NOT NULL,
 source_grant_id UUID NOT NULL,
 scope_node_id UUID NOT NULL,
 auteur_personne_id INTEGER NOT NULL REFERENCES personnes(id) ON DELETE RESTRICT,
 reviewer_grant_id UUID,
 request_key UUID NOT NULL,
 content_hash CHAR(64) NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'),
 nom VARCHAR(120) NOT NULL CHECK(length(btrim(nom))>0),
 famille VARCHAR(24) NOT NULL CHECK(famille IN ('ECLAIRAGE','CLIMATISATION','FROID','POMPAGE','MOTEUR','INFORMATIQUE','SOLAIRE','STOCKAGE','AUTRE')),
 quantite INTEGER NOT NULL CHECK(quantite BETWEEN 1 AND 10000),
 puissance_unitaire_w INTEGER CHECK(puissance_unitaire_w BETWEEN 1 AND 100000000),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 1000000),
 statut VARCHAR(16) NOT NULL DEFAULT 'EN_REVUE' CHECK(statut IN ('EN_REVUE','A_CORRIGER','REFUSEE','INTEGREE')),
 equipment_id BIGINT,
 date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 date_modification TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 date_cloture TIMESTAMPTZ,
 CONSTRAINT fk_c2_site FOREIGN KEY(site_id,tenant_id,owner_personne_id) REFERENCES energy_inventory_sites(id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT fk_c2_source FOREIGN KEY(source_grant_id,site_id,tenant_id,owner_personne_id) REFERENCES energy_scope_grants(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT fk_c2_reviewer FOREIGN KEY(reviewer_grant_id,site_id,tenant_id,owner_personne_id) REFERENCES energy_scope_grants(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT fk_c2_node FOREIGN KEY(scope_node_id,site_id,tenant_id,owner_personne_id) REFERENCES energy_scope_nodes(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT fk_c2_equipment FOREIGN KEY(equipment_id,site_id,tenant_id,owner_personne_id) REFERENCES energy_inventory_equipements(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT ck_c2_statut CHECK ((statut='EN_REVUE' AND reviewer_grant_id IS NOT NULL AND equipment_id IS NULL AND date_cloture IS NULL)
 OR (statut='A_CORRIGER' AND reviewer_grant_id IS NULL AND equipment_id IS NULL AND date_cloture IS NULL)
 OR (statut='REFUSEE' AND reviewer_grant_id IS NULL AND equipment_id IS NULL AND date_cloture IS NOT NULL)
 OR (statut='INTEGREE' AND reviewer_grant_id IS NULL AND equipment_id IS NOT NULL AND date_cloture IS NOT NULL)),
 CONSTRAINT uq_c2_request UNIQUE(site_id,source_grant_id,request_key)
);
CREATE INDEX IF NOT EXISTS ix_c2_reviewer ON energy_scope_proposals(site_id,reviewer_grant_id,date_creation) WHERE statut='EN_REVUE';
CREATE INDEX IF NOT EXISTS ix_c2_author ON energy_scope_proposals(tenant_id,auteur_personne_id,date_creation DESC);
CREATE TABLE IF NOT EXISTS energy_scope_proposal_events (
 id BIGSERIAL PRIMARY KEY,
 proposal_id UUID NOT NULL REFERENCES energy_scope_proposals(id) ON DELETE RESTRICT,
 site_id BIGINT NOT NULL,
 tenant_id INTEGER NOT NULL,
 acteur_personne_id INTEGER NOT NULL REFERENCES personnes(id) ON DELETE RESTRICT,
 acteur_grant_id UUID NOT NULL,
 version INTEGER NOT NULL CHECK(version>0),
 action VARCHAR(24) NOT NULL CHECK(action IN ('SOUMISE','TRANSMISE','A_CORRIGER','CORRIGEE','REFUSEE','INTEGREE')),
 details JSONB NOT NULL CHECK(jsonb_typeof(details)='object'),
 date_evenement TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT fk_c2_event_grant FOREIGN KEY(acteur_grant_id) REFERENCES energy_scope_grants(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS ix_c2_events ON energy_scope_proposal_events(proposal_id,id);
CREATE OR REPLACE FUNCTION energy_c2_event_append_only() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'ENERGY_C2_AUDIT_IMMUABLE'; END $$;
DROP TRIGGER IF EXISTS tr_energy_c2_event_immutable ON energy_scope_proposal_events;
CREATE TRIGGER tr_energy_c2_event_immutable BEFORE UPDATE OR DELETE ON energy_scope_proposal_events
 FOR EACH ROW EXECUTE FUNCTION energy_c2_event_append_only();
CREATE TABLE IF NOT EXISTS energy_scope_equipment_locations (
 equipment_id BIGINT PRIMARY KEY,
 site_id BIGINT NOT NULL,
 tenant_id INTEGER NOT NULL,
 owner_personne_id INTEGER NOT NULL,
 scope_node_id UUID NOT NULL,
 proposal_id UUID NOT NULL UNIQUE REFERENCES energy_scope_proposals(id) ON DELETE RESTRICT,
 date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT fk_c2_location_equipment FOREIGN KEY(equipment_id,site_id,tenant_id,owner_personne_id) REFERENCES energy_inventory_equipements(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT fk_c2_location_node FOREIGN KEY(scope_node_id,site_id,tenant_id,owner_personne_id) REFERENCES energy_scope_nodes(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS ix_c2_location_node ON energy_scope_equipment_locations(site_id,scope_node_id);
COMMENT ON TABLE energy_scope_proposals IS 'Propositions par perimetre C1, validation via chaine de grants, aucune insertion canonique avant coordinateur';
COMMENT ON TABLE energy_scope_equipment_locations IS 'Localisation fine des equipements C2 sans reproduire la table canonique Equipment 051';
COMMIT;
