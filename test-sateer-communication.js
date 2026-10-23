const {
    soumettrePublicationADiasporaDatabase,
    listerSoumissionsDiasporaDatabase,
    approuverDiffusionDiasporaDatabase
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
            "===== SATEER COMMUNICATION ====="
        );


        // =================================================
        // CONSULAT PROPOSE LA PUBLICATION #1
        // Awa = personne #3
        // Consulat = organisation #1
        // =================================================

        console.log("");
        console.log(
            "----- PROPOSITION CONSULAT -----"
        );


        const soumission =
            await soumettrePublicationADiasporaDatabase(
                1,
                3,
                1,
                "SN"
            );


        if (
            soumission === undefined
        ) {

            console.log(
                "Soumission impossible."
            );

            return;
        }


        console.log(
            "Publication proposée à Diaspora."
        );


        console.log(
            "Publication : #" +
            soumission.id
        );


        console.log(
            "Titre : " +
            soumission.titre
        );


        console.log(
            "Statut Diaspora : " +
            soumission.statut_diffusion_diaspora
        );


        // =================================================
        // BOÎTE DE RÉCEPTION SATEER COMMUNICATION
        // =================================================

        console.log("");
        console.log(
            "----- SATEER COMMUNICATION / À VALIDER -----"
        );


        const propositions =
            await listerSoumissionsDiasporaDatabase(
                "SN"
            );


        console.log(
            "Propositions : " +
            propositions.length
        );


        for (
            const proposition
            of propositions
        ) {

            console.log("");

            console.log(
                "#" +
                proposition.id +
                " - " +
                proposition.titre
            );


            console.log(
                "Source : " +
                proposition.organisation
            );


            console.log(
                "Catégorie : " +
                proposition.categorie
            );


            console.log(
                "Priorité : " +
                proposition.priorite
            );


            console.log(
                "Audience : " +
                proposition.audience_type +
                (
                    proposition.audience_valeur
                        ?
                        " / " +
                        proposition.audience_valeur
                        :
                        ""
                )
            );
        }


        // =================================================
        // AGENT SATEER #6 APPROUVE
        // =================================================

        console.log("");
        console.log(
            "----- VALIDATION SATEER -----"
        );


        const validation =
            await approuverDiffusionDiasporaDatabase(
                1,
                6,
                "SN"
            );


        if (
            validation === undefined
        ) {

            console.log(
                "Validation impossible."
            );

            return;
        }


        console.log(
            "Publication validée."
        );


        console.log(
            "Publication : #" +
            validation.id
        );


        console.log(
            "Statut Diaspora : " +
            validation.statut_diffusion_diaspora
        );


        console.log(
            "Validée par : " +
            validation.validee_par_sateer
        );


        // =================================================
        // VÉRIFICATION BOÎTE VIDE
        // =================================================

        console.log("");
        console.log(
            "----- APRÈS VALIDATION -----"
        );


        const restant =
            await listerSoumissionsDiasporaDatabase(
                "SN"
            );


        console.log(
            "Propositions restantes : " +
            restant.length
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