-- E-METER-1B2 : pieces privees chiffrees hors webroot, metadonnees de recette uniquement.
-- ADDITIF : a appliquer sur sateer_test apres dry-run et autorisation explicite.
DO $$ BEGIN
 IF current_database()<>'sateer_test' OR
    (SELECT system_identifier::text FROM pg_control_system())<>'7699611241381229531'
 THEN RAISE EXCEPTION 'E_BILLING_EVIDENCE_REFUS_BASE_OU_CLUSTER'; END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_declaration_scope
 ON energy_billing_declarations(id,site_id,tenant_id,owner_personne_id);
CREATE TABLE IF NOT EXISTS energy_billing_attachments (
 id UUID PRIMARY KEY,
 site_id BIGINT NOT NULL,tenant_id INTEGER NOT NULL,owner_personne_id INTEGER NOT NULL,
 declaration_id UUID NOT NULL,
 nom_original VARCHAR(120) NOT NULL CHECK(length(btrim(nom_original))>0),
 mime_type VARCHAR(32) NOT NULL CHECK(mime_type IN ('application/pdf','image/png')),
 taille_octets INTEGER NOT NULL CHECK(taille_octets BETWEEN 64 AND 5242880),
 sha256 CHAR(64) NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),
 provenance VARCHAR(24) NOT NULL DEFAULT 'SAISIE_MANUELLE' CHECK(provenance='SAISIE_MANUELLE'),
 qualification VARCHAR(24) NOT NULL DEFAULT 'DECLARE_A_VERIFIER' CHECK(qualification='DECLARE_A_VERIFIER'),
 auteur_personne_id INTEGER NOT NULL REFERENCES personnes(id) ON DELETE RESTRICT,
 request_key UUID NOT NULL,date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT fk_billing_attachment_declaration FOREIGN KEY(declaration_id,site_id,tenant_id,owner_personne_id)
  REFERENCES energy_billing_declarations(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT uq_billing_attachment_scope UNIQUE(id,site_id,tenant_id,owner_personne_id),
 CONSTRAINT uq_billing_attachment_key UNIQUE(site_id,owner_personne_id,request_key)
);
CREATE INDEX IF NOT EXISTS ix_billing_attachment_declaration ON energy_billing_attachments(declaration_id,date_creation,id);
CREATE TABLE IF NOT EXISTS energy_billing_attachment_events (
 id BIGSERIAL PRIMARY KEY,
 attachment_id UUID NOT NULL,site_id BIGINT NOT NULL,tenant_id INTEGER NOT NULL,owner_personne_id INTEGER NOT NULL,
 acteur_personne_id INTEGER NOT NULL REFERENCES personnes(id) ON DELETE RESTRICT,
 action VARCHAR(48) NOT NULL CHECK(action='BillingAttachmentStored.v1'),
 date_evenement TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT fk_billing_attachment_event FOREIGN KEY(attachment_id,site_id,tenant_id,owner_personne_id)
  REFERENCES energy_billing_attachments(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS ix_billing_attachment_events ON energy_billing_attachment_events(attachment_id,date_evenement,id);
-- Réutilise le déclencheur d'historique immuable 062, sans modifier 062.
DROP TRIGGER IF EXISTS tr_billing_attachment_append_only ON energy_billing_attachments;
CREATE TRIGGER tr_billing_attachment_append_only BEFORE UPDATE OR DELETE ON energy_billing_attachments
 FOR EACH ROW EXECUTE FUNCTION energy_billing_append_only_guard();
DROP TRIGGER IF EXISTS tr_billing_attachment_event_append_only ON energy_billing_attachment_events;
CREATE TRIGGER tr_billing_attachment_event_append_only BEFORE UPDATE OR DELETE ON energy_billing_attachment_events
 FOR EACH ROW EXECUTE FUNCTION energy_billing_append_only_guard();
