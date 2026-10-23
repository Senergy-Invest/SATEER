const {
    publierInformationPostgreSQL
} = require("./services");


const {
    fermerDatabase
} = require("./database");


async function tester() {

    try {

        console.log("");
        console.log(
            "===== TEST PUBLICATION BANQUE ====="
        );


        const publication =
            await publierInformationPostgreSQL(
                6,
                "Financement immobilier diaspora",
                "Découvrez une offre de financement immobilier destinée aux Sénégalais de la diaspora.",
                "TOUS",
                null,
                "OPPORTUNITE",
                "IMPORTANTE",
                7,
                "SN",
                [
                    {
                        type: "LIEN",
                        nom: "Découvrir l'offre",
                        url: "https://exemple-banque.local/offre-diaspora"
                    }
                ]
            );


        if (
            publication === undefined
        ) {

            console.log(
                "Publication bancaire non créée."
            );

            return;
        }


        console.log("");
        console.log(
            "Publication bancaire créée."
        );

        console.log(
            "ID publication : " +
            publication.id
        );

        console.log(
            "Titre : " +
            publication.titre
        );

        console.log(
            "Organisation : " +
            publication.organisation_id
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