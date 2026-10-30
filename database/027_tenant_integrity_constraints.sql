-- =========================================================
-- SATEER CORE — Migration 027
-- Garanties relationnelles d'isolation tenant / organisation
-- =========================================================
--
-- Cette migration renforce les invariants au niveau PostgreSQL.
-- Elle ne met pas en place RLS : les politiques RLS feront l'objet
-- d'une phase distincte, après validation du modèle de contexte.
--
-- Les références explicitement externes (partenaire, organisation
-- cible d'une invitation ou d'une relation) restent possibles.
-- Elles sont documentées et restent soumises aux autorisations métier.
--
-- Pré-requis : migrations 001 à 026 appliquées.
-- Cible de validation CI : base PostgreSQL jetable sateer_test.
-- =========================================================

BEGIN;

-- ---------------------------------------------------------
-- 1. PRÉCONDITIONS ET CONTEXTES MANQUANTS
-- ---------------------------------------------------------

DO $$
DECLARE
    n BIGINT;
BEGIN
    SELECT COUNT(*) INTO n FROM organisations WHERE tenant_id IS NULL;
    IF n > 0 THEN
        RAISE EXCEPTION
            'MIGRATION_027_ABORT: % organisation(s) sans tenant_id. Corriger leur rattachement avant migration.',
            n;
    END IF;

    SELECT COUNT(*) INTO n
    FROM relations_personne_organisation_unit m
    LEFT JOIN organisation_units u ON u.id = m.organisation_unit_id
    WHERE u.id IS NULL;
    IF n > 0 THEN
        RAISE EXCEPTION
            'MIGRATION_027_ABORT: % affectation(s) pointent vers une unité inexistante.',
            n;
    END IF;

    SELECT COUNT(*) INTO n
    FROM relations_personne_organisation_unit m
    JOIN organisation_units u ON u.id = m.organisation_unit_id
    WHERE m.organisation_id IS NOT NULL
      AND m.organisation_id IS DISTINCT FROM u.organisation_id;
    IF n > 0 THEN
        RAISE EXCEPTION
            'MIGRATION_027_ABORT: % affectation(s) ont un contexte organisationnel incohérent.',
            n;
    END IF;

    SELECT COUNT(*) INTO n
    FROM relations_personne_organisation_unit m
    JOIN organisation_units u ON u.id = m.organisation_unit_id
    WHERE m.actif = TRUE
      AND NOT EXISTS (
          SELECT 1
          FROM relations_personne_organisation r
          WHERE r.personne_id = m.personne_id
            AND r.organisation_id = u.organisation_id
      );
    IF n > 0 THEN
        RAISE EXCEPTION
            'MIGRATION_027_ABORT: % affectation(s) actives à une unité sans appartenance personne-organisation.',
            n;
    END IF;

    SELECT COUNT(*) INTO n
    FROM relations_personne_organisation_unit m
    JOIN organisation_units u ON u.id = m.organisation_unit_id
    JOIN organisation_roles r ON r.id = m.role_id
    WHERE m.role_id IS NOT NULL
      AND r.organisation_id IS DISTINCT FROM u.organisation_id;
    IF n > 0 THEN
        RAISE EXCEPTION
            'MIGRATION_027_ABORT: % affectation(s) utilisent un rôle appartenant à une autre organisation.',
            n;
    END IF;

    SELECT COUNT(*) INTO n
    FROM demande_orientations h
    JOIN demandes d ON d.id = h.demande_id
    WHERE (h.tenant_id IS NOT NULL AND h.tenant_id IS DISTINCT FROM d.tenant_id)
       OR (h.organisation_id IS NOT NULL AND h.organisation_id IS DISTINCT FROM d.organisation_id);
    IF n > 0 THEN
        RAISE EXCEPTION
            'MIGRATION_027_ABORT: % historique(s) d''orientation ont un contexte différent de leur demande.',
            n;
    END IF;

    SELECT COUNT(*) INTO n
    FROM report_templates
    WHERE organisation_id IS NOT NULL AND tenant_id IS NULL;
    IF n > 0 THEN
        RAISE EXCEPTION
            'MIGRATION_027_ABORT: % modèle(s) de rapport ont une organisation mais aucun tenant.',
            n;
    END IF;
END;
$$;

ALTER TABLE organisations
    ALTER COLUMN tenant_id SET NOT NULL;

-- Contexte explicite sur les affectations unité/personne.
ALTER TABLE relations_personne_organisation_unit
    ADD COLUMN IF NOT EXISTS organisation_id INTEGER;

UPDATE relations_personne_organisation_unit m
SET organisation_id = u.organisation_id
FROM organisation_units u
WHERE u.id = m.organisation_unit_id
  AND m.organisation_id IS NULL;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM relations_personne_organisation_unit
        WHERE organisation_id IS NULL
    ) THEN
        RAISE EXCEPTION
            'MIGRATION_027_ABORT: impossible de déterminer l''organisation de toutes les affectations.';
    END IF;
END;
$$;

ALTER TABLE relations_personne_organisation_unit
    ALTER COLUMN organisation_id SET NOT NULL;

-- Contexte explicite sur l'historique d'orientation.
ALTER TABLE demande_orientations
    ADD COLUMN IF NOT EXISTS tenant_id INTEGER;

ALTER TABLE demande_orientations
    ADD COLUMN IF NOT EXISTS organisation_id INTEGER;

UPDATE demande_orientations h
SET
    tenant_id = d.tenant_id,
    organisation_id = d.organisation_id
FROM demandes d
WHERE d.id = h.demande_id
  AND (h.tenant_id IS NULL OR h.organisation_id IS NULL);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM demande_orientations
        WHERE tenant_id IS NULL OR organisation_id IS NULL
    ) THEN
        RAISE EXCEPTION
            'MIGRATION_027_ABORT: impossible de déterminer le tenant et l''organisation de tous les historiques d''orientation.';
    END IF;
END;
$$;

ALTER TABLE demande_orientations
    ALTER COLUMN tenant_id SET NOT NULL,
    ALTER COLUMN organisation_id SET NOT NULL;

-- Les modèles globaux sont autorisés (tenant_id NULL), mais un
-- modèle propre à une organisation doit obligatoirement être tenant-scoped.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'report_templates'::regclass
          AND conname = 'chk_sateer_027_report_template_org_requires_tenant'
    ) THEN
        ALTER TABLE report_templates
            ADD CONSTRAINT chk_sateer_027_report_template_org_requires_tenant
            CHECK (organisation_id IS NULL OR tenant_id IS NOT NULL)
            NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'audit_trail'::regclass
          AND conname = 'chk_sateer_027_audit_org_requires_tenant'
    ) THEN
        ALTER TABLE audit_trail
            ADD CONSTRAINT chk_sateer_027_audit_org_requires_tenant
            CHECK (organisation_id IS NULL OR tenant_id IS NOT NULL)
            NOT VALID;
    END IF;
END;
$$;

-- ---------------------------------------------------------
-- 2. CLÉS CANDIDATES COMPOSITES DES TABLES PARENTES
-- ---------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS uq_sateer_027_organisations_tenant_id
    ON organisations (tenant_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sateer_027_units_organisation_id
    ON organisation_units (organisation_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sateer_027_demandes_tenant_id
    ON demandes (tenant_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sateer_027_publications_tenant_id
    ON publications (tenant_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sateer_027_publications_tenant_org_id
    ON publications (tenant_id, organisation_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sateer_027_ai_configurations_tenant_id
    ON ai_configurations (tenant_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sateer_027_consents_tenant_id
    ON consents (tenant_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sateer_027_leads_tenant_id
    ON leads (tenant_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sateer_027_introductions_tenant_id
    ON introductions (tenant_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sateer_027_partner_agreements_tenant_id
    ON partner_agreements (tenant_id, id);

-- ---------------------------------------------------------
-- 3. OUTIL LOCAL À LA MIGRATION POUR AJOUTER LES FK
--    EN NOT VALID, PUIS LES VALIDER EXPLICITEMENT.
-- ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sateer_027_add_fk_if_missing(
    p_table TEXT,
    p_name TEXT,
    p_definition TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = to_regclass('public.' || p_table)
          AND conname = p_name
    ) THEN
        EXECUTE format(
            'ALTER TABLE %I ADD CONSTRAINT %I %s NOT VALID',
            p_table,
            p_name,
            p_definition
        );
    END IF;
END;
$$;

-- ---------------------------------------------------------
-- 4. GARANTIES TENANT / ORGANISATION DU CIRCUIT CONSULAIRE
-- ---------------------------------------------------------

SELECT public.sateer_027_add_fk_if_missing(
    'demandes',
    'fk_sateer_027_demandes_tenant_organisation',
    'FOREIGN KEY (tenant_id, organisation_id)
     REFERENCES organisations (tenant_id, id) ON DELETE RESTRICT'
);

SELECT public.sateer_027_add_fk_if_missing(
    'organisation_units',
    'fk_sateer_027_unit_parent_same_organisation',
    'FOREIGN KEY (organisation_id, parent_unit_id)
     REFERENCES organisation_units (organisation_id, id)
     ON DELETE SET NULL (parent_unit_id)'
);

SELECT public.sateer_027_add_fk_if_missing(
    'demandes',
    'fk_sateer_027_demande_destination_same_organisation',
    'FOREIGN KEY (organisation_id, destination_unit_id)
     REFERENCES organisation_units (organisation_id, id)
     ON DELETE SET NULL (destination_unit_id)'
);

SELECT public.sateer_027_add_fk_if_missing(
    'demande_history',
    'fk_sateer_027_history_tenant_demande',
    'FOREIGN KEY (tenant_id, demande_id)
     REFERENCES demandes (tenant_id, id) ON DELETE CASCADE'
);

SELECT public.sateer_027_add_fk_if_missing(
    'demande_reponses',
    'fk_sateer_027_reponses_tenant_demande',
    'FOREIGN KEY (tenant_id, demande_id)
     REFERENCES demandes (tenant_id, id) ON DELETE CASCADE'
);

SELECT public.sateer_027_add_fk_if_missing(
    'demande_orientations',
    'fk_sateer_027_orientations_tenant_organisation',
    'FOREIGN KEY (tenant_id, organisation_id)
     REFERENCES organisations (tenant_id, id) ON DELETE RESTRICT'
);

SELECT public.sateer_027_add_fk_if_missing(
    'demande_orientations',
    'fk_sateer_027_orientations_tenant_demande',
    'FOREIGN KEY (tenant_id, demande_id)
     REFERENCES demandes (tenant_id, id) ON DELETE CASCADE'
);

SELECT public.sateer_027_add_fk_if_missing(
    'demande_orientations',
    'fk_sateer_027_orientations_ancienne_unite',
    'FOREIGN KEY (organisation_id, ancienne_unit_id)
     REFERENCES organisation_units (organisation_id, id)
     ON DELETE SET NULL (ancienne_unit_id)'
);

SELECT public.sateer_027_add_fk_if_missing(
    'demande_orientations',
    'fk_sateer_027_orientations_nouvelle_unite',
    'FOREIGN KEY (organisation_id, nouvelle_unit_id)
     REFERENCES organisation_units (organisation_id, id) ON DELETE RESTRICT'
);

-- ---------------------------------------------------------
-- 5. AFFECTATIONS PERSONNE / UNITÉ / RÔLE
-- ---------------------------------------------------------

SELECT public.sateer_027_add_fk_if_missing(
    'relations_personne_organisation_unit',
    'fk_sateer_027_membership_organisation_unit',
    'FOREIGN KEY (organisation_id, organisation_unit_id)
     REFERENCES organisation_units (organisation_id, id) ON DELETE CASCADE'
);

SELECT public.sateer_027_add_fk_if_missing(
    'relations_personne_organisation_unit',
    'fk_sateer_027_membership_organisation_role',
    'FOREIGN KEY (role_id, organisation_id)
     REFERENCES organisation_roles (id, organisation_id)
     ON DELETE SET NULL (role_id)'
);

-- ---------------------------------------------------------
-- 6. RÉFÉRENCES TENANT-SCOPED — CONFIGURATION / ANALYTICS
-- ---------------------------------------------------------

SELECT public.sateer_027_add_fk_if_missing(
    'ai_configurations',
    'fk_sateer_027_ai_configuration_organisation',
    'FOREIGN KEY (tenant_id, organisation_id)
     REFERENCES organisations (tenant_id, id) ON DELETE CASCADE'
);

SELECT public.sateer_027_add_fk_if_missing(
    'ai_conversations',
    'fk_sateer_027_ai_conversation_organisation',
    'FOREIGN KEY (tenant_id, organisation_id)
     REFERENCES organisations (tenant_id, id)
     ON DELETE SET NULL (organisation_id)'
);

SELECT public.sateer_027_add_fk_if_missing(
    'ai_conversations',
    'fk_sateer_027_ai_conversation_configuration_tenant',
    'FOREIGN KEY (tenant_id, ai_configuration_id)
     REFERENCES ai_configurations (tenant_id, id)
     ON DELETE SET NULL (ai_configuration_id)'
);

SELECT public.sateer_027_add_fk_if_missing(
    'analytics_events',
    'fk_sateer_027_analytics_organisation',
    'FOREIGN KEY (tenant_id, organisation_id)
     REFERENCES organisations (tenant_id, id) ON DELETE CASCADE'
);

SELECT public.sateer_027_add_fk_if_missing(
    'analytics_events',
    'fk_sateer_027_analytics_publication_same_tenant_org',
    'FOREIGN KEY (tenant_id, organisation_id, publication_id)
     REFERENCES publications (tenant_id, organisation_id, id)
     ON DELETE CASCADE'
);

SELECT public.sateer_027_add_fk_if_missing(
    'audit_trail',
    'fk_sateer_027_audit_organisation',
    'FOREIGN KEY (tenant_id, organisation_id)
     REFERENCES organisations (tenant_id, id)
     ON DELETE SET NULL (organisation_id)'
);

SELECT public.sateer_027_add_fk_if_missing(
    'consents',
    'fk_sateer_027_consent_organisation',
    'FOREIGN KEY (tenant_id, organisation_id)
     REFERENCES organisations (tenant_id, id)
     ON DELETE SET NULL (organisation_id)'
);

SELECT public.sateer_027_add_fk_if_missing(
    'consents',
    'fk_sateer_027_consent_publication_tenant',
    'FOREIGN KEY (tenant_id, publication_id)
     REFERENCES publications (tenant_id, id)
     ON DELETE SET NULL (publication_id)'
);

SELECT public.sateer_027_add_fk_if_missing(
    'dashboard_configurations',
    'fk_sateer_027_dashboard_organisation',
    'FOREIGN KEY (tenant_id, organisation_id)
     REFERENCES organisations (tenant_id, id) ON DELETE CASCADE'
);

SELECT public.sateer_027_add_fk_if_missing(
    'dashboard_configurations',
    'fk_sateer_027_dashboard_active_organisation',
    'FOREIGN KEY (tenant_id, active_par_organisation_id)
     REFERENCES organisations (tenant_id, id)
     ON DELETE SET NULL (active_par_organisation_id)'
);

SELECT public.sateer_027_add_fk_if_missing(
    'knowledge_sources',
    'fk_sateer_027_knowledge_source_organisation',
    'FOREIGN KEY (tenant_id, organisation_id)
     REFERENCES organisations (tenant_id, id) ON DELETE CASCADE'
);

SELECT public.sateer_027_add_fk_if_missing(
    'language_configurations',
    'fk_sateer_027_language_organisation',
    'FOREIGN KEY (tenant_id, organisation_id)
     REFERENCES organisations (tenant_id, id) ON DELETE CASCADE'
);

SELECT public.sateer_027_add_fk_if_missing(
    'notifications',
    'fk_sateer_027_notification_organisation',
    'FOREIGN KEY (tenant_id, organisation_id)
     REFERENCES organisations (tenant_id, id)
     ON DELETE SET NULL (organisation_id)'
);

SELECT public.sateer_027_add_fk_if_missing(
    'publications',
    'fk_sateer_027_publication_organisation',
    'FOREIGN KEY (tenant_id, organisation_id)
     REFERENCES organisations (tenant_id, id) ON DELETE RESTRICT'
);

SELECT public.sateer_027_add_fk_if_missing(
    'report_templates',
    'fk_sateer_027_report_template_organisation',
    'FOREIGN KEY (tenant_id, organisation_id)
     REFERENCES organisations (tenant_id, id) ON DELETE CASCADE'
);

SELECT public.sateer_027_add_fk_if_missing(
    'report_runs',
    'fk_sateer_027_report_run_organisation',
    'FOREIGN KEY (tenant_id, organisation_source_id)
     REFERENCES organisations (tenant_id, id)
     ON DELETE SET NULL (organisation_source_id)'
);

-- ---------------------------------------------------------
-- 7. RÉFÉRENCES TENANT-SCOPED — PARTENARIATS ET SUIVI
-- ---------------------------------------------------------

SELECT public.sateer_027_add_fk_if_missing(
    'leads',
    'fk_sateer_027_lead_source_organisation',
    'FOREIGN KEY (tenant_id, source_organisation_id)
     REFERENCES organisations (tenant_id, id) ON DELETE RESTRICT'
);

SELECT public.sateer_027_add_fk_if_missing(
    'leads',
    'fk_sateer_027_lead_publication_tenant',
    'FOREIGN KEY (tenant_id, publication_id)
     REFERENCES publications (tenant_id, id)
     ON DELETE SET NULL (publication_id)'
);

SELECT public.sateer_027_add_fk_if_missing(
    'leads',
    'fk_sateer_027_lead_consent_tenant',
    'FOREIGN KEY (tenant_id, consent_id)
     REFERENCES consents (tenant_id, id)
     ON DELETE SET NULL (consent_id)'
);

SELECT public.sateer_027_add_fk_if_missing(
    'introductions',
    'fk_sateer_027_introduction_lead_tenant',
    'FOREIGN KEY (tenant_id, lead_id)
     REFERENCES leads (tenant_id, id) ON DELETE CASCADE'
);

SELECT public.sateer_027_add_fk_if_missing(
    'introductions',
    'fk_sateer_027_introduction_sateer_organisation',
    'FOREIGN KEY (tenant_id, sateer_organisation_id)
     REFERENCES organisations (tenant_id, id) ON DELETE RESTRICT'
);

SELECT public.sateer_027_add_fk_if_missing(
    'lead_followups',
    'fk_sateer_027_followup_lead_tenant',
    'FOREIGN KEY (tenant_id, lead_id)
     REFERENCES leads (tenant_id, id) ON DELETE CASCADE'
);

SELECT public.sateer_027_add_fk_if_missing(
    'commissions',
    'fk_sateer_027_commission_agreement_tenant',
    'FOREIGN KEY (tenant_id, partner_agreement_id)
     REFERENCES partner_agreements (tenant_id, id)
     ON DELETE SET NULL (partner_agreement_id)'
);

SELECT public.sateer_027_add_fk_if_missing(
    'commissions',
    'fk_sateer_027_commission_lead_tenant',
    'FOREIGN KEY (tenant_id, lead_id)
     REFERENCES leads (tenant_id, id) ON DELETE SET NULL (lead_id)'
);

SELECT public.sateer_027_add_fk_if_missing(
    'commissions',
    'fk_sateer_027_commission_introduction_tenant',
    'FOREIGN KEY (tenant_id, introduction_id)
     REFERENCES introductions (tenant_id, id)
     ON DELETE SET NULL (introduction_id)'
);

SELECT public.sateer_027_add_fk_if_missing(
    'partner_agreements',
    'fk_sateer_027_partner_agreement_sateer_organisation',
    'FOREIGN KEY (tenant_id, sateer_organisation_id)
     REFERENCES organisations (tenant_id, id) ON DELETE RESTRICT'
);

-- ---------------------------------------------------------
-- 8. RÉFÉRENCES INTER-TENANT EXPLICITES
-- ---------------------------------------------------------
-- Ces liens restent volontairement ouverts vers une organisation
-- d'un autre tenant. Les FK simples existantes garantissent l'existence
-- de l'organisation cible ; l'application doit vérifier le lien métier
-- (relation, invitation, partenariat, consentement) avant tout accès.

SELECT public.sateer_027_add_fk_if_missing(
    'organisation_relationships',
    'fk_sateer_027_org_relationship_source_tenant',
    'FOREIGN KEY (tenant_id, source_organisation_id)
     REFERENCES organisations (tenant_id, id) ON DELETE CASCADE'
);

SELECT public.sateer_027_add_fk_if_missing(
    'organisation_invitations',
    'fk_sateer_027_org_invitation_source_tenant',
    'FOREIGN KEY (tenant_id, organisation_source_id)
     REFERENCES organisations (tenant_id, id) ON DELETE CASCADE'
);

SELECT public.sateer_027_add_fk_if_missing(
    'organisation_join_requests',
    'fk_sateer_027_org_join_requester_tenant',
    'FOREIGN KEY (tenant_id, organisation_demandeuse_id)
     REFERENCES organisations (tenant_id, id) ON DELETE CASCADE'
);

COMMENT ON CONSTRAINT fk_org_relationship_target ON organisation_relationships IS
    'Référence inter-tenant volontaire : organisation cible externe. Toute exposition doit vérifier une relation autorisée.';

COMMENT ON CONSTRAINT fk_org_invitation_acceptee ON organisation_invitations IS
    'Référence inter-tenant volontaire : organisation ayant accepté une invitation. Toute exposition doit vérifier le jeton et le statut.';

COMMENT ON CONSTRAINT fk_org_join_cible ON organisation_join_requests IS
    'Référence inter-tenant volontaire : organisation cible de la demande de rattachement. La décision doit être autorisée.';

COMMENT ON CONSTRAINT fk_partner_agreement_partner ON partner_agreements IS
    'Référence inter-tenant volontaire : organisation partenaire externe. L''accord actif gouverne les échanges.';

COMMENT ON CONSTRAINT fk_lead_partner_org ON leads IS
    'Référence inter-tenant volontaire : organisation partenaire destinataire du lead. Le consentement et l''accord actif sont requis.';

COMMENT ON CONSTRAINT fk_introduction_partner ON introductions IS
    'Référence inter-tenant volontaire : organisation partenaire destinataire de la mise en relation.';

-- ---------------------------------------------------------
-- 9. GARDE SUR LES MODÈLES DE RAPPORT GLOBAUX / TENANT
-- ---------------------------------------------------------
-- report_templates.tenant_id NULL signifie modèle global.
-- Un modèle tenant-scoped ne peut être utilisé que dans son tenant.
-- Un modèle organisation-scoped ne peut être utilisé que pour son org.

CREATE OR REPLACE FUNCTION sateer_027_verifier_tenant_modele_rapport()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    modele_tenant INTEGER;
    modele_organisation INTEGER;
BEGIN
    IF NEW.report_template_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT tenant_id, organisation_id
    INTO modele_tenant, modele_organisation
    FROM report_templates
    WHERE id = NEW.report_template_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'MODELE_RAPPORT_INTROUVABLE';
    END IF;

    IF modele_tenant IS NOT NULL
       AND modele_tenant IS DISTINCT FROM NEW.tenant_id THEN
        RAISE EXCEPTION 'MODELE_RAPPORT_TENANT_INCOMPATIBLE';
    END IF;

    IF modele_organisation IS NOT NULL
       AND modele_organisation IS DISTINCT FROM NEW.organisation_source_id THEN
        RAISE EXCEPTION 'MODELE_RAPPORT_ORGANISATION_INCOMPATIBLE';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sateer_027_report_run_template_tenant
    ON report_runs;

CREATE TRIGGER trg_sateer_027_report_run_template_tenant
BEFORE INSERT OR UPDATE OF tenant_id, report_template_id, organisation_source_id
ON report_runs
FOR EACH ROW
EXECUTE FUNCTION sateer_027_verifier_tenant_modele_rapport();

-- ---------------------------------------------------------
-- 10. GARDE SQL SUR LES AFFECTATIONS D'UNITÉ
-- ---------------------------------------------------------

CREATE OR REPLACE FUNCTION sateer_027_verifier_affectation_unite()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    unite_organisation INTEGER;
BEGIN
    SELECT organisation_id
    INTO unite_organisation
    FROM organisation_units
    WHERE id = NEW.organisation_unit_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'UNITE_AFFECTATION_INTROUVABLE';
    END IF;

    IF NEW.organisation_id IS NULL THEN
        NEW.organisation_id := unite_organisation;
    ELSIF NEW.organisation_id IS DISTINCT FROM unite_organisation THEN
        RAISE EXCEPTION 'AFFECTATION_UNITE_ORGANISATION_INCOMPATIBLE';
    END IF;

    IF NEW.actif = TRUE AND NOT EXISTS (
        SELECT 1
        FROM relations_personne_organisation r
        WHERE r.personne_id = NEW.personne_id
          AND r.organisation_id = unite_organisation
    ) THEN
        RAISE EXCEPTION 'PERSONNE_HORS_ORGANISATION';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sateer_027_verifier_affectation_unite
    ON relations_personne_organisation_unit;

CREATE TRIGGER trg_sateer_027_verifier_affectation_unite
BEFORE INSERT OR UPDATE OF personne_id, organisation_id, organisation_unit_id, role_id, actif
ON relations_personne_organisation_unit
FOR EACH ROW
EXECUTE FUNCTION sateer_027_verifier_affectation_unite();

-- ---------------------------------------------------------
-- 11. GARDE SQL SUR L'HISTORIQUE D'ORIENTATION
-- ---------------------------------------------------------

CREATE OR REPLACE FUNCTION sateer_027_verifier_contexte_orientation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    demande_tenant INTEGER;
    demande_organisation INTEGER;
BEGIN
    SELECT tenant_id, organisation_id
    INTO demande_tenant, demande_organisation
    FROM demandes
    WHERE id = NEW.demande_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'DEMANDE_ORIENTATION_INTROUVABLE';
    END IF;

    IF NEW.tenant_id IS NULL THEN
        NEW.tenant_id := demande_tenant;
    ELSIF NEW.tenant_id IS DISTINCT FROM demande_tenant THEN
        RAISE EXCEPTION 'ORIENTATION_TENANT_INCOMPATIBLE';
    END IF;

    IF NEW.organisation_id IS NULL THEN
        NEW.organisation_id := demande_organisation;
    ELSIF NEW.organisation_id IS DISTINCT FROM demande_organisation THEN
        RAISE EXCEPTION 'ORIENTATION_ORGANISATION_INCOMPATIBLE';
    END IF;

    IF NEW.ancienne_unit_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM organisation_units
        WHERE id = NEW.ancienne_unit_id
          AND organisation_id = demande_organisation
    ) THEN
        RAISE EXCEPTION 'ORIENTATION_ANCIENNE_UNITE_INCOMPATIBLE';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM organisation_units
        WHERE id = NEW.nouvelle_unit_id
          AND organisation_id = demande_organisation
    ) THEN
        RAISE EXCEPTION 'ORIENTATION_NOUVELLE_UNITE_INCOMPATIBLE';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sateer_027_verifier_contexte_orientation
    ON demande_orientations;

CREATE TRIGGER trg_sateer_027_verifier_contexte_orientation
BEFORE INSERT OR UPDATE OF demande_id, tenant_id, organisation_id, ancienne_unit_id, nouvelle_unit_id
ON demande_orientations
FOR EACH ROW
EXECUTE FUNCTION sateer_027_verifier_contexte_orientation();

-- ---------------------------------------------------------
-- 12. INDEX DES CLÉS ÉTRANGÈRES COMPOSITES CÔTÉ ENFANT
-- ---------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_sateer_027_units_parent_org
    ON organisation_units (organisation_id, parent_unit_id);

CREATE INDEX IF NOT EXISTS idx_sateer_027_demande_tenant_org
    ON demandes (tenant_id, organisation_id);

CREATE INDEX IF NOT EXISTS idx_sateer_027_demande_org_destination
    ON demandes (organisation_id, destination_unit_id);

CREATE INDEX IF NOT EXISTS idx_sateer_027_history_tenant_demande
    ON demande_history (tenant_id, demande_id);

CREATE INDEX IF NOT EXISTS idx_sateer_027_reponses_tenant_demande
    ON demande_reponses (tenant_id, demande_id);

CREATE INDEX IF NOT EXISTS idx_sateer_027_orientations_tenant_demande
    ON demande_orientations (tenant_id, demande_id);

CREATE INDEX IF NOT EXISTS idx_sateer_027_membership_org_unit
    ON relations_personne_organisation_unit (organisation_id, organisation_unit_id);

CREATE INDEX IF NOT EXISTS idx_sateer_027_membership_role_org
    ON relations_personne_organisation_unit (role_id, organisation_id)
    WHERE role_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sateer_027_ai_configuration_org
    ON ai_configurations (tenant_id, organisation_id);

CREATE INDEX IF NOT EXISTS idx_sateer_027_ai_conversation_org
    ON ai_conversations (tenant_id, organisation_id);

CREATE INDEX IF NOT EXISTS idx_sateer_027_ai_conversation_configuration
    ON ai_conversations (tenant_id, ai_configuration_id);

CREATE INDEX IF NOT EXISTS idx_sateer_027_analytics_org
    ON analytics_events (tenant_id, organisation_id);

CREATE INDEX IF NOT EXISTS idx_sateer_027_analytics_publication
    ON analytics_events (tenant_id, organisation_id, publication_id)
    WHERE publication_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sateer_027_audit_org
    ON audit_trail (tenant_id, organisation_id)
    WHERE organisation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sateer_027_consents_org
    ON consents (tenant_id, organisation_id)
    WHERE organisation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sateer_027_consents_publication
    ON consents (tenant_id, publication_id)
    WHERE publication_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sateer_027_dashboard_active_org
    ON dashboard_configurations (tenant_id, active_par_organisation_id)
    WHERE active_par_organisation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sateer_027_knowledge_source_org
    ON knowledge_sources (tenant_id, organisation_id)
    WHERE organisation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sateer_027_language_org
    ON language_configurations (tenant_id, organisation_id)
    WHERE organisation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sateer_027_notification_org
    ON notifications (tenant_id, organisation_id)
    WHERE organisation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sateer_027_publication_org
    ON publications (tenant_id, organisation_id);

CREATE INDEX IF NOT EXISTS idx_sateer_027_report_template_org
    ON report_templates (tenant_id, organisation_id)
    WHERE organisation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sateer_027_report_run_org
    ON report_runs (tenant_id, organisation_source_id)
    WHERE organisation_source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sateer_027_lead_source_org
    ON leads (tenant_id, source_organisation_id);

CREATE INDEX IF NOT EXISTS idx_sateer_027_lead_publication
    ON leads (tenant_id, publication_id)
    WHERE publication_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sateer_027_lead_consent
    ON leads (tenant_id, consent_id)
    WHERE consent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sateer_027_introduction_lead
    ON introductions (tenant_id, lead_id);

CREATE INDEX IF NOT EXISTS idx_sateer_027_followup_lead
    ON lead_followups (tenant_id, lead_id);

CREATE INDEX IF NOT EXISTS idx_sateer_027_commission_agreement
    ON commissions (tenant_id, partner_agreement_id)
    WHERE partner_agreement_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sateer_027_commission_lead
    ON commissions (tenant_id, lead_id)
    WHERE lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sateer_027_commission_introduction
    ON commissions (tenant_id, introduction_id)
    WHERE introduction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sateer_027_partner_agreement_sateer_org
    ON partner_agreements (tenant_id, sateer_organisation_id);

CREATE INDEX IF NOT EXISTS idx_sateer_027_org_relationship_source
    ON organisation_relationships (tenant_id, source_organisation_id);

CREATE INDEX IF NOT EXISTS idx_sateer_027_org_invitation_source
    ON organisation_invitations (tenant_id, organisation_source_id);

CREATE INDEX IF NOT EXISTS idx_sateer_027_org_join_requester
    ON organisation_join_requests (tenant_id, organisation_demandeuse_id);

-- ---------------------------------------------------------
-- 13. VALIDATION DES NOUVELLES CONTRAINTES
-- ---------------------------------------------------------

DO $$
DECLARE
    item RECORD;
BEGIN
    FOR item IN
        SELECT conrelid::regclass AS table_name, conname
        FROM pg_constraint
        WHERE conname LIKE 'fk_sateer_027_%'
          AND NOT convalidated
    LOOP
        EXECUTE format(
            'ALTER TABLE %s VALIDATE CONSTRAINT %I',
            item.table_name,
            item.conname
        );
    END LOOP;
END;
$$;

ALTER TABLE report_templates
    VALIDATE CONSTRAINT chk_sateer_027_report_template_org_requires_tenant;

ALTER TABLE audit_trail
    VALIDATE CONSTRAINT chk_sateer_027_audit_org_requires_tenant;

-- ---------------------------------------------------------
-- 14. DOCUMENTATION DU MODÈLE
-- ---------------------------------------------------------

COMMENT ON COLUMN relations_personne_organisation_unit.organisation_id IS
    'Contexte organisationnel explicite de l''affectation ; rempli et vérifié par trigger SQL.';

COMMENT ON COLUMN demande_orientations.tenant_id IS
    'Tenant de la demande orientée ; dérivé et vérifié par trigger SQL.';

COMMENT ON COLUMN demande_orientations.organisation_id IS
    'Organisation propriétaire de la demande et des unités source/destination ; dérivée et vérifiée par trigger SQL.';

DROP FUNCTION public.sateer_027_add_fk_if_missing(TEXT, TEXT, TEXT);

COMMIT;
