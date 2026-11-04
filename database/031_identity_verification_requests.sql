-- Lot 1T. Processus interne de demande de verification, aucun statut officiel.
BEGIN;
DO $$ BEGIN
 IF current_database() <> 'sateer_test' THEN RAISE EXCEPTION 'LOT_1T_BASE_INTERDITE'; END IF;
 IF NOT EXISTS (SELECT 1 FROM organisations o JOIN tenants t ON t.id=o.tenant_id WHERE o.id=1 AND t.code='SN')
 THEN RAISE EXCEPTION 'LOT_1T_CONSULAT_PILOTE_ABSENT'; END IF;
 IF NOT EXISTS (SELECT 1 FROM organisation_roles WHERE organisation_id=1 AND code='OPERATIONAL_DEPUTY' AND actif=true)
 THEN RAISE EXCEPTION 'LOT_1T_ROLE_PILOTE_ABSENT'; END IF;
END $$;
CREATE TABLE IF NOT EXISTS identity_verification_requests (
 id BIGSERIAL PRIMARY KEY,
 personne_id INTEGER NOT NULL REFERENCES personnes(id) ON DELETE CASCADE,
 organisation_id INTEGER NOT NULL REFERENCES organisations(id),
 statut VARCHAR(40) NOT NULL DEFAULT 'EN_ATTENTE'
  CHECK (statut IN ('EN_ATTENTE','EN_INSTRUCTION','COMPLEMENT_REQUIS','EXAMEN_TERMINE','REFUSEE')),
 consentement_at TIMESTAMPTZ NOT NULL,
 types_documents JSONB NOT NULL DEFAULT '[]'::jsonb,
 message_citoyen VARCHAR(600),
 retour_consulat VARCHAR(600),
 instruit_par INTEGER REFERENCES personnes(id),
 date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 date_modification TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_identity_verif_active ON identity_verification_requests (personne_id, organisation_id)
 WHERE statut IN ('EN_ATTENTE','EN_INSTRUCTION','COMPLEMENT_REQUIS');
CREATE INDEX IF NOT EXISTS idx_identity_verif_org_status ON identity_verification_requests(organisation_id,statut,date_creation DESC);
CREATE INDEX IF NOT EXISTS idx_identity_verif_person ON identity_verification_requests(personne_id,date_creation DESC);
CREATE TABLE IF NOT EXISTS identity_verification_events (
 id BIGSERIAL PRIMARY KEY,
 demande_id BIGINT NOT NULL REFERENCES identity_verification_requests(id) ON DELETE CASCADE,
 acteur_id INTEGER NOT NULL REFERENCES personnes(id),
 action VARCHAR(45) NOT NULL CHECK (action IN ('SOUMISSION','PRISE_EN_CHARGE','COMPLEMENT_DEMANDE','COMPLEMENT_RECU','EXAMEN_TERMINE','REFUS')),
 statut_avant VARCHAR(40),
 statut_apres VARCHAR(40) NOT NULL,
 commentaire VARCHAR(600),
 date_evenement TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_identity_verif_events ON identity_verification_events(demande_id,id);
INSERT INTO permissions(code,nom,description) VALUES
 ('VIEW_IDENTITY_VERIFICATION_REQUESTS','Consulter les demandes de vérification d’identité','Droit institutionnel de lecture des dossiers de vérification interne'),
 ('REVIEW_IDENTITY_VERIFICATION_REQUESTS','Instruire les demandes de vérification d’identité','Droit institutionnel de traitement interne, sans validation officielle')
ON CONFLICT (code) DO NOTHING;
-- Rôle fonctionnel NON protégé : ne modifie jamais le rôle institutionnel
-- OPERATIONAL_DEPUTY, dont les permissions sont protégées par la migration 024.
-- Cette affectation de démonstration est strictement limitée à l'organisation 1.
INSERT INTO organisation_roles (organisation_id,code,nom,description,scope,metadata)
VALUES (
  1,
  'IDENTITY_VERIFICATION_REVIEWER',
  'Instructeur des vérifications d identité',
  'Instruction interne de dossiers citoyens, sans certification officielle',
  'ORGANISATION',
  '{"pilotOnly":true,"module":"identity_verification"}'::jsonb
)
ON CONFLICT (organisation_id,code) DO NOTHING;
DO $$ BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM organisation_roles r
   WHERE r.organisation_id=1 AND r.code='IDENTITY_VERIFICATION_REVIEWER'
     AND r.scope='ORGANISATION' AND r.actif=TRUE
     AND NOT (r.metadata @> '{"systemProtected":true}'::jsonb)
 ) THEN RAISE EXCEPTION 'LOT_1T_ROLE_FONCTIONNEL_NON_AUTORISE'; END IF;
END $$;

INSERT INTO role_permissions (role_id,permission_id,actif)
SELECT r.id,p.id,TRUE
FROM organisation_roles r CROSS JOIN permissions p
WHERE r.organisation_id=1 AND r.code='IDENTITY_VERIFICATION_REVIEWER'
  AND p.actif=TRUE
  AND p.code IN ('VIEW_IDENTITY_VERIFICATION_REQUESTS','REVIEW_IDENTITY_VERIFICATION_REQUESTS')
ON CONFLICT (role_id,permission_id) DO NOTHING;

-- Ne pas forcer la réactivation d'une permission préexistante désactivée.
DO $$ BEGIN
 IF (
   SELECT COUNT(DISTINCT p.code) FROM role_permissions rp
   JOIN organisation_roles r ON r.id=rp.role_id
   JOIN permissions p ON p.id=rp.permission_id
   WHERE r.organisation_id=1 AND r.code='IDENTITY_VERIFICATION_REVIEWER'
     AND rp.actif=TRUE AND p.actif=TRUE
     AND p.code IN ('VIEW_IDENTITY_VERIFICATION_REQUESTS','REVIEW_IDENTITY_VERIFICATION_REQUESTS')
 ) <> 2 THEN RAISE EXCEPTION 'LOT_1T_PERMISSIONS_NON_ACTIVES'; END IF;
END $$;

-- Affectation nominative au vice-consul DEMO, sous réserve de son rôle existant.
-- Aucun autre compte, aucune autre organisation ne reçoit ces droits.
INSERT INTO relations_personne_organisation_roles
  (personne_id,organisation_id,role_id,actif,date_debut)
SELECT a.personne_id,1,rv.id,TRUE,NOW()
FROM auth_accounts a
JOIN relations_personne_organisation membre
  ON membre.personne_id=a.personne_id AND membre.organisation_id=1
JOIN relations_personne_organisation_roles existant
  ON existant.personne_id=a.personne_id AND existant.organisation_id=1
  AND existant.actif=TRUE AND existant.date_debut<=NOW()
  AND (existant.date_fin IS NULL OR existant.date_fin>NOW())
JOIN organisation_roles rdeputy
  ON rdeputy.id=existant.role_id AND rdeputy.organisation_id=1
  AND rdeputy.code='OPERATIONAL_DEPUTY' AND rdeputy.actif=TRUE
JOIN organisation_roles rv
  ON rv.organisation_id=1 AND rv.code='IDENTITY_VERIFICATION_REVIEWER'
WHERE LOWER(a.identifiant)='demo.viceconsul' AND a.actif=TRUE
ON CONFLICT (personne_id,organisation_id,role_id) DO NOTHING;

-- Une affectation absente ou déjà désactivée doit faire échouer la migration.
DO $$ BEGIN
 IF (
   SELECT COUNT(*)
   FROM relations_personne_organisation_roles x
   JOIN organisation_roles r ON r.id=x.role_id
   JOIN auth_accounts a ON a.personne_id=x.personne_id
   WHERE x.organisation_id=1 AND r.code='IDENTITY_VERIFICATION_REVIEWER'
     AND LOWER(a.identifiant)='demo.viceconsul'
     AND a.actif=TRUE AND x.actif=TRUE
     AND x.date_debut<=NOW() AND (x.date_fin IS NULL OR x.date_fin>NOW())
 ) <> 1 THEN RAISE EXCEPTION 'LOT_1T_AFFECTATION_PILOTE_ABSENTE'; END IF;
END $$;
COMMIT;
