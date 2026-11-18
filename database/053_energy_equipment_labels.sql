-- SATEER Energy MVP02A-2 : OCR local facultatif et valeurs de plaque confirmees.
-- Seule la base sateer_test peut recevoir cette migration de recette.
BEGIN;
DO $$ BEGIN
 IF current_database()<>'sateer_test' THEN RAISE EXCEPTION 'MVP02A2_REFUSE_HORS_SATEER_TEST';END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_energy_photo_private_scope
 ON energy_equipment_photos(id,passeport_id,tenant_id,owner_personne_id);
CREATE TABLE IF NOT EXISTS energy_equipment_label_proposals (
 id UUID PRIMARY KEY,
 passeport_id BIGINT NOT NULL,
 tenant_id INTEGER NOT NULL,
 owner_personne_id INTEGER NOT NULL,
 photo_id UUID NOT NULL,
 moteur VARCHAR(48) NOT NULL CHECK (moteur='MACOS_VISION_LOCAL_V1'),
 propositions JSONB NOT NULL CHECK(jsonb_typeof(propositions)='object'),
 statut VARCHAR(16) NOT NULL DEFAULT 'PROPOSEE' CHECK(statut IN ('PROPOSEE','CONFIRMEE')),
 date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 expiration TIMESTAMPTZ NOT NULL DEFAULT (NOW()+interval '20 minutes'),
 CONSTRAINT fk_labels_passport_private FOREIGN KEY(passeport_id,tenant_id,owner_personne_id)
 REFERENCES energy_equipment_passports(id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT fk_labels_photo_private FOREIGN KEY(photo_id,passeport_id,tenant_id,owner_personne_id)
 REFERENCES energy_equipment_photos(id,passeport_id,tenant_id,owner_personne_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS ix_energy_label_analysis_private ON energy_equipment_label_proposals(passeport_id,tenant_id,owner_personne_id,date_creation DESC);
CREATE TABLE IF NOT EXISTS energy_equipment_label_versions (
 id BIGSERIAL PRIMARY KEY,
 passeport_id BIGINT NOT NULL,
 tenant_id INTEGER NOT NULL,
 owner_personne_id INTEGER NOT NULL,
 photo_id UUID,
 champ VARCHAR(20) NOT NULL CHECK(champ IN ('MARQUE','MODELE','PUISSANCE_W','TENSION_V')),
 revision INTEGER NOT NULL CHECK(revision>0),
 valeur VARCHAR(80) NOT NULL CHECK(length(btrim(valeur))>0),
 provenance VARCHAR(36) NOT NULL CHECK(provenance IN ('OCR_CONFIRME_PAR_UTILISATEUR','OCR_CORRIGE_PAR_UTILISATEUR','SAISIE_MANUELLE')),
 validation VARCHAR(30) NOT NULL DEFAULT 'DECLAREE_PAR_UTILISATEUR' CHECK(validation='DECLAREE_PAR_UTILISATEUR'),
 date_validation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT fk_label_version_private FOREIGN KEY(passeport_id,tenant_id,owner_personne_id)
 REFERENCES energy_equipment_passports(id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT fk_label_source_photo_private FOREIGN KEY(photo_id,passeport_id,tenant_id,owner_personne_id)
 REFERENCES energy_equipment_photos(id,passeport_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT uq_label_version UNIQUE (passeport_id,champ,revision)
);
CREATE INDEX IF NOT EXISTS ix_energy_label_latest ON energy_equipment_label_versions(passeport_id,champ,revision DESC);
ALTER TABLE energy_equipment_passport_events DROP CONSTRAINT IF EXISTS energy_equipment_passport_events_event_type_check;
ALTER TABLE energy_equipment_passport_events ADD CONSTRAINT energy_equipment_passport_events_event_type_check
 CHECK(event_type IN ('EquipmentPassportCreated.v1','EquipmentPhotoAdded.v1','EquipmentPhotoRemoved.v1','EquipmentLabelFieldConfirmed.v1'));
COMMENT ON TABLE energy_equipment_label_proposals IS 'Propositions OCR locales, privees, temporaires; pas une mesure ou certification.';
COMMENT ON TABLE energy_equipment_label_versions IS 'Historique append-only des valeurs volontairement confirmees par le proprietaire, distinctes des lignes groupees.';
COMMIT;
