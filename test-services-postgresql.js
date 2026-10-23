const {
    aPermissionPostgreSQL
} = require("./services");


const {
    fermerDatabase
} = require("./database");


async function tester() {

    try {

        console.log("");
        console.log(
            "===== TEST SERVICES.JS + POSTGRESQL ====="
        );


        const awa =
            await aPermissionPostgreSQL(
                3,
                "PUBLIER_INFORMATION",
                1,
                "SN"
            );


        console.log("");
        console.log(
            "Awa peut publier : " +
            awa
        );


        const fatou =
            await aPermissionPostgreSQL(
                1,
                "PUBLIER_INFORMATION",
                1,
                "SN"
            );


        console.log(
            "Fatou peut publier : " +
            fatou
        );


        const mauvaisTenant =
            await aPermissionPostgreSQL(
                3,
                "PUBLIER_INFORMATION",
                1,
                "ML"
            );


        console.log(
            "Awa peut publier via tenant ML : " +
            mauvaisTenant
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