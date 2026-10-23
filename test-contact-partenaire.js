const {
    creerDemandeContactPartenaireDatabase,
    obtenirImpactPublicationDatabase
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
            "===== TEST CONTACT PARTENAIRE ====="
        );


        const demande =
            await creerDemandeContactPartenaireDatabase(
                2,
                1,
                "SN",
                "J'accepte que SATEER transmette mes coordonnées à la Banque Partenaire Démo afin qu'elle puisse me contacter au sujet de cette offre.",
                "Je souhaite obtenir des informations sur le financement immobilier diaspora.",
                "DIASPORA"
            );


        console.log("");


        if (
            demande === undefined
        ) {

            console.log(
                "Demande de contact non créée."
            );

            return;
        }


        console.log(
            "Demande de contact créée."
        );

        console.log(
            "Lead ID : " +
            demande.lead_id
        );

        console.log(
            "Consentement ID : " +
            demande.consent_id
        );

        console.log(
            "Publication : " +
            demande.publication_id
        );

        console.log(
            "Partenaire : " +
            demande.partner_organisation_id
        );

        console.log(
            "Statut lead : " +
            demande.statut
        );


        console.log("");
        console.log(
            "===== IMPACT PUBLICATION BANQUE ====="
        );


        const impact =
            await obtenirImpactPublicationDatabase(
                2,
                6,
                "SN"
            );


        console.log(
            "Demandes de contact : " +
            impact.statistiques.demandes_contact
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