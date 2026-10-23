const {
    aPermissionDatabase
} = require(
    "./services-database"
);

const {
    fermerDatabase
} = require(
    "./database"
);


async function testerPermission(
    titre,
    personneId,
    organisationId,
    tenantCode,
    permission
) {

    const autorise =
        await aPermissionDatabase(
            personneId,
            organisationId,
            tenantCode,
            permission
        );


    console.log("");
    console.log(
        "----- " + titre + " -----"
    );

    console.log(
        "Personne : " +
        personneId
    );

    console.log(
        "Organisation : " +
        organisationId
    );

    console.log(
        "Tenant : " +
        tenantCode
    );

    console.log(
        "Permission : " +
        permission
    );

    console.log(
        "Autorisé : " +
        autorise
    );
}


async function tester() {

    try {

        console.log("");
        console.log(
            "===== TEST PERMISSIONS DATABASE ====="
        );


        await testerPermission(
            "AWA / PUBLIER INFORMATION",
            3,
            1,
            "SN",
            "PUBLIER_INFORMATION"
        );


        await testerPermission(
            "FATOU / PUBLIER INFORMATION",
            1,
            1,
            "SN",
            "PUBLIER_INFORMATION"
        );


        await testerPermission(
            "AMINATA / GERER AGENTS",
            5,
            1,
            "SN",
            "GERER_AGENTS"
        );


        await testerPermission(
            "AWA / MAUVAIS TENANT",
            3,
            1,
            "ML",
            "PUBLIER_INFORMATION"
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