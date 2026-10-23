const {
    validerEtEnvoyerPropositionIASecretariat
} = require(
    "./services"
);


const {
    listerDemandesOrganisationDatabase,
    prendreEnChargeDemandeDatabase,
    listerReponsesDemandeCitoyenDatabase,
    listerNotificationsPersonneDatabase
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
            "===== IA SECRÉTARIAT / VALIDATION HUMAINE ====="
        );


        // =================================================
        // 1. CHERCHER UNE DEMANDE NOUVELLE
        // =================================================

        const demandesNouvelles =
            await listerDemandesOrganisationDatabase(
                1,
                "SN",
                "NOUVELLE"
            );


        if (
            demandesNouvelles.length === 0
        ) {

            console.log(
                "Aucune demande NOUVELLE disponible pour le test."
            );

            return;
        }


        const demande =
            demandesNouvelles[0];


        console.log("");

        console.log(
            "Demande choisie : #" +
            demande.id
        );


        console.log(
            "Citoyen : " +
            demande.prenom +
            " " +
            demande.nom
        );


        console.log(
            "Objet : " +
            demande.objet
        );


        // =================================================
        // 2. AWA PREND LA DEMANDE
        // =================================================

        console.log("");

        console.log(
            "----- AWA PREND LA DEMANDE -----"
        );


        const priseEnCharge =
            await prendreEnChargeDemandeDatabase(
                demande.id,
                3,
                1,
                "SN"
            );


        if (
            priseEnCharge === undefined
        ) {

            console.log(
                "Prise en charge impossible."
            );

            return;
        }


        console.log(
            "Demande #" +
            priseEnCharge.id
        );


        console.log(
            "Statut : " +
            priseEnCharge.statut
        );


        // =================================================
        // 3. IA PRÉPARE ET AWA VALIDE
        // =================================================

        console.log("");

        console.log(
            "----- PROPOSITION IA -----"
        );


        const resultat =
            await validerEtEnvoyerPropositionIASecretariat(
                demande.id,
                3,
                1,
                "SN"
            );


        if (
            resultat === undefined
        ) {

            console.log(
                "Résultat IA indisponible."
            );

            return;
        }


        if (
            resultat.succes === false
        ) {

            console.log(
                "Validation impossible : " +
                resultat.raison
            );

            return;
        }


        console.log(
            "Action : " +
            resultat.action
        );


        console.log("");

        console.log(
            "Résumé IA :"
        );


        console.log(
            resultat.analyseIA.resume
        );


        console.log("");

        console.log(
            "Catégorie proposée : " +
            resultat.analyseIA.categorieProposee
        );


        console.log(
            "Priorité proposée : " +
            resultat.analyseIA.prioriteProposee
        );


        console.log(
            "Confiance : " +
            resultat.analyseIA.confiance
        );


        console.log("");

        console.log(
            "Réponse validée par Awa :"
        );


        console.log(
            resultat.reponse.contenu
        );


        console.log("");

        console.log(
            "Statut demande : " +
            resultat.reponse.statutDemande
        );


        console.log(
            "Notification ID : " +
            resultat.reponse.notificationId
        );


        // =================================================
        // 4. FATOU VOIT LA RÉPONSE
        // =================================================

        console.log("");

        console.log(
            "===== FATOU / RÉPONSE ====="
        );


        const reponses =
            await listerReponsesDemandeCitoyenDatabase(
                demande.id,
                demande.personne_id,
                1,
                "SN"
            );


        console.log(
            "Réponses visibles : " +
            reponses.length
        );


        for (
            const reponse
            of reponses
        ) {

            console.log("");

            console.log(
                reponse.contenu
            );


            console.log(
                "Auteur : " +
                reponse.auteur_prenom +
                " " +
                reponse.auteur_nom
            );
        }


        // =================================================
        // 5. FATOU VOIT SES NOTIFICATIONS
        // =================================================

        console.log("");

        console.log(
            "===== FATOU / NOTIFICATIONS ====="
        );


        const notifications =
            await listerNotificationsPersonneDatabase(
                demande.personne_id,
                "SN",
                "NON_LUE"
            );


        console.log(
            "Notifications non lues : " +
            notifications.length
        );


        for (
            const notification
            of notifications
        ) {

            console.log("");

            console.log(
                notification.titre
            );


            console.log(
                notification.message
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