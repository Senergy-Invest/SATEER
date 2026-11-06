-- Périmètre : staging d'e-mails intégralement synthétiques, sans connexion réelle.
-- Aucune création automatique de demandes ou de personnes.
CREATE TABLE IF NOT EXISTS pilot_email_inbox_demo (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  organisation_id INTEGER NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  mailbox_key VARCHAR(60) NOT NULL,
  source VARCHAR(30) NOT NULL DEFAULT 'DEMO_SYNTHETIQUE' CHECK (source = 'DEMO_SYNTHETIQUE'),
  message_id VARCHAR(255) NOT NULL,
  fingerprint CHAR(64) NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  from_label VARCHAR(120) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  categorie_proposee VARCHAR(80),
  unite_suggeree_id INTEGER REFERENCES organisation_units(id) ON DELETE SET NULL,
  motif_qualification VARCHAR(60) NOT NULL,
  statut VARCHAR(40) NOT NULL DEFAULT 'A_QUALIFIER' CHECK (statut = 'A_QUALIFIER'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_pilot_email_inbox_demo UNIQUE(organisation_id,mailbox_key,message_id),
  CONSTRAINT uq_pilot_email_inbox_fingerprint UNIQUE(organisation_id,fingerprint),
  CONSTRAINT ck_pilot_email_inbox_body CHECK(length(body) BETWEEN 1 AND 16000),
  CONSTRAINT ck_pilot_email_inbox_subject CHECK(length(subject) BETWEEN 1 AND 255)
);
CREATE INDEX IF NOT EXISTS idx_pilot_email_inbox_demo_org ON pilot_email_inbox_demo(organisation_id,created_at DESC);
