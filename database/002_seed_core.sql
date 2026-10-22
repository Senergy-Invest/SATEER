-- =========================================================
-- SATEER - Données initiales du Core
-- organisations / personnes / relations
-- =========================================================


-- =========================================================
-- ORGANISATIONS
-- =========================================================

INSERT INTO organisations (
    id,
    nom,
    type
)
VALUES
    (
        1,
        'Consulat du Sénégal à Bordeaux',
        'CONSULAT'
    ),
    (
        2,
        'Ambassade du Sénégal en France',
        'AMBASSADE'
    ),
    (
        3,
        'SONAGED',
        'ENTREPRISE_PUBLIQUE'
    ),
    (
        4,
        'Association des Étudiants Sénégalais de Bordeaux',
        'ASSOCIATION'
    ),
    (
        5,
        'SATEER France',
        'SATEER'
    );


-- =========================================================
-- PERSONNES
-- =========================================================

INSERT INTO personnes (
    id,
    prenom,
    nom,
    pays_residence,
    departement,
    profil
)
VALUES
    (
        1,
        'Fatou',
        'Ndiaye',
        'France',
        'Gironde',
        'ETUDIANT'
    ),
    (
        2,
        'Mamadou',
        'Diop',
        'France',
        'Haute-Garonne',
        'ENTREPRENEUR'
    ),
    (
        3,
        'Awa',
        'Fall',
        'France',
        'Gironde',
        'AGENT_CONSULAIRE'
    ),
    (
        4,
        'Ibrahima',
        'Sarr',
        'France',
        NULL,
        'AUTRE'
    ),
    (
        5,
        'Aminata',
        'Ba',
        'France',
        'Gironde',
        'AUTRE'
    ),
    (
        6,
        'Agent',
        'SATEER',
        'France',
        'Gironde',
        'AGENT_SATEER'
    );


-- =========================================================
-- RELATIONS PERSONNE / ORGANISATION
-- =========================================================

INSERT INTO relations_personne_organisation (
    personne_id,
    organisation_id,
    type
)
VALUES
    (
        1,
        1,
        'USAGER'
    ),
    (
        2,
        1,
        'USAGER'
    ),
    (
        3,
        1,
        'AGENT'
    ),
    (
        4,
        2,
        'AGENT'
    ),
    (
        5,
        1,
        'RESPONSABLE'
    ),
    (
        1,
        4,
        'MEMBRE'
    ),
    (
        6,
        5,
        'AGENT_SATEER'
    );


-- =========================================================
-- REMETTRE LES SEQUENCES AU BON NIVEAU
-- =========================================================

SELECT setval(
    'organisations_id_seq',
    (SELECT MAX(id) FROM organisations)
);

SELECT setval(
    'personnes_id_seq',
    (SELECT MAX(id) FROM personnes)
);

SELECT setval(
    'relations_personne_organisation_id_seq',
    (
        SELECT MAX(id)
        FROM relations_personne_organisation
    )
);