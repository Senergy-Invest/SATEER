// =========================================================
// SATEER
// DÉMONSTRATION PILOTE CONSULAT / AMBASSADE / DIASPORA / IA
// =========================================================


const {
    publierInformationPostgreSQL,
    analyserDemandeAvecIASecretariat,
    validerEtEnvoyerPropositionIASecretariat,
    repondreAvecIACitoyen
} = require("./services");


const {
    obtenirMonSateerDatabase,
    listerPublicationsAmbassadePourPersonneDatabase,
    listerPublicationsVisiblesPourPersonneDatabase,
    creerDemandeDatabase,
    prendreEnChargeDemandeDatabase,
    listerNotificationsPersonneDatabase,
    soumettrePublicationADiasporaDatabase,
    approuverDiffusionDiasporaDatabase,
    listerPublicationsDiasporaPourPersonneDatabase,
    enregistrerInteractionPublicationDatabase,
    obtenirDashboardConsulatDatabase,
    obtenirAnalyticsConsulatDatabase
} = require("./services-database");


const {
    fermerDatabase
} = require("./database");


// =========================================================
// DONNÉES PILOTE
// =========================================================

const TENANT = "SN";

const CONSULAT_ID = 1;
const AMBASSADE_ID = 2;

const FATOU_ID = 1;
const MAMADOU_ID = 2;

const AWA_ID = 3;
const AGENT_SATEER_ID = 6;


// =========================================================
// OUTILS D'AFFICHAGE
// =========================================================

function titre(texte) {

    console.log("");
    console.log("");
    console.log(
        "============================================================"
    );

    console.log(
        texte
    );

    console.log(
        "============================================================"
    );
}


function sousTitre(texte) {

    console.log("");
    console.log(
        "----- " + texte + " -----"
    );
}


function valeur(label, valeur) {

    console.log(
        label + " : " + valeur
    );
}


// =========================================================
// DÉMONSTRATION
// =========================================================

async function demo() {

    try {

        // =================================================
        // INTRODUCTION
        // =================================================

        titre(
            "SATEER - DÉMONSTRATION DU PILOTE"
        );


        console.log(
            "Scénario : Fatou Ndiaye, citoyenne sénégalaise résidant en Gironde."
        );


        console.log(
            "Elle utilise Mon SATEER pour accéder au Consulat, à l'Ambassade et à Diaspora."
        );


        // =================================================
        // ÉTAPE 1
        // MON SATEER
        // =================================================

        titre(
            "1. FATOU OUVRE MON SATEER"
        );


        const monSateer =
            await obtenirMonSateerDatabase(
                FATOU_ID,
                TENANT
            );


        if (!monSateer) {

            throw new Error(
                "Mon SATEER indisponible."
            );
        }


        valeur(
            "Citoyen",
            monSateer.personne.prenom +
            " " +
            monSateer.personne.nom
        );


        console.log("");
        console.log(
            "Expériences disponibles :"
        );


        for (
            const experience
            of monSateer.experiences
        ) {

            console.log(
                "- " +
                experience.nom
            );
        }


        // =================================================
        // ÉTAPE 2
        // MON AMBASSADE
        // =================================================

        titre(
            "2. FATOU CONSULTE MON AMBASSADE"
        );


        const publicationsAmbassade =
            await listerPublicationsAmbassadePourPersonneDatabase(
                FATOU_ID,
                AMBASSADE_ID,
                TENANT
            );


        if (
            publicationsAmbassade.length === 0
        ) {

            console.log(
                "Aucune information Ambassade disponible."
            );

        } else {

            const publicationAmbassade =
                publicationsAmbassade[0];


            valeur(
                "Information",
                publicationAmbassade.titre
            );


            valeur(
                "Catégorie",
                publicationAmbassade.categorie
            );


            valeur(
                "Priorité",
                publicationAmbassade.priorite
            );
        }


        // =================================================
        // ÉTAPE 3
        // IA CITOYEN
        // =================================================

        titre(
            "3. FATOU POSE UNE QUESTION À L'IA CITOYEN"
        );


        console.log(
            'Fatou : "Comment renouveler mon passeport ?"'
        );


        const reponseIA =
            await repondreAvecIACitoyen(
                FATOU_ID,
                CONSULAT_ID,
                TENANT,
                "Comment renouveler mon passeport ?"
            );


        console.log("");

        valeur(
            "Statut IA",
            reponseIA.statut
        );


        valeur(
            "Confiance",
            reponseIA.confiance
        );


        console.log("");
        console.log(
            "Réponse IA :"
        );


        console.log(
            reponseIA.reponse
        );


        if (
            reponseIA.sources &&
            reponseIA.sources.length > 0
        ) {

            console.log("");
            console.log(
                "Source institutionnelle :"
            );


            for (
                const source
                of reponseIA.sources
            ) {

                console.log(
                    "- " +
                    source.titre +
                    " / " +
                    source.source
                );
            }
        }


        // =================================================
        // ÉTAPE 4
        // DEMANDE CITOYENNE
        // =================================================

        titre(
            "4. FATOU CRÉE UNE DEMANDE AU CONSULAT"
        );


        const demande =
            await creerDemandeDatabase(
                FATOU_ID,
                CONSULAT_ID,
                TENANT,
                "PASSEPORT",
                "Renouvellement de passeport",
                "Je souhaite connaître les documents nécessaires pour renouveler mon passeport.",
                "NORMALE",
                "MON_CONSULAT"
            );


        if (!demande) {

            throw new Error(
                "Impossible de créer la demande."
            );
        }


        valeur(
            "Demande",
            "#" + demande.id
        );


        valeur(
            "Catégorie",
            demande.categorie
        );


        valeur(
            "Statut",
            demande.statut
        );


        // =================================================
        // ÉTAPE 5
        // AWA PREND EN CHARGE
        // =================================================

        titre(
            "5. AWA FALL PREND LA DEMANDE EN CHARGE"
        );


        const priseEnCharge =
            await prendreEnChargeDemandeDatabase(
                demande.id,
                AWA_ID,
                CONSULAT_ID,
                TENANT
            );


        if (!priseEnCharge) {

            throw new Error(
                "La demande ne peut pas être prise en charge."
            );
        }


        valeur(
            "Agent",
            "Awa Fall"
        );


        valeur(
            "Demande",
            "#" + demande.id
        );


        valeur(
            "Nouveau statut",
            priseEnCharge.statut
        );


        // =================================================
        // ÉTAPE 6
        // IA SECRÉTARIAT
        // =================================================

        titre(
            "6. L'IA SECRÉTARIAT AIDE AWA"
        );


        const analyseIA =
            await analyserDemandeAvecIASecretariat(
                demande.id,
                CONSULAT_ID,
                TENANT
            );


        valeur(
            "Statut",
            analyseIA.statut
        );


        console.log("");

        console.log(
            "Résumé proposé :"
        );


        console.log(
            analyseIA.resume
        );


        console.log("");

        valeur(
            "Catégorie proposée",
            analyseIA.categorieProposee
        );


        valeur(
            "Priorité proposée",
            analyseIA.prioriteProposee
        );


        valeur(
            "Confiance",
            analyseIA.confiance
        );


        console.log("");

        console.log(
            "Réponse proposée :"
        );


        console.log(
            analyseIA.reponseProposee
        );


        console.log("");

        valeur(
            "Validation humaine obligatoire",
            analyseIA.validationHumaineObligatoire
        );


        // =================================================
        // ÉTAPE 7
        // AWA VALIDE
        // =================================================

        titre(
            "7. AWA VALIDE ET ENVOIE LA RÉPONSE"
        );


        const validation =
            await validerEtEnvoyerPropositionIASecretariat(
                demande.id,
                AWA_ID,
                CONSULAT_ID,
                TENANT
            );


        if (
            !validation ||
            validation.succes === false
        ) {

            throw new Error(
                "Validation IA impossible."
            );
        }


        valeur(
            "Action",
            validation.action
        );


        valeur(
            "Statut demande",
            validation.reponse.statutDemande
        );


        console.log("");

        console.log(
            "Réponse envoyée à Fatou :"
        );


        console.log(
            validation.reponse.contenu
        );


        // =================================================
        // ÉTAPE 8
        // NOTIFICATION
        // =================================================

        titre(
            "8. FATOU REÇOIT UNE NOTIFICATION"
        );


        const notifications =
            await listerNotificationsPersonneDatabase(
                FATOU_ID,
                TENANT,
                "NON_LUE"
            );


        const notificationDemande =
            notifications.find(
                notification =>
                    Number(
                        notification.reference_id
                    ) === Number(
                        demande.id
                    )
            );


        if (notificationDemande) {

            valeur(
                "Notification",
                notificationDemande.titre
            );


            console.log(
                notificationDemande.message
            );

        } else {

            console.log(
                "Notification créée mais non retrouvée dans la sélection."
            );
        }


        // =================================================
        // ÉTAPE 9
        // CONSULAT PUBLIE
        // =================================================

        titre(
            "9. LE CONSULAT PUBLIE UNE INFORMATION CIBLÉE"
        );


        const identifiantDemo =
            new Date()
                .toISOString()
                .replace(
                    /[:.]/g,
                    "-"
                );


        const publication =
            await publierInformationPostgreSQL(
                CONSULAT_ID,

                "Information Consulat - Gironde - " +
                identifiantDemo,

                "Le Consulat informe les Sénégalais résidant en Gironde d'une information importante diffusée dans le cadre du pilote SATEER.",

                "DEPARTEMENT",

                "Gironde",

                "INFORMATION",

                "IMPORTANTE",

                AWA_ID,

                TENANT,

                []
            );


        if (!publication) {

            throw new Error(
                "Publication Consulat impossible."
            );
        }


        valeur(
            "Publication",
            "#" + publication.id
        );


        valeur(
            "Audience",
            "Gironde"
        );


        valeur(
            "Priorité",
            publication.priorite
        );


        // =================================================
        // ÉTAPE 10
        // MON CONSULAT
        // =================================================

        titre(
            "10. FATOU VOIT L'INFORMATION DANS MON CONSULAT"
        );


        const publicationsConsulat =
            await listerPublicationsVisiblesPourPersonneDatabase(
                FATOU_ID,
                CONSULAT_ID,
                TENANT
            );


        const publicationVisible =
            publicationsConsulat.find(
                element =>
                    Number(element.id) ===
                    Number(publication.id)
            );


        if (publicationVisible) {

            console.log(
                "✅ Fatou voit la publication."
            );


            await enregistrerInteractionPublicationDatabase(
                publication.id,
                FATOU_ID,
                TENANT,
                "VIEW",
                "MON_CONSULAT"
            );

        } else {

            console.log(
                "❌ Fatou ne voit pas la publication."
            );
        }


        // =================================================
        // ÉTAPE 11
        // PROPOSITION DIASPORA
        // =================================================

        titre(
            "11. LE CONSULAT PROPOSE LA PUBLICATION À DIASPORA"
        );


        const soumission =
            await soumettrePublicationADiasporaDatabase(
                publication.id,
                AWA_ID,
                CONSULAT_ID,
                TENANT
            );


        if (!soumission) {

            throw new Error(
                "Soumission Diaspora impossible."
            );
        }


        valeur(
            "Statut Diaspora",
            soumission.statut_diffusion_diaspora
        );


        // =================================================
        // ÉTAPE 12
        // SATEER COMMUNICATION
        // =================================================

        titre(
            "12. SATEER COMMUNICATION VALIDE LA DIFFUSION"
        );


        const approbation =
            await approuverDiffusionDiasporaDatabase(
                publication.id,
                AGENT_SATEER_ID,
                TENANT
            );


        if (!approbation) {

            throw new Error(
                "Approbation Diaspora impossible."
            );
        }


        valeur(
            "Décision",
            "DIFFUSION APPROUVÉE"
        );


        valeur(
            "Statut",
            approbation.statut_diffusion_diaspora
        );


        // =================================================
        // ÉTAPE 13
        // DIASPORA FATOU
        // =================================================

        titre(
            "13. FATOU OUVRE DIASPORA"
        );


        const diasporaFatou =
            await listerPublicationsDiasporaPourPersonneDatabase(
                FATOU_ID,
                TENANT
            );


        const publicationFatou =
            diasporaFatou.find(
                element =>
                    Number(element.id) ===
                    Number(publication.id)
            );


        if (publicationFatou) {

            console.log(
                "✅ Fatou voit l'information dans Diaspora."
            );


            await enregistrerInteractionPublicationDatabase(
                publication.id,
                FATOU_ID,
                TENANT,
                "VIEW",
                "DIASPORA"
            );

        } else {

            console.log(
                "❌ Fatou ne voit pas l'information."
            );
        }


        // =================================================
        // ÉTAPE 14
        // DIASPORA MAMADOU
        // =================================================

        titre(
            "14. MAMADOU OUVRE DIASPORA"
        );


        const diasporaMamadou =
            await listerPublicationsDiasporaPourPersonneDatabase(
                MAMADOU_ID,
                TENANT
            );


        const publicationMamadou =
            diasporaMamadou.find(
                element =>
                    Number(element.id) ===
                    Number(publication.id)
            );


        if (publicationMamadou) {

            console.log(
                "❌ Mamadou voit la publication alors qu'elle cible la Gironde."
            );

        } else {

            console.log(
                "✅ Mamadou ne voit pas la publication."
            );


            console.log(
                "Raison : il réside en Haute-Garonne."
            );
        }


        // =================================================
        // ÉTAPE 15
        // DASHBOARD VICE-CONSUL
        // =================================================

        titre(
            "15. LE VICE-CONSUL CONSULTE SON TABLEAU DE BORD"
        );


        const dashboard =
            await obtenirDashboardConsulatDatabase(
                CONSULAT_ID,
                TENANT
            );


        console.log(
            "Demandes :"
        );


        valeur(
            "Total",
            dashboard.demandes.total
        );


        valeur(
            "Nouvelles",
            dashboard.demandes.nouvelles
        );


        valeur(
            "En cours",
            dashboard.demandes.en_cours
        );


        valeur(
            "Traitées",
            dashboard.demandes.traitees
        );


        console.log("");

        console.log(
            "Publications :"
        );


        valeur(
            "Total",
            dashboard.publications.total
        );


        valeur(
            "Publiées",
            dashboard.publications.publiees
        );


        valeur(
            "Diffusées Diaspora",
            dashboard.publications.diffusees_diaspora
        );


        // =================================================
        // ÉTAPE 16
        // ANALYTICS
        // =================================================

        titre(
            "16. LE VICE-CONSUL MESURE L'IMPACT"
        );


        const analytics =
            await obtenirAnalyticsConsulatDatabase(
                CONSULAT_ID,
                TENANT
            );


        valeur(
            "Vues totales",
            analytics.global.vues_totales
        );


        valeur(
            "Personnes uniques",
            analytics.global.personnes_uniques
        );


        valeur(
            "Clics",
            analytics.global.clics
        );


        valeur(
            "Intérêts",
            analytics.global.interets
        );


        console.log("");

        console.log(
            "Canaux :"
        );


        for (
            const canal
            of analytics.canaux
        ) {

            console.log(
                "- " +
                canal.channel +
                " : " +
                canal.vues +
                " vue(s)"
            );
        }


        console.log("");

        console.log(
            "Territoires :"
        );


        for (
            const territoire
            of analytics.territoires
        ) {

            console.log(
                "- " +
                territoire.territoire +
                " : " +
                territoire.vues +
                " vue(s)"
            );
        }


        // =================================================
        // CONCLUSION
        // =================================================

        titre(
            "DÉMONSTRATION TERMINÉE"
        );


        console.log(
            "✅ Mon SATEER"
        );

        console.log(
            "✅ Mon Consulat"
        );

        console.log(
            "✅ Mon Ambassade"
        );

        console.log(
            "✅ Diaspora ciblée"
        );

        console.log(
            "✅ Demandes citoyennes"
        );

        console.log(
            "✅ IA Citoyen"
        );

        console.log(
            "✅ IA Secrétariat avec validation humaine"
        );

        console.log(
            "✅ SATEER Communication"
        );

        console.log(
            "✅ Dashboard Vice-Consul"
        );

        console.log(
            "✅ Analytics territoriaux et multicanaux"
        );


        console.log("");

        console.log(
            "SATEER ne remplace pas les institutions."
        );


        console.log(
            "SATEER les relie au citoyen, organise les interactions et mesure leur impact."
        );


        console.log("");


    } catch (erreur) {

        console.error("");
        console.error(
            "❌ ERREUR DÉMO : " +
            erreur.message
        );


        console.error(
            erreur
        );

    } finally {

        await fermerDatabase();
    }
}


demo();