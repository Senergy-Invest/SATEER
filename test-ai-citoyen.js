const {
    repondreAvecIACitoyen
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
            "===== IA CITOYEN ====="
        );


        // =================================================
        // QUESTION CONNUE
        // =================================================

        console.log("");
        console.log(
            "----- QUESTION CONNUE -----"
        );


        const reponsePasseport =
            await repondreAvecIACitoyen(
                1,
                1,
                "SN",
                "Comment renouveler mon passeport ?"
            );


        console.log(
            "Statut : " +
            reponsePasseport.statut
        );


        console.log(
            "Confiance : " +
            reponsePasseport.confiance
        );


        console.log("");

        console.log(
            "Réponse :"
        );


        console.log(
            reponsePasseport.reponse
        );


        console.log("");

        console.log(
            "Sources :"
        );


        for (
            const source
            of reponsePasseport.sources
        ) {

            console.log(
                "- " +
                source.titre +
                " / " +
                source.source +
                " / version " +
                source.version
            );
        }


        // =================================================
        // QUESTION NON COUVERTE
        // =================================================

        console.log("");
        console.log(
            "----- QUESTION NON COUVERTE -----"
        );


        const reponseInconnue =
            await repondreAvecIACitoyen(
                1,
                1,
                "SN",
                "Est-ce que je peux récupérer mon passeport demain à 8h ?"
            );


        console.log(
            "Statut : " +
            reponseInconnue.statut
        );


        console.log(
            "Confiance : " +
            reponseInconnue.confiance
        );


        console.log("");

        console.log(
            "Réponse :"
        );


        console.log(
            reponseInconnue.reponse
        );


        console.log(
            "Escalade humaine : " +
            reponseInconnue.escaladeHumaine
        );


        // =================================================
        // MAUVAIS TENANT
        // =================================================

        console.log("");
        console.log(
            "----- MAUVAIS TENANT -----"
        );


        const mauvaisTenant =
            await repondreAvecIACitoyen(
                1,
                1,
                "ML",
                "Comment renouveler mon passeport ?"
            );


        console.log(
            "Statut : " +
            mauvaisTenant.statut
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