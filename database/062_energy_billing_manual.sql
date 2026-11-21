-- E-METER-1B1 : factures/recharges DECLAREES uniquement, sans facturation calculee.
-- Installer avec l'outil de recette apres accord; garde sur sateer_test + cluster.
DO $$ BEGIN
 IF current_database() <> 'sateer_test' OR
   (SELECT system_identifier::text FROM pg_control_system()) <> '7699611241381229531'
 THEN RAISE EXCEPTION 'E_BILLING_REFUS_BASE_OU_CLUSTER'; END IF;
END $$;
CREATE TABLE IF NOT EXISTS energy_billing_declarations (
 id UUID PRIMARY KEY,
 site_id BIGINT NOT NULL, tenant_id INTEGER NOT NULL, owner_personne_id INTEGER NOT NULL,
 point_id UUID, meter_id UUID,
 nature VARCHAR(12) NOT NULL CHECK(nature IN ('FACTURE','RECHARGE')),
 energie VARCHAR(20) NOT NULL CHECK(energie IN ('ELECTRICITE','GAZ','EAU','CHALEUR','AUTRE')),
 date_document DATE NOT NULL,
 periode_debut DATE, periode_fin DATE,
 devise CHAR(3) NOT NULL CHECK(devise ~ '^[A-Z]{3}$'),
 montant NUMERIC(14,2) NOT NULL CHECK(montant>=0 AND montant<1000000000000),
 reference_document VARCHAR(80),
 reference_justificatif VARCHAR(120),
 provenance VARCHAR(24) NOT NULL DEFAULT 'SAISIE_MANUELLE' CHECK(provenance='SAISIE_MANUELLE'),
 qualification VARCHAR(24) NOT NULL DEFAULT 'DECLARE_A_VERIFIER' CHECK(qualification='DECLARE_A_VERIFIER'),
 auteur_personne_id INTEGER NOT NULL REFERENCES personnes(id) ON DELETE RESTRICT,
 request_key UUID NOT NULL, content_hash CHAR(64) NOT NULL,
 date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
 CONSTRAINT fk_billing_site FOREIGN KEY(site_id,tenant_id,owner_personne_id)
  REFERENCES energy_inventory_sites(id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT fk_billing_point FOREIGN KEY(point_id,site_id,tenant_id,owner_personne_id)
  REFERENCES energy_meter_points(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT fk_billing_meter FOREIGN KEY(meter_id,point_id,site_id,tenant_id,owner_personne_id)
  REFERENCES energy_meter_devices(id,point_id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT ck_billing_meter_point CHECK(meter_id IS NULL OR point_id IS NOT NULL),
 CONSTRAINT ck_billing_period CHECK(
   (nature='FACTURE' AND periode_debut IS NOT NULL AND periode_fin IS NOT NULL
    AND periode_debut<=periode_fin AND periode_fin<=date_document)
   OR (nature='RECHARGE' AND periode_debut IS NULL AND periode_fin IS NULL)),
 CONSTRAINT uq_billing_idempotence UNIQUE(site_id,owner_personne_id,request_key)
);
-- Une facture liee à un point doit déclarer la même énergie, y compris via SQL direct.
CREATE OR REPLACE FUNCTION energy_billing_point_energy_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.point_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM energy_meter_points p
    WHERE p.id=NEW.point_id AND p.site_id=NEW.site_id
      AND p.tenant_id=NEW.tenant_id AND p.owner_personne_id=NEW.owner_personne_id
      AND p.energie=NEW.energie
 ) THEN RAISE EXCEPTION 'E_BILLING_POINT_ENERGIE_INCOMPATIBLE'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tr_billing_point_energy ON energy_billing_declarations;
CREATE TRIGGER tr_billing_point_energy BEFORE INSERT ON energy_billing_declarations
 FOR EACH ROW EXECUTE FUNCTION energy_billing_point_energy_guard();
CREATE INDEX IF NOT EXISTS ix_billing_site_date ON energy_billing_declarations(site_id,date_document DESC,id);
CREATE INDEX IF NOT EXISTS ix_billing_meter_date ON energy_billing_declarations(meter_id,date_document DESC) WHERE meter_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS energy_billing_events (
 id BIGSERIAL PRIMARY KEY,
 site_id BIGINT NOT NULL,tenant_id INTEGER NOT NULL,owner_personne_id INTEGER NOT NULL,
 acteur_personne_id INTEGER NOT NULL REFERENCES personnes(id) ON DELETE RESTRICT,
 action VARCHAR(48) NOT NULL CHECK(action='BillingDeclarationRecorded.v1'),
 entity_id UUID NOT NULL,
 details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(details)='object'),
 date_evenement TIMESTAMPTZ NOT NULL DEFAULT now(),
 CONSTRAINT fk_billing_event_site FOREIGN KEY(site_id,tenant_id,owner_personne_id)
  REFERENCES energy_inventory_sites(id,tenant_id,owner_personne_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS ix_billing_events_site ON energy_billing_events(site_id,date_evenement,id);
CREATE OR REPLACE FUNCTION energy_billing_append_only_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'E_BILLING_HISTORIQUE_IMMUABLE'; END $$;
DROP TRIGGER IF EXISTS tr_billing_declaration_append_only ON energy_billing_declarations;
CREATE TRIGGER tr_billing_declaration_append_only BEFORE UPDATE OR DELETE ON energy_billing_declarations
 FOR EACH ROW EXECUTE FUNCTION energy_billing_append_only_guard();
DROP TRIGGER IF EXISTS tr_billing_event_append_only ON energy_billing_events;
CREATE TRIGGER tr_billing_event_append_only BEFORE UPDATE OR DELETE ON energy_billing_events
 FOR EACH ROW EXECUTE FUNCTION energy_billing_append_only_guard();
