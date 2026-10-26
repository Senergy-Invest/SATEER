const params =
    new URLSearchParams(
        window.location.search
    );


const organisationId =
    Number(
        params.get("organisation")
        || 1
    );


const tenant =
    params.get("tenant")
    || "SN";


let citoyens =
    [];


// =========================================================
// CHARGEMENT
// =========================================================

async function chargerCommunaute() {

    try {

        const reponse =
            await fetch(
                `/api/organisations/${organisationId}/ecosysteme?tenant=${tenant}`
            );


        const donnees =
            await reponse.json();


        if (!reponse.ok) {

            throw new Error(
                donnees.erreur
                || "Impossible de charger la communauté."
            );
        }


        afficherCommunaute(
            donnees
        );

    } catch (erreur) {

        console.error(
            "Erreur communauté :",
            erreur
        );

    }
}


// =========================================================
// AFFICHAGE GLOBAL
// =========================================================

function afficherCommunaute(
    donnees
) {

    document.getElementById(
        "organisationNom"
    ).textContent =
        donnees.organisation.nom;


    document.getElementById(
        "resumeCitoyens"
    ).textContent =
        donnees.resume.usagers;


    document.getElementById(
        "resumeTerritoires"
    ).textContent =
        donnees.resume.territoires;


    citoyens =
        donnees.usagers || [];


    afficherCitoyens(
        citoyens
    );


    afficherTerritoires(
        donnees.territoires || []
    );
}


// =========================================================
// CITOYENS
// =========================================================

function afficherCitoyens(
    liste
) {

    const container =
        document.getElementById(
            "citoyensListe"
        );


    const resultat =
        document.getElementById(
            "resultatsCitoyens"
        );


    container.innerHTML =
        "";


    resultat.textContent =
        `${liste.length} citoyen(s) affiché(s)`;


    if (
        liste.length === 0
    ) {

        afficherVide(
            container,
            "Aucun citoyen trouvé."
        );

        return;
    }


    liste.forEach(
        (citoyen) => {

            const card =
                document.createElement(
                    "article"
                );


            card.className =
                "community-person-card";


            const avatar =
                document.createElement(
                    "div"
                );


            avatar.className =
                "community-person-avatar";


            avatar.textContent =
                `${premiereLettre(citoyen.prenom)}${premiereLettre(citoyen.nom)}`;


            const informations =
                document.createElement(
                    "div"
                );


            informations.className =
                "community-person-info";


            const nom =
                document.createElement(
                    "strong"
                );


            nom.textContent =
                `${citoyen.prenom} ${citoyen.nom}`;


            const territoire =
                document.createElement(
                    "span"
                );


            territoire.textContent =
                citoyen.territoire
                || "Territoire non renseigné";


            informations.appendChild(
                nom
            );


            informations.appendChild(
                territoire
            );


            card.appendChild(
                avatar
            );


            card.appendChild(
                informations
            );


            container.appendChild(
                card
            );
        }
    );
}


// =========================================================
// RECHERCHE
// =========================================================

document.getElementById(
    "rechercheCitoyen"
).addEventListener(
    "input",
    (event) => {

        const recherche =
            normaliser(
                event.target.value
            );


        if (!recherche) {

            afficherCitoyens(
                citoyens
            );

            return;
        }


        const resultats =
            citoyens.filter(
                (citoyen) => {

                    const texte =
                        normaliser(
                            `${citoyen.prenom} ${citoyen.nom} ${citoyen.territoire || ""}`
                        );


                    return texte.includes(
                        recherche
                    );
                }
            );


        afficherCitoyens(
            resultats
        );
    }
);


// =========================================================
// TERRITOIRES
// =========================================================

function afficherTerritoires(
    territoires
) {

    const container =
        document.getElementById(
            "territoiresListe"
        );


    container.innerHTML =
        "";


    territoires.forEach(
        (territoire) => {

            const card =
                document.createElement(
                    "article"
                );


            card.className =
                "ecosystem-territory-card";


            const nom =
                document.createElement(
                    "strong"
                );


            nom.textContent =
                territoire.territoire;


            const nombre =
                document.createElement(
                    "span"
                );


            nombre.textContent =
                `${territoire.personnes} citoyen(s)`;


            card.appendChild(
                nom
            );


            card.appendChild(
                nombre
            );


            container.appendChild(
                card
            );
        }
    );
}


// =========================================================
// OUTILS
// =========================================================

function afficherVide(
    container,
    message
) {

    const vide =
        document.createElement(
            "div"
        );


    vide.className =
        "dashboard-empty";


    vide.textContent =
        message;


    container.appendChild(
        vide
    );
}


function premiereLettre(
    valeur
) {

    if (!valeur) {

        return "?";
    }


    return valeur
        .trim()
        .charAt(0)
        .toUpperCase();
}


function normaliser(
    valeur
) {

    return String(
        valeur || ""
    )
        .normalize("NFD")
        .replace(
            /[\u0300-\u036f]/g,
            ""
        )
        .toLowerCase()
        .trim();
}


// =========================================================
// DÉMARRAGE
// =========================================================

chargerCommunaute();