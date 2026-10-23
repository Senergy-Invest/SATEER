const {
    listerPublicationsParOrganisationEtTenantDatabase
} = require(
    "./services-database"
);


const {
    fermerDatabase
} = require(
    "./database"
);


async function tester() {

    try {

        console.log("");
        console.log(
            "===== TEST LECTURE PUBLICATIONS POSTGRESQL ====="
        );


        const publicationsSenegal =
            await listerPublicationsParOrganisationEtTenantDatabase(
                1,
                "SN"
            );


        console.log("");
        console.log(
            "----- CONSULAT / TENANT SN -----"
        );


        console.log(
            "Nombre de publications : " +
            publicationsSenegal.length
        );


        publicationsSenegal.forEach(
            publication => {

                console.log("");

                console.log(
                    "ID : " +
                    publication.id
                );

                console.log(
                    "Organisation : " +
                    publication.organisation_nom
                );

                console.log(
                    "Titre : " +
                    publication.titre
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
                    publication.audience_type
                );

                console.log(
                    "Diffusion Diaspora : " +
                    publication
                        .statut_diffusion_diaspora
                );

            }
        );


        const publicationsMali =
            await listerPublicationsParOrganisationEtTenantDatabase(
                1,
                "ML"
            );


        console.log("");
        console.log(
            "----- CONSULAT / TENANT ML -----"
        );

        console.log(
            "Nombre de publications : " +
            publicationsMali.length
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