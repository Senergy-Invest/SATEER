const {
    creerIntroductionPartenaireDatabase
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
            "===== TEST INTRODUCTION PARTENAIRE ====="
        );


        const introduction =
            await creerIntroductionPartenaireDatabase(
                1,
                6,
                "SN",
                "SATEER"
            );


        if (
            introduction === undefined
        ) {

            console.log(
                "Introduction non créée."
            );

            return;
        }


        console.log("");

        console.log(
            "Introduction créée."
        );

        console.log(
            "Introduction ID : " +
            introduction.introduction_id
        );

        console.log(
            "Lead ID : " +
            introduction.lead_id
        );

        console.log(
            "Partenaire : " +
            introduction.partner_organisation_id
        );

        console.log(
            "Statut introduction : " +
            introduction.introduction_statut
        );

        console.log(
            "Statut lead : " +
            introduction.lead_statut
        );

        console.log(
            "Suivi ID : " +
            introduction.followup_id
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