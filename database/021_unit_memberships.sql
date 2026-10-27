-- =========================================================
-- SATEER
-- Migration 021
-- Affectations génériques Personne ↔ Unité ↔ Rôle
-- =========================================================
--
-- Doctrine :
--
-- La référence métier du rôle devient role_id.
--
-- Le champ texte "role" reste temporairement disponible
-- uniquement pour compatibilité avec les anciennes données.
--
-- principal = affectation principale de la personne.
--
-- Responsable d'une unité = rôle configurable
-- (ex. UNIT_MANAGER dans le pilote Bordeaux).
--
-- =========================================================


BEGIN;


-- =========================================================
-- 1. RETIRER L'ANCIENNE CONTRAINTE BASÉE SUR LE TEXTE
-- =========================================================

ALTER TABLE relations_personne_organisation_unit

DROP CONSTRAINT IF EXISTS
uq_relation_personne_unit_role;


-- =========================================================
-- 2. LE CHAMP TEXTE "role" DEVIENT HÉRITÉ / OPTIONNEL
-- =========================================================

ALTER TABLE relations_personne_organisation_unit

ALTER COLUMN role
DROP NOT NULL;


-- =========================================================
-- 3. VÉRIFIER QU'UNE AFFECTATION GARDE AU MOINS
--    UNE INFORMATION DE RÔLE
--
-- Anciennes données :
--     role peut encore être renseigné.
--
-- Nouvelles données :
--     role_id doit être utilisé.
-- =========================================================

DO $$
BEGIN

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_relation_unit_role_present'
    ) THEN

        ALTER TABLE relations_personne_organisation_unit

        ADD CONSTRAINT chk_relation_unit_role_present

        CHECK (
            role_id IS NOT NULL
            OR NULLIF(
                BTRIM(role),
                ''
            ) IS NOT NULL
        );

    END IF;

END
$$;


-- =========================================================
-- 4. UNICITÉ SUR LE NOUVEAU RÔLE CONFIGURABLE
-- =========================================================

CREATE UNIQUE INDEX IF NOT EXISTS
uq_relation_personne_unit_role_id

ON relations_personne_organisation_unit (
    personne_id,
    organisation_unit_id,
    role_id
)

WHERE role_id IS NOT NULL;


-- =========================================================
-- 5. DATE DE MODIFICATION
-- =========================================================

ALTER TABLE relations_personne_organisation_unit

ADD COLUMN IF NOT EXISTS
date_modification TIMESTAMP WITHOUT TIME ZONE
NOT NULL
DEFAULT CURRENT_TIMESTAMP;


-- =========================================================
-- 6. INDEX POUR LES AFFECTATIONS ACTIVES
-- =========================================================

CREATE INDEX IF NOT EXISTS
idx_relation_unit_actif

ON relations_personne_organisation_unit (
    organisation_unit_id,
    actif
);


CREATE INDEX IF NOT EXISTS
idx_relation_personne_actif

ON relations_personne_organisation_unit (
    personne_id,
    actif
);


CREATE INDEX IF NOT EXISTS
idx_relation_personne_principal

ON relations_personne_organisation_unit (
    personne_id,
    principal
)

WHERE actif = TRUE;


COMMIT;