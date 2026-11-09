-- SATEER / P3.3.1 — Préparation du registre d'activations institutionnelles.
-- NON EXECUTEE par INSTALLER.sh. À appliquer ultérieurement après contrôle dédié.
-- Conserver experience_activations (préférences et accès personnels) intacte.
-- Aucune activation implicite / seed.

BEGIN;

-- Permet une FK composite garantissant que l'organisation est du tenant déclaré.
-- La table organisations possède déjà une clé primaire (id) ; cet index ajoute
-- la paire (id, tenant_id) nécessaire à une FK de portée.
CREATE UNIQUE INDEX IF NOT EXISTS ux_organisations_id_tenant_for_experience
    ON organisations(id, tenant_id);

CREATE TABLE IF NOT EXISTS organisation_experience_activations (
    id BIGSERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL,
    organisation_id INTEGER NOT NULL,
    experience_id INTEGER NOT NULL,
    statut VARCHAR(16) NOT NULL DEFAULT 'INACTIVE',
    date_activation TIMESTAMP,
    date_desactivation TIMESTAMP,
    date_modification TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modifie_par_personne_id INTEGER,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT ck_org_experience_statut
        CHECK (statut IN ('ACTIVE', 'INACTIVE')),
    CONSTRAINT uq_org_experience_tenant_org_exp
        UNIQUE (tenant_id, organisation_id, experience_id),
    CONSTRAINT fk_org_experience_tenant
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
    CONSTRAINT fk_org_experience_org_et_tenant
        FOREIGN KEY (organisation_id, tenant_id)
        REFERENCES organisations(id, tenant_id) ON DELETE RESTRICT,
    CONSTRAINT fk_org_experience_experience
        FOREIGN KEY (experience_id) REFERENCES experiences(id) ON DELETE RESTRICT,
    CONSTRAINT fk_org_experience_actor
        FOREIGN KEY (modifie_par_personne_id) REFERENCES personnes(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_org_experience_activations_active
    ON organisation_experience_activations(tenant_id, organisation_id, statut);

COMMENT ON TABLE organisation_experience_activations IS
    'Activation institutionnelle par organisation et tenant; distincte des activations personnelles. Aucune activation par défaut.';

COMMIT;
