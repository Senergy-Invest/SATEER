CREATE TABLE organisations (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL
);


CREATE TABLE personnes (
    id SERIAL PRIMARY KEY,
    prenom VARCHAR(100) NOT NULL,
    nom VARCHAR(100) NOT NULL,
    pays_residence VARCHAR(100),
    departement VARCHAR(100),
    profil VARCHAR(100)
);


CREATE TABLE relations_personne_organisation (
    id SERIAL PRIMARY KEY,
    personne_id INTEGER NOT NULL,
    organisation_id INTEGER NOT NULL,
    type VARCHAR(100) NOT NULL,

    CONSTRAINT fk_relation_personne
        FOREIGN KEY (personne_id)
        REFERENCES personnes(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_relation_organisation
        FOREIGN KEY (organisation_id)
        REFERENCES organisations(id)
        ON DELETE CASCADE
);