-- =========================================================
-- SATEER
-- Migration 009
--
-- Partenaire de démonstration pour le pilote
-- Banque + agent + contrat SATEER France
-- =========================================================


-- =========================================================
-- 1. BANQUE PARTENAIRE
--
-- Organisation générique.
-- Le moteur ne dépend pas de son nom.
-- =========================================================

INSERT INTO organisations (
    nom,
    type,
    tenant_id,
    country_id,
    territory_id
)
SELECT
    'Banque Partenaire Démo',
    'BANQUE',
    1,
    1,
    4
WHERE NOT EXISTS (
    SELECT 1
    FROM organisations
    WHERE nom = 'Banque Partenaire Démo'
);


-- =========================================================
-- 2. AGENT DE LA BANQUE
-- =========================================================

INSERT INTO personnes (
    prenom,
    nom,
    pays_residence,
    departement,
    profil,
    residence_country_id,
    residence_territory_id
)
SELECT
    'Agent',
    'Banque Démo',
    'Sénégal',
    NULL,
    'AGENT_PARTENAIRE',
    1,
    4
WHERE NOT EXISTS (
    SELECT 1
    FROM personnes
    WHERE
        prenom = 'Agent'
        AND nom = 'Banque Démo'
);


-- =========================================================
-- 3. RELATION AGENT ↔ BANQUE
-- =========================================================

INSERT INTO relations_personne_organisation (
    personne_id,
    organisation_id,
    type
)
SELECT
    p.id,
    o.id,
    'AGENT'
FROM personnes p
CROSS JOIN organisations o
WHERE
    p.prenom = 'Agent'
    AND p.nom = 'Banque Démo'
    AND o.nom = 'Banque Partenaire Démo'
    AND NOT EXISTS (
        SELECT 1
        FROM relations_personne_organisation r
        WHERE
            r.personne_id = p.id
            AND r.organisation_id = o.id
            AND r.type = 'AGENT'
    );


-- =========================================================
-- 4. CAPABILITIES DE LA BANQUE
-- =========================================================

INSERT INTO organisation_capabilities (
    organisation_id,
    capability_id
)
SELECT
    o.id,
    c.id
FROM organisations o
CROSS JOIN capabilities c
WHERE
    o.nom = 'Banque Partenaire Démo'
    AND c.code IN (
        'PUBLIER',
        'PROPOSER_DIASPORA',
        'ANALYTICS',
        'RECEVOIR_LEADS',
        'SATEER_INVEST',
        'REPORTING'
    )
ON CONFLICT (
    organisation_id,
    capability_id
)
DO NOTHING;


-- =========================================================
-- 5. CONTRAT SATEER FRANCE ↔ BANQUE
--
-- Pour le pilote :
-- commission_type = LEAD_QUALIFIE
--
-- Le montant est volontairement NULL :
-- on ne fixe pas encore de tarif commercial.
-- =========================================================

INSERT INTO partner_agreements (
    tenant_id,
    sateer_organisation_id,
    partner_organisation_id,
    code,
    type,
    statut,
    commission_type,
    commission_value,
    devise,
    date_debut,
    configuration
)
SELECT
    1,
    sateer.id,
    banque.id,
    'SATEER_BANK_DEMO_001',
    'MISE_EN_RELATION',
    'ACTIF',
    'LEAD_QUALIFIE',
    NULL,
    'EUR',
    CURRENT_TIMESTAMP,
    '{
        "pilot": true,
        "description": "Contrat de démonstration pour les mises en relation diaspora."
    }'::jsonb
FROM organisations sateer
CROSS JOIN organisations banque
WHERE
    sateer.nom = 'SATEER France'
    AND banque.nom = 'Banque Partenaire Démo'
    AND NOT EXISTS (
        SELECT 1
        FROM partner_agreements pa
        WHERE pa.code = 'SATEER_BANK_DEMO_001'
    );