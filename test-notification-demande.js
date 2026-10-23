const {
    prendreEnChargeDemandeDatabase,
    repondreDemandeDatabase,
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
            "===== NOTIFICATION DEMANDE ====="
        );


        console.log("");
        console.log(
            "----- PRISE EN CHARGE DEMANDE #2 -----"
        );


        const priseEnCharge =
            await prendreEnChargeDemandeDatabase(
                2,
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
            "Statut : " +
            priseEnCharge.statut
        );


        console.log("");
        console.log(
            "----- RÉPONSE AWA -----"
        );


        const reponse =
            await repondreDemandeDatabase(
                2,
                3,
                1,
                "SN",
                "Bonjour Fatou. Votre demande a bien été examinée. Vous pouvez consulter la procédure officielle et préparer les documents nécessaires."
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
            "Statut demande : " +
            reponse.demande_statut
        );


        console.log(
            "Notification ID : " +
            reponse.notification_id
        );


        console.log(
            "Notification : " +
            reponse.notification_statut
        );


        console.log("");
        console.log(
            "===== FATOU / NOTIFICATIONS ====="
        );


        const notifications =
            await listerNotificationsPersonneDatabase(
                1,
                "SN"
            );


        console.log(
            "Notifications : " +
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


            console.log(
                "Organisation : " +
                (
                    notification.organisation ||
                    "SATEER"
                )
            );


            console.log(
                "Statut : " +
                notification.statut
            );


            console.log(
                "Référence : " +
                notification.reference_type +
                " #" +
                notification.reference_id
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