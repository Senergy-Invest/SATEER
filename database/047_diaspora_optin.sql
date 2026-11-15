-- SATEER Diaspora D2B-A : abonnements volontaires, associations verifiees et anti-doublons.
-- Aucun compte, organisation, droit, abonnement ou publication n'est cree implicitement.
-- Installation uniquement sur sateer_test apres sauvegarde du diagnostic et autorisation explicite.
BEGIN;

-- Cet index permet une FK composite stricte organisation + tenant.
CREATE UNIQUE INDEX IF NOT EXISTS ux_organisations_diaspora_id_tenant
  ON organisations(id, tenant_id);

CREATE TABLE IF NOT EXISTS diaspora_association_directory (
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  organisation_id INTEGER NOT NULL,
  statut VARCHAR(16) NOT NULL CHECK (statut IN ('VERIFIEE','SUSPENDUE')),
  modifie_par INTEGER NOT NULL REFERENCES personnes(id) ON DELETE RESTRICT,
  date_verification TIMESTAMPTZ,
  date_modification TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, organisation_id),
  CONSTRAINT fk_diaspora_directory_scope FOREIGN KEY (organisation_id, tenant_id)
    REFERENCES organisations(id, tenant_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS diaspora_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  personne_id INTEGER NOT NULL REFERENCES personnes(id) ON DELETE CASCADE,
  association_id INTEGER,
  theme_code VARCHAR(40),
  actif BOOLEAN NOT NULL DEFAULT TRUE,
  date_abonnement TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  date_modification TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_diaspora_subscription_association_scope
    FOREIGN KEY (association_id, tenant_id) REFERENCES organisations(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT ck_diaspora_one_target CHECK (
    (association_id IS NOT NULL AND theme_code IS NULL)
    OR (association_id IS NULL AND theme_code IS NOT NULL)
  ),
  CONSTRAINT ck_diaspora_theme CHECK (theme_code IS NULL OR theme_code IN
    ('EVENEMENT','FORMATION','EMPLOI','ENTREPRENEURIAT','CULTURE','COMMUNAUTE'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_diaspora_subscription_association
  ON diaspora_subscriptions(tenant_id, personne_id, association_id)
  WHERE association_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_diaspora_subscription_theme
  ON diaspora_subscriptions(tenant_id, personne_id, theme_code)
  WHERE theme_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_diaspora_subscriptions_active
  ON diaspora_subscriptions(tenant_id, actif, personne_id);
CREATE INDEX IF NOT EXISTS ix_diaspora_directory_verified
  ON diaspora_association_directory(tenant_id, statut);

-- Les deux abonnements (theme + association) ne peuvent jamais provoquer deux alertes
-- pour la meme publication et la meme personne. Index partiel : aucun impact sur
-- les types historiques de notifications (Consulat / Ambassade / canaux).
CREATE UNIQUE INDEX IF NOT EXISTS ux_diaspora_notification_once
  ON notifications(tenant_id, personne_id, reference_id)
  WHERE type='DIASPORA_ABONNEMENT' AND reference_type='PUBLICATION';
COMMIT;
