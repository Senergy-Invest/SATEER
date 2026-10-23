-- =========================================================
-- SATEER
-- Migration 008
--
-- Consentements
-- Leads
-- Mises en relation
-- Suivi
-- Commissions
--
-- Architecture générique multi-tenant / CEDEAO
-- =========================================================


-- =========================================================
-- 1. PARTNER AGREEMENTS
--
-- Contrat entre SATEER et une organisation partenaire.
-- Exemple :
-- banque
-- promoteur
-- entreprise
-- projet SATEER Invest
-- =========================================================

CREATE TABLE IF NOT EXISTS partner_agreements (

    id BIGSERIAL PRIMARY KEY,

    tenant_id INTEGER NOT NULL,

    sateer_organisation_id INTEGER NOT NULL,

    partner_organisation_id INTEGER NOT NULL,

    code VARCHAR(100) NOT NULL,

    type VARCHAR(100) NOT NULL,

    statut VARCHAR(100)
        NOT NULL
        DEFAULT 'ACTIF',

    commission_type VARCHAR(100),

    commission_value NUMERIC(15,4),

    devise VARCHAR(20),

    date_debut TIMESTAMP,

    date_fin TIMESTAMP,

    configuration JSONB
        NOT NULL
        DEFAULT '{}'::jsonb,

    date_creation TIMESTAMP
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,


    CONSTRAINT fk_partner_agreement_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_partner_agreement_sateer
        FOREIGN KEY (sateer_organisation_id)
        REFERENCES organisations(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_partner_agreement_partner
        FOREIGN KEY (partner_organisation_id)
        REFERENCES organisations(id)
        ON DELETE RESTRICT
);


-- =========================================================
-- 2. CONSENTS
--
-- Consentement explicite de l'utilisateur.
--
-- Exemple :
-- transmettre mes coordonnées
-- autoriser une banque à me contacter
-- =========================================================

CREATE TABLE IF NOT EXISTS consents (

    id BIGSERIAL PRIMARY KEY,

    tenant_id INTEGER NOT NULL,

    personne_id INTEGER NOT NULL,

    organisation_id INTEGER,

    publication_id INTEGER,

    consent_type VARCHAR(100) NOT NULL,

    statut VARCHAR(100)
        NOT NULL
        DEFAULT 'ACCORDE',

    texte_consentement TEXT NOT NULL,

    metadata JSONB
        NOT NULL
        DEFAULT '{}'::jsonb,

    date_consentement TIMESTAMP
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    date_retrait TIMESTAMP,


    CONSTRAINT fk_consent_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_consent_personne
        FOREIGN KEY (personne_id)
        REFERENCES personnes(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_consent_organisation
        FOREIGN KEY (organisation_id)
        REFERENCES organisations(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_consent_publication
        FOREIGN KEY (publication_id)
        REFERENCES publications(id)
        ON DELETE SET NULL
);


-- =========================================================
-- 3. LEADS
--
-- Un lead apparaît après intérêt qualifié /
-- demande volontaire de mise en relation.
-- =========================================================

CREATE TABLE IF NOT EXISTS leads (

    id BIGSERIAL PRIMARY KEY,

    tenant_id INTEGER NOT NULL,

    personne_id INTEGER NOT NULL,

    source_organisation_id INTEGER NOT NULL,

    publication_id INTEGER,

    partner_organisation_id INTEGER,

    consent_id BIGINT,

    type VARCHAR(100)
        NOT NULL
        DEFAULT 'CONTACT_REQUEST',

    statut VARCHAR(100)
        NOT NULL
        DEFAULT 'NOUVEAU',

    qualification VARCHAR(100),

    besoin TEXT,

    metadata JSONB
        NOT NULL
        DEFAULT '{}'::jsonb,

    date_creation TIMESTAMP
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    date_modification TIMESTAMP
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,


    CONSTRAINT fk_lead_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_lead_personne
        FOREIGN KEY (personne_id)
        REFERENCES personnes(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_lead_source_org
        FOREIGN KEY (source_organisation_id)
        REFERENCES organisations(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_lead_publication
        FOREIGN KEY (publication_id)
        REFERENCES publications(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_lead_partner_org
        FOREIGN KEY (partner_organisation_id)
        REFERENCES organisations(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_lead_consent
        FOREIGN KEY (consent_id)
        REFERENCES consents(id)
        ON DELETE SET NULL
);


-- =========================================================
-- 4. INTRODUCTIONS
--
-- Mise en relation effective.
-- =========================================================

CREATE TABLE IF NOT EXISTS introductions (

    id BIGSERIAL PRIMARY KEY,

    tenant_id INTEGER NOT NULL,

    lead_id BIGINT NOT NULL,

    sateer_organisation_id INTEGER NOT NULL,

    partner_organisation_id INTEGER NOT NULL,

    statut VARCHAR(100)
        NOT NULL
        DEFAULT 'PREPAREE',

    canal VARCHAR(100),

    date_introduction TIMESTAMP,

    metadata JSONB
        NOT NULL
        DEFAULT '{}'::jsonb,


    CONSTRAINT fk_introduction_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_introduction_lead
        FOREIGN KEY (lead_id)
        REFERENCES leads(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_introduction_sateer
        FOREIGN KEY (sateer_organisation_id)
        REFERENCES organisations(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_introduction_partner
        FOREIGN KEY (partner_organisation_id)
        REFERENCES organisations(id)
        ON DELETE RESTRICT
);


-- =========================================================
-- 5. FOLLOW UPS
--
-- Historique du suivi de mise en relation.
-- =========================================================

CREATE TABLE IF NOT EXISTS lead_followups (

    id BIGSERIAL PRIMARY KEY,

    tenant_id INTEGER NOT NULL,

    lead_id BIGINT NOT NULL,

    personne_agent_id INTEGER,

    statut VARCHAR(100) NOT NULL,

    note TEXT,

    metadata JSONB
        NOT NULL
        DEFAULT '{}'::jsonb,

    date_suivi TIMESTAMP
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,


    CONSTRAINT fk_followup_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_followup_lead
        FOREIGN KEY (lead_id)
        REFERENCES leads(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_followup_agent
        FOREIGN KEY (personne_agent_id)
        REFERENCES personnes(id)
        ON DELETE SET NULL
);


-- =========================================================
-- 6. COMMISSIONS
--
-- Commission SATEER éventuelle.
-- Elle ne signifie pas paiement automatique.
-- Elle représente une obligation / rémunération
-- contractuelle à suivre.
-- =========================================================

CREATE TABLE IF NOT EXISTS commissions (

    id BIGSERIAL PRIMARY KEY,

    tenant_id INTEGER NOT NULL,

    partner_agreement_id BIGINT,

    lead_id BIGINT,

    introduction_id BIGINT,

    montant NUMERIC(15,2),

    devise VARCHAR(20),

    type VARCHAR(100),

    statut VARCHAR(100)
        NOT NULL
        DEFAULT 'A_CALCULER',

    date_eligibilite TIMESTAMP,

    date_paiement TIMESTAMP,

    metadata JSONB
        NOT NULL
        DEFAULT '{}'::jsonb,


    CONSTRAINT fk_commission_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_commission_agreement
        FOREIGN KEY (partner_agreement_id)
        REFERENCES partner_agreements(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_commission_lead
        FOREIGN KEY (lead_id)
        REFERENCES leads(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_commission_introduction
        FOREIGN KEY (introduction_id)
        REFERENCES introductions(id)
        ON DELETE SET NULL
);


-- =========================================================
-- 7. INDEX
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_consents_person
ON consents(
    tenant_id,
    personne_id
);


CREATE INDEX IF NOT EXISTS idx_leads_partner
ON leads(
    tenant_id,
    partner_organisation_id,
    statut
);


CREATE INDEX IF NOT EXISTS idx_leads_source
ON leads(
    tenant_id,
    source_organisation_id
);


CREATE INDEX IF NOT EXISTS idx_introductions_lead
ON introductions(
    lead_id
);


CREATE INDEX IF NOT EXISTS idx_followups_lead
ON lead_followups(
    lead_id,
    date_suivi
);


CREATE INDEX IF NOT EXISTS idx_commissions_status
ON commissions(
    tenant_id,
    statut
);