const {
    repondreDemandeDatabase,
    listerDemandesPersonneDatabase,
    listerReponsesDemandeCitoyenDatabase
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
            "===== RÉPONSE CONSULAT ====="
        );


        console.log("");
        console.log(
            "----- AWA RÉPOND À FATOU -----"
        );


        const reponse =
            await repondreDemandeDatabase(
                1,
                3,
                1,
                "SN",
                "Bonjour Fatou. Pour le renouvellement de votre passeport, merci de préparer les pièces demandées par le Consulat et de consulter la procédure officielle avant votre rendez-vous."
            );


        if (
            reponse === undefined
        ) {

            console.log(
                "Réponse impossible."
            );

            return;
        }


        console.log(
            "Réponse envoyée."
        );


        console.log(
            "Réponse ID : " +
            reponse.reponse_id
        );


        console.log(
            "Demande : #" +
            reponse.demande_id
        );


        console.log(
            "Statut demande : " +
            reponse.demande_statut
        );


        console.log(
            "Historique : #" +
            reponse.history_id
        );


        console.log("");
        console.log(
            "===== FATOU / MES DEMANDES ====="
        );


        const demandes =
            await listerDemandesPersonneDatabase(
                1,
                1,
                "SN"
            );


        for (
            const demande
            of demandes
        ) {

            console.log("");

            console.log(
                "Demande #" +
                demande.id
            );


            console.log(
                demande.objet
            );


            console.log(
                "Statut : " +
                demande.statut
            );


            const reponses =
                await listerReponsesDemandeCitoyenDatabase(
                    demande.id,
                    1,
                    1,
                    "SN"
                );


            console.log(
                "Réponses : " +
                reponses.length
            );


            for (
                const element
                of reponses
            ) {

                console.log("");

                console.log(
                    "Réponse du Consulat :"
                );


                console.log(
                    element.contenu
                );


                console.log(
                    "Auteur : " +
                    element.auteur_prenom +
                    " " +
                    element.auteur_nom
                );
            }
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