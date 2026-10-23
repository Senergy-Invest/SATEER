const {
    enregistrerInteractionPublicationDatabase,
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
            "===== TEST INTERACTIONS PUBLICATION ====="
        );


        console.log("");
        console.log(
            "----- CLICK FATOU -----"
        );


        const clic =
            await enregistrerInteractionPublicationDatabase(
                1,
                1,
                "SN",
                "CLICK",
                "MON_CONSULAT",
                {
                    source: "DETAIL_PUBLICATION"
                }
            );


        console.log(
            "CLICK enregistré : " +
            (
                clic !== undefined
            )
        );


        console.log("");
        console.log(
            "----- INTEREST FATOU -----"
        );


        const interet =
            await enregistrerInteractionPublicationDatabase(
                1,
                1,
                "SN",
                "INTEREST",
                "MON_CONSULAT",
                {
                    action: "JE_SUIS_INTERESSEE"
                }
            );


        console.log(
            "INTEREST enregistré : " +
            (
                interet !== undefined
            )
        );


        console.log("");
        console.log(
            "----- MAUVAIS TENANT -----"
        );


        const mauvaisTenant =
            await enregistrerInteractionPublicationDatabase(
                1,
                1,
                "ML",
                "CLICK",
                "MON_CONSULAT"
            );


        console.log(
            "Interaction créée : " +
            (
                mauvaisTenant !== undefined
            )
        );


        console.log("");
        console.log(
            "===== IMPACT APRÈS INTERACTIONS ====="
        );


        const impact =
            await obtenirImpactPublicationDatabase(
                1,
                1,
                "SN"
            );


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