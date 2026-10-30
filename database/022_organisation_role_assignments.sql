-- =========================================================
-- SATEER
-- 022 - AFFECTATIONS DES ROLES ORGANISATIONNELS
-- =========================================================
--
-- Objectif :
-- Permettre à une personne de recevoir un ou plusieurs
-- rôles de portée ORGANISATION ou BOTH.
--
-- Les rôles sont entièrement configurables.
-- Aucun rôle métier n'est imposé par la plateforme.
-- =========================================================

BEGIN;


-- =========================================================
-- 1. GARANTIR LA COHERENCE ROLE / ORGANISATION
-- =========================================================

CREATE UNIQUE INDEX IF NOT EXISTS
    uq_organisation_roles_id_organisation
ON organisation_roles (
    id,
    organisation_id
);


-- =========================================================
-- 2. AFFECTATIONS DES ROLES ORGANISATIONNELS
-- =========================================================

CREATE TABLE IF NOT EXISTS
relations_personne_organisation_roles (

    id SERIAL PRIMARY KEY,

    personne_id INTEGER NOT NULL,

    organisation_id INTEGER NOT NULL,

    role_id INTEGER NOT NULL,

    actif BOOLEAN NOT NULL DEFAULT TRUE,

    date_debut TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    date_fin TIMESTAMP NULL,

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    date_creation TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    date_modification TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP,


    CONSTRAINT fk_affectation_org_role_personne

        FOREIGN KEY (personne_id)
        REFERENCES personnes(id)
        ON DELETE CASCADE,


    CONSTRAINT fk_affectation_org_role_organisation

        FOREIGN KEY (organisation_id)
        REFERENCES organisations(id)
        ON DELETE CASCADE,


    CONSTRAINT fk_affectation_org_role_role

        FOREIGN KEY (
            role_id,
            organisation_id
        )

        REFERENCES organisation_roles (
            id,
            organisation_id
        )

        ON DELETE RESTRICT,


    CONSTRAINT uq_affectation_personne_org_role

        UNIQUE (
            personne_id,
            organisation_id,
            role_id
        )

);


-- =========================================================
-- 3. INDEX DE RECHERCHE
-- =========================================================

CREATE INDEX IF NOT EXISTS
    idx_affectation_org_role_personne
ON relations_personne_organisation_roles (
    personne_id
);


CREATE INDEX IF NOT EXISTS
    idx_affectation_org_role_organisation
ON relations_personne_organisation_roles (
    organisation_id
);


CREATE INDEX IF NOT EXISTS
    idx_affectation_org_role_role
ON relations_personne_organisation_roles (
    role_id
);


CREATE INDEX IF NOT EXISTS
    idx_affectation_org_role_active
ON relations_personne_organisation_roles (
    personne_id,
    organisation_id
)
WHERE actif = TRUE;


-- =========================================================
-- 4. PROTECTION DES AFFECTATIONS
-- =========================================================
--
-- Une personne doit appartenir à l'organisation.
--
-- Le rôle doit :
-- - appartenir à cette organisation
-- - être actif
-- - avoir un scope ORGANISATION ou BOTH
--
-- =========================================================

CREATE OR REPLACE FUNCTION
verifier_affectation_role_organisation()

RETURNS TRIGGER AS $$

BEGIN

    IF NOT EXISTS (

        SELECT 1

        FROM relations_personne_organisation rpo

        WHERE
            rpo.personne_id = NEW.personne_id
            AND rpo.organisation_id = NEW.organisation_id

    ) THEN

        RAISE EXCEPTION
            'PERSONNE_HORS_ORGANISATION';

    END IF;


    IF NEW.actif = TRUE THEN

        IF NOT EXISTS (

            SELECT 1

            FROM organisation_roles r

            WHERE
                r.id = NEW.role_id
                AND r.organisation_id = NEW.organisation_id
                AND r.actif = TRUE
                AND r.scope IN (
                    'ORGANISATION',
                    'BOTH'
                )

        ) THEN

            RAISE EXCEPTION
                'ROLE_ORGANISATION_INVALIDE';

        END IF;

    END IF;


    RETURN NEW;

END;

$$ LANGUAGE plpgsql;


DROP TRIGGER IF EXISTS
    trg_verifier_affectation_role_organisation
ON relations_personne_organisation_roles;


CREATE TRIGGER
    trg_verifier_affectation_role_organisation

BEFORE INSERT OR UPDATE
ON relations_personne_organisation_roles

FOR EACH ROW

EXECUTE FUNCTION
    verifier_affectation_role_organisation();


COMMIT;