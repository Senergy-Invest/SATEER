


// =========================================================
// PARAMÈTRES URL
// =========================================================

const params =
    new URLSearchParams(
        window.location.search
    );


let ORGANISATION_ID = Number(params.get("organisation")) || null;


const USE_CASE =
    params.get("useCase") ||
    "CITIZEN_ASSISTANT";


const SOURCE =
    params.get("source") ||
    "SATEER";


// =========================================================
// ÉLÉMENTS DOM
// =========================================================

const conversation =
    document.getElementById(
        "assistantConversation"
    );


const form =
    document.getElementById(
        "assistantForm"
    );


const input =
    document.getElementById(
        "assistantInput"
    );


const newConversationButton =
    document.getElementById(
        "newConversationButton"
    );


const assistantTitle =
    document.getElementById(
        "assistantTitle"
    );


const assistantName =
    document.getElementById(
        "assistantName"
    );


const assistantContextLabel =
    document.getElementById(
        "assistantContextLabel"
    );


const assistantDescription =
    document.getElementById(
        "assistantDescription"
    );


// =========================================================
// CONFIGURATION CONTEXTE
// =========================================================

function configurerAssistant() {

    if (
        USE_CASE ===
        "CITIZEN_ASSISTANT"
    ) {

        assistantTitle.textContent =
            "Assistant citoyen";


        assistantName.textContent =
            "Assistant citoyen SATEER";


        assistantDescription.textContent =
            "Réponses basées sur des informations institutionnelles validées.";
    }


    if (
        SOURCE ===
        "MON_CONSULAT"
    ) {

        assistantContextLabel.textContent =
            "MON CONSULAT";
    }


    else if (
        SOURCE ===
        "MON_AMBASSADE"
    ) {

        assistantContextLabel.textContent =
            "MON AMBASSADE";
    }


    else {

        assistantContextLabel.textContent =
            "SATEER";
    }
}


// =========================================================
// MESSAGE INITIAL
// =========================================================

function afficherMessageInitial() {

    conversation.innerHTML =
        "";


    const message =
        document.createElement(
            "div"
        );


    message.className =
        "message message-ai";


    message.innerHTML = `
        <div>
            Bonjour Fatou 👋
        </div>

        <div>
            Posez-moi une question.
        </div>
    `;


    conversation.appendChild(
        message
    );
}


// =========================================================
// RETOUR
// =========================================================

document
    .getElementById(
        "backButton"
    )
    .addEventListener(
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
// NOUVELLE CONVERSATION
// =========================================================

newConversationButton.addEventListener(
    "click",
    () => {

        afficherMessageInitial();


        input.value =
            "";


        input.focus();
    }
);


// =========================================================
// AJOUTER MESSAGE
// =========================================================

function ajouterMessage(
    contenu,
    type,
    sources = []
) {

    const message =
        document.createElement(
            "div"
        );


    message.className =
        type === "user"
            ? "message message-user"
            : "message message-ai";


    const texte =
        document.createElement(
            "div"
        );


    texte.textContent =
        contenu;


    message.appendChild(
        texte
    );


    if (
        type === "ai" &&
        sources.length > 0
    ) {

        const sourceContainer =
            document.createElement(
                "div"
            );


        sourceContainer.className =
            "message-source";


        const titre =
            document.createElement(
                "strong"
            );


        titre.textContent =
            "Source institutionnelle :";


        sourceContainer.appendChild(
            titre
        );


        for (
            const source
            of sources
        ) {

            const ligne =
                document.createElement(
                    "div"
                );


            ligne.textContent =
                source.titre +
                " — " +
                source.source;


            sourceContainer.appendChild(
                ligne
            );
        }


        message.appendChild(
            sourceContainer
        );
    }


    conversation.appendChild(
        message
    );


    conversation.scrollTop =
        conversation.scrollHeight;
}


// =========================================================
// ENVOI QUESTION
// =========================================================

form.addEventListener(
    "submit",
    async event => {

        event.preventDefault();

        const contexte = await window.SATEER_CONTEXT_READY;
        const organisation = await window.SATEER_choisirOrganisation(ORGANISATION_ID);
        if (!organisation) {
            ajouterMessage("Sélectionnez une organisation rattachée à votre compte pour utiliser cet assistant.", "ai");
            return;
        }
        ORGANISATION_ID = Number(organisation.id);

        const question =
            input.value.trim();


        if (!question) {

            return;
        }


        ajouterMessage(
            question,
            "user"
        );


        input.value =
            "";


        input.disabled =
            true;


        const attente =
            document.createElement(
                "div"
            );


        attente.className =
            "message message-ai";


        attente.textContent =
            "Je recherche les informations autorisées...";


        conversation.appendChild(
            attente
        );


        conversation.scrollTop =
            conversation.scrollHeight;


        try {

            const reponse =
                await fetch(
                    "/api/assistant/message",
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

                                useCase:
                                    USE_CASE,

                                question:
                                    question
                            })
                    }
                );


            if (!reponse.ok) {

                throw new Error(
                    "Erreur Assistant SATEER."
                );
            }


            const resultat =
                await reponse.json();


            attente.remove();


            ajouterMessage(
                resultat.reponse ||
                "Je ne peux pas répondre à cette question pour le moment.",
                "ai",
                resultat.sources || []
            );


            if (
                resultat.statut ===
                "ESCALADE_HUMAINE"
            ) {

                ajouterMessage(
                    "Un agent peut prendre le relais si nécessaire.",
                    "ai"
                );
            }


        } catch (erreur) {

            console.error(
                erreur
            );


            attente.remove();


            ajouterMessage(
                "Une erreur est survenue. Veuillez réessayer.",
                "ai"
            );

        } finally {

            input.disabled =
                false;


            input.focus();
        }
    }
);


// =========================================================
// INITIALISATION
// =========================================================

configurerAssistant();

afficherMessageInitial();