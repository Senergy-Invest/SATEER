const {
    analyserDemandeAvecIASecretariat
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
            "===== IA SECRÉTARIAT ====="
        );


        const analyse =
            await analyserDemandeAvecIASecretariat(
                1,
                1,
                "SN"
            );


        if (
            analyse === undefined
        ) {

            console.log(
                "Analyse impossible."
            );

            return;
        }


        console.log("");

        console.log(
            "Statut : " +
            analyse.statut
        );


        console.log("");

        console.log(
            "Résumé :"
        );

        console.log(
            analyse.resume
        );


        console.log("");

        console.log(
            "Catégorie proposée : " +
            analyse.categorieProposee
        );


        console.log(
            "Priorité proposée : " +
            analyse.prioriteProposee
        );


        console.log(
            "Confiance : " +
            analyse.confiance
        );


        console.log("");

        console.log(
            "Réponse proposée :"
        );

        console.log(
            analyse.reponseProposee
        );


        console.log("");

        console.log(
            "Sources utilisées :"
        );


        for (
            const source
            of analyse.connaissancesUtilisees
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


        console.log("");

        console.log(
            "Validation humaine obligatoire : " +
            analyse.validationHumaineObligatoire
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