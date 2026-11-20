-- SUNU Courant C4A : graphe electrique declare, carte physique C1 et usages canoniques 051.
-- Uniquement sateer_test ; additif ; aucun schema Core / P1 / Ambassade / Diaspora modifie.
BEGIN;
DO $$ BEGIN
 IF current_database()<>'sateer_test' THEN RAISE EXCEPTION 'ENERGY_C4A_HORS_BASE_RECETTE'; END IF;
END $$;
CREATE TABLE IF NOT EXISTS energy_topology_assets (
 id UUID PRIMARY KEY,
 site_id BIGINT NOT NULL,
 tenant_id INTEGER NOT NULL,
 owner_personne_id INTEGER NOT NULL,
 type_noeud VARCHAR(20) NOT NULL CHECK(type_noeud IN ('SOURCE','COMPTEUR','TABLEAU','CIRCUIT','DEPART')),
 nom VARCHAR(120) NOT NULL CHECK(length(btrim(nom))>0),
 repere VARCHAR(60),
 scope_node_id UUID,
 request_key UUID NOT NULL,
 content_hash CHAR(64) NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'),
 auteur_personne_id INTEGER NOT NULL REFERENCES personnes(id) ON DELETE RESTRICT,
 fiabilite VARCHAR(24) NOT NULL DEFAULT 'DECLARE_A_VERIFIER' CHECK(fiabilite='DECLARE_A_VERIFIER'),
 date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT fk_c4a_asset_site FOREIGN KEY(site_id,tenant_id,owner_personne_id)
  REFERENCES energy_inventory_sites(id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT fk_c4a_asset_scope FOREIGN KEY(scope_node_id,site_id,tenant_id,owner_personne_id)
  REFERENCES energy_scope_nodes(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT uq_c4a_asset_scope UNIQUE(id,site_id,tenant_id,owner_personne_id),
 CONSTRAINT uq_c4a_asset_req UNIQUE(site_id,owner_personne_id,request_key)
);
CREATE INDEX IF NOT EXISTS ix_c4a_assets_site ON energy_topology_assets(site_id,date_creation,id);
CREATE TABLE IF NOT EXISTS energy_topology_links (
 id UUID PRIMARY KEY,
 site_id BIGINT NOT NULL,
 tenant_id INTEGER NOT NULL,
 owner_personne_id INTEGER NOT NULL,
 source_asset_id UUID NOT NULL,
 target_asset_id UUID,
 target_scope_node_id UUID,
 target_equipment_id BIGINT,
 type_lien VARCHAR(16) NOT NULL CHECK(type_lien IN ('ALIMENTE','MESURE','DESSERT')),
 request_key UUID NOT NULL,
 content_hash CHAR(64) NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'),
 auteur_personne_id INTEGER NOT NULL REFERENCES personnes(id) ON DELETE RESTRICT,
 fiabilite VARCHAR(24) NOT NULL DEFAULT 'DECLARE_A_VERIFIER' CHECK(fiabilite='DECLARE_A_VERIFIER'),
 actif BOOLEAN NOT NULL DEFAULT TRUE,
 date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 date_retrait TIMESTAMPTZ,
 retire_par INTEGER REFERENCES personnes(id) ON DELETE RESTRICT,
 CONSTRAINT fk_c4a_link_source FOREIGN KEY(source_asset_id,site_id,tenant_id,owner_personne_id)
  REFERENCES energy_topology_assets(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT fk_c4a_link_target_asset FOREIGN KEY(target_asset_id,site_id,tenant_id,owner_personne_id)
  REFERENCES energy_topology_assets(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT fk_c4a_link_target_scope FOREIGN KEY(target_scope_node_id,site_id,tenant_id,owner_personne_id)
  REFERENCES energy_scope_nodes(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT fk_c4a_link_target_equip FOREIGN KEY(target_equipment_id,site_id,tenant_id,owner_personne_id)
  REFERENCES energy_inventory_equipements(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT uq_c4a_link_req UNIQUE(site_id,owner_personne_id,request_key),
 CONSTRAINT ck_c4a_link_one_target CHECK(
  (CASE WHEN target_asset_id IS NULL THEN 0 ELSE 1 END +
   CASE WHEN target_scope_node_id IS NULL THEN 0 ELSE 1 END +
   CASE WHEN target_equipment_id IS NULL THEN 0 ELSE 1 END)=1),
 CONSTRAINT ck_c4a_link_semantics CHECK(
  (type_lien='ALIMENTE' AND target_scope_node_id IS NULL) OR
  (type_lien='DESSERT' AND target_scope_node_id IS NOT NULL) OR
  (type_lien='MESURE')),
 CONSTRAINT ck_c4a_link_retired CHECK ((actif AND date_retrait IS NULL AND retire_par IS NULL) OR
                                      (NOT actif AND date_retrait IS NOT NULL AND retire_par IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_c4a_link_active ON energy_topology_links
 (site_id,source_asset_id,type_lien,COALESCE(target_asset_id::text,''),COALESCE(target_scope_node_id::text,''),COALESCE(target_equipment_id::text,'')) WHERE actif;
CREATE INDEX IF NOT EXISTS ix_c4a_links_site ON energy_topology_links(site_id,source_asset_id,actif);
CREATE TABLE IF NOT EXISTS energy_topology_usages (
 id UUID PRIMARY KEY,
 site_id BIGINT NOT NULL,
 tenant_id INTEGER NOT NULL,
 owner_personne_id INTEGER NOT NULL,
 equipment_id BIGINT NOT NULL,
 usage VARCHAR(20) NOT NULL CHECK(usage IN ('FROID','ECLAIRAGE','VENTILATION','CHAUFFAGE','POMPAGE','INFORMATIQUE','PRODUCTION','SECURITE','AUTRE')),
 commentaire VARCHAR(200),
 request_key UUID NOT NULL,
 content_hash CHAR(64) NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'),
 auteur_personne_id INTEGER NOT NULL REFERENCES personnes(id) ON DELETE RESTRICT,
 fiabilite VARCHAR(24) NOT NULL DEFAULT 'DECLARE_A_VERIFIER' CHECK(fiabilite='DECLARE_A_VERIFIER'),
 date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT fk_c4a_usage_equipment FOREIGN KEY(equipment_id,site_id,tenant_id,owner_personne_id)
  REFERENCES energy_inventory_equipements(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT uq_c4a_usage_request UNIQUE(site_id,owner_personne_id,request_key),
 CONSTRAINT uq_c4a_usage_per_equipment UNIQUE(site_id,equipment_id,usage)
);
CREATE INDEX IF NOT EXISTS ix_c4a_usage_site ON energy_topology_usages(site_id,equipment_id);
CREATE TABLE IF NOT EXISTS energy_topology_events (
 id BIGSERIAL PRIMARY KEY,
 site_id BIGINT NOT NULL,
 tenant_id INTEGER NOT NULL,
 owner_personne_id INTEGER NOT NULL,
 acteur_personne_id INTEGER NOT NULL REFERENCES personnes(id) ON DELETE RESTRICT,
 action VARCHAR(48) NOT NULL CHECK(action IN ('TopologyAssetCreated.v1','TopologyLinkDeclared.v1','TopologyLinkWithdrawn.v1','TopologyUsageDeclared.v1')),
 entity_id UUID NOT NULL,
 details JSONB NOT NULL CHECK(jsonb_typeof(details)='object'),
 date_evenement TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT fk_c4a_event_site FOREIGN KEY(site_id,tenant_id,owner_personne_id)
  REFERENCES energy_inventory_sites(id,tenant_id,owner_personne_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS ix_c4a_events_site ON energy_topology_events(site_id,date_evenement,id);
CREATE OR REPLACE FUNCTION energy_topology_059_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'ENERGY_C4A_IMMUABLE'; END $$;
DROP TRIGGER IF EXISTS tr_c4a_asset_immutable ON energy_topology_assets;
CREATE TRIGGER tr_c4a_asset_immutable BEFORE UPDATE OR DELETE ON energy_topology_assets FOR EACH ROW EXECUTE FUNCTION energy_topology_059_immutable();
DROP TRIGGER IF EXISTS tr_c4a_usage_immutable ON energy_topology_usages;
CREATE TRIGGER tr_c4a_usage_immutable BEFORE UPDATE OR DELETE ON energy_topology_usages FOR EACH ROW EXECUTE FUNCTION energy_topology_059_immutable();
DROP TRIGGER IF EXISTS tr_c4a_event_immutable ON energy_topology_events;
CREATE TRIGGER tr_c4a_event_immutable BEFORE UPDATE OR DELETE ON energy_topology_events FOR EACH ROW EXECUTE FUNCTION energy_topology_059_immutable();
CREATE OR REPLACE FUNCTION energy_topology_059_check_link() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE src_type VARCHAR(20); cycle_found BOOLEAN;
BEGIN
 SELECT type_noeud INTO src_type FROM energy_topology_assets
  WHERE id=NEW.source_asset_id AND site_id=NEW.site_id AND tenant_id=NEW.tenant_id AND owner_personne_id=NEW.owner_personne_id;
 IF src_type IS NULL THEN RAISE EXCEPTION 'ENERGY_C4A_SOURCE_INCONNUE'; END IF;
 IF NEW.type_lien='MESURE' AND src_type<>'COMPTEUR' THEN RAISE EXCEPTION 'ENERGY_C4A_MESURE_COMPTEUR_REQUIS'; END IF;
 IF NEW.type_lien='DESSERT' AND src_type NOT IN ('SOURCE','TABLEAU','CIRCUIT','DEPART') THEN RAISE EXCEPTION 'ENERGY_C4A_DESSERT_TABLEAU_REQUIS'; END IF;
 IF NEW.type_lien='ALIMENTE' AND NEW.target_asset_id IS NOT NULL THEN
  IF NEW.source_asset_id=NEW.target_asset_id THEN RAISE EXCEPTION 'ENERGY_C4A_BOUCLE_ALIMENTATION'; END IF;
  WITH RECURSIVE parcours(id) AS (
   SELECT NEW.target_asset_id
   UNION
   SELECT l.target_asset_id FROM energy_topology_links l JOIN parcours p ON l.source_asset_id=p.id
    WHERE l.site_id=NEW.site_id AND l.tenant_id=NEW.tenant_id AND l.owner_personne_id=NEW.owner_personne_id
      AND l.actif AND l.type_lien='ALIMENTE' AND l.target_asset_id IS NOT NULL
  ) SELECT EXISTS(SELECT 1 FROM parcours WHERE id=NEW.source_asset_id) INTO cycle_found;
  IF cycle_found THEN RAISE EXCEPTION 'ENERGY_C4A_BOUCLE_ALIMENTATION'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tr_c4a_link_check ON energy_topology_links;
CREATE TRIGGER tr_c4a_link_check BEFORE INSERT ON energy_topology_links FOR EACH ROW EXECUTE FUNCTION energy_topology_059_check_link();
CREATE OR REPLACE FUNCTION energy_topology_059_link_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'ENERGY_C4A_LIEN_IMMUABLE'; END IF;
 IF NEW.id<>OLD.id OR NEW.site_id<>OLD.site_id OR NEW.tenant_id<>OLD.tenant_id OR
    NEW.owner_personne_id<>OLD.owner_personne_id OR NEW.source_asset_id<>OLD.source_asset_id OR
    NEW.target_asset_id IS DISTINCT FROM OLD.target_asset_id OR
    NEW.target_scope_node_id IS DISTINCT FROM OLD.target_scope_node_id OR
    NEW.target_equipment_id IS DISTINCT FROM OLD.target_equipment_id OR
    NEW.type_lien<>OLD.type_lien OR NEW.auteur_personne_id<>OLD.auteur_personne_id OR
    NEW.request_key<>OLD.request_key OR NEW.content_hash<>OLD.content_hash OR
    NEW.fiabilite<>OLD.fiabilite OR NEW.date_creation<>OLD.date_creation THEN
    RAISE EXCEPTION 'ENERGY_C4A_LIEN_IMMUABLE';
 END IF;
 IF NOT OLD.actif AND NEW.actif THEN RAISE EXCEPTION 'ENERGY_C4A_REACTIVATION_REFUSEE'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tr_c4a_link_immutable ON energy_topology_links;
CREATE TRIGGER tr_c4a_link_immutable BEFORE UPDATE OR DELETE ON energy_topology_links FOR EACH ROW EXECUTE FUNCTION energy_topology_059_link_immutable();
COMMENT ON TABLE energy_topology_assets IS 'Appareillages electriques declares du site, distincts des machines Energy 051 et des espaces C1. Aucune validation electrique implicite.';
COMMENT ON TABLE energy_topology_links IS 'Relations declarees ALIMENTE, MESURE, DESSERT; plusieurs batiments peuvent etre mesures par le meme compteur. Liens retirable sans effacement.';
COMMENT ON TABLE energy_topology_usages IS 'Troisieme carte fonctionnelle, rattachee uniquement aux equipements canoniques 051; pas de comptage energetique.';
COMMENT ON TABLE energy_topology_events IS 'Historique append-only du graphe electrique et fonctionnel, aucune certification ni consommation inferee.';
COMMIT;
