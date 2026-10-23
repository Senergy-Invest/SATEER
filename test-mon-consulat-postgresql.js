const {
    afficherMonConsulatPostgreSQL
} = require("./services");


const {
    fermerDatabase
} = require("./database");


async function tester() {

    try {

        console.log("");
        console.log(
            "===== TEST MON CONSULAT POSTGRESQL ====="
        );


        console.log("");
        console.log(
            "----- FATOU / GIRonde -----"
        );


        await afficherMonConsulatPostgreSQL(
            1,
            1,
            "SN"
        );


        console.log("");
        console.log(
            "----- MAMADOU / HAUTE-GARONNE -----"
        );


        await afficherMonConsulatPostgreSQL(
            2,
            1,
            "SN"
        );


        console.log("");
        console.log(
            "----- TEST MAUVAIS TENANT -----"
        );


        await afficherMonConsulatPostgreSQL(
            1,
            1,
            "ML"
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