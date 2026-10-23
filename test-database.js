const {
    trouverOrganisationParIdEtTenantDatabase
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
            "===== TEST MULTI-TENANT ====="
        );


        const organisationSenegal =
            await trouverOrganisationParIdEtTenantDatabase(
                1,
                "SN"
            );


        console.log("");
        console.log(
            "----- TEST TENANT SN -----"
        );


        if (
            organisationSenegal === undefined
        ) {

            console.log(
                "Organisation introuvable."
            );

        } else {

            console.log(
                "Organisation trouvée : " +
                organisationSenegal.nom
            );

            console.log(
                "Tenant : " +
                organisationSenegal.tenant_code
            );
        }


        const organisationMali =
            await trouverOrganisationParIdEtTenantDatabase(
                1,
                "ML"
            );


        console.log("");
        console.log(
            "----- TEST TENANT ML -----"
        );


        if (
            organisationMali === undefined
        ) {

            console.log(
                "Accès refusé / organisation introuvable pour le tenant ML."
            );

        } else {

            console.log(
                "ERREUR : organisation trouvée : " +
                organisationMali.nom
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