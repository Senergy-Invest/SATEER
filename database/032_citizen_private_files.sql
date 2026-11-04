-- Lot 1U : coffre documentaire privé, test uniquement.
BEGIN;
DO $$ BEGIN
  IF current_database() <> 'sateer_test' THEN RAISE EXCEPTION 'LOT_1U_REFUSE_HORS_SATEER_TEST'; END IF;
END $$;
CREATE TABLE IF NOT EXISTS citizen_private_files (
  id UUID PRIMARY KEY,
  personne_id INTEGER NOT NULL REFERENCES personnes(id) ON DELETE CASCADE,
  categorie VARCHAR(32) NOT NULL CHECK (categorie IN ('CNI_RECTO','CNI_VERSO','PASSEPORT','CARTE_CONSULAIRE','ACTE_NAISSANCE','JUSTIFICATIF_DOMICILE','AUTRE')),
  nom_original VARCHAR(120) NOT NULL,
  mime_type VARCHAR(32) NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp','application/pdf')),
  taille_octets INTEGER NOT NULL CHECK (taille_octets BETWEEN 1 AND 5242880),
  date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_citizen_private_files_owner ON citizen_private_files(personne_id,date_creation DESC);
COMMENT ON TABLE citizen_private_files IS 'Coffre prive de demonstration. Seules les metadonnees; contenu chiffre hors dossier public. Aucune certification et aucun partage automatique.';
COMMIT;
