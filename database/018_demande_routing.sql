-- =========================================================
-- SATEER
-- Migration 018
-- Orientation des demandes par le Secrétariat
-- =========================================================
--
-- Principe :
--
-- Demande reçue
--      ↓
-- Secrétariat
--      ↓
-- Orientation vers une unité
--
-- La table demandes conserve la destination actuelle.
-- La table demande_orientations conserve l'historique.
--
-- =========================================================


BEGIN;


-- =========================================================
-- 1. DESTINATION ACTUELLE DE LA DEMANDE
-- =========================================================

ALTER TABLE demandes
ADD COLUMN IF NOT EXISTS destination_unit_id INTEGER;


ALTER TABLE demandes
ADD COLUMN IF NOT EXISTS orientee_par INTEGER;


ALTER TABLE demandes
ADD COLUMN IF NOT EXISTS motif_orientation TEXT;


ALTER TABLE demandes
ADD COLUMN IF NOT EXISTS date_orientation TIMESTAMP WITHOUT TIME ZONE;


-- =========================================================
-- 2. CLÉS ÉTRANGÈRES
-- =========================================================

DO $$
BEGIN

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_demandes_destination_unit'
    ) THEN

        ALTER TABLE demandes

        ADD CONSTRAINT fk_demandes_destination_unit

        FOREIGN KEY (
            destination_unit_id
        )

        REFERENCES organisation_units(id)

        ON DELETE SET NULL;

    END IF;

END
$$;


DO $$
BEGIN

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_demandes_orientee_par'
    ) THEN

        ALTER TABLE demandes

        ADD CONSTRAINT fk_demandes_orientee_par

        FOREIGN KEY (
            orientee_par
        )

        REFERENCES personnes(id)

        ON DELETE SET NULL;

    END IF;

END
$$;


-- =========================================================
-- 3. HISTORIQUE DES ORIENTATIONS
-- =========================================================

CREATE TABLE IF NOT EXISTS demande_orientations (

    id BIGSERIAL PRIMARY KEY,

    demande_id BIGINT NOT NULL,

    ancienne_unit_id INTEGER,

    nouvelle_unit_id INTEGER NOT NULL,

    orientee_par INTEGER,

    motif TEXT,

    metadata JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    date_creation TIMESTAMP WITHOUT TIME ZONE
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,


    CONSTRAINT fk_demande_orientations_demande

        FOREIGN KEY (
            demande_id
        )

        REFERENCES demandes(id)

        ON DELETE CASCADE,


    CONSTRAINT fk_demande_orientations_ancienne_unit

        FOREIGN KEY (
            ancienne_unit_id
        )

        REFERENCES organisation_units(id)

        ON DELETE SET NULL,


    CONSTRAINT fk_demande_orientations_nouvelle_unit

        FOREIGN KEY (
            nouvelle_unit_id
        )

        REFERENCES organisation_units(id)

        ON DELETE RESTRICT,


    CONSTRAINT fk_demande_orientations_personne

        FOREIGN KEY (
            orientee_par
        )

        REFERENCES personnes(id)

        ON DELETE SET NULL
);


-- =========================================================
-- 4. INDEX
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_demandes_destination_unit
ON demandes (
    destination_unit_id
);


CREATE INDEX IF NOT EXISTS idx_demande_orientations_demande
ON demande_orientations (
    demande_id,
    date_creation DESC
);


CREATE INDEX IF NOT EXISTS idx_demande_orientations_nouvelle_unit
ON demande_orientations (
    nouvelle_unit_id
);


COMMIT;