const PERSONNE_ID = 1;
const TENANT = "SN";


// =========================================================
// PARAMÈTRES URL
// =========================================================

const params =
    new URLSearchParams(
        window.location.search
    );


const ORGANISATION_ID =
    Number(
        params.get(
            "organisation"
        ) || 1
    );


const SOURCE =
    params.get(
        "source"
    ) || "SATEER";


// =========================================================
// DOM
// =========================================================

const backButton =
    document.getElementById(
        "backButton"
    );


const demandeContextLabel =
    document.getElementById(
        "demandeContextLabel"
    );


const demandeForm =
    document.getElementById(
        "demandeForm"
    );


const categorieInput =
    document.getElementById(
        "categorie"
    );


const objetInput =
    document.getElementById(
        "objet"
    );


const messageInput =
    document.getElementById(
        "message"
    );


const envoyerButton =
    document.getElementById(
        "envoyerDemandeButton"
    );


const erreurContainer =
    document.getElementById(
        "demandeErreur"
    );


const succesContainer =
    document.getElementById(
        "demandeSucces"
    );


// =========================================================
// CONFIGURATION DU CONTEXTE
// =========================================================

function configurerContexte() {

    if (
        SOURCE ===
        "MON_CONSULAT"
    ) {

        demandeContextLabel.textContent =
            "MON CONSULAT";

        return;
    }


    if (
        SOURCE ===
        "MON_AMBASSADE"
    ) {

        demandeContextLabel.textContent =
            "MON AMBASSADE";

        return;
    }


    demandeContextLabel.textContent =
        "SATEER";
}


// =========================================================
// RETOUR
// =========================================================

backButton.addEventListener(
    "click",
    () => {

        if (
            SOURCE ===
            "MON_CONSULAT"
        ) {

            window.location.href =
                "/consulat.html";

            return;
        }


        if (
            SOURCE ===
            "MON_AMBASSADE"
        ) {

            window.location.href =
                "/ambassade.html";

            return;
        }


        window.location.href =
            "/";
    }
);


// =========================================================
// AFFICHAGE ERREUR
// =========================================================

function afficherErreur(
    message
) {

    succesContainer.hidden =
        true;


    erreurContainer.textContent =
        message;


    erreurContainer.hidden =
        false;
}


// =========================================================
// AFFICHAGE SUCCÈS
// =========================================================

function afficherSucces(
    message
) {

    erreurContainer.hidden =
        true;


    succesContainer.textContent =
        message;


    succesContainer.hidden =
        false;
}


// =========================================================
// ENVOI DU FORMULAIRE
// =========================================================

demandeForm.addEventListener(
    "submit",
    async event => {

        event.preventDefault();


        erreurContainer.hidden =
            true;


        succesContainer.hidden =
            true;


        const categorie =
            categorieInput.value;


        const objet =
            objetInput.value.trim();


        const message =
            messageInput.value.trim();


        // =================================================
        // VALIDATION FRONT
        // =================================================

        if (
            !categorie ||
            !objet ||
            !message
        ) {

            afficherErreur(
                "Veuillez compléter tous les champs."
            );

            return;
        }


        // =================================================
        // ÉTAT ENVOI
        // =================================================

        envoyerButton.disabled =
            true;


        envoyerButton.textContent =
            "Envoi en cours...";


        try {

            // =================================================
            // API SATEER
            // =================================================

            const reponse =
                await fetch(
                    "/api/demandes",
                    {

                        method:
                            "POST",

                        headers: {

                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify({

                                personneId:
                                    PERSONNE_ID,

                                organisationId:
                                    ORGANISATION_ID,

                                tenantCode:
                                    TENANT,

                                categorie:
                                    categorie,

                                objet:
                                    objet,

                                message:
                                    message,

                                priorite:
                                    "NORMALE",

                                canal:
                                    SOURCE
                            })
                    }
                );


            // =================================================
            // LECTURE DE LA RÉPONSE
            // =================================================

            const resultat =
                await reponse.json();


            if (
                !reponse.ok
            ) {

                throw new Error(
                    resultat.erreur ||
                    "Impossible d'envoyer la demande."
                );
            }


            // =================================================
            // SUCCÈS
            // =================================================

            afficherSucces(
                resultat.message ||
                "Votre demande a bien été envoyée."
            );


            demandeForm.reset();


        } catch (erreur) {

            console.error(
                erreur
            );


            afficherErreur(
                erreur.message ||
                "Une erreur est survenue."
            );


        } finally {

            // =================================================
            // RÉACTIVATION DU BOUTON
            // =================================================

            envoyerButton.disabled =
                false;


            envoyerButton.textContent =
                "Envoyer ma demande";
        }
    }
);


// =========================================================
// INITIALISATION
// =========================================================

configurerContexte();