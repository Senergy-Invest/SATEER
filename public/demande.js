


// =========================================================
// PARAMÈTRES URL
// =========================================================

const params =
    new URLSearchParams(
        window.location.search
    );


let ORGANISATION_ID = Number(params.get("organisation")) || null;


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

const intentionInput = document.getElementById("intention");
const ambassadeIntentionGroup = document.getElementById("ambassadeIntentionGroup");
// Aucun changement de parcours pour le Consulat ou SATEER.
ambassadeIntentionGroup.hidden = SOURCE !== "MON_AMBASSADE";
intentionInput.required = SOURCE === "MON_AMBASSADE";


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
        // L'intention précède le sujet : aucun routage automatique par mot-clé.
        const information = document.querySelector(".form-information p");
        if (information) information.textContent =
            "Votre message sera d'abord qualifié par un service habilité de l'ambassade. La catégorie indiquée ne crée pas automatiquement un dossier de pièces.";
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

            // Le retour doit conserver le contexte de la demarche P7.
            // Sans tenant, /api/context ne sait plus quel Consulat charger.
            const retour = new URL("/consulat.html", window.location.origin);
            const tenant = params.get("tenant") || window.SATEER_CONTEXT?.tenantCode;
            const organisationId = Number(params.get("organisation") || ORGANISATION_ID);
            if (!tenant || !Number.isSafeInteger(organisationId) || organisationId <= 0) {
                window.location.href = "/";
                return;
            }
            retour.searchParams.set("organisation", String(organisationId));
            retour.searchParams.set("tenant", tenant);
            window.location.href = retour.pathname + retour.search;

            return;
        }


        if (
            SOURCE ===
            "MON_AMBASSADE"
        ) {

            const retour = new URL("/ambassade.html", window.location.origin);
            const tenant = params.get("tenant") || window.SATEER_CONTEXT?.tenantCode;
            const organisationId = Number(params.get("organisation") || ORGANISATION_ID);
            if (tenant && Number.isSafeInteger(organisationId) && organisationId > 0) {
                retour.searchParams.set("organisation", String(organisationId));
                retour.searchParams.set("tenant", tenant);
            }
            window.location.href = retour.pathname + retour.search;
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

        const contexte = await window.SATEER_CONTEXT_READY;
        const typeAttendu = SOURCE === "MON_AMBASSADE" ? "AMBASSADE" : undefined;
        const organisation = await window.SATEER_choisirOrganisation(ORGANISATION_ID, typeAttendu);
        if (!organisation) {
            afficherErreur("Aucune organisation unique n’est associée à votre demande. Sélectionnez d’abord une organisation dans votre espace SATEER.");
            return;
        }
        ORGANISATION_ID = Number(organisation.id);

        erreurContainer.hidden =
            true;


        succesContainer.hidden =
            true;


        const intention = SOURCE === "MON_AMBASSADE" ? intentionInput.value : null;
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
            (SOURCE === "MON_AMBASSADE" && !["INFORMATION", "DEMARCHE", "INCERTAIN"].includes(intention)) ||
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

                                organisationId:
                                    ORGANISATION_ID,

                                tenantCode:
                                    contexte.tenantCode,

                                categorie:
                                    categorie,

                                objet:
                                    objet,

                                message:
                                    message,

                                priorite:
                                    "NORMALE",

                                canal:
                                    SOURCE,
                                ...(SOURCE === "MON_AMBASSADE" ? { intention } : {})
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

            afficherSucces(resultat.message || "Votre demande a bien été envoyée.");
            // A15 : accusé de réception avec numéro et liens de suivi. Le reset
            // visuel ne doit jamais laisser croire que la demande est remplacée.
            if (SOURCE === "MON_AMBASSADE") {
                const numero = Number(resultat.demande?.id);
                if (Number.isSafeInteger(numero) && numero > 0) {
                    succesContainer.textContent = "Demande n°" + numero + " enregistrée. " +
                        "Elle reste conservée lorsque vous créez une autre demande.";
                    const contexteLien = new URLSearchParams({
                        organisation: String(ORGANISATION_ID), tenant: String(contexte.tenantCode)
                    });
                    const suivi = document.createElement("a");
                    const q = new URLSearchParams(contexteLien);
                    q.set("demande", String(numero)); q.set("source", "MON_AMBASSADE");
                    suivi.href = "/demande-detail.html?" + q.toString();
                    suivi.textContent = "Voir la demande n°" + numero;
                    const autres = document.createElement("a");
                    autres.href = "/ambassade.html?" + contexteLien.toString() + "#ambassadeDemandesSection";
                    autres.textContent = "Voir toutes mes demandes";
                    const actions = document.createElement("div");
                    actions.className = "ambassade-demande-recu-actions";
                    actions.style.cssText = "display:flex;flex-wrap:wrap;gap:12px;margin-top:12px;font-weight:750";
                    actions.append(suivi, autres);
                    succesContainer.append(actions);
                }
            }

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