const {
    obtenirAnalyticsConsulatDatabase
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
            "===== ANALYTICS CONSULAT ====="
        );


        const analytics =
            await obtenirAnalyticsConsulatDatabase(
                1,
                "SN"
            );


        if (
            analytics === undefined
        ) {

            console.log(
                "Consulat introuvable."
            );

            return;
        }


        console.log("");

        console.log(
            analytics.organisation.nom
        );


        // =================================================
        // GLOBAL
        // =================================================

        console.log("");
        console.log(
            "===== IMPACT GLOBAL ====="
        );


        console.log(
            "Vues totales : " +
            analytics.global.vues_totales
        );


        console.log(
            "Personnes uniques : " +
            analytics.global.personnes_uniques
        );


        console.log(
            "Clics : " +
            analytics.global.clics
        );


        console.log(
            "Intérêts : " +
            analytics.global.interets
        );


        console.log(
            "Demandes de contact : " +
            analytics.global.demandes_contact
        );


        console.log(
            "Inscriptions : " +
            analytics.global.inscriptions
        );


        console.log(
            "Conversions : " +
            analytics.global.conversions
        );


        // =================================================
        // PUBLICATIONS
        // =================================================

        console.log("");
        console.log(
            "===== PAR PUBLICATION ====="
        );


        for (
            const publication
            of analytics.publications
        ) {

            console.log("");

            console.log(
                "#" +
                publication.id +
                " - " +
                publication.titre
            );


            console.log(
                "Vues : " +
                publication.vues
            );


            console.log(
                "Vues uniques : " +
                publication.vues_uniques
            );


            console.log(
                "Clics : " +
                publication.clics
            );


            console.log(
                "Intérêts : " +
                publication.interets
            );


            console.log(
                "Diaspora : " +
                publication.statut_diffusion_diaspora
            );
        }


        // =================================================
        // CANAUX
        // =================================================

        console.log("");
        console.log(
            "===== PAR CANAL ====="
        );


        for (
            const canal
            of analytics.canaux
        ) {

            console.log(
                "- " +
                canal.channel +
                " : " +
                canal.vues +
                " vue(s), " +
                canal.vues_uniques +
                " personne(s) unique(s)"
            );
        }


        // =================================================
        // TERRITOIRES
        // =================================================

        console.log("");
        console.log(
            "===== PAR TERRITOIRE ====="
        );


        for (
            const territoire
            of analytics.territoires
        ) {

            console.log(
                "- " +
                territoire.territoire +
                " : " +
                territoire.vues +
                " vue(s), " +
                territoire.personnes_uniques +
                " personne(s) unique(s)"
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