-- =========================================================
-- SATEER
-- Migration 014
--
-- IA Secrétariat - Pilote Consulat
--
-- Première connaissance contrôlée pour le cas PASSEPORT.
-- =========================================================


INSERT INTO knowledge_articles (
    knowledge_source_id,
    code,
    titre,
    contenu,
    langue,
    version,
    statut,
    valide_par_personne_id,
    date_validation,
    date_debut_validite
)
SELECT
    ks.id,

    'PASSEPORT_RENOUVELLEMENT_PILOTE',

    'Renouvellement de passeport - procédure pilote',

    'Cette connaissance est utilisée pour le pilote SATEER.

Lorsqu''un citoyen demande des informations concernant le renouvellement de son passeport :

1. Classer la demande dans la catégorie PASSEPORT.

2. Identifier clairement le besoin exprimé par le citoyen.

3. Préparer une réponse courte, claire et professionnelle.

4. Orienter le citoyen vers la procédure officielle du Consulat pour connaître les pièces, conditions, tarifs, délais et modalités de rendez-vous.

5. Ne jamais inventer une liste de documents, un tarif, un délai ou une condition administrative qui ne figure pas dans une source institutionnelle validée.

6. Toute réponse préparée par l''IA Secrétariat doit être validée par un agent avant envoi au citoyen.',

    'fr',

    1,

    'VALIDE',

    5,

    CURRENT_TIMESTAMP,

    CURRENT_TIMESTAMP

FROM knowledge_sources ks

INNER JOIN tenants t
    ON t.id = ks.tenant_id

WHERE
    ks.code = 'CONSULAT_BORDEAUX_OFFICIAL'

    AND t.code = 'SN'

    AND NOT EXISTS (

        SELECT 1

        FROM knowledge_articles ka

        WHERE
            ka.knowledge_source_id = ks.id

            AND ka.code =
                'PASSEPORT_RENOUVELLEMENT_PILOTE'
    );