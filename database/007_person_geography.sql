-- =========================================================
-- SATEER
-- Migration 007
--
-- Géographie structurée des personnes
--
-- Objectif :
-- - ciblage
-- - analytics
-- - reporting
-- - segmentation géographique
--
-- Architecture générique multi-pays / CEDEAO
-- =========================================================


-- =========================================================
-- 1. NOUVEAUX CHAMPS PERSONNES
--
-- Les anciens champs texte :
--
-- pays_residence
-- departement
--
-- sont conservés temporairement pour compatibilité.
--
-- Les nouvelles références structurées deviennent
-- progressivement les références principales.
-- =========================================================

ALTER TABLE personnes
ADD COLUMN IF NOT EXISTS residence_country_id INTEGER;


ALTER TABLE personnes
ADD COLUMN IF NOT EXISTS residence_territory_id INTEGER;


-- =========================================================
-- 2. CONTRAINTES
--
-- On les ajoute de manière protégée afin que la migration
-- puisse être relue sans créer la même contrainte deux fois.
-- =========================================================

DO $$
BEGIN

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_personne_residence_country'
    ) THEN

        ALTER TABLE personnes
        ADD CONSTRAINT fk_personne_residence_country
            FOREIGN KEY (residence_country_id)
            REFERENCES countries(id)
            ON DELETE SET NULL;

    END IF;

END
$$;


DO $$
BEGIN

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_personne_residence_territory'
    ) THEN

        ALTER TABLE personnes
        ADD CONSTRAINT fk_personne_residence_territory
            FOREIGN KEY (residence_territory_id)
            REFERENCES territories(id)
            ON DELETE SET NULL;

    END IF;

END
$$;


-- =========================================================
-- 3. TERRITOIRE MANQUANT DU PILOTE
--
-- Haute-Garonne existe déjà dans nos données historiques
-- pour Mamadou.
--
-- On la crée proprement dans le référentiel territories.
--
-- country_id 2 = France
-- parent_id 1 = France
-- =========================================================

INSERT INTO territories (
    country_id,
    parent_id,
    code,
    nom,
    type
)
SELECT
    2,
    1,
    '31',
    'Haute-Garonne',
    'DEPARTEMENT'
WHERE NOT EXISTS (
    SELECT 1
    FROM territories
    WHERE
        country_id = 2
        AND code = '31'
);


-- =========================================================
-- 4. FATOU NDIAYE
--
-- France / Gironde
-- =========================================================

UPDATE personnes
SET
    residence_country_id = 2,
    residence_territory_id = (
        SELECT id
        FROM territories
        WHERE
            country_id = 2
            AND code = '33'
        LIMIT 1
    )
WHERE id = 1;


-- =========================================================
-- 5. MAMADOU DIOP
--
-- France / Haute-Garonne
-- =========================================================

UPDATE personnes
SET
    residence_country_id = 2,
    residence_territory_id = (
        SELECT id
        FROM territories
        WHERE
            country_id = 2
            AND code = '31'
        LIMIT 1
    )
WHERE id = 2;


-- =========================================================
-- 6. AWA FALL
--
-- France / Gironde
-- =========================================================

UPDATE personnes
SET
    residence_country_id = 2,
    residence_territory_id = (
        SELECT id
        FROM territories
        WHERE
            country_id = 2
            AND code = '33'
        LIMIT 1
    )
WHERE id = 3;


-- =========================================================
-- 7. IBRAHIMA SARR
--
-- France
-- territoire précis actuellement inconnu.
-- =========================================================

UPDATE personnes
SET
    residence_country_id = 2,
    residence_territory_id = NULL
WHERE id = 4;


-- =========================================================
-- 8. AMINATA BA
--
-- France / Gironde
-- =========================================================

UPDATE personnes
SET
    residence_country_id = 2,
    residence_territory_id = (
        SELECT id
        FROM territories
        WHERE
            country_id = 2
            AND code = '33'
        LIMIT 1
    )
WHERE id = 5;


-- =========================================================
-- 9. AGENT SATEER
--
-- France / Gironde
-- =========================================================

UPDATE personnes
SET
    residence_country_id = 2,
    residence_territory_id = (
        SELECT id
        FROM territories
        WHERE
            country_id = 2
            AND code = '33'
        LIMIT 1
    )
WHERE id = 6;


-- =========================================================
-- 10. INDEX
--
-- Ils serviront notamment pour :
-- ciblage
-- analytics
-- reporting
-- recherches géographiques
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_personnes_residence_country
ON personnes(residence_country_id);


CREATE INDEX IF NOT EXISTS idx_personnes_residence_territory
ON personnes(residence_territory_id);