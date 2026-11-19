-- SUNU Courant C3B : qualification technique par les collaborateurs C1/C2.
-- ADDITIF, base de recette epinglee uniquement. Aucun acces photo / passeport / Core.
BEGIN;
DO $$ BEGIN IF current_database()<>'sateer_test' THEN RAISE EXCEPTION 'C3B_REFUSE_HORS_SATEER_TEST'; END IF; END $$;
-- Clé composite de portée requise pour la FK vers une proposition C2 réellement intégrée.
CREATE UNIQUE INDEX IF NOT EXISTS uq_c3b_c2_proposal_scope
 ON energy_scope_proposals(id,site_id,tenant_id,owner_personne_id);
CREATE TABLE IF NOT EXISTS energy_catalog_collab_proposals (
 id UUID PRIMARY KEY,
 site_id BIGINT NOT NULL,tenant_id INTEGER NOT NULL,owner_personne_id INTEGER NOT NULL,
 source_grant_id UUID NOT NULL,scope_node_id UUID NOT NULL,
 c2_proposal_id UUID NOT NULL,
 auteur_personne_id INTEGER NOT NULL REFERENCES personnes(id) ON DELETE RESTRICT,
 reviewer_grant_id UUID,
 request_key UUID NOT NULL,content_hash CHAR(64) NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'),
 famille VARCHAR(24) NOT NULL CHECK(famille IN ('ECLAIRAGE','CLIMATISATION','FROID','POMPAGE','MOTEUR','INFORMATIQUE','SOLAIRE','STOCKAGE','AUTRE')),
 sous_famille VARCHAR(80) NOT NULL CHECK(length(btrim(sous_famille))>0),
 designation VARCHAR(120) NOT NULL CHECK(length(btrim(designation))>0),
 marque VARCHAR(80),modele VARCHAR(80),
 puissance_nominale_w INTEGER CHECK(puissance_nominale_w BETWEEN 1 AND 100000000),
 tension_v INTEGER CHECK(tension_v BETWEEN 1 AND 1000000),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 1000000),
 statut VARCHAR(20) NOT NULL DEFAULT 'EN_REVUE' CHECK(statut IN ('EN_REVUE','A_CORRIGER','REFUSEE','EN_CATALOGUE','RAPPROCHEE')),
 catalogue_reference_id UUID,
 date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),date_modification TIMESTAMPTZ NOT NULL DEFAULT NOW(),date_cloture TIMESTAMPTZ,
 CONSTRAINT fk_c3b_site FOREIGN KEY(site_id,tenant_id,owner_personne_id)
  REFERENCES energy_inventory_sites(id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT fk_c3b_source FOREIGN KEY(source_grant_id,site_id,tenant_id,owner_personne_id)
  REFERENCES energy_scope_grants(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT fk_c3b_reviewer FOREIGN KEY(reviewer_grant_id,site_id,tenant_id,owner_personne_id)
  REFERENCES energy_scope_grants(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT fk_c3b_c2 FOREIGN KEY(c2_proposal_id,site_id,tenant_id,owner_personne_id)
  REFERENCES energy_scope_proposals(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT fk_c3b_scope FOREIGN KEY(scope_node_id,site_id,tenant_id,owner_personne_id)
  REFERENCES energy_scope_nodes(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT fk_c3b_reference FOREIGN KEY(catalogue_reference_id,site_id,tenant_id,owner_personne_id)
  REFERENCES energy_catalog_references(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT uq_c3b_request UNIQUE(site_id,source_grant_id,request_key),
 CONSTRAINT ck_c3b_lifecycle CHECK (
  (statut='EN_REVUE' AND reviewer_grant_id IS NOT NULL AND date_cloture IS NULL AND catalogue_reference_id IS NULL) OR
  (statut='A_CORRIGER' AND reviewer_grant_id IS NULL AND date_cloture IS NULL AND catalogue_reference_id IS NULL) OR
  (statut='REFUSEE' AND reviewer_grant_id IS NULL AND date_cloture IS NOT NULL AND catalogue_reference_id IS NULL) OR
  (statut IN ('EN_CATALOGUE','RAPPROCHEE') AND reviewer_grant_id IS NULL AND date_cloture IS NOT NULL AND catalogue_reference_id IS NOT NULL)
 )
);
CREATE INDEX IF NOT EXISTS ix_c3b_pending ON energy_catalog_collab_proposals(site_id,reviewer_grant_id,date_creation) WHERE statut='EN_REVUE';
CREATE INDEX IF NOT EXISTS ix_c3b_author ON energy_catalog_collab_proposals(tenant_id,auteur_personne_id,date_creation DESC);
CREATE INDEX IF NOT EXISTS ix_c3b_c2 ON energy_catalog_collab_proposals(c2_proposal_id);
CREATE TABLE IF NOT EXISTS energy_catalog_collab_events (
 id BIGSERIAL PRIMARY KEY,
 proposal_id UUID NOT NULL REFERENCES energy_catalog_collab_proposals(id) ON DELETE RESTRICT,
 site_id BIGINT NOT NULL,tenant_id INTEGER NOT NULL,
 acteur_personne_id INTEGER NOT NULL REFERENCES personnes(id) ON DELETE RESTRICT,
 acteur_grant_id UUID NOT NULL REFERENCES energy_scope_grants(id) ON DELETE RESTRICT,
 version INTEGER NOT NULL CHECK(version>0),
 action VARCHAR(24) NOT NULL CHECK(action IN ('SOUMISE','TRANSMISE','A_CORRIGER','CORRIGEE','REFUSEE','EN_CATALOGUE','RAPPROCHEE')),
 details JSONB NOT NULL CHECK(jsonb_typeof(details)='object'),
 date_evenement TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_c3b_events_proposal ON energy_catalog_collab_events(proposal_id,id);
CREATE OR REPLACE FUNCTION energy_c3b_event_append_only() RETURNS TRIGGER LANGUAGE plpgsql AS $$
 BEGIN RAISE EXCEPTION 'ENERGY_C3B_AUDIT_IMMUABLE'; END $$;
DROP TRIGGER IF EXISTS tr_energy_c3b_event_immutable ON energy_catalog_collab_events;
CREATE TRIGGER tr_energy_c3b_event_immutable BEFORE UPDATE OR DELETE ON energy_catalog_collab_events
 FOR EACH ROW EXECUTE FUNCTION energy_c3b_event_append_only();
COMMENT ON TABLE energy_catalog_collab_proposals IS 'Propositions techniques collaborateurs C2, sans accès ni copie de photo ou passeport. Le coordinateur prépare une CANDIDATE C3A ou rapproche une référence interne après vérification.';
COMMIT;
