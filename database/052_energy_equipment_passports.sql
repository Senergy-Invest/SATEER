-- SATEER Energy MVP02A-1 : passeports physiques et preuves photographiques PRIVEES.
-- Recette locale ONLY : aucune insertion dans les tables Core ou les pilotes institutionnels.
BEGIN;
DO $$ BEGIN
 IF current_database() <> 'sateer_test' THEN RAISE EXCEPTION 'MVP02A1_REFUSE_HORS_SATEER_TEST'; END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_eq_passport_scope
 ON energy_inventory_equipements(id,site_id,tenant_id,owner_personne_id);
CREATE TABLE IF NOT EXISTS energy_equipment_passports (
 id BIGSERIAL PRIMARY KEY,
 public_id UUID NOT NULL UNIQUE,
 site_id BIGINT NOT NULL,
 inventaire_equipement_id BIGINT NOT NULL,
 tenant_id INTEGER NOT NULL,
 owner_personne_id INTEGER NOT NULL,
 numero_individuel INTEGER NOT NULL CHECK (numero_individuel BETWEEN 1 AND 10000),
 scan_token VARCHAR(48) NOT NULL UNIQUE CHECK (scan_token ~ '^[A-Za-z0-9_-]{27}$'),
 statut VARCHAR(20) NOT NULL DEFAULT 'DECLARE' CHECK (statut = 'DECLARE'),
 revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
 date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT fk_passport_equipement_scope FOREIGN KEY (inventaire_equipement_id,site_id,tenant_id,owner_personne_id)
 REFERENCES energy_inventory_equipements(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT uq_passport_appareil_individuel UNIQUE (inventaire_equipement_id,numero_individuel),
 CONSTRAINT uq_passport_scope UNIQUE(id,tenant_id,owner_personne_id)
);
CREATE INDEX IF NOT EXISTS ix_passport_site_prive
 ON energy_equipment_passports(site_id,tenant_id,owner_personne_id,date_creation DESC);
CREATE TABLE IF NOT EXISTS energy_equipment_photos (
 id UUID PRIMARY KEY,
 passeport_id BIGINT NOT NULL,
 tenant_id INTEGER NOT NULL,
 owner_personne_id INTEGER NOT NULL,
 type_photo VARCHAR(12) NOT NULL CHECK (type_photo IN ('APPAREIL','ETIQUETTE')),
 mime_type VARCHAR(24) NOT NULL CHECK (mime_type IN ('image/png','image/webp')),
 taille_octets INTEGER NOT NULL CHECK (taille_octets BETWEEN 64 AND 3145728),
 date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 date_suppression TIMESTAMPTZ,
 CONSTRAINT fk_photo_passport_prive FOREIGN KEY(passeport_id,tenant_id,owner_personne_id)
 REFERENCES energy_equipment_passports(id,tenant_id,owner_personne_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS ix_photo_passport_prive
 ON energy_equipment_photos(passeport_id,tenant_id,owner_personne_id,date_creation DESC)
 WHERE date_suppression IS NULL;
CREATE TABLE IF NOT EXISTS energy_equipment_passport_events (
 id BIGSERIAL PRIMARY KEY,
 passeport_id BIGINT NOT NULL,
 tenant_id INTEGER NOT NULL,
 acteur_personne_id INTEGER NOT NULL,
 event_type VARCHAR(48) NOT NULL CHECK(event_type IN ('EquipmentPassportCreated.v1','EquipmentPhotoAdded.v1','EquipmentPhotoRemoved.v1')),
 payload JSONB NOT NULL CHECK(jsonb_typeof(payload)='object'),
 date_evenement TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT fk_passport_event_prive FOREIGN KEY(passeport_id,tenant_id,acteur_personne_id)
 REFERENCES energy_equipment_passports(id,tenant_id,owner_personne_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS ix_passport_events ON energy_equipment_passport_events(passeport_id,date_evenement,id);
COMMENT ON TABLE energy_equipment_passports IS 'Passeports individuels SATEER, par quantite physique declaree, PAS une certification. QR token opaque necessitant une session.';
COMMENT ON TABLE energy_equipment_photos IS 'Metadonnees seulement ; fichiers AES-GCM hors du repertoire public, suppression logique historisee.';
COMMIT;
