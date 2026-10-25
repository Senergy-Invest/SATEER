-- =========================================================
-- SATEER
-- Migration 016
-- Réseau institutionnel et rattachement des organisations
-- =========================================================
--
-- Objectif :
--
-- Une organisation possède son propre profil SATEER.
--
-- Elle peut ensuite :
--
-- 1. être invitée par une autre organisation
-- 2. demander elle-même un rattachement
-- 3. obtenir une relation active après validation
--
-- Exemple :
--
-- Association des Étudiants Sénégalais de Bordeaux
--          ↓
-- COMMUNITY_MEMBER
--          ↓
-- Consulat du Sénégal à Bordeaux
--
-- =========================================================


BEGIN;


-- =========================================================
-- 1. RELATIONS ENTRE ORGANISATIONS
-- =========================================================
--
-- Représente une relation réellement validée.
--
-- Exemples :
--
-- Association → Consulat
-- Entreprise → Ambassade
-- Association → Mairie
-- Partenaire → Institution
--
-- =========================================================

CREATE TABLE IF NOT EXISTS organisation_relationships (

    id SERIAL PRIMARY KEY,

    tenant_id INTEGER NOT NULL,

    source_organisation_id INTEGER NOT NULL,

    target_organisation_id INTEGER NOT NULL,

    type VARCHAR(100) NOT NULL,

    statut VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',

    actif BOOLEAN NOT NULL DEFAULT TRUE,

    date_debut TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    date_fin TIMESTAMP NULL,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    date_creation TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    date_modification TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_org_relationship_tenant
        FOREIGN KEY (
            tenant_id
        )
        REFERENCES tenants(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_org_relationship_source
        FOREIGN KEY (
            source_organisation_id
        )
        REFERENCES organisations(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_org_relationship_target
        FOREIGN KEY (
            target_organisation_id
        )
        REFERENCES organisations(id)
        ON DELETE CASCADE,

    CONSTRAINT uq_org_relationship
        UNIQUE (
            tenant_id,
            source_organisation_id,
            target_organisation_id,
            type
        ),

    CONSTRAINT chk_org_relationship_different
        CHECK (
            source_organisation_id
            <> target_organisation_id
        )
);


CREATE INDEX IF NOT EXISTS idx_org_relationship_source
    ON organisation_relationships (
        source_organisation_id
    );


CREATE INDEX IF NOT EXISTS idx_org_relationship_target
    ON organisation_relationships (
        target_organisation_id
    );


CREATE INDEX IF NOT EXISTS idx_org_relationship_type
    ON organisation_relationships (
        type
    );


CREATE INDEX IF NOT EXISTS idx_org_relationship_statut
    ON organisation_relationships (
        statut
    );


-- =========================================================
-- 2. INVITATIONS D'ORGANISATIONS
-- =========================================================
--
-- Une institution peut inviter une organisation
-- qui n'est pas encore inscrite dans SATEER.
--
-- Exemple :
--
-- Consulat
--     ↓
-- invitation par email
--     ↓
-- association
--     ↓
-- création du profil
--     ↓
-- acceptation
--
-- Le token sera généré côté application Node.js.
--
-- =========================================================

CREATE TABLE IF NOT EXISTS organisation_invitations (

    id SERIAL PRIMARY KEY,

    tenant_id INTEGER NOT NULL,

    organisation_source_id INTEGER NOT NULL,

    organisation_acceptee_id INTEGER NULL,

    email VARCHAR(255) NOT NULL,

    nom_organisation VARCHAR(255) NULL,

    type_relation VARCHAR(100) NOT NULL,

    token VARCHAR(255) NOT NULL,

    statut VARCHAR(50) NOT NULL DEFAULT 'EN_ATTENTE',

    invitee_par_personne_id INTEGER NULL,

    date_expiration TIMESTAMP NULL,

    date_acceptation TIMESTAMP NULL,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    date_creation TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_org_invitation_tenant
        FOREIGN KEY (
            tenant_id
        )
        REFERENCES tenants(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_org_invitation_source
        FOREIGN KEY (
            organisation_source_id
        )
        REFERENCES organisations(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_org_invitation_acceptee
        FOREIGN KEY (
            organisation_acceptee_id
        )
        REFERENCES organisations(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_org_invitation_personne
        FOREIGN KEY (
            invitee_par_personne_id
        )
        REFERENCES personnes(id)
        ON DELETE SET NULL,

    CONSTRAINT uq_org_invitation_token
        UNIQUE (
            token
        )
);


CREATE INDEX IF NOT EXISTS idx_org_invitation_source
    ON organisation_invitations (
        organisation_source_id
    );


CREATE INDEX IF NOT EXISTS idx_org_invitation_email
    ON organisation_invitations (
        email
    );


CREATE INDEX IF NOT EXISTS idx_org_invitation_statut
    ON organisation_invitations (
        statut
    );


-- =========================================================
-- 3. DEMANDES DE RATTACHEMENT
-- =========================================================
--
-- Une organisation déjà inscrite dans SATEER
-- peut demander à rejoindre l'écosystème
-- d'une autre organisation.
--
-- Exemple :
--
-- Association
--      ↓
-- "Je souhaite être rattachée au Consulat"
--      ↓
-- EN_ATTENTE
--      ↓
-- validation
--      ↓
-- organisation_relationships
--
-- =========================================================

CREATE TABLE IF NOT EXISTS organisation_join_requests (

    id SERIAL PRIMARY KEY,

    tenant_id INTEGER NOT NULL,

    organisation_demandeuse_id INTEGER NOT NULL,

    organisation_cible_id INTEGER NOT NULL,

    type_relation VARCHAR(100) NOT NULL,

    statut VARCHAR(50) NOT NULL DEFAULT 'EN_ATTENTE',

    message TEXT NULL,

    demandee_par_personne_id INTEGER NULL,

    traitee_par_personne_id INTEGER NULL,

    motif_decision TEXT NULL,

    date_decision TIMESTAMP NULL,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    date_creation TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    date_modification TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_org_join_tenant
        FOREIGN KEY (
            tenant_id
        )
        REFERENCES tenants(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_org_join_demandeuse
        FOREIGN KEY (
            organisation_demandeuse_id
        )
        REFERENCES organisations(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_org_join_cible
        FOREIGN KEY (
            organisation_cible_id
        )
        REFERENCES organisations(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_org_join_demandeur
        FOREIGN KEY (
            demandee_par_personne_id
        )
        REFERENCES personnes(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_org_join_traitement
        FOREIGN KEY (
            traitee_par_personne_id
        )
        REFERENCES personnes(id)
        ON DELETE SET NULL,

    CONSTRAINT chk_org_join_different
        CHECK (
            organisation_demandeuse_id
            <> organisation_cible_id
        )
);


CREATE INDEX IF NOT EXISTS idx_org_join_cible
    ON organisation_join_requests (
        organisation_cible_id
    );


CREATE INDEX IF NOT EXISTS idx_org_join_demandeuse
    ON organisation_join_requests (
        organisation_demandeuse_id
    );


CREATE INDEX IF NOT EXISTS idx_org_join_statut
    ON organisation_join_requests (
        statut
    );


-- =========================================================
-- 4. DONNÉE PILOTE
-- =========================================================
--
-- Organisation 1 :
-- Consulat du Sénégal à Bordeaux
--
-- Organisation 4 :
-- Association des Étudiants Sénégalais de Bordeaux
--
-- L'association existe déjà dans SATEER.
--
-- Pour notre pilote, nous considérons qu'elle est déjà
-- reconnue comme membre de l'écosystème du Consulat.
--
-- source = association
-- target = Consulat
--
-- =========================================================

INSERT INTO organisation_relationships (
    tenant_id,
    source_organisation_id,
    target_organisation_id,
    type,
    statut,
    actif
)

SELECT
    t.id,
    4,
    1,
    'COMMUNITY_MEMBER',
    'ACTIVE',
    TRUE

FROM tenants t

WHERE
    t.code = 'SN'

ON CONFLICT (
    tenant_id,
    source_organisation_id,
    target_organisation_id,
    type
)

DO NOTHING;


COMMIT;