const {
    creerDemandeDatabase,
    listerDemandesPersonneDatabase
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
            "===== DEMANDES CITOYENNES ====="
        );


        console.log("");
        console.log(
            "----- CRÉATION -----"
        );


        const demande =
            await creerDemandeDatabase(
                1,
                1,
                "SN",
                "PASSEPORT",
                "Renouvellement de passeport",
                "Je souhaite connaître les documents nécessaires pour renouveler mon passeport.",
                "NORMALE",
                "MON_CONSULAT"
            );


        if (
            demande === undefined
        ) {

            console.log(
                "Demande non créée."
            );

            return;
        }


        console.log(
            "Demande créée."
        );


        console.log(
            "ID : " +
            demande.id
        );


        console.log(
            "Catégorie : " +
            demande.categorie
        );


        console.log(
            "Objet : " +
            demande.objet
        );


        console.log(
            "Statut : " +
            demande.statut
        );


        console.log("");
        console.log(
            "----- MES DEMANDES -----"
        );


        const demandes =
            await listerDemandesPersonneDatabase(
                1,
                1,
                "SN"
            );


        for (
            const element
            of demandes
        ) {

            console.log("");

            console.log(
                "Demande #" +
                element.id
            );


            console.log(
                element.objet
            );


            console.log(
                "Catégorie : " +
                element.categorie
            );


            console.log(
                "Statut : " +
                element.statut
            );


            console.log(
                "Organisation : " +
                element.organisation
            );
        }


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