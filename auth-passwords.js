// =========================================================
// SATEER CORE
// GESTION SECURISEE DES MOTS DE PASSE
// =========================================================

const {
    randomBytes,
    scrypt: scryptCallback,
    timingSafeEqual
} = require("node:crypto");

const {
    promisify
} = require("node:util");


const scrypt = promisify(scryptCallback);


// Parametres de derivation de cle

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

const SCRYPT_OPTIONS = {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024
};


// =========================================================
// HACHER UN MOT DE PASSE
// =========================================================

async function hacherMotDePasse(motDePasse) {

    if (
        typeof motDePasse !== "string"
        || Buffer.byteLength(
            motDePasse,
            "utf8"
        ) < 12
        || Buffer.byteLength(
            motDePasse,
            "utf8"
        ) > 256
    ) {

        throw new Error(
            "MOT_DE_PASSE_INVALIDE"
        );
    }


    // Sel aleatoire unique pour chaque compte

    const sel = randomBytes(16);


    // Derivation cryptographique

    const empreinte = await scrypt(
        motDePasse,
        sel,
        64,
        SCRYPT_OPTIONS
    );


    // Format versionne pour permettre
    // une evolution future de la securite

    return [
        "scrypt",
        SCRYPT_N,
        SCRYPT_R,
        SCRYPT_P,
        sel.toString("base64url"),
        empreinte.toString("base64url")
    ].join("$");
}


// =========================================================
// VERIFIER UN MOT DE PASSE
// =========================================================

async function verifierMotDePasse(
    motDePasse,
    empreinteStockee
) {

    if (
        typeof motDePasse !== "string"
        || typeof empreinteStockee !== "string"
    ) {

        return false;
    }


    try {

        const parties =
            empreinteStockee.split("$");


        if (parties.length !== 6) {

            return false;
        }


        const [
            algorithme,
            n,
            r,
            p,
            selEncode,
            empreinteEncodee
        ] = parties;


        if (
            algorithme !== "scrypt"
            || Number(n) !== SCRYPT_N
            || Number(r) !== SCRYPT_R
            || Number(p) !== SCRYPT_P
        ) {

            return false;
        }


        const sel =
            Buffer.from(
                selEncode,
                "base64url"
            );


        const empreinteAttendue =
            Buffer.from(
                empreinteEncodee,
                "base64url"
            );


        if (
            sel.length !== 16
            || empreinteAttendue.length !== 64
        ) {

            return false;
        }


        const empreinteCalculee =
            await scrypt(
                motDePasse,
                sel,
                64,
                SCRYPT_OPTIONS
            );


        return timingSafeEqual(
            empreinteCalculee,
            empreinteAttendue
        );

    } catch (erreur) {

        return false;
    }
}


// =========================================================
// EXPORTS
// =========================================================

module.exports = {
    hacherMotDePasse,
    verifierMotDePasse
};