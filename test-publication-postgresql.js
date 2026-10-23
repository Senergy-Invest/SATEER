const {
    publierInformationPostgreSQL
} = require("./services");


const {
    fermerDatabase
} = require("./database");


async function tester() {

    try {

        console.log("");
        console.log(
            "===== TEST PUBLICATION METIER POSTGRESQL ====="
        );


        console.log("");
        console.log(
            "----- AWA / TENANT SN -----"
        );


        const publicationAwa =
            await publierInformationPostgreSQL(
                1,
                "Test publication PostgreSQL",
                "Cette publication utilise une permission vérifiée dans PostgreSQL.",
                "DEPARTEMENT",
                "Gironde",
                "INFORMATION",
                "NORMALE",
                3,
                "SN"
            );


        console.log("");

        console.log(
            "Publication créée : " +
            (
                publicationAwa !== undefined
            )
        );


        console.log("");
        console.log(
            "----- FATOU / TENANT SN -----"
        );


        const publicationFatou =
            await publierInformationPostgreSQL(
                1,
                "Publication interdite",
                "Fatou ne doit pas pouvoir publier.",
                "TOUS",
                null,
                "INFORMATION",
                "NORMALE",
                1,
                "SN"
            );


        console.log("");

        console.log(
            "Publication créée : " +
            (
                publicationFatou !== undefined
            )
        );


        console.log("");
        console.log(
            "----- AWA / TENANT ML -----"
        );


        const publicationMauvaisTenant =
            await publierInformationPostgreSQL(
                1,
                "Publication mauvais tenant",
                "Cette publication doit être refusée.",
                "TOUS",
                null,
                "INFORMATION",
                "NORMALE",
                3,
                "ML"
            );


        console.log("");

        console.log(
            "Publication créée : " +
            (
                publicationMauvaisTenant !== undefined
            )
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