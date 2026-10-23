const {
    obtenirMonSateerDatabase
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
            "===== MON SATEER ====="
        );


        const monSateer =
            await obtenirMonSateerDatabase(
                1,
                "SN"
            );


        if (
            monSateer === undefined
        ) {

            console.log(
                "Mon SATEER indisponible."
            );

            return;
        }


        console.log("");

        console.log(
            "Bonjour " +
            monSateer.personne.prenom +
            " " +
            monSateer.personne.nom
        );


        console.log(
            "Territoire : " +
            (
                monSateer.personne.territoire ||
                "Non renseigné"
            )
        );


        // =================================================
        // SYNTHÈSE
        // =================================================

        console.log("");
        console.log(
            "===== SYNTHÈSE ====="
        );


        console.log(
            "Expériences actives : " +
            monSateer.compteurs.experiences
        );


        console.log(
            "Demandes récentes : " +
            monSateer.compteurs.demandes
        );


        console.log(
            "Notifications non lues : " +
            monSateer.compteurs.notificationsNonLues
        );


        // =================================================
        // EXPÉRIENCES
        // =================================================

        console.log("");
        console.log(
            "===== MES EXPÉRIENCES ====="
        );


        for (
            const experience
            of monSateer.experiences
        ) {

            console.log(
                "- " +
                experience.nom
            );
        }


        // =================================================
        // DEMANDES
        // =================================================

        console.log("");
        console.log(
            "===== MES DEMANDES ====="
        );


        if (
            monSateer.demandes.length === 0
        ) {

            console.log(
                "Aucune demande."
            );

        } else {

            for (
                const demande
                of monSateer.demandes
            ) {

                console.log("");

                console.log(
                    "#" +
                    demande.id +
                    " - " +
                    demande.objet
                );


                console.log(
                    "Organisation : " +
                    demande.organisation
                );


                console.log(
                    "Statut : " +
                    demande.statut
                );
            }
        }


        // =================================================
        // NOTIFICATIONS
        // =================================================

        console.log("");
        console.log(
            "===== MES NOTIFICATIONS ====="
        );


        if (
            monSateer.notifications.length === 0
        ) {

            console.log(
                "Aucune notification."
            );

        } else {

            for (
                const notification
                of monSateer.notifications
            ) {

                console.log("");

                console.log(
                    (
                        notification.statut ===
                        "NON_LUE"
                            ?
                            "[NOUVEAU] "
                            :
                            ""
                    ) +
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
            }
        }


        // =================================================
        // ACCÈS RAPIDES
        // =================================================

        console.log("");
        console.log(
            "===== ACCÈS RAPIDES ====="
        );


        for (
            const experience
            of monSateer.experiences
        ) {

            console.log(
                "- Ouvrir " +
                experience.nom
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