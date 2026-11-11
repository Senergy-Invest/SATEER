-- P335BY : pilote test Bordeaux uniquement. N'autorise aucun envoi de courrier.
-- Les assignations utilisent demandes.assignee_a ; ces tables ne sont que réglages et audit.
CREATE TABLE IF NOT EXISTS pilot_case_dispatch_agent_settings (
  organisation_id integer NOT NULL REFERENCES organisations(id),
  unit_id integer NOT NULL REFERENCES organisation_units(id),
  personne_id integer NOT NULL REFERENCES personnes(id),
  capacite numeric(5,2) NOT NULL DEFAULT 1 CHECK (capacite BETWEEN 0.25 AND 2.00),
  disponible boolean NOT NULL DEFAULT true,
  updated_by integer NOT NULL REFERENCES personnes(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organisation_id,unit_id,personne_id)
);
CREATE TABLE IF NOT EXISTS pilot_case_dispatch_audit (
  id bigserial PRIMARY KEY,
  organisation_id integer NOT NULL REFERENCES organisations(id),
  unit_id integer NOT NULL REFERENCES organisation_units(id),
  demande_id integer REFERENCES demandes(id),
  agent_id integer REFERENCES personnes(id),
  acteur_id integer NOT NULL REFERENCES personnes(id),
  action varchar(50) NOT NULL,
  ancien jsonb,
  nouveau jsonb NOT NULL,
  motif text,
  cree_le timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT p335by_actions CHECK (action IN ('AFFECTATION_MANUELLE','AFFECTATION_AUTO_ASSISTEE','REPARTITION_LOT','CONFIGURATION_CAPACITE'))
);
CREATE INDEX IF NOT EXISTS p335by_audit_org_date ON pilot_case_dispatch_audit(organisation_id,cree_le DESC,id DESC);
INSERT INTO permissions (code,nom,description,actif)
VALUES ('ASSIGN_CONSULAR_CASES_PILOT', 'Affecter des dossiers au sein des bureaux (pilote)',
  'Répartition manuelle ou auto assistée des dossiers dans la base locale de recette.',true)
ON CONFLICT(code) DO NOTHING;
