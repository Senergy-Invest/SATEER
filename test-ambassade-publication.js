const {
    publierInformationPostgreSQL
} = require(
    "./services"
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
            "===== PUBLICATION AMBASSADE ====="
        );


        const publication =
            await publierInformationPostgreSQL(
                2,
                "Information officielle de l'Ambassade",
                "L'Ambassade du Sénégal en France informe la communauté sénégalaise d'une nouvelle information officielle destinée aux Sénégalais résidant en France.",
                "TOUS",
                null,
                "COMMUNIQUE",
                "IMPORTANTE",
                4,
                "SN",
                []
            );


        if (
            publication === undefined
        ) {

            console.log(
                "Publication Ambassade non créée."
            );

            return;
        }


        console.log("");

        console.log(
            "Publication créée."
        );


        console.log(
            "ID : " +
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