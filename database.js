const { Pool } = require("pg");


const pool = new Pool({
    user: process.env.USER,
    host: "localhost",
    database: "sateer",
    port: 5432
});


async function executerRequete(
    texte,
    valeurs = []
) {

    const resultat =
        await pool.query(
            texte,
            valeurs
        );

    return resultat;
}


async function fermerDatabase() {

    await pool.end();
}


module.exports = {
    executerRequete,
    fermerDatabase
};