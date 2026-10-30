-- =========================================================
-- SATEER CORE — 024
-- Dashboards stratégique / opérationnel et délégation de lecture
-- =========================================================
--
-- Principes :
-- - le dashboard stratégique est protégé par une permission dédiée ;
-- - le dashboard opérationnel est protégé par une permission dédiée ;
-- - le Vice-Consul peut déléguer uniquement la lecture du dashboard
--   opérationnel à un membre actif de l'organisation ;
-- - une délégation ne confère aucun droit de traitement ou d'administration ;
-- - les rôles institutionnels du pilote sont protégés contre les modifications
--   via l'administration standard des rôles.
--
-- Cette migration est transactionnelle et réexécutable.
-- =========================================================

BEGIN;

-- 1. Permissions dédiées aux deux dashboards et à la délégation.
INSERT INTO permissions (code, nom, description, actif)
VALUES
(
    'VIEW_STRATEGIC_DASHBOARD',
    'Consulter le dashboard stratégique',
    'Permet de consulter les indicateurs institutionnels agrégés et la vue stratégique de l’organisation.',
    TRUE
),
(
    'VIEW_OPERATIONAL_DASHBOARD',
    'Consulter le dashboard opérationnel',
    'Permet de consulter la vue opérationnelle agrégée de l’organisation.',
    TRUE
),
(
    'MANAGE_OPERATIONAL_DASHBOARD_ACCESS',
    'Gérer les accès au dashboard opérationnel',
    'Permet de déléguer ou retirer à un membre actif de l’organisation le droit de consultation du dashboard opérationnel.',
    TRUE
)
ON CONFLICT (code)
DO UPDATE SET
    nom = EXCLUDED.nom,
    description = EXCLUDED.description,
    actif = TRUE,
    date_modification = CURRENT_TIMESTAMP;


-- 2. Délégations nominatives de lecture du dashboard opérationnel.
CREATE TABLE IF NOT EXISTS organisation_dashboard_access_delegations (
    id BIGSERIAL PRIMARY KEY,
    organisation_id INTEGER NOT NULL,
    personne_id INTEGER NOT NULL,
    granted_by_personne_id INTEGER NOT NULL,
    revoked_by_personne_id INTEGER,
    actif BOOLEAN NOT NULL DEFAULT TRUE,
    date_debut TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    date_fin TIMESTAMP WITHOUT TIME ZONE,
    motif VARCHAR(500),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    date_creation TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    date_modification TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_dashboard_delegation_organisation
        FOREIGN KEY (organisation_id)
        REFERENCES organisations(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_dashboard_delegation_personne
        FOREIGN KEY (personne_id)
        REFERENCES personnes(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_dashboard_delegation_grantor
        FOREIGN KEY (granted_by_personne_id)
        REFERENCES personnes(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_dashboard_delegation_revoker
        FOREIGN KEY (revoked_by_personne_id)
        REFERENCES personnes(id)
        ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_dashboard_delegation_active
ON organisation_dashboard_access_delegations (organisation_id, personne_id)
WHERE actif = TRUE;

CREATE INDEX IF NOT EXISTS idx_dashboard_delegation_personne_active
ON organisation_dashboard_access_delegations (personne_id, organisation_id)
WHERE actif = TRUE;


-- 3. Accorder les permissions aux rôles initiaux du pilote.
-- Les codes de rôle sont des données de configuration du Consulat de Bordeaux.
INSERT INTO role_permissions (role_id, permission_id, actif)
SELECT r.id, p.id, TRUE
FROM organisation_roles r
CROSS JOIN permissions p
WHERE
    r.organisation_id = 1
    AND (
        (r.code = 'HEAD_OF_MISSION' AND p.code = 'VIEW_STRATEGIC_DASHBOARD')
        OR
        (r.code = 'OPERATIONAL_DEPUTY' AND p.code IN (
            'VIEW_OPERATIONAL_DASHBOARD',
            'MANAGE_OPERATIONAL_DASHBOARD_ACCESS'
        ))
    )
ON CONFLICT (role_id, permission_id) DO NOTHING;


-- 4. Protéger les deux rôles institutionnels du pilote.
-- Le Vice-Consul conserve l'administration des rôles métier,
-- mais ne peut pas modifier le rôle du Consul ni son propre rôle système.
UPDATE organisation_roles
SET
    metadata = metadata || jsonb_build_object(
        'systemProtected', TRUE,
        'systemProtectionReason', 'INSTITUTIONAL_AUTHORITY'
    ),
    date_modification = CURRENT_TIMESTAMP
WHERE
    organisation_id = 1
    AND code IN ('HEAD_OF_MISSION', 'OPERATIONAL_DEPUTY')
    AND NOT (metadata @> '{"systemProtected": true}'::jsonb);


-- 5. Protection SQL des rôles institutionnels.
CREATE OR REPLACE FUNCTION sateer_refuser_modification_role_protege()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.metadata @> '{"systemProtected": true}'::jsonb THEN
        IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'ROLE_INSTITUTIONNEL_PROTEGE';
        END IF;

        IF NEW IS DISTINCT FROM OLD THEN
            RAISE EXCEPTION 'ROLE_INSTITUTIONNEL_PROTEGE';
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sateer_role_protege_update
ON organisation_roles;

CREATE TRIGGER trg_sateer_role_protege_update
BEFORE UPDATE OR DELETE ON organisation_roles
FOR EACH ROW
EXECUTE FUNCTION sateer_refuser_modification_role_protege();


-- 6. Protection SQL des permissions associées aux rôles protégés.
CREATE OR REPLACE FUNCTION sateer_refuser_modification_permissions_role_protege()
RETURNS TRIGGER AS $$
DECLARE
    cible_role_id INTEGER;
    role_protege BOOLEAN;
BEGIN
    IF TG_OP = 'DELETE' THEN
        cible_role_id := OLD.role_id;
        SELECT (metadata @> '{"systemProtected": true}'::jsonb)
        INTO role_protege
        FROM organisation_roles
        WHERE id = cible_role_id;
    ELSIF TG_OP = 'UPDATE' THEN
        SELECT EXISTS (
            SELECT 1
            FROM organisation_roles
            WHERE id IN (OLD.role_id, NEW.role_id)
                AND metadata @> '{"systemProtected": true}'::jsonb
        ) INTO role_protege;
    ELSE
        cible_role_id := NEW.role_id;
        SELECT (metadata @> '{"systemProtected": true}'::jsonb)
        INTO role_protege
        FROM organisation_roles
        WHERE id = cible_role_id;
    END IF;

    IF COALESCE(role_protege, FALSE) THEN
        IF TG_OP = 'INSERT' THEN
            -- Une réexécution idempotente de la migration peut rencontrer
            -- une relation déjà présente ; elle ne doit pas la modifier.
            IF EXISTS (
                SELECT 1 FROM role_permissions rp
                WHERE rp.role_id = NEW.role_id
                    AND rp.permission_id = NEW.permission_id
            ) THEN
                RETURN NEW;
            END IF;
            RAISE EXCEPTION 'PERMISSIONS_ROLE_INSTITUTIONNEL_PROTEGEES';
        END IF;

        IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'PERMISSIONS_ROLE_INSTITUTIONNEL_PROTEGEES';
        END IF;

        IF NEW IS DISTINCT FROM OLD THEN
            RAISE EXCEPTION 'PERMISSIONS_ROLE_INSTITUTIONNEL_PROTEGEES';
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sateer_permissions_role_protege
ON role_permissions;

CREATE TRIGGER trg_sateer_permissions_role_protege
BEFORE INSERT OR UPDATE OR DELETE ON role_permissions
FOR EACH ROW
EXECUTE FUNCTION sateer_refuser_modification_permissions_role_protege();


-- 7. Vérifier la légitimité du délégant et l'affectation du bénéficiaire.
CREATE OR REPLACE FUNCTION sateer_verifier_delegation_dashboard_operationnel()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Nouvelle délégation : vérifier le bénéficiaire et le délégant.
        IF NOT EXISTS (
            SELECT 1
            FROM relations_personne_organisation_roles rel
            INNER JOIN organisation_roles r
                ON r.id = rel.role_id
                AND r.organisation_id = rel.organisation_id
            WHERE
                rel.personne_id = NEW.personne_id
                AND rel.organisation_id = NEW.organisation_id
                AND rel.actif = TRUE
                AND r.actif = TRUE
                AND r.scope IN ('ORGANISATION', 'BOTH')
                AND rel.date_debut <= CURRENT_TIMESTAMP
                AND (rel.date_fin IS NULL OR rel.date_fin > CURRENT_TIMESTAMP)
        ) THEN
            RAISE EXCEPTION 'BENEFICIAIRE_NON_AFFECTE_A_L_ORGANISATION';
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM relations_personne_organisation_roles rel
            INNER JOIN organisation_roles r
                ON r.id = rel.role_id
                AND r.organisation_id = rel.organisation_id
            INNER JOIN role_permissions rp
                ON rp.role_id = r.id
                AND rp.actif = TRUE
            INNER JOIN permissions p
                ON p.id = rp.permission_id
                AND p.actif = TRUE
            WHERE
                rel.personne_id = NEW.granted_by_personne_id
                AND rel.organisation_id = NEW.organisation_id
                AND rel.actif = TRUE
                AND r.actif = TRUE
                AND r.scope IN ('ORGANISATION', 'BOTH')
                AND p.code = 'MANAGE_OPERATIONAL_DASHBOARD_ACCESS'
                AND rel.date_debut <= CURRENT_TIMESTAMP
                AND (rel.date_fin IS NULL OR rel.date_fin > CURRENT_TIMESTAMP)
        ) THEN
            RAISE EXCEPTION 'DELEGANT_NON_AUTORISE';
        END IF;
    ELSIF NEW.organisation_id IS DISTINCT FROM OLD.organisation_id
       OR NEW.personne_id IS DISTINCT FROM OLD.personne_id
       OR NEW.granted_by_personne_id IS DISTINCT FROM OLD.granted_by_personne_id THEN
        RAISE EXCEPTION 'MODIFICATION_IDENTITE_DELEGATION_INTERDITE';
    ELSIF NEW.actif IS DISTINCT FROM OLD.actif AND NEW.actif = TRUE THEN
        RAISE EXCEPTION 'REACTIVATION_DELEGATION_INTERDITE';
    ELSIF NEW.actif IS DISTINCT FROM OLD.actif AND NEW.actif = FALSE THEN
        IF NOT EXISTS (
            SELECT 1
            FROM relations_personne_organisation_roles rel
            INNER JOIN organisation_roles r
                ON r.id = rel.role_id
                AND r.organisation_id = rel.organisation_id
            INNER JOIN role_permissions rp
                ON rp.role_id = r.id
                AND rp.actif = TRUE
            INNER JOIN permissions p
                ON p.id = rp.permission_id
                AND p.actif = TRUE
            WHERE
                rel.personne_id = NEW.revoked_by_personne_id
                AND rel.organisation_id = NEW.organisation_id
                AND rel.actif = TRUE
                AND r.actif = TRUE
                AND r.scope IN ('ORGANISATION', 'BOTH')
                AND p.code = 'MANAGE_OPERATIONAL_DASHBOARD_ACCESS'
                AND rel.date_debut <= CURRENT_TIMESTAMP
                AND (rel.date_fin IS NULL OR rel.date_fin > CURRENT_TIMESTAMP)
        ) THEN
            RAISE EXCEPTION 'AUTEUR_RETRAIT_NON_AUTORISE';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sateer_verifier_delegation_dashboard
ON organisation_dashboard_access_delegations;

CREATE TRIGGER trg_sateer_verifier_delegation_dashboard
BEFORE INSERT OR UPDATE ON organisation_dashboard_access_delegations
FOR EACH ROW
EXECUTE FUNCTION sateer_verifier_delegation_dashboard_operationnel();

COMMIT;
