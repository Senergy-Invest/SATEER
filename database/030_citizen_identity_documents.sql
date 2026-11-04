-- Lot 1S : références CNI/PASSEPORT chiffrées ; aucun scan, aucun fichier.
-- GARDE : exclusivement la base de test du pilote.
BEGIN;
DO $$ BEGIN
    IF current_database() <> 'sateer_test' THEN
        RAISE EXCEPTION 'LOT_1S_REFUSE_HORS_SATEER_TEST';
    END IF;
END $$;
CREATE TABLE IF NOT EXISTS citizen_identity_documents (
    personne_id INTEGER NOT NULL REFERENCES personnes(id) ON DELETE CASCADE,
    type_document VARCHAR(20) NOT NULL CHECK (type_document IN ('CNI', 'PASSEPORT')),
    numero_chiffre TEXT NOT NULL,
    pays_emetteur CHAR(2),
    date_delivrance DATE,
    date_expiration DATE,
    version_chiffrement SMALLINT NOT NULL DEFAULT 1 CHECK (version_chiffrement = 1),
    date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    date_modification TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (personne_id, type_document),
    CONSTRAINT chk_periode_document CHECK (
        date_delivrance IS NULL OR date_expiration IS NULL OR date_delivrance <= date_expiration
    ),
    CONSTRAINT chk_format_document_chiffre CHECK (numero_chiffre LIKE 'v1:%')
);
COMMENT ON TABLE citizen_identity_documents IS 'References documentaires citoyennes declarees, chiffre AES-256-GCM en applicatif. Pas de valeur officielle verifiee.';
COMMIT;
