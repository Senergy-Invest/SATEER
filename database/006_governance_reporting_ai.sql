-- =========================================================
-- SATEER
-- Migration 006
--
-- Gouvernance centrale
-- Dashboards
-- Reporting
-- Intelligence artificielle
--
-- Architecture générique multi-tenant / CEDEAO
-- =========================================================


-- =========================================================
-- 1. NOUVELLES CAPABILITIES
-- =========================================================

INSERT INTO capabilities (
    code,
    nom,
    description
)
VALUES

(
    'REPORTING',
    'Reporting professionnel',
    'Permet de générer et consulter des rapports professionnels.'
),

(
    'AI_SECRETARIAT',
    'Assistant IA secrétariat',
    'Permet aux agents de bénéficier du classement, résumé, routage et préparation de réponses par IA.'
),

(
    'AI_CITIZEN_ASSISTANT',
    'Assistant IA usagers',
    'Permet aux usagers de poser des questions et obtenir des réponses automatisées lorsque aucune décision humaine n est nécessaire.'
),

(
    'AI_ADMIN',
    'Administration IA',
    'Permet de configurer et superviser les capacités IA.'
),

(
    'DASHBOARD_ADMIN',
    'Administration des tableaux de bord',
    'Permet à SATEER de configurer et superviser les tableaux de bord des organisations.'
)

ON CONFLICT (code)
DO NOTHING;


-- =========================================================
-- 2. CONFIGURATION DES TABLEAUX DE BORD
--
-- SATEER décide quels dashboards sont activés
-- pour quelle organisation.
-- =========================================================

CREATE TABLE IF NOT EXISTS dashboard_configurations (

    id SERIAL PRIMARY KEY,

    tenant_id INTEGER NOT NULL,

    organisation_id INTEGER NOT NULL,

    code VARCHAR(100) NOT NULL,

    nom VARCHAR(255) NOT NULL,

    actif BOOLEAN NOT NULL DEFAULT TRUE,

    niveau VARCHAR(100)
        NOT NULL
        DEFAULT 'STANDARD',

    configuration JSONB
        NOT NULL
        DEFAULT '{}'::jsonb,

    active_par_organisation_id INTEGER,

    active_par_personne_id INTEGER,

    date_activation TIMESTAMP
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    date_modification TIMESTAMP
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,


    CONSTRAINT fk_dashboard_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE RESTRICT,


    CONSTRAINT fk_dashboard_organisation
        FOREIGN KEY (organisation_id)
        REFERENCES organisations(id)
        ON DELETE CASCADE,


    CONSTRAINT fk_dashboard_active_org
        FOREIGN KEY (active_par_organisation_id)
        REFERENCES organisations(id)
        ON DELETE SET NULL,


    CONSTRAINT fk_dashboard_active_personne
        FOREIGN KEY (active_par_personne_id)
        REFERENCES personnes(id)
        ON DELETE SET NULL,


    CONSTRAINT uq_dashboard_configuration
        UNIQUE (
            tenant_id,
            organisation_id,
            code
        )
);


-- =========================================================
-- 3. DÉFINITION GÉNÉRIQUE DES MÉTRIQUES
-- =========================================================

CREATE TABLE IF NOT EXISTS metric_definitions (

    id SERIAL PRIMARY KEY,

    code VARCHAR(100)
        NOT NULL
        UNIQUE,

    nom VARCHAR(255)
        NOT NULL,

    description TEXT,

    type_agregation VARCHAR(100)
        NOT NULL,

    event_type VARCHAR(100),

    actif BOOLEAN
        NOT NULL
        DEFAULT TRUE
);


INSERT INTO metric_definitions (
    code,
    nom,
    description,
    type_agregation,
    event_type
)
VALUES

(
    'VIEWS',
    'Consultations',
    'Nombre de consultations enregistrées.',
    'COUNT',
    'VIEW'
),

(
    'UNIQUE_VIEWS',
    'Consultations uniques',
    'Nombre de personnes distinctes ayant consulté un contenu.',
    'COUNT_DISTINCT_PERSON',
    'VIEW'
),

(
    'CLICKS',
    'Clics',
    'Nombre de clics enregistrés.',
    'COUNT',
    'CLICK'
),

(
    'INTERESTS',
    'Intérêts déclarés',
    'Nombre de personnes ayant explicitement exprimé un intérêt.',
    'COUNT',
    'INTEREST'
),

(
    'CONTACT_REQUESTS',
    'Demandes de contact',
    'Nombre de demandes volontaires de mise en relation.',
    'COUNT',
    'CONTACT_REQUEST'
),

(
    'REGISTRATIONS',
    'Inscriptions',
    'Nombre d inscriptions enregistrées.',
    'COUNT',
    'REGISTRATION'
),

(
    'CONVERSIONS',
    'Conversions',
    'Nombre de conversions mesurées lorsque le parcours permet de les connaître.',
    'COUNT',
    'CONVERSION'
)

ON CONFLICT (code)
DO NOTHING;


-- =========================================================
-- 4. MODÈLES DE RAPPORTS
-- =========================================================

CREATE TABLE IF NOT EXISTS report_templates (

    id SERIAL PRIMARY KEY,

    tenant_id INTEGER,

    organisation_id INTEGER,

    code VARCHAR(100) NOT NULL,

    nom VARCHAR(255) NOT NULL,

    description TEXT,

    configuration JSONB
        NOT NULL
        DEFAULT '{}'::jsonb,

    actif BOOLEAN
        NOT NULL
        DEFAULT TRUE,

    date_creation TIMESTAMP
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,


    CONSTRAINT fk_report_template_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE CASCADE,


    CONSTRAINT fk_report_template_organisation
        FOREIGN KEY (organisation_id)
        REFERENCES organisations(id)
        ON DELETE CASCADE
);


-- =========================================================
-- 5. EXÉCUTIONS / GÉNÉRATIONS DE RAPPORTS
--
-- Un ReportRun représente une génération réelle.
-- =========================================================

CREATE TABLE IF NOT EXISTS report_runs (

    id BIGSERIAL PRIMARY KEY,

    tenant_id INTEGER NOT NULL,

    report_template_id INTEGER,

    organisation_source_id INTEGER,

    genere_par_personne_id INTEGER,

    titre VARCHAR(255) NOT NULL,

    periode_debut TIMESTAMP,

    periode_fin TIMESTAMP,

    filtres JSONB
        NOT NULL
        DEFAULT '{}'::jsonb,

    resultat JSONB
        NOT NULL
        DEFAULT '{}'::jsonb,

    statut VARCHAR(100)
        NOT NULL
        DEFAULT 'GENERE',

    date_generation TIMESTAMP
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,


    CONSTRAINT fk_report_run_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE RESTRICT,


    CONSTRAINT fk_report_run_template
        FOREIGN KEY (report_template_id)
        REFERENCES report_templates(id)
        ON DELETE SET NULL,


    CONSTRAINT fk_report_run_organisation
        FOREIGN KEY (organisation_source_id)
        REFERENCES organisations(id)
        ON DELETE SET NULL,


    CONSTRAINT fk_report_run_personne
        FOREIGN KEY (genere_par_personne_id)
        REFERENCES personnes(id)
        ON DELETE SET NULL
);


-- =========================================================
-- 6. DESTINATAIRES DES RAPPORTS
-- =========================================================

CREATE TABLE IF NOT EXISTS report_recipients (

    id BIGSERIAL PRIMARY KEY,

    report_run_id BIGINT NOT NULL,

    organisation_id INTEGER,

    nom_destinataire VARCHAR(255),

    type_destinataire VARCHAR(100),

    date_partage TIMESTAMP,

    statut VARCHAR(100)
        NOT NULL
        DEFAULT 'PREPARE',


    CONSTRAINT fk_report_recipient_run
        FOREIGN KEY (report_run_id)
        REFERENCES report_runs(id)
        ON DELETE CASCADE,


    CONSTRAINT fk_report_recipient_organisation
        FOREIGN KEY (organisation_id)
        REFERENCES organisations(id)
        ON DELETE SET NULL
);


-- =========================================================
-- 7. SOURCES DE CONNAISSANCE IA
--
-- Exemple :
-- Consulat
-- Ambassade
-- Ministère
-- Banque partenaire
-- SATEER
-- =========================================================

CREATE TABLE IF NOT EXISTS knowledge_sources (

    id SERIAL PRIMARY KEY,

    tenant_id INTEGER NOT NULL,

    organisation_id INTEGER,

    code VARCHAR(100) NOT NULL,

    nom VARCHAR(255) NOT NULL,

    type VARCHAR(100) NOT NULL,

    actif BOOLEAN
        NOT NULL
        DEFAULT TRUE,

    date_creation TIMESTAMP
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,


    CONSTRAINT fk_knowledge_source_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE RESTRICT,


    CONSTRAINT fk_knowledge_source_organisation
        FOREIGN KEY (organisation_id)
        REFERENCES organisations(id)
        ON DELETE CASCADE
);


-- =========================================================
-- 8. ARTICLES DE CONNAISSANCE
--
-- L IA doit répondre à partir de contenus approuvés.
-- =========================================================

CREATE TABLE IF NOT EXISTS knowledge_articles (

    id BIGSERIAL PRIMARY KEY,

    knowledge_source_id INTEGER NOT NULL,

    code VARCHAR(150) NOT NULL,

    titre VARCHAR(255) NOT NULL,

    contenu TEXT NOT NULL,

    langue VARCHAR(20)
        NOT NULL
        DEFAULT 'fr',

    version INTEGER
        NOT NULL
        DEFAULT 1,

    statut VARCHAR(100)
        NOT NULL
        DEFAULT 'BROUILLON',

    valide_par_personne_id INTEGER,

    date_validation TIMESTAMP,

    date_debut_validite TIMESTAMP,

    date_fin_validite TIMESTAMP,

    date_creation TIMESTAMP
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,


    CONSTRAINT fk_article_source
        FOREIGN KEY (knowledge_source_id)
        REFERENCES knowledge_sources(id)
        ON DELETE CASCADE,


    CONSTRAINT fk_article_validator
        FOREIGN KEY (valide_par_personne_id)
        REFERENCES personnes(id)
        ON DELETE SET NULL
);


-- =========================================================
-- 9. CONFIGURATION IA
--
-- Peut être configurée par tenant / organisation /
-- cas d usage.
-- =========================================================

CREATE TABLE IF NOT EXISTS ai_configurations (

    id SERIAL PRIMARY KEY,

    tenant_id INTEGER NOT NULL,

    organisation_id INTEGER,

    code VARCHAR(100) NOT NULL,

    nom VARCHAR(255) NOT NULL,

    use_case VARCHAR(100) NOT NULL,

    actif BOOLEAN
        NOT NULL
        DEFAULT TRUE,

    human_validation_required BOOLEAN
        NOT NULL
        DEFAULT FALSE,

    configuration JSONB
        NOT NULL
        DEFAULT '{}'::jsonb,

    date_creation TIMESTAMP
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    date_modification TIMESTAMP
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,


    CONSTRAINT fk_ai_configuration_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE CASCADE,


    CONSTRAINT fk_ai_configuration_organisation
        FOREIGN KEY (organisation_id)
        REFERENCES organisations(id)
        ON DELETE CASCADE
);


-- =========================================================
-- 10. CONFIGURATION LANGUES / VOIX
--
-- Architecture extensible :
-- français, wolof, bambara, pulaar, etc.
-- =========================================================

CREATE TABLE IF NOT EXISTS language_configurations (

    id SERIAL PRIMARY KEY,

    tenant_id INTEGER NOT NULL,

    organisation_id INTEGER,

    language_code VARCHAR(20) NOT NULL,

    nom VARCHAR(100) NOT NULL,

    texte_active BOOLEAN
        NOT NULL
        DEFAULT TRUE,

    voice_input_active BOOLEAN
        NOT NULL
        DEFAULT FALSE,

    voice_output_active BOOLEAN
        NOT NULL
        DEFAULT FALSE,

    actif BOOLEAN
        NOT NULL
        DEFAULT TRUE,

    configuration JSONB
        NOT NULL
        DEFAULT '{}'::jsonb,


    CONSTRAINT fk_language_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE CASCADE,


    CONSTRAINT fk_language_organisation
        FOREIGN KEY (organisation_id)
        REFERENCES organisations(id)
        ON DELETE CASCADE
);


-- =========================================================
-- 11. CONVERSATIONS IA
--
-- Une conversation peut provenir :
-- citoyen
-- agent
-- email
-- voix
-- interface web
-- etc.
-- =========================================================

CREATE TABLE IF NOT EXISTS ai_conversations (

    id BIGSERIAL PRIMARY KEY,

    tenant_id INTEGER NOT NULL,

    organisation_id INTEGER,

    personne_id INTEGER,

    ai_configuration_id INTEGER,

    canal VARCHAR(100)
        NOT NULL
        DEFAULT 'WEB',

    langue VARCHAR(20)
        NOT NULL
        DEFAULT 'fr',

    statut VARCHAR(100)
        NOT NULL
        DEFAULT 'OUVERTE',

    date_creation TIMESTAMP
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    date_cloture TIMESTAMP,


    CONSTRAINT fk_ai_conversation_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE RESTRICT,


    CONSTRAINT fk_ai_conversation_organisation
        FOREIGN KEY (organisation_id)
        REFERENCES organisations(id)
        ON DELETE SET NULL,


    CONSTRAINT fk_ai_conversation_personne
        FOREIGN KEY (personne_id)
        REFERENCES personnes(id)
        ON DELETE SET NULL,


    CONSTRAINT fk_ai_conversation_configuration
        FOREIGN KEY (ai_configuration_id)
        REFERENCES ai_configurations(id)
        ON DELETE SET NULL
);


-- =========================================================
-- 12. MESSAGES IA
-- =========================================================

CREATE TABLE IF NOT EXISTS ai_messages (

    id BIGSERIAL PRIMARY KEY,

    conversation_id BIGINT NOT NULL,

    auteur_type VARCHAR(100) NOT NULL,

    contenu TEXT NOT NULL,

    metadata JSONB
        NOT NULL
        DEFAULT '{}'::jsonb,

    date_message TIMESTAMP
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,


    CONSTRAINT fk_ai_message_conversation
        FOREIGN KEY (conversation_id)
        REFERENCES ai_conversations(id)
        ON DELETE CASCADE
);


-- =========================================================
-- 13. ESCALADES VERS UN HUMAIN
--
-- L IA ne décide pas de tout.
-- =========================================================

CREATE TABLE IF NOT EXISTS ai_escalations (

    id BIGSERIAL PRIMARY KEY,

    conversation_id BIGINT NOT NULL,

    organisation_id INTEGER,

    motif TEXT NOT NULL,

    priorite VARCHAR(100)
        NOT NULL
        DEFAULT 'NORMALE',

    statut VARCHAR(100)
        NOT NULL
        DEFAULT 'A_TRAITER',

    assigne_a_personne_id INTEGER,

    date_creation TIMESTAMP
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    date_traitement TIMESTAMP,


    CONSTRAINT fk_ai_escalation_conversation
        FOREIGN KEY (conversation_id)
        REFERENCES ai_conversations(id)
        ON DELETE CASCADE,


    CONSTRAINT fk_ai_escalation_organisation
        FOREIGN KEY (organisation_id)
        REFERENCES organisations(id)
        ON DELETE SET NULL,


    CONSTRAINT fk_ai_escalation_assignee
        FOREIGN KEY (assigne_a_personne_id)
        REFERENCES personnes(id)
        ON DELETE SET NULL
);


-- =========================================================
-- 14. AUDIT TRAIL GÉNÉRIQUE
--
-- Important pour :
-- sécurité
-- conformité
-- rapports
-- IA
-- commissions
-- administration
-- =========================================================

CREATE TABLE IF NOT EXISTS audit_trail (

    id BIGSERIAL PRIMARY KEY,

    tenant_id INTEGER,

    organisation_id INTEGER,

    personne_id INTEGER,

    action VARCHAR(150) NOT NULL,

    entity_type VARCHAR(100),

    entity_id VARCHAR(100),

    details JSONB
        NOT NULL
        DEFAULT '{}'::jsonb,

    date_action TIMESTAMP
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,


    CONSTRAINT fk_audit_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE SET NULL,


    CONSTRAINT fk_audit_organisation
        FOREIGN KEY (organisation_id)
        REFERENCES organisations(id)
        ON DELETE SET NULL,


    CONSTRAINT fk_audit_personne
        FOREIGN KEY (personne_id)
        REFERENCES personnes(id)
        ON DELETE SET NULL
);


-- =========================================================
-- 15. INDEX
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_dashboard_org
ON dashboard_configurations(
    tenant_id,
    organisation_id
);


CREATE INDEX IF NOT EXISTS idx_report_runs_tenant
ON report_runs(
    tenant_id,
    date_generation
);


CREATE INDEX IF NOT EXISTS idx_knowledge_source_org
ON knowledge_sources(
    tenant_id,
    organisation_id
);


CREATE INDEX IF NOT EXISTS idx_knowledge_articles_source
ON knowledge_articles(
    knowledge_source_id,
    statut
);


CREATE INDEX IF NOT EXISTS idx_ai_config_org
ON ai_configurations(
    tenant_id,
    organisation_id
);


CREATE INDEX IF NOT EXISTS idx_ai_conversation_org
ON ai_conversations(
    tenant_id,
    organisation_id
);


CREATE INDEX IF NOT EXISTS idx_ai_escalation_status
ON ai_escalations(
    statut,
    priorite
);


CREATE INDEX IF NOT EXISTS idx_audit_tenant
ON audit_trail(
    tenant_id,
    date_action
);


-- =========================================================
-- 16. ACTIVATION PILOTE CONSULAT BORDEAUX
-- =========================================================

INSERT INTO organisation_capabilities (
    organisation_id,
    capability_id
)
SELECT
    1,
    id
FROM capabilities
WHERE code IN (
    'REPORTING',
    'AI_SECRETARIAT',
    'AI_CITIZEN_ASSISTANT'
)
ON CONFLICT (
    organisation_id,
    capability_id
)
DO NOTHING;


-- =========================================================
-- 17. ACTIVATION SATEER FRANCE
--
-- SATEER peut administrer dashboards, IA et rapports.
-- =========================================================

INSERT INTO organisation_capabilities (
    organisation_id,
    capability_id
)
SELECT
    5,
    id
FROM capabilities
WHERE code IN (
    'REPORTING',
    'AI_ADMIN',
    'DASHBOARD_ADMIN'
)
ON CONFLICT (
    organisation_id,
    capability_id
)
DO NOTHING;


-- =========================================================
-- 18. DASHBOARD PILOTE CONSULAT
--
-- Activé par SATEER France / Agent SATEER.
-- =========================================================

INSERT INTO dashboard_configurations (
    tenant_id,
    organisation_id,
    code,
    nom,
    niveau,
    configuration,
    active_par_organisation_id,
    active_par_personne_id
)
VALUES (
    1,
    1,
    'CONSULAT_MAIN',
    'Tableau de bord Consulat',
    'PILOTE',
    '{
        "modules": [
            "demandes",
            "publications",
            "diaspora",
            "analytics",
            "bureau_projet"
        ]
    }'::jsonb,
    5,
    6
)
ON CONFLICT (
    tenant_id,
    organisation_id,
    code
)
DO NOTHING;


-- =========================================================
-- 19. SOURCE DE CONNAISSANCE PILOTE
-- =========================================================

INSERT INTO knowledge_sources (
    tenant_id,
    organisation_id,
    code,
    nom,
    type
)
VALUES (
    1,
    1,
    'CONSULAT_BORDEAUX_OFFICIAL',
    'Base officielle du Consulat du Sénégal à Bordeaux',
    'INSTITUTIONNELLE'
)
ON CONFLICT
DO NOTHING;


-- =========================================================
-- 20. CONFIGURATIONS IA PILOTE
-- =========================================================

INSERT INTO ai_configurations (
    tenant_id,
    organisation_id,
    code,
    nom,
    use_case,
    human_validation_required
)
VALUES

(
    1,
    1,
    'CONSULAT_SECRETARIAT',
    'Assistant IA du secrétariat',
    'SECRETARIAT',
    TRUE
),

(
    1,
    1,
    'CONSULAT_CITIZEN',
    'Assistant IA des usagers',
    'CITIZEN_ASSISTANT',
    FALSE
)

ON CONFLICT
DO NOTHING;


-- =========================================================
-- 21. LANGUES PILOTE
-- =========================================================

INSERT INTO language_configurations (
    tenant_id,
    organisation_id,
    language_code,
    nom,
    texte_active,
    voice_input_active,
    voice_output_active
)
VALUES

(
    1,
    1,
    'fr',
    'Français',
    TRUE,
    TRUE,
    TRUE
),

(
    1,
    1,
    'wo',
    'Wolof',
    TRUE,
    FALSE,
    FALSE
);
