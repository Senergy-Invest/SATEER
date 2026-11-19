-- SATEER Energy MVP02-B1 — collaboration déclarative, tenant et responsable immuables.
-- AUCUN partage institutionnel ou financier. Migration de recette uniquement.
BEGIN;
DO $$ BEGIN
 IF current_database() <> 'sateer_test' THEN RAISE EXCEPTION 'ENERGY_COLLAB_REFUSE_HORS_SATEER_TEST'; END IF;
END $$;
-- Un propriétaire transmet lui-même un code secret à usage unique, jamais dans une URL GET.
CREATE TABLE IF NOT EXISTS energy_inventory_invitations (
 id BIGSERIAL PRIMARY KEY,
 public_id UUID NOT NULL UNIQUE,
 site_id BIGINT NOT NULL,
 tenant_id INTEGER NOT NULL,
 owner_personne_id INTEGER NOT NULL,
 token_hash CHAR(64) NOT NULL UNIQUE CHECK(token_hash ~ '^[0-9a-f]{64}$'),
 invitee_personne_id INTEGER REFERENCES personnes(id) ON DELETE RESTRICT,
 statut VARCHAR(12) NOT NULL DEFAULT 'OUVERTE' CHECK (statut IN ('OUVERTE','ACCEPTEE','REVOQUEE')),
 expires_at TIMESTAMPTZ NOT NULL,
 date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 date_acceptation TIMESTAMPTZ,
 date_revocation TIMESTAMPTZ,
 CONSTRAINT fk_collab_invite_site_scope FOREIGN KEY(site_id,tenant_id,owner_personne_id)
 REFERENCES energy_inventory_sites(id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT ck_collab_distinct_personnes CHECK(invitee_personne_id IS NULL OR invitee_personne_id <> owner_personne_id),
 CONSTRAINT ck_collab_accepte_avec_personne CHECK(statut <> 'ACCEPTEE' OR invitee_personne_id IS NOT NULL),
 CONSTRAINT uq_collab_invite_scope UNIQUE(id,site_id,tenant_id,owner_personne_id),
 CONSTRAINT uq_collab_invite_assignee UNIQUE(id,invitee_personne_id)
);
CREATE INDEX IF NOT EXISTS ix_collab_invitations_site ON energy_inventory_invitations(site_id,tenant_id,owner_personne_id,date_creation DESC);
CREATE INDEX IF NOT EXISTS ix_collab_invitations_contributeur ON energy_inventory_invitations(invitee_personne_id,tenant_id,statut) WHERE invitee_personne_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_collab_canonical_equipment_scope
 ON energy_inventory_equipements(id,site_id,tenant_id,owner_personne_id);
CREATE TABLE IF NOT EXISTS energy_inventory_contributions (
 id BIGSERIAL PRIMARY KEY,
 public_id UUID NOT NULL UNIQUE,
 invitation_id BIGINT NOT NULL,
 site_id BIGINT NOT NULL,
 tenant_id INTEGER NOT NULL,
 owner_personne_id INTEGER NOT NULL,
 contributeur_personne_id INTEGER NOT NULL REFERENCES personnes(id) ON DELETE RESTRICT,
 request_key UUID NOT NULL,
 content_hash CHAR(64) NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'),
 nom VARCHAR(120) NOT NULL CHECK(length(btrim(nom))>0),
 famille VARCHAR(24) NOT NULL CHECK(famille IN ('ECLAIRAGE','CLIMATISATION','FROID','POMPAGE','MOTEUR','INFORMATIQUE','SOLAIRE','STOCKAGE','AUTRE')),
 quantite INTEGER NOT NULL CHECK(quantite BETWEEN 1 AND 10000),
 puissance_unitaire_w INTEGER CHECK(puissance_unitaire_w BETWEEN 1 AND 100000000),
 statut VARCHAR(10) NOT NULL DEFAULT 'SOUMISE' CHECK(statut IN ('SOUMISE','ACCEPTEE','REFUSEE')),
 equipment_id BIGINT,
 date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 date_decision TIMESTAMPTZ,
 CONSTRAINT fk_collab_contributor_accepted_invite FOREIGN KEY(invitation_id,contributeur_personne_id)
 REFERENCES energy_inventory_invitations(id,invitee_personne_id) ON DELETE RESTRICT,
 CONSTRAINT fk_collab_contribution_invite_scope FOREIGN KEY(invitation_id,site_id,tenant_id,owner_personne_id)
 REFERENCES energy_inventory_invitations(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT fk_collab_contribution_equipment_scope FOREIGN KEY(equipment_id,site_id,tenant_id,owner_personne_id)
 REFERENCES energy_inventory_equipements(id,site_id,tenant_id,owner_personne_id) ON DELETE RESTRICT,
 CONSTRAINT ck_collab_contributeur_distinct CHECK(contributeur_personne_id <> owner_personne_id),
 CONSTRAINT ck_collab_decision_coherente CHECK((statut='ACCEPTEE' AND equipment_id IS NOT NULL AND date_decision IS NOT NULL) OR
   (statut='REFUSEE' AND equipment_id IS NULL AND date_decision IS NOT NULL) OR
   (statut='SOUMISE' AND equipment_id IS NULL AND date_decision IS NULL)),
 CONSTRAINT uq_collab_contribution_idempotente UNIQUE(invitation_id,contributeur_personne_id,request_key)
);
CREATE INDEX IF NOT EXISTS ix_collab_contributions_attente ON energy_inventory_contributions(site_id,tenant_id,owner_personne_id,statut,date_creation);
CREATE TABLE IF NOT EXISTS energy_inventory_collaboration_events (
 id BIGSERIAL PRIMARY KEY,
 site_id BIGINT NOT NULL,
 tenant_id INTEGER NOT NULL,
 owner_personne_id INTEGER NOT NULL,
 acteur_personne_id INTEGER NOT NULL REFERENCES personnes(id) ON DELETE RESTRICT,
 action VARCHAR(32) NOT NULL CHECK(action IN ('InvitationIssued.v1','InvitationAccepted.v1','InvitationRevoked.v1',
   'ContributionSubmitted.v1','ContributionAccepted.v1','ContributionRejected.v1')),
 entity_public_id UUID NOT NULL,
 details JSONB NOT NULL CHECK(jsonb_typeof(details)='object'),
 date_evenement TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT fk_collab_event_site FOREIGN KEY(site_id,tenant_id,owner_personne_id)
 REFERENCES energy_inventory_sites(id,tenant_id,owner_personne_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS ix_collab_events_site ON energy_inventory_collaboration_events(site_id,date_evenement,id);
COMMENT ON TABLE energy_inventory_contributions IS 'Propositions privees, aucune mutation du patrimoine canonique avant acceptation explicite du responsable; acceptee ne signifie PAS mesuree ou certifiee.';
COMMIT;
