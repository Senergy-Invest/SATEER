BEGIN;
DO $$ BEGIN IF current_database() <> 'sateer_test' THEN RAISE EXCEPTION 'P7_TEST_UNIQUEMENT'; END IF; END $$;
CREATE TABLE organisation_procedure_catalogue (
 id BIGSERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL REFERENCES tenants(id),
 organisation_id INTEGER NOT NULL REFERENCES organisations(id),
 code VARCHAR(64) NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_]{2,63}$'),
 categorie VARCHAR(64) NOT NULL CHECK (categorie IN ('PASSEPORT','CARTE_CONSULAIRE','ETAT_CIVIL','RENDEZ_VOUS','INFORMATION','AUTRE')),
 titre VARCHAR(160) NOT NULL,
 pieces_obligatoires TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
 delai_indicatif_jours INTEGER CHECK (delai_indicatif_jours BETWEEN 1 AND 365),
 actif BOOLEAN NOT NULL DEFAULT FALSE,
 valide_par INTEGER REFERENCES personnes(id),
 mis_a_jour_le TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (organisation_id,code)
);
CREATE TABLE demande_documents_partages (
 id UUID PRIMARY KEY,
 demande_id BIGINT NOT NULL REFERENCES demandes(id) ON DELETE CASCADE,
 personne_id INTEGER NOT NULL REFERENCES personnes(id),
 document_source_id UUID NOT NULL,
 categorie VARCHAR(32) NOT NULL,
 nom_original VARCHAR(120) NOT NULL,
 mime_type VARCHAR(32) NOT NULL,
 taille_octets INTEGER NOT NULL,
 date_partage TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(demande_id, document_source_id)
);
CREATE INDEX idx_demande_documents_partages_dossier ON demande_documents_partages(demande_id);
CREATE INDEX idx_proc_catalogue_org ON organisation_procedure_catalogue(organisation_id,actif);
COMMENT ON TABLE demande_documents_partages IS 'Copie chiffree immuable des fichiers autorises explicitement par le citoyen. Pilote sans documents reels.';
COMMIT;
