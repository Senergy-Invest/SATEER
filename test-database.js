const {
    listerPersonnesParOrganisationEtRelationDatabase
} = require(
    "./services-database"
);

const {
    fermerDatabase
} = require(
    "./database"
);


async function afficherPersonnes(
    titre,
    personnes
) {

    console.log("");
    console.log(
        "----- " + titre + " -----"
    );


    if (
        personnes.length === 0
    ) {

        console.log(
            "Aucune personne trouvée."
        );

        return;
    }


    personnes.forEach(
        personne => {

            console.log(
                personne.id +
                " | " +
                personne.prenom +
                " " +
                personne.nom +
                " | " +
                personne.relation_type +
                " | tenant " +
                personne.tenant_code
            );

        }
    );
}


async function tester() {

    try {

        console.log("");
        console.log(
            "===== TEST PERSONNES / ORGANISATION ====="
        );


        const usagers =
            await listerPersonnesParOrganisationEtRelationDatabase(
                1,
                "SN",
                "USAGER"
            );


        await afficherPersonnes(
            "USAGERS DU CONSULAT",
            usagers
        );


        const agents =
            await listerPersonnesParOrganisationEtRelationDatabase(
                1,
                "SN",
                "AGENT"
            );


        await afficherPersonnes(
            "AGENTS DU CONSULAT",
            agents
        );


        const responsables =
            await listerPersonnesParOrganisationEtRelationDatabase(
                1,
                "SN",
                "RESPONSABLE"
            );


        await afficherPersonnes(
            "RESPONSABLES DU CONSULAT",
            responsables
        );


        const testMauvaisTenant =
            await listerPersonnesParOrganisationEtRelationDatabase(
                1,
                "ML",
                "USAGER"
            );


        await afficherPersonnes(
            "TEST TENANT ML",
            testMauvaisTenant
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