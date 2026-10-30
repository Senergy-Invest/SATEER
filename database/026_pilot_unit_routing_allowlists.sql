-- =========================================================
-- SATEER PILOTE BORDEAUX — 026
-- Liste explicite des destinations de routage autorisées
-- =========================================================
--
-- Cette migration configure uniquement les unités du pilote.
-- Le moteur générique exige ensuite une allowlist explicite dans
-- la configuration de la capability ROUTE_CASES.
--
-- Pour les nouvelles organisations, cette liste est renseignée
-- depuis l'administration des capacités de chaque unité.
-- =========================================================

BEGIN;

UPDATE organisation_unit_capabilities source_capability
SET
    configuration = COALESCE(source_capability.configuration, '{}'::jsonb)
        || jsonb_build_object(
            'allowedDestinationUnitIds',
            COALESCE((
                SELECT jsonb_agg(destination.id ORDER BY destination.id)
                FROM organisation_units destination
                WHERE
                    destination.organisation_id = source_unit.organisation_id
                    AND destination.actif = TRUE
                    AND destination.id <> source_unit.id
                    AND EXISTS (
                        SELECT 1
                        FROM organisation_unit_capabilities destination_capability
                        INNER JOIN capabilities destination_feature
                            ON destination_feature.id = destination_capability.capability_id
                        WHERE
                            destination_capability.organisation_unit_id = destination.id
                            AND destination_capability.actif = TRUE
                            AND destination_feature.actif = TRUE
                            AND destination_feature.code IN (
                                'RECEIVE_INCOMING',
                                'TAKE_CASES',
                                'PROCESS_CASES',
                                'RESPOND_CASES'
                            )
                    )
            ), '[]'::jsonb)
        ),
    date_modification = CURRENT_TIMESTAMP
FROM organisation_units source_unit
INNER JOIN capabilities route_feature
    ON route_feature.code = 'ROUTE_CASES'
WHERE
    source_capability.organisation_unit_id = source_unit.id
    AND source_capability.capability_id = route_feature.id
    AND source_capability.actif = TRUE
    AND source_unit.organisation_id = 1
    AND source_unit.actif = TRUE;

COMMIT;
