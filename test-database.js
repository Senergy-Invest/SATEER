const {
    listerOrganisationsParTenantEtTypeDatabase
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
            "===== TEST LISTE ORGANISATIONS ====="
        );


        const consulats =
            await listerOrganisationsParTenantEtTypeDatabase(
                "SN",
                "CONSULAT"
            );


        console.log("");
        console.log(
            "----- CONSULATS DU TENANT SN -----"
        );


        if (
            consulats.length === 0
        ) {

            console.log(
                "Aucun consulat trouvé."
            );

        } else {

            consulats.forEach(
                organisation => {

                    console.log(
                        organisation.id +
                        " | " +
                        organisation.nom +
                        " | " +
                        organisation.territoire
                    );

                }
            );
        }


        const ambassades =
            await listerOrganisationsParTenantEtTypeDatabase(
                "SN",
                "AMBASSADE"
            );


        console.log("");
        console.log(
            "----- AMBASSADES DU TENANT SN -----"
        );


        if (
            ambassades.length === 0
        ) {

            console.log(
                "Aucune ambassade trouvée."
            );

        } else {

            ambassades.forEach(
                organisation => {

                    console.log(
                        organisation.id +
                        " | " +
                        organisation.nom +
                        " | " +
                        organisation.territoire
                    );

                }
            );
        }


        const consulatsMali =
            await listerOrganisationsParTenantEtTypeDatabase(
                "ML",
                "CONSULAT"
            );


        console.log("");
        console.log(
            "----- CONSULATS DU TENANT ML -----"
        );

        console.log(
            "Nombre trouvé : " +
            consulatsMali.length
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