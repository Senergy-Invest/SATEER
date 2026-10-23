const {
    obtenirDashboardConsulatDatabase
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
            "===== DASHBOARD VICE-CONSUL ====="
        );


        const dashboard =
            await obtenirDashboardConsulatDatabase(
                1,
                "SN"
            );


        if (
            dashboard === undefined
        ) {

            console.log(
                "Consulat introuvable."
            );

            return;
        }


        console.log("");

        console.log(
            dashboard.organisation.nom
        );


        console.log(
            "Tenant : " +
            dashboard.organisation.tenant_code
        );


        // =================================================
        // DEMANDES
        // =================================================

        console.log("");
        console.log(
            "===== DEMANDES ====="
        );


        console.log(
            "Total : " +
            dashboard.demandes.total
        );


        console.log(
            "Nouvelles : " +
            dashboard.demandes.nouvelles
        );


        console.log(
            "En cours : " +
            dashboard.demandes.en_cours
        );


        console.log(
            "Traitées : " +
            dashboard.demandes.traitees
        );


        console.log(
            "Importantes : " +
            dashboard.demandes.importantes
        );


        console.log(
            "Urgentes : " +
            dashboard.demandes.urgentes
        );


        // =================================================
        // PUBLICATIONS
        // =================================================

        console.log("");
        console.log(
            "===== PUBLICATIONS ====="
        );


        console.log(
            "Total : " +
            dashboard.publications.total
        );


        console.log(
            "Publiées : " +
            dashboard.publications.publiees
        );


        console.log(
            "Importantes : " +
            dashboard.publications.importantes
        );


        console.log(
            "Urgentes : " +
            dashboard.publications.urgentes
        );


        console.log(
            "Soumises à Diaspora : " +
            dashboard.publications.soumises_diaspora
        );


        console.log(
            "Diffusées dans Diaspora : " +
            dashboard.publications.diffusees_diaspora
        );


        // =================================================
        // DIASPORA / USAGERS
        // =================================================

        console.log("");
        console.log(
            "===== DIASPORA / USAGERS ====="
        );


        console.log(
            "Usagers liés au Consulat : " +
            dashboard.diaspora.total_usagers
        );


        console.log(
            "Avec territoire renseigné : " +
            dashboard.diaspora.avec_territoire
        );


        console.log("");
        console.log(
            "Répartition territoriale :"
        );


        for (
            const territoire
            of dashboard.territoires
        ) {

            console.log(
                "- " +
                territoire.territoire +
                " : " +
                territoire.personnes
            );
        }


        // =================================================
        // ACTIVITÉ RÉCENTE
        // =================================================

        console.log("");
        console.log(
            "===== DERNIÈRES DEMANDES ====="
        );


        for (
            const demande
            of dashboard.activiteRecente.demandes
        ) {

            console.log("");

            console.log(
                "#" +
                demande.id +
                " - " +
                demande.prenom +
                " " +
                demande.nom
            );


            console.log(
                demande.objet
            );


            console.log(
                demande.statut +
                " / " +
                demande.priorite
            );
        }


        console.log("");
        console.log(
            "===== DERNIÈRES PUBLICATIONS ====="
        );


        for (
            const publication
            of dashboard.activiteRecente.publications
        ) {

            console.log("");

            console.log(
                "#" +
                publication.id +
                " - " +
                publication.titre
            );


            console.log(
                publication.categorie +
                " / " +
                publication.priorite
            );


            console.log(
                "Diaspora : " +
                publication.statut_diffusion_diaspora
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