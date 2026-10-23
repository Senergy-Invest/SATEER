const {
    trouverOrganisationParIdDatabase
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
            "===== TEST SERVICE DATABASE ====="
        );


        const organisation =
            await trouverOrganisationParIdDatabase(
                1
            );


        if (
            organisation === undefined
        ) {

            console.log(
                "Organisation introuvable."
            );

            return;
        }


        console.log(
            "ID : " +
            organisation.id
        );

        console.log(
            "Nom : " +
            organisation.nom
        );

        console.log(
            "Type : " +
            organisation.type
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