const {
    obtenirImpactPublicationDatabase
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
            "===== TABLEAU DE BORD IMPACT ====="
        );


        const impact =
            await obtenirImpactPublicationDatabase(
                1,
                1,
                "SN"
            );


        if (
            impact === undefined
        ) {

            console.log(
                "Publication introuvable."
            );

            return;
        }


        console.log("");

        console.log(
            "Publication : " +
            impact.publication.titre
        );


        console.log("");

        console.log(
            "Vues totales : " +
            impact.statistiques.vues_totales
        );

        console.log(
            "Vues uniques : " +
            impact.statistiques.vues_uniques
        );

        console.log(
            "Clics : " +
            impact.statistiques.clics
        );

        console.log(
            "Intérêts : " +
            impact.statistiques.interets
        );

        console.log(
            "Demandes de contact : " +
            impact.statistiques.demandes_contact
        );

        console.log(
            "Inscriptions : " +
            impact.statistiques.inscriptions
        );

        console.log(
            "Conversions : " +
            impact.statistiques.conversions
        );


        console.log("");
        console.log(
            "----- PAR PAYS -----"
        );


        for (
            const ligne
            of impact.pays
        ) {

            console.log(
                (
                    ligne.pays ||
                    "Pays inconnu"
                ) +
                " : " +
                ligne.vues
            );
        }


        console.log("");
        console.log(
            "----- PAR TERRITOIRE -----"
        );


        for (
            const ligne
            of impact.territoires
        ) {

            console.log(
                (
                    ligne.territoire ||
                    "Territoire inconnu"
                ) +
                " : " +
                ligne.vues
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