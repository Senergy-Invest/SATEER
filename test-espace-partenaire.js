const {
    obtenirEspacePartenaireDatabase
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
            "===== ESPACE PARTENAIRE ====="
        );


        const espace =
            await obtenirEspacePartenaireDatabase(
                6,
                "SN"
            );


        if (
            espace === undefined
        ) {

            console.log(
                "Organisation partenaire introuvable."
            );

            return;
        }


        console.log("");

        console.log(
            "Organisation : " +
            espace.organisation.nom
        );


        console.log(
            "Tenant : " +
            espace.organisation.tenant_code
        );


        console.log("");

        console.log(
            "Leads reçus : " +
            espace.introductions.length
        );


        for (
            const introduction
            of espace.introductions
        ) {

            console.log("");

            console.log(
                "------------------------------"
            );


            console.log(
                introduction.prenom +
                " " +
                introduction.nom
            );


            console.log(
                "Lead ID : " +
                introduction.lead_id
            );


            console.log(
                "Besoin : " +
                introduction.besoin
            );


            console.log(
                "Statut lead : " +
                introduction.lead_statut
            );


            console.log(
                "Statut introduction : " +
                introduction.introduction_statut
            );


            console.log(
                "Consentement : " +
                introduction.consent_statut
            );


            console.log(
                "Type consentement : " +
                introduction.consent_type
            );


            console.log(
                "Canal : " +
                introduction.canal
            );
        }


        console.log("");

        console.log(
            "===== HISTORIQUE ====="
        );


        for (
            const suivi
            of espace.suivis
        ) {

            console.log("");

            console.log(
                "Lead #" +
                suivi.lead_id
            );


            console.log(
                "Statut : " +
                suivi.statut
            );


            console.log(
                "Note : " +
                suivi.note
            );


            console.log(
                "Agent : " +
                (
                    suivi.agent_prenom ||
                    ""
                ) +
                " " +
                (
                    suivi.agent_nom ||
                    ""
                )
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