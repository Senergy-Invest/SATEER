const { Pool } = require("pg");

// La base par defaut reste "sateer" pour preserver le comportement existant.
// Les tests et environnements distincts peuvent choisir leur cible via PG*.
const pool = new Pool({
    user: process.env.PGUSER || process.env.USER,
    host: process.env.PGHOST || "localhost",
    database: process.env.PGDATABASE || "sateer",
    port: Number(process.env.PGPORT || 5432),
    ...(process.env.PGPASSWORD
        ? { password: process.env.PGPASSWORD }
        : {})
});


async function executerRequete(
    texte,
    valeurs = []
) {
    return await pool.query(texte, valeurs);
}


// =========================================================
// CLIENT TRANSACTIONNEL
// =========================================================

async function obtenirClientDatabase() {
    return await pool.connect();
}


async function fermerDatabase() {
    await pool.end();
}


module.exports = {
    executerRequete,
    obtenirClientDatabase,
    fermerDatabase
};
