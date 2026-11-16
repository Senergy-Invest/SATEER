-- SATEER Energy MVP01 : dossier privé d'expression du besoin, aucun lien institutionnel implicite.
-- Migration volontaire : recette sateer_test exclusivement, non appliquée par l'installateur MVP01-A.
BEGIN;
CREATE TABLE IF NOT EXISTS energy_cases (
 id BIGSERIAL PRIMARY KEY,
 public_id UUID NOT NULL UNIQUE,
 tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
 owner_personne_id INTEGER NOT NULL REFERENCES personnes(id) ON DELETE RESTRICT,
 request_key UUID NOT NULL,
 content_hash CHAR(64) NOT NULL,
 profil VARCHAR(20) NOT NULL CHECK (profil IN ('PARTICULIER','PRO','ORGANISATION')),
 type_site VARCHAR(30) NOT NULL,
 nom_site VARCHAR(120) NOT NULL,
 pays CHAR(2) NOT NULL CHECK (pays ~ '^[A-Z]{2}$'),
 alimentation VARCHAR(32) NOT NULL,
 compteur VARCHAR(10) NOT NULL CHECK (compteur IN ('OUI','NON','INCONNU')),
 besoins JSONB NOT NULL CHECK (jsonb_typeof(besoins) = 'array'),
 description TEXT NOT NULL,
 statut VARCHAR(24) NOT NULL DEFAULT 'BROUILLON' CHECK (statut = 'BROUILLON'),
 date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT uq_energy_case_request UNIQUE (tenant_id,owner_personne_id,request_key)
);
CREATE INDEX IF NOT EXISTS idx_energy_case_owner ON energy_cases (tenant_id,owner_personne_id,date_creation DESC,id DESC);
CREATE TABLE IF NOT EXISTS energy_case_events (
 id BIGSERIAL PRIMARY KEY,
 energy_case_id BIGINT NOT NULL REFERENCES energy_cases(id) ON DELETE RESTRICT,
 tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
 actor_personne_id INTEGER NOT NULL REFERENCES personnes(id) ON DELETE RESTRICT,
 event_type VARCHAR(40) NOT NULL CHECK(event_type='EnergyCaseCreated.v1'),
 event_data JSONB NOT NULL,
 date_evenement TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_energy_case_events_case ON energy_case_events(energy_case_id,date_evenement);
COMMIT;
