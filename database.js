const { Pool } = require("pg");

const pool = new Pool({
    user: process.env.USER,
    host: "localhost",
    database: "sateer",
    port: 5432
});


async function testerConnexionDatabase() {

    try {

        const resultat =
            await pool.query(
                "SELECT current_database() AS database"
            );

        console.log("");
        console.log(
            "===== CONNEXION POSTGRESQL ====="
        );

        console.log(
            "Base connectée : " +
            resultat.rows[0].database
        );

        console.log(
            "Connexion PostgreSQL réussie."
        );


        const organisationResultat =
            await pool.query(
                `
                SELECT
                    id,
                    nom,
                    type
                FROM organisations
                WHERE id = $1
                `,
                [1]
            );


        const organisation =
            organisationResultat.rows[0];


        console.log("");
        console.log(
            "===== TEST LECTURE ORGANISATION ====="
        );

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
            "Erreur PostgreSQL :"
        );

        console.error(
            erreur.message
        );

    } finally {

        await pool.end();
    }
}


testerConnexionDatabase();