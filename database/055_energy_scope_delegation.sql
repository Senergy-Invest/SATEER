-- SUNU Courant MVP02-C1 — arborescence physique et delegations par perimetre.
-- Migration ADDITIVE et exclusivement sur sateer_test. MVP02-B1 reste inchange.
BEGIN;
DO $$ BEGIN
 IF current_database() <> 'sateer_test' THEN RAISE EXCEPTION 'ENERGY_SCOPE_055_REFUSE_HORS_SATEER_TEST'; END IF;
END $$;
CREATE TABLE IF NOT EXISTS energy_scope_nodes (
 id UUID PRIMARY KEY,
 site_id BIGINT NOT NULL,
 tenant_id INTEGER NOT NULL,
 owner_personne_id INTEGER NOT NULL,
 parent_id UUID,
 -- Correspondance facultative avec la cartographie physique 051 : aucun doublon canonique d equipement.
 legacy_zone_id BIGINT,
 type_noeud VARCHAR(32) NOT NULL CHECK (type_noeud ~ '^[A-Z_]{2,32}$'),
 nom VARCHAR(120) NOT NULL CHECK (length(btrim(nom))>0),
 request_key UUID NOT NULL,
 content_hash CHAR(64) NOT NULL,
 created_by INTEGER NOT NULL REFERENCES personnes(id) ON DELETE RESTRICT,
 date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT fk_energy_scope_site FOREIGN KEY (site_id,tenant_id,owner_personne_id)
 REFERENCES energy_inventory_sites(id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT uq_energy_scope_node_site UNIQUE (id,site_id,tenant_id,owner_personne_id),
 CONSTRAINT fk_energy_scope_zone_existante FOREIGN KEY(legacy_zone_id,site_id,tenant_id,owner_personne_id)
 REFERENCES energy_inventory_zones(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT fk_energy_scope_parent_same_site FOREIGN KEY(parent_id,site_id,tenant_id,owner_personne_id)
 REFERENCES energy_scope_nodes(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT uq_energy_scope_request UNIQUE(site_id,owner_personne_id,request_key),
 CONSTRAINT ck_energy_scope_root CHECK(parent_id IS NOT NULL OR type_noeud='SITE')
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_energy_scope_single_root ON energy_scope_nodes(site_id) WHERE parent_id IS NULL;
-- Eviter les espaces homonymes sous un meme parent lors de contributions concurrentes.
CREATE UNIQUE INDEX IF NOT EXISTS uq_energy_scope_sibling_name ON energy_scope_nodes(site_id,parent_id,lower(btrim(nom))) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_energy_scope_node_parent ON energy_scope_nodes(site_id,parent_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_energy_scope_legacy_zone ON energy_scope_nodes(site_id,legacy_zone_id) WHERE legacy_zone_id IS NOT NULL;
-- Aucun reparentage : ce sont des nœuds immuables. Un enfant ne peut avoir un parent futur, donc pas de cycle.
CREATE OR REPLACE FUNCTION energy_scope_no_reparent_055() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.parent_id IS DISTINCT FROM OLD.parent_id OR NEW.site_id <> OLD.site_id OR
    NEW.tenant_id <> OLD.tenant_id OR NEW.owner_personne_id <> OLD.owner_personne_id OR
 NEW.legacy_zone_id IS DISTINCT FROM OLD.legacy_zone_id THEN
    RAISE EXCEPTION 'ENERGY_SCOPE_IMMUTABLE_PARENT';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tr_energy_scope_no_reparent_055 ON energy_scope_nodes;
CREATE TRIGGER tr_energy_scope_no_reparent_055 BEFORE UPDATE ON energy_scope_nodes
 FOR EACH ROW EXECUTE FUNCTION energy_scope_no_reparent_055();
CREATE TABLE IF NOT EXISTS energy_scope_grants (
 id UUID PRIMARY KEY,
 site_id BIGINT NOT NULL,
 tenant_id INTEGER NOT NULL,
 owner_personne_id INTEGER NOT NULL,
 node_id UUID NOT NULL,
 personne_id INTEGER NOT NULL REFERENCES personnes(id) ON DELETE RESTRICT,
 parent_grant_id UUID,
 role_scope VARCHAR(16) NOT NULL CHECK(role_scope IN ('COORDINATEUR','RESPONSABLE','OCCUPANT')),
 statut VARCHAR(12) NOT NULL DEFAULT 'ACTIF' CHECK(statut IN ('ACTIF','REVOQUE')),
 date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 date_revocation TIMESTAMPTZ,
 CONSTRAINT uq_energy_scope_grant_site UNIQUE(id,site_id,tenant_id,owner_personne_id),
 CONSTRAINT fk_energy_scope_grant_site FOREIGN KEY(node_id,site_id,tenant_id,owner_personne_id)
 REFERENCES energy_scope_nodes(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT fk_energy_scope_grant_parent FOREIGN KEY(parent_grant_id,site_id,tenant_id,owner_personne_id)
 REFERENCES energy_scope_grants(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT ck_energy_scope_grant_root CHECK(
    (role_scope='COORDINATEUR' AND parent_grant_id IS NULL AND personne_id=owner_personne_id)
    OR (role_scope<>'COORDINATEUR' AND parent_grant_id IS NOT NULL))
);
-- Interdire changements silencieux de role, noeud, personne ou lien de tutelle.
CREATE OR REPLACE FUNCTION energy_scope_grant_immutable_055() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.parent_grant_id IS DISTINCT FROM OLD.parent_grant_id OR NEW.node_id <> OLD.node_id OR
    NEW.personne_id <> OLD.personne_id OR NEW.role_scope <> OLD.role_scope OR
    NEW.site_id <> OLD.site_id OR NEW.tenant_id <> OLD.tenant_id OR
    NEW.owner_personne_id <> OLD.owner_personne_id THEN
    RAISE EXCEPTION 'ENERGY_SCOPE_GRANT_IMMUTABLE';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tr_energy_scope_grant_immutable_055 ON energy_scope_grants;
CREATE TRIGGER tr_energy_scope_grant_immutable_055 BEFORE UPDATE ON energy_scope_grants
 FOR EACH ROW EXECUTE FUNCTION energy_scope_grant_immutable_055();
CREATE UNIQUE INDEX IF NOT EXISTS uq_energy_scope_coordinator ON energy_scope_grants(site_id) WHERE role_scope='COORDINATEUR';
CREATE UNIQUE INDEX IF NOT EXISTS uq_energy_scope_active_grant ON energy_scope_grants(site_id,node_id,personne_id,role_scope) WHERE statut='ACTIF';
CREATE INDEX IF NOT EXISTS ix_energy_scope_grants_actor ON energy_scope_grants(tenant_id,personne_id,statut);
CREATE INDEX IF NOT EXISTS ix_energy_scope_grants_parent ON energy_scope_grants(parent_grant_id,statut);
CREATE TABLE IF NOT EXISTS energy_scope_invitations (
 id UUID PRIMARY KEY,
 site_id BIGINT NOT NULL,
 tenant_id INTEGER NOT NULL,
 owner_personne_id INTEGER NOT NULL,
 issuer_grant_id UUID NOT NULL,
 target_node_id UUID NOT NULL,
 target_personne_id INTEGER NOT NULL REFERENCES personnes(id) ON DELETE RESTRICT,
 role_scope VARCHAR(16) NOT NULL CHECK(role_scope IN ('RESPONSABLE','OCCUPANT')),
 statut VARCHAR(12) NOT NULL DEFAULT 'EN_ATTENTE' CHECK(statut IN ('EN_ATTENTE','ACCEPTEE','REVOQUEE')),
 request_key UUID NOT NULL,
 content_hash CHAR(64) NOT NULL,
 accepted_grant_id UUID,
 date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 expires_at TIMESTAMPTZ NOT NULL,
 date_reponse TIMESTAMPTZ,
 CONSTRAINT fk_energy_scope_inv_issuer FOREIGN KEY(issuer_grant_id,site_id,tenant_id,owner_personne_id)
 REFERENCES energy_scope_grants(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT fk_energy_scope_inv_node FOREIGN KEY(target_node_id,site_id,tenant_id,owner_personne_id)
 REFERENCES energy_scope_nodes(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT fk_energy_scope_inv_grant FOREIGN KEY(accepted_grant_id,site_id,tenant_id,owner_personne_id)
 REFERENCES energy_scope_grants(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT uq_energy_scope_inv_request UNIQUE(issuer_grant_id,request_key),
 CONSTRAINT ck_energy_scope_inv_accept CHECK((statut='ACCEPTEE')=(accepted_grant_id IS NOT NULL))
);
CREATE OR REPLACE FUNCTION energy_scope_inv_immutable_055() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.issuer_grant_id <> OLD.issuer_grant_id OR NEW.target_node_id <> OLD.target_node_id OR
    NEW.target_personne_id <> OLD.target_personne_id OR NEW.role_scope <> OLD.role_scope OR
    NEW.site_id <> OLD.site_id OR NEW.tenant_id <> OLD.tenant_id OR NEW.owner_personne_id <> OLD.owner_personne_id THEN
    RAISE EXCEPTION 'ENERGY_SCOPE_INVITATION_IMMUTABLE';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tr_energy_scope_inv_immutable_055 ON energy_scope_invitations;
CREATE TRIGGER tr_energy_scope_inv_immutable_055 BEFORE UPDATE ON energy_scope_invitations
 FOR EACH ROW EXECUTE FUNCTION energy_scope_inv_immutable_055();
CREATE INDEX IF NOT EXISTS ix_energy_scope_inv_target ON energy_scope_invitations(tenant_id,target_personne_id,statut,expires_at);
CREATE INDEX IF NOT EXISTS ix_energy_scope_inv_issuer ON energy_scope_invitations(issuer_grant_id,date_creation DESC);
CREATE TABLE IF NOT EXISTS energy_scope_events (
 id BIGSERIAL PRIMARY KEY,
 site_id BIGINT NOT NULL,
 tenant_id INTEGER NOT NULL,
 owner_personne_id INTEGER NOT NULL,
 acteur_personne_id INTEGER NOT NULL REFERENCES personnes(id) ON DELETE RESTRICT,
 action VARCHAR(48) NOT NULL CHECK(action IN ('ScopeRootCreated.v1','ScopeNodeCreated.v1','ScopeInviteSent.v1','ScopeInviteAccepted.v1','ScopeInviteRevoked.v1','ScopeGrantRevoked.v1')),
 entity_id UUID NOT NULL,
 details JSONB NOT NULL CHECK(jsonb_typeof(details)='object'),
 date_evenement TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT fk_energy_scope_event_site FOREIGN KEY(site_id,tenant_id,owner_personne_id)
 REFERENCES energy_inventory_sites(id,tenant_id,owner_personne_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS ix_energy_scope_event_site ON energy_scope_events(site_id,date_evenement,id);
COMMENT ON TABLE energy_scope_nodes IS 'Arbre des perimetres de responsabilite; cartographie physique canonique dans energy_inventory_zones, relation legacy_zone_id facultative.';
COMMENT ON TABLE energy_scope_grants IS 'Responsabilites distinctes des lieux. Pairs autorises sur meme zone, aucune escalation de privilege.';
COMMENT ON TABLE energy_scope_invitations IS 'Invitations NOMINATIVES dans un compte Core existant ; pas de code anonyme ni d acces aux photos.';
COMMIT;
