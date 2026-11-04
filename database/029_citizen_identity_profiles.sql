-- SATEER Core - Lot 1R : complements DECLARATIFS du profil personnel.
-- Ce schéma ne stocke aucune référence d'identité officielle ni pièce jointe.
-- Ne jamais exécuter ailleurs que sateer_test pendant le pilote.
BEGIN;
DO $$
BEGIN
    IF current_database() <> 'sateer_test' THEN
        RAISE EXCEPTION 'LOT_1R_REFUSE_HORS_SATEER_TEST';
    END IF;
END $$;
CREATE TABLE IF NOT EXISTS citizen_identity_profiles (
    personne_id INTEGER PRIMARY KEY REFERENCES personnes(id) ON DELETE CASCADE,
    date_naissance DATE,
    nationalite_declaree VARCHAR(100),
    adresse_residence_declaree VARCHAR(250),
    ville_residence_declaree VARCHAR(120),
    code_postal_residence_declare VARCHAR(20),
    date_modification TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_citizen_identity_nationalite CHECK (nationalite_declaree IS NULL OR length(btrim(nationalite_declaree)) > 0),
    CONSTRAINT chk_citizen_identity_adresse CHECK (adresse_residence_declaree IS NULL OR length(btrim(adresse_residence_declaree)) > 0),
    CONSTRAINT chk_citizen_identity_ville CHECK (ville_residence_declaree IS NULL OR length(btrim(ville_residence_declaree)) > 0)
);
COMMIT;
