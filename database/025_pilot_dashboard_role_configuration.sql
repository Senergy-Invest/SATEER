-- =========================================================
-- SATEER PILOTE BORDEAUX — 025
-- Configuration initiale des rôles des dashboards
-- =========================================================
--
-- Cette migration contient volontairement l'identifiant de
-- l'organisation pilote : il s'agit de données de configuration,
-- pas d'une règle du moteur SATEER Core.
--
-- Toute nouvelle organisation configure ses propres rôles et
-- permissions depuis l'administration SATEER. Elle n'hérite pas
-- automatiquement des rôles institutionnels du pilote.
-- =========================================================

BEGIN;

INSERT INTO role_permissions (role_id, permission_id, actif)
SELECT r.id, p.id, TRUE
FROM organisation_roles r
CROSS JOIN permissions p
WHERE
    r.organisation_id = 1
    AND r.actif = TRUE
    AND (
        (r.code = 'HEAD_OF_MISSION' AND p.code = 'VIEW_STRATEGIC_DASHBOARD')
        OR
        (r.code = 'OPERATIONAL_DEPUTY' AND p.code IN (
            'VIEW_OPERATIONAL_DASHBOARD',
            'MANAGE_OPERATIONAL_DASHBOARD_ACCESS'
        ))
    )
ON CONFLICT (role_id, permission_id) DO NOTHING;

UPDATE organisation_roles
SET
    metadata = metadata || jsonb_build_object(
        'systemProtected', TRUE,
        'systemProtectionReason', 'INSTITUTIONAL_AUTHORITY'
    ),
    date_modification = CURRENT_TIMESTAMP
WHERE
    organisation_id = 1
    AND code IN ('HEAD_OF_MISSION', 'OPERATIONAL_DEPUTY')
    AND NOT (metadata @> '{"systemProtected": true}'::jsonb);

COMMIT;
