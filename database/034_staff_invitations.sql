BEGIN;
CREATE TABLE IF NOT EXISTS sateer_staff_invitations (
 id BIGSERIAL PRIMARY KEY,
 organisation_id INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
 unit_id INTEGER NOT NULL REFERENCES organisation_units(id) ON DELETE CASCADE,
 role_id INTEGER NOT NULL REFERENCES organisation_roles(id),
 invited_by INTEGER NOT NULL REFERENCES personnes(id),
 prenom VARCHAR(100) NOT NULL,
 nom VARCHAR(100) NOT NULL,
 email VARCHAR(190) NOT NULL,
 token_sha256 CHAR(64) NOT NULL UNIQUE,
 expires_at TIMESTAMPTZ NOT NULL,
 accepted_at TIMESTAMPTZ,
 accepted_person_id INTEGER REFERENCES personnes(id),
 revoked_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT ck_invitation_state CHECK (NOT (accepted_at IS NOT NULL AND revoked_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_staff_invites_admin ON sateer_staff_invitations (organisation_id,unit_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_invites_mail ON sateer_staff_invitations (organisation_id,lower(email));
COMMIT;
