-- ========================================================
-- SATEER CORE
-- 023 - AUTHENTIFICATION GENERIQUE
-- ========================================================
--
-- Un compte authentifie une personne canonique.
--
-- Les droits restent portes par les relations :
-- personne -> organisation -> role -> permission.
--
-- Aucun role institutionnel n'est code en dur.
-- ========================================================

BEGIN;


-- ========================================================
-- 1. COMPTES DE CONNEXION
-- ========================================================

CREATE TABLE IF NOT EXISTS auth_accounts (

    id BIGSERIAL PRIMARY KEY,

    personne_id INTEGER NOT NULL,

    identifiant VARCHAR(190) NOT NULL,

    mot_de_passe_hash TEXT NOT NULL,

    actif BOOLEAN NOT NULL DEFAULT TRUE,

    tentatives_echouees INTEGER
        NOT NULL DEFAULT 0,

    verrouille_jusqua TIMESTAMPTZ,

    derniere_connexion TIMESTAMPTZ,

    date_creation TIMESTAMPTZ
        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    date_modification TIMESTAMPTZ
        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_auth_account_personne
        FOREIGN KEY (personne_id)
        REFERENCES personnes(id)
        ON DELETE CASCADE,

    CONSTRAINT uq_auth_account_personne
        UNIQUE (personne_id),

    CONSTRAINT chk_auth_identifiant
        CHECK (LENGTH(TRIM(identifiant)) >= 3),

    CONSTRAINT chk_auth_tentatives
        CHECK (tentatives_echouees >= 0)
);


-- Identifiants uniques, sans distinction majuscules/minuscules.

CREATE UNIQUE INDEX IF NOT EXISTS
    uq_auth_account_identifiant
ON auth_accounts (
    LOWER(identifiant)
);


-- ========================================================
-- 2. SESSIONS AUTHENTIFIEES
-- ========================================================

CREATE TABLE IF NOT EXISTS auth_sessions (

    id BIGSERIAL PRIMARY KEY,

    compte_id BIGINT NOT NULL,

    empreinte_jeton VARCHAR(64) NOT NULL,

    date_creation TIMESTAMPTZ
        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    date_expiration TIMESTAMPTZ NOT NULL,

    date_derniere_utilisation TIMESTAMPTZ,

    date_revocation TIMESTAMPTZ,

    CONSTRAINT fk_auth_session_compte
        FOREIGN KEY (compte_id)
        REFERENCES auth_accounts(id)
        ON DELETE CASCADE,

    CONSTRAINT uq_auth_session_jeton
        UNIQUE (empreinte_jeton),

    CONSTRAINT chk_auth_session_hash
        CHECK (
            empreinte_jeton ~ '^[0-9a-f]{64}$'
        ),

    CONSTRAINT chk_auth_session_expiration
        CHECK (
            date_expiration > date_creation
        )
);


-- ========================================================
-- 3. INDEX DES SESSIONS
-- ========================================================

CREATE INDEX IF NOT EXISTS
    idx_auth_sessions_compte
ON auth_sessions (
    compte_id
);


CREATE INDEX IF NOT EXISTS
    idx_auth_sessions_expiration
ON auth_sessions (
    date_expiration
);


CREATE INDEX IF NOT EXISTS
    idx_auth_sessions_actives
ON auth_sessions (
    compte_id,
    date_expiration
)
WHERE date_revocation IS NULL;


COMMIT;