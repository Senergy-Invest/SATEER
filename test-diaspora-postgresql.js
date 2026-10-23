const {
    trouverPersonneParIdDatabase,
    listerPublicationsDiasporaPourPersonneDatabase,
    enregistrerInteractionPublicationDatabase
} = require(
    "./services-database"
);


const {
    fermerDatabase
} = require(
    "./database"
);


async function afficherDiaspora(
    personneId,
    tenantCode
) {

    const personne =
        await trouverPersonneParIdDatabase(
            personneId
        );


    if (
        personne === undefined
    ) {

        console.log(
            "Personne introuvable."
        );

        return;
    }


    console.log("");
    console.log(
        "===== DIASPORA POSTGRESQL ====="
    );


    console.log(
        personne.prenom +
        " " +
        personne.nom
    );


    console.log(
        "Tenant : " +
        tenantCode
    );


    const publications =
        await listerPublicationsDiasporaPourPersonneDatabase(
            personneId,
            tenantCode
        );


    console.log("");

    console.log(
        "Publications visibles : " +
        publications.length
    );


    if (
        publications.length === 0
    ) {

        console.log(
            "Aucune publication Diaspora correspondant à votre profil."
        );

        return;
    }


    for (
        const publication
        of publications
    ) {

        await enregistrerInteractionPublicationDatabase(
            publication.id,
            personneId,
            tenantCode,
            "VIEW",
            "DIASPORA"
        );


        console.log("");
        console.log(
            "------------------------------"
        );


        console.log(
            publication.titre
        );


        console.log(
            publication.contenu
        );


        console.log(
            "Source : " +
            publication.organisation
        );


        console.log(
            "Type source : " +
            publication.organisation_type
        );


        console.log(
            "Catégorie : " +
            publication.categorie
        );


        console.log(
            "Priorité : " +
            publication.priorite
        );


        console.log(
            "Audience : " +
            publication.audience_type +
            (
                publication.audience_valeur
                    ?
                    " / " +
                    publication.audience_valeur
                    :
                    ""
            )
        );
    }
}


async function tester() {

    try {

        console.log("");
        console.log(
            "===== TEST DIASPORA ====="
        );


        console.log("");
        console.log(
            "----- FATOU / GIRONDE -----"
        );


        await afficherDiaspora(
            1,
            "SN"
        );


        console.log("");
        console.log(
            "----- MAMADOU / HAUTE-GARONNE -----"
        );


        await afficherDiaspora(
            2,
            "SN"
        );


        console.log("");
        console.log(
            "----- MAUVAIS TENANT -----"
        );


        await afficherDiaspora(
            1,
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