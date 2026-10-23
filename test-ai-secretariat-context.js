const {
    obtenirContexteIASecretariatDatabase
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
            "===== IA SECRÉTARIAT / CONTEXTE ====="
        );


        const contexte =
            await obtenirContexteIASecretariatDatabase(
                1,
                1,
                "SN"
            );


        if (
            contexte === undefined
        ) {

            console.log(
                "Contexte IA indisponible."
            );

            return;
        }


        console.log("");

        console.log(
            "===== DEMANDE ====="
        );


        console.log(
            "Citoyen : " +
            contexte.demande.prenom +
            " " +
            contexte.demande.nom
        );


        console.log(
            "Objet : " +
            contexte.demande.objet
        );


        console.log(
            "Catégorie : " +
            contexte.demande.categorie
        );


        console.log(
            "Description : " +
            contexte.demande.description
        );


        console.log("");

        console.log(
            "===== CONFIGURATION IA ====="
        );


        console.log(
            "Code : " +
            contexte.configurationIA.code
        );


        console.log(
            "Use case : " +
            contexte.configurationIA.use_case
        );


        console.log(
            "Validation humaine obligatoire : " +
            contexte.configurationIA
                .human_validation_required
        );


        console.log("");

        console.log(
            "===== CONNAISSANCES AUTORISÉES ====="
        );


        console.log(
            "Articles trouvés : " +
            contexte.connaissances.length
        );


        for (
            const article
            of contexte.connaissances
        ) {

            console.log("");

            console.log(
                article.titre
            );


            console.log(
                "Source : " +
                article.source_nom
            );


            console.log(
                "Version : " +
                article.version
            );


            console.log(
                "Statut : " +
                article.statut
            );


            console.log("");

            console.log(
                article.contenu
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