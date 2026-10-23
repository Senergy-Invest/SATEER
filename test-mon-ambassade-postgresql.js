const {
    trouverPersonneParIdDatabase,
    trouverOrganisationParIdEtTenantDatabase,
    listerPublicationsAmbassadePourPersonneDatabase,
    enregistrerInteractionPublicationDatabase
} = require(
    "./services-database"
);


const {
    fermerDatabase
} = require(
    "./database"
);


async function afficherMonAmbassade(
    personneId,
    organisationId,
    tenantCode
) {

    const personne =
        await trouverPersonneParIdDatabase(
            personneId
        );


    const ambassade =
        await trouverOrganisationParIdEtTenantDatabase(
            organisationId,
            tenantCode
        );


    if (
        personne === undefined
    ) {

        console.log(
            "Personne introuvable."
        );

        return;
    }


    if (
        ambassade === undefined ||
        ambassade.type !== "AMBASSADE"
    ) {

        console.log(
            "Ambassade introuvable."
        );

        return;
    }


    const publications =
        await listerPublicationsAmbassadePourPersonneDatabase(
            personneId,
            organisationId,
            tenantCode
        );


    console.log("");
    console.log(
        "===== MON AMBASSADE POSTGRESQL ====="
    );


    console.log(
        personne.prenom +
        " " +
        personne.nom
    );


    console.log(
        "Ambassade : " +
        ambassade.nom
    );


    console.log(
        "Tenant : " +
        tenantCode
    );


    console.log("");

    console.log(
        "Informations officielles :"
    );


    if (
        publications.length === 0
    ) {

        console.log(
            "Aucune information correspondant à votre profil."
        );

    } else {

        for (
            const publication
            of publications
        ) {

            await enregistrerInteractionPublicationDatabase(
                publication.id,
                personneId,
                tenantCode,
                "VIEW",
                "MON_AMBASSADE"
            );


            console.log("");
            console.log(
                publication.titre
            );


            console.log(
                publication.contenu
            );


            console.log(
                "Catégorie : " +
                publication.categorie
            );


            console.log(
                "Priorité : " +
                publication.priorite
            );
        }
    }


    console.log("");

    console.log(
        "Services disponibles :"
    );


    console.log(
        "- Contacter l'Ambassade"
    );


    console.log(
        "- Mes démarches"
    );


    console.log(
        "- Informations nationales"
    );
}


async function tester() {

    try {

        console.log("");
        console.log(
            "===== TEST MON AMBASSADE ====="
        );


        console.log("");
        console.log(
            "----- FATOU -----"
        );


        await afficherMonAmbassade(
            1,
            2,
            "SN"
        );


        console.log("");
        console.log(
            "----- MAMADOU -----"
        );


        await afficherMonAmbassade(
            2,
            2,
            "SN"
        );


        console.log("");
        console.log(
            "----- MAUVAIS TENANT -----"
        );


        await afficherMonAmbassade(
            1,
            2,
            "ML"
        );


    } catch (erreur) {

        console.error(
            "Erreur : " +
            erreur.message
        );

    } finally {

        await fermerDatabase();
    }
}


tester();