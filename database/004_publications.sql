-- =========================================================
-- SATEER
-- Migration 004
-- Publications génériques
-- =========================================================


CREATE TABLE publications (
    id SERIAL PRIMARY KEY,

    tenant_id INTEGER NOT NULL,

    organisation_id INTEGER NOT NULL,

    publie_par INTEGER NOT NULL,

    titre VARCHAR(255) NOT NULL,

    contenu TEXT NOT NULL,

    categorie VARCHAR(100) NOT NULL,

    priorite VARCHAR(100) NOT NULL DEFAULT 'NORMALE',

    audience_type VARCHAR(100) NOT NULL DEFAULT 'TOUS',

    audience_valeur VARCHAR(255),

    medias JSONB NOT NULL DEFAULT '[]'::jsonb,

    statut VARCHAR(100) NOT NULL DEFAULT 'PUBLIEE',

    statut_diffusion_diaspora VARCHAR(100)
        NOT NULL
        DEFAULT 'NON_DEMANDEE',

    date_publication TIMESTAMP
        NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    date_soumission_diaspora TIMESTAMP,

    date_diffusion_diaspora TIMESTAMP,

    validee_par_sateer INTEGER,

    rejetee_par_sateer INTEGER,

    motif_rejet_diaspora TEXT,

    date_rejet_diaspora TIMESTAMP,

    audience_type_proposee VARCHAR(100),

    audience_valeur_proposee VARCHAR(255),

    ciblage_modifie_par_sateer INTEGER,

    date_modification_ciblage TIMESTAMP,


    CONSTRAINT fk_publication_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE RESTRICT,


    CONSTRAINT fk_publication_organisation
        FOREIGN KEY (organisation_id)
        REFERENCES organisations(id)
        ON DELETE RESTRICT,


    CONSTRAINT fk_publication_auteur
        FOREIGN KEY (publie_par)
        REFERENCES personnes(id)
        ON DELETE RESTRICT,


    CONSTRAINT fk_publication_validation_sateer
        FOREIGN KEY (validee_par_sateer)
        REFERENCES personnes(id)
        ON DELETE SET NULL,


    CONSTRAINT fk_publication_rejet_sateer
        FOREIGN KEY (rejetee_par_sateer)
        REFERENCES personnes(id)
        ON DELETE SET NULL,


    CONSTRAINT fk_publication_ciblage_sateer
        FOREIGN KEY (ciblage_modifie_par_sateer)
        REFERENCES personnes(id)
        ON DELETE SET NULL
);


CREATE INDEX idx_publications_tenant
ON publications(tenant_id);


CREATE INDEX idx_publications_organisation
ON publications(organisation_id);


CREATE INDEX idx_publications_statut_diaspora
ON publications(
    tenant_id,
    statut_diffusion_diaspora
);


CREATE INDEX idx_publications_audience
ON publications(
    tenant_id,
    audience_type
);