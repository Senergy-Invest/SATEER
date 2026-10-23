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
        // PERFORMANCE
        // =================================================

        console.log("");
        console.log(
            "===== PERFORMANCE ====="
        );


        console.log(
            "Demandes mesurées : " +
            dashboard.delaiTraitement.demandes_mesurees
        );


        console.log(
            "Délai moyen de traitement : " +
            (
                dashboard.delaiTraitement.heures_moyennes ||
                0
            ) +
            " heure(s)"
        );


        // =================================================
        // CATÉGORIES
        // =================================================

        console.log("");
        console.log(
            "===== DEMANDES PAR CATÉGORIE ====="
        );


        if (
            dashboard.demandesParCategorie.length === 0
        ) {

            console.log(
                "Aucune demande."
            );

        } else {

            for (
                const categorie
                of dashboard.demandesParCategorie
            ) {

                console.log(
                    "- " +
                    categorie.categorie +
                    " : " +
                    categorie.total
                );
            }
        }


        // =================================================
        // TERRITOIRES DES DEMANDES
        // =================================================

        console.log("");
        console.log(
            "===== DEMANDES PAR TERRITOIRE ====="
        );


        if (
            dashboard.demandesParTerritoire.length === 0
        ) {

            console.log(
                "Aucune donnée."
            );

        } else {

            for (
                const territoire
                of dashboard.demandesParTerritoire
            ) {

                console.log(
                    "- " +
                    territoire.territoire +
                    " : " +
                    territoire.total
                );
            }
        }


        // =================================================
        // À SURVEILLER
        // =================================================

        console.log("");
        console.log(
            "===== DEMANDES À SURVEILLER ====="
        );


        if (
            dashboard.demandesASurveiller.length === 0
        ) {

            console.log(
                "Aucune demande nécessitant une attention particulière."
            );

        } else {

            for (
                const demande
                of dashboard.demandesASurveiller
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
                    demande.priorite +
                    " / " +
                    demande.statut
                );


                console.log(
                    "Territoire : " +
                    demande.territoire
                );


                console.log(
                    "Âge : " +
                    demande.age_jours +
                    " jour(s)"
                );
            }
        }


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
        // DIASPORA
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
        // ACTIVITÉ
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