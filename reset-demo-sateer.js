// =========================================================
// SATEER
// RESET DES DONNÉES DE DÉMONSTRATION
//
// IMPORTANT :
// - on conserve les personnes
// - on conserve les organisations
// - on conserve les tenants
// - on conserve les expériences
// - on conserve les configurations IA
// - on conserve la base de connaissance
//
// On nettoie uniquement les données opérationnelles
// Consulat / Ambassade utilisées pendant les démonstrations.
// =========================================================

const {
    executerRequete,
    fermerDatabase
} = require("./database");


async function resetDemo() {

    try {

        console.log("");
        console.log(
            "============================================================"
        );

        console.log(
            "SATEER - RÉINITIALISATION DE LA DÉMONSTRATION"
        );

        console.log(
            "============================================================"
        );


        await executerRequete(`
            -- =================================================
            -- ANALYTICS CONSULAT / AMBASSADE
            -- =================================================

            DELETE FROM analytics_events
            WHERE organisation_id IN (1, 2);


            -- =================================================
            -- NOTIFICATIONS LIÉES AU CONSULAT
            -- =================================================

            DELETE FROM notifications
            WHERE organisation_id = 1;


            -- =================================================
            -- RÉPONSES AUX DEMANDES CONSULAIRES
            -- =================================================

            DELETE FROM demande_reponses
            WHERE demande_id IN (
                SELECT id
                FROM demandes
                WHERE organisation_id = 1
            );


            -- =================================================
            -- HISTORIQUE DES DEMANDES
            -- =================================================

            DELETE FROM demande_history
            WHERE demande_id IN (
                SELECT id
                FROM demandes
                WHERE organisation_id = 1
            );


            -- =================================================
            -- DEMANDES CITOYENNES CONSULAT
            -- =================================================

            DELETE FROM demandes
            WHERE organisation_id = 1;


            -- =================================================
            -- PUBLICATIONS CONSULAT / AMBASSADE
            --
            -- On ne touche PAS aux publications partenaires
            -- ou aux autres organisations.
            -- =================================================

            DELETE FROM publications
            WHERE organisation_id IN (1, 2);
        `);


        console.log("");
        console.log(
            "✅ Demandes citoyennes nettoyées"
        );

        console.log(
            "✅ Réponses nettoyées"
        );

        console.log(
            "✅ Notifications nettoyées"
        );

        console.log(
            "✅ Analytics nettoyés"
        );

        console.log(
            "✅ Publications Consulat/Ambassade nettoyées"
        );


        console.log("");
        console.log(
            "Données conservées :"
        );

        console.log(
            "✅ Fatou / Mamadou / Awa / responsables"
        );

        console.log(
            "✅ Consulat / Ambassade / SATEER"
        );

        console.log(
            "✅ Tenant Sénégal"
        );

        console.log(
            "✅ Mon SATEER et activations"
        );

        console.log(
            "✅ Configurations IA"
        );

        console.log(
            "✅ Base de connaissance officielle"
        );


        console.log("");
        console.log(
            "La base est prête pour une nouvelle démonstration."
        );

        console.log("");


    } catch (erreur) {

        console.error("");
        console.error(
            "❌ ERREUR RESET : " +
            erreur.message
        );

        console.error(
            erreur
        );

    } finally {

        await fermerDatabase();
    }
}


resetDemo();