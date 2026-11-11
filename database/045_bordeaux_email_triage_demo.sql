-- P335BX : UNIQUEMENT la base sateer_test, organisation fictive 70.
-- Aucune permission de messagerie officielle, aucun événement sortant, aucun dossier.
CREATE TABLE IF NOT EXISTS pilot_email_triage_demo_rules (
  organisation_id integer NOT NULL REFERENCES organisations(id),
  tenant_code varchar(50) NOT NULL,
  category_key varchar(80) NOT NULL,
  mode varchar(20) NOT NULL CHECK(mode IN ('MANUEL','PROPOSITION')),
  destination_unit_id integer NULL REFERENCES organisation_units(id),
  actif boolean NOT NULL DEFAULT TRUE,
  created_by integer NOT NULL REFERENCES personnes(id),
  updated_by integer NOT NULL REFERENCES personnes(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(organisation_id,tenant_code,category_key),
  CONSTRAINT p335bx_mode_unit CHECK (
    (mode='MANUEL' AND destination_unit_id IS NULL) OR
    (mode='PROPOSITION' AND destination_unit_id IS NOT NULL)
  )
);
CREATE TABLE IF NOT EXISTS pilot_email_triage_demo_audit (
  id bigserial PRIMARY KEY,
  organisation_id integer NOT NULL REFERENCES organisations(id),
  tenant_code varchar(50) NOT NULL,
  category_key varchar(80) NOT NULL,
  acteur_personne_id integer NOT NULL REFERENCES personnes(id),
  ancien jsonb,
  nouveau jsonb NOT NULL,
  modifie_le timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS p335bx_audit_org_date ON pilot_email_triage_demo_audit(organisation_id,modifie_le DESC);
INSERT INTO permissions(code,nom,description,actif)
VALUES('CONFIGURE_CONSULAR_MAIL_DEMO','Configurer les règles de tri des courriers fictifs',
 'Gestion des files simulées du pilote Bordeaux. Aucun routage réel ni envoi de courrier.',TRUE)
ON CONFLICT(code) DO NOTHING;
