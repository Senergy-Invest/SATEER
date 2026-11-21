-- E-METER-1C1 : index versionnes des rectifications, immuables et attaches aux declarations 062.
-- Ce fichier n'est execute en persistance que sur sateer_test et sur autorisation explicite.
DO $$ BEGIN
 IF current_database()<>'sateer_test' OR
   (SELECT system_identifier::text FROM pg_control_system())<>'7699611241381229531'
 THEN RAISE EXCEPTION 'E_BILLING_REVISION_REFUS_BASE_OU_CLUSTER'; END IF;
END $$;
-- Cle referencable scoppée pour empecher les associations cross-site en SQL direct.
CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_declarations_scope_ref
 ON energy_billing_declarations(id,site_id,tenant_id,owner_personne_id);
CREATE TABLE IF NOT EXISTS energy_billing_rectifications (
 id UUID PRIMARY KEY,
 site_id BIGINT NOT NULL, tenant_id INTEGER NOT NULL, owner_personne_id INTEGER NOT NULL,
 original_declaration_id UUID NOT NULL, corrected_declaration_id UUID NOT NULL,
 revision INTEGER NOT NULL CHECK(revision BETWEEN 1 AND 20),
 motif VARCHAR(400) NOT NULL CHECK(length(btrim(motif)) BETWEEN 12 AND 400),
 acteur_personne_id INTEGER NOT NULL REFERENCES personnes(id) ON DELETE RESTRICT,
 request_key UUID NOT NULL, content_hash CHAR(64) NOT NULL CHECK(content_hash~'^[a-f0-9]{64}$'),
 date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
 CONSTRAINT fk_billing_revision_site FOREIGN KEY(site_id,tenant_id,owner_personne_id)
  REFERENCES energy_inventory_sites(id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT fk_billing_revision_original FOREIGN KEY(original_declaration_id,site_id,tenant_id,owner_personne_id)
  REFERENCES energy_billing_declarations(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT fk_billing_revision_corrected FOREIGN KEY(corrected_declaration_id,site_id,tenant_id,owner_personne_id)
  REFERENCES energy_billing_declarations(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT ck_billing_revision_different CHECK(original_declaration_id<>corrected_declaration_id),
 CONSTRAINT uq_billing_revision_sequence UNIQUE(original_declaration_id,revision),
 CONSTRAINT uq_billing_revision_target UNIQUE(corrected_declaration_id),
 CONSTRAINT uq_billing_revision_idempotence UNIQUE(site_id,owner_personne_id,request_key)
);
CREATE INDEX IF NOT EXISTS ix_billing_rectifications_original_date
 ON energy_billing_rectifications(original_declaration_id,revision);
-- Une revision ne peut pas prendre pour origine une declaration deja creee par rectification.
CREATE OR REPLACE FUNCTION energy_billing_revision_root_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM energy_billing_rectifications r WHERE r.corrected_declaration_id=NEW.original_declaration_id)
 THEN RAISE EXCEPTION 'E_BILLING_REVISION_ORIGINE_NON_CANONIQUE'; END IF;
 IF EXISTS(SELECT 1 FROM energy_billing_rectifications r WHERE r.original_declaration_id=NEW.corrected_declaration_id)
 THEN RAISE EXCEPTION 'E_BILLING_REVISION_CIBLE_NON_CANONIQUE'; END IF;
 IF NEW.revision<>(SELECT COALESCE(MAX(r.revision),0)+1 FROM energy_billing_rectifications r
   WHERE r.original_declaration_id=NEW.original_declaration_id AND r.site_id=NEW.site_id
    AND r.tenant_id=NEW.tenant_id AND r.owner_personne_id=NEW.owner_personne_id)
 THEN RAISE EXCEPTION 'E_BILLING_REVISION_SEQUENCE_NON_CONTIGUE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM energy_billing_declarations d
  WHERE d.id=NEW.corrected_declaration_id AND d.site_id=NEW.site_id
    AND d.tenant_id=NEW.tenant_id AND d.owner_personne_id=NEW.owner_personne_id
    AND d.auteur_personne_id=NEW.acteur_personne_id AND d.request_key=NEW.request_key)
 THEN RAISE EXCEPTION 'E_BILLING_REVISION_CIBLE_NON_CONFORME'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tr_billing_revision_root ON energy_billing_rectifications;
CREATE TRIGGER tr_billing_revision_root BEFORE INSERT ON energy_billing_rectifications
 FOR EACH ROW EXECUTE FUNCTION energy_billing_revision_root_guard();
DROP TRIGGER IF EXISTS tr_billing_revision_immutable ON energy_billing_rectifications;
CREATE TRIGGER tr_billing_revision_immutable BEFORE UPDATE OR DELETE ON energy_billing_rectifications
 FOR EACH ROW EXECUTE FUNCTION energy_billing_append_only_guard();
