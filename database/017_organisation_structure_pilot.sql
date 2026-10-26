-- =========================================================
-- SATEER
-- Migration 017
-- Ajustement de la structure interne du Consulat pilote
-- =========================================================
--
-- Structure cible :
--
-- Consulat du Sénégal à Bordeaux
-- │
-- ├── Bureau du Consul
-- │
-- └── Bureau du Vice-Consul
--     │
--     ├── Secrétariat
--     │
--     ├── Bureau de projet
--     │
--     └── Service consulaire
--
-- Le Vice-Consul supervise ces unités.
--
-- L'Assistant secrétariat appartient fonctionnellement
-- au Secrétariat et non au dashboard du Vice-Consul.
--
-- =========================================================


BEGIN;


-- =========================================================
-- 1. BUREAU DE PROJET
-- =========================================================

INSERT INTO organisation_units (
    organisation_id,
    parent_unit_id,
    code,
    nom,
    type
)

SELECT
    1,
    vice_consul.id,
    'PROJECT_OFFICE',
    'Bureau de projet',
    'PROJECT_OFFICE'

FROM organisation_units vice_consul

WHERE
    vice_consul.organisation_id = 1
    AND vice_consul.code = 'OPERATIONAL_DEPUTY'

ON CONFLICT (
    organisation_id,
    code
)

DO NOTHING;


-- =========================================================
-- 2. DOCUMENTATION FONCTIONNELLE DES UNITÉS
-- =========================================================
--
-- On enrichit les metadata pour expliquer le rôle
-- de chaque unité dans le pilote.
--
-- =========================================================


UPDATE organisation_units

SET metadata =
    jsonb_build_object(
        'mission',
        'Supervision stratégique et représentation institutionnelle',
        'dashboardRole',
        'HEAD_OF_MISSION'
    )

WHERE
    organisation_id = 1
    AND code = 'HEAD_OF_MISSION';


UPDATE organisation_units

SET metadata =
    jsonb_build_object(
        'mission',
        'Pilotage opérationnel quotidien et supervision des services',
        'dashboardRole',
        'OPERATIONAL_DEPUTY'
    )

WHERE
    organisation_id = 1
    AND code = 'OPERATIONAL_DEPUTY';


UPDATE organisation_units

SET metadata =
    jsonb_build_object(
        'mission',
        'Réception, tri, orientation et suivi des demandes entrantes',
        'assistantSecretariat',
        true
    )

WHERE
    organisation_id = 1
    AND code = 'SECRETARIAT';


UPDATE organisation_units

SET metadata =
    jsonb_build_object(
        'mission',
        'Suivi des projets, initiatives et actions transversales'
    )

WHERE
    organisation_id = 1
    AND code = 'PROJECT_OFFICE';


UPDATE organisation_units

SET metadata =
    jsonb_build_object(
        'mission',
        'Traitement opérationnel des démarches consulaires'
    )

WHERE
    organisation_id = 1
    AND code = 'CONSULAR_SERVICE';


COMMIT;