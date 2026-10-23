const {
    listerDemandesOrganisationDatabase,
    prendreEnChargeDemandeDatabase
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
            "===== ESPACE CONSULAT ====="
        );


        console.log("");
        console.log(
            "----- BOÎTE DE RÉCEPTION -----"
        );


        const demandesNouvelles =
            await listerDemandesOrganisationDatabase(
                1,
                "SN",
                "NOUVELLE"
            );


        console.log(
            "Demandes nouvelles : " +
            demandesNouvelles.length
        );


        for (
            const demande
            of demandesNouvelles
        ) {

            console.log("");

            console.log(
                "Demande #" +
                demande.id
            );


            console.log(
                demande.prenom +
                " " +
                demande.nom
            );


            console.log(
                demande.objet
            );


            console.log(
                "Catégorie : " +
                demande.categorie
            );


            console.log(
                "Priorité : " +
                demande.priorite
            );


            console.log(
                "Statut : " +
                demande.statut
            );


            console.log(
                "Territoire : " +
                (
                    demande.territoire ||
                    "Non renseigné"
                )
            );
        }


        console.log("");
        console.log(
            "----- AWA PREND LA DEMANDE #1 -----"
        );


        const priseEnCharge =
            await prendreEnChargeDemandeDatabase(
                1,
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
            "Demande prise en charge."
        );


        console.log(
            "Demande : #" +
            priseEnCharge.id
        );


        console.log(
            "Statut : " +
            priseEnCharge.statut
        );


        console.log(
            "Assignée à la personne : " +
            priseEnCharge.assignee_a
        );


        console.log(
            "Historique : #" +
            priseEnCharge.history_id
        );


        console.log("");
        console.log(
            "----- DEMANDES EN COURS -----"
        );


        const demandesEnCours =
            await listerDemandesOrganisationDatabase(
                1,
                "SN",
                "EN_COURS"
            );


        for (
            const demande
            of demandesEnCours
        ) {

            console.log("");

            console.log(
                "Demande #" +
                demande.id
            );


            console.log(
                demande.prenom +
                " " +
                demande.nom
            );


            console.log(
                demande.objet
            );


            console.log(
                "Statut : " +
                demande.statut
            );


            console.log(
                "Assignée à : " +
                (
                    demande.assignee_prenom ||
                    ""
                ) +
                " " +
                (
                    demande.assignee_nom ||
                    ""
                )
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