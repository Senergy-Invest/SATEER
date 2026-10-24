const PERSONNE_ID = 1;
const TENANT = "SN";
const CONSULAT_ID = 1;


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

            window.location.href =
                "/";
        }
    );


// =========================================================
// STATUT
// =========================================================

function classeStatut(
    statut
) {

    return (
        "status status-" +
        String(statut)
            .toLowerCase()
    );
}


// =========================================================
// PUBLICATIONS
// =========================================================

function afficherPublications(
    publications
) {

    const container =
        document.getElementById(
            "publicationsContainer"
        );


    container.innerHTML = "";


    if (
        !publications ||
        publications.length === 0
    ) {

        container.innerHTML = `
            <div class="empty">
                Aucune information officielle disponible.
            </div>
        `;

        return;
    }


    for (
        const publication
        of publications
    ) {

        const item =
            document.createElement(
                "article"
            );


        item.className =
            "publication-card";


        item.innerHTML = `

            <div class="publication-top">

                <span class="publication-category">
                    ${publication.categorie}
                </span>

                <span class="publication-priority">
                    ${publication.priorite}
                </span>

            </div>


            <h3>
                ${publication.titre}
            </h3>


            <p>
                ${publication.contenu}
            </p>


            <div class="publication-footer">

                <span>
                    🇸🇳 Information officielle
                </span>

            </div>
        `;


        container.appendChild(
            item
        );
    }
}


// =========================================================
// DEMANDES
// =========================================================

function afficherDemandes(
    demandes
) {

    const container =
        document.getElementById(
            "demandesConsulatContainer"
        );


    container.innerHTML = "";


    if (
        !demandes ||
        demandes.length === 0
    ) {

        container.innerHTML = `
            <div class="empty">
                Vous n'avez aucune demande.
            </div>
        `;

        return;
    }


    for (
        const demande
        of demandes
    ) {

        const item =
            document.createElement(
                "div"
            );


        item.className =
            "list-item";


        item.innerHTML = `

            <div class="list-main">

                <p class="list-title">
                    ${demande.objet}
                </p>

                <p class="list-subtitle">
                    ${demande.categorie}
                </p>

            </div>


            <span
                class="${classeStatut(demande.statut)}"
            >
                ${demande.statut}
            </span>
        `;


        container.appendChild(
            item
        );
    }
}


// =========================================================
// NOTIFICATIONS
// =========================================================

function afficherNotifications(
    notifications
) {

    const container =
        document.getElementById(
            "notificationsConsulatContainer"
        );


    container.innerHTML = "";


    if (
        !notifications ||
        notifications.length === 0
    ) {

        container.innerHTML = `
            <div class="empty">
                Aucune notification du Consulat.
            </div>
        `;

        return;
    }


    for (
        const notification
        of notifications
    ) {

        const item =
            document.createElement(
                "div"
            );


        item.className =
            "notification";


        item.innerHTML = `

            <div class="notification-icon">
                🔔
            </div>


            <div>

                <p class="notification-title">
                    ${notification.titre}
                </p>

                <p class="notification-message">
                    ${notification.message}
                </p>

            </div>
        `;


        container.appendChild(
            item
        );
    }
}


// =========================================================
// ASSISTANT CITOYEN
// =========================================================

const assistantPanel =
    document.getElementById(
        "assistantPanel"
    );


const assistantButton =
    document.getElementById(
        "assistantCitoyenButton"
    );


const assistantCloseButton =
    document.getElementById(
        "assistantCloseButton"
    );


const assistantForm =
    document.getElementById(
        "assistantForm"
    );


const assistantInput =
    document.getElementById(
        "assistantInput"
    );


const assistantConversation =
    document.getElementById(
        "assistantConversation"
    );


// =========================================================
// OUVRIR ASSISTANT
// =========================================================

assistantButton.addEventListener(
    "click",
    () => {

        assistantPanel.classList.remove(
            "hidden"
        );


        assistantInput.focus();


        assistantPanel.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }
);


// =========================================================
// FERMER ASSISTANT
// =========================================================

assistantCloseButton.addEventListener(
    "click",
    () => {

        assistantPanel.classList.add(
            "hidden"
        );
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


    // =====================================================
    // SOURCES INSTITUTIONNELLES
    // =====================================================

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


        const titreSource =
            document.createElement(
                "strong"
            );


        titreSource.textContent =
            "Source institutionnelle :";


        sourceContainer.appendChild(
            titreSource
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


    assistantConversation.appendChild(
        message
    );


    assistantConversation.scrollTop =
        assistantConversation.scrollHeight;
}


// =========================================================
// ENVOYER QUESTION
// =========================================================

assistantForm.addEventListener(
    "submit",
    async event => {

        event.preventDefault();


        const question =
            assistantInput.value.trim();


        if (!question) {

            return;
        }


        // =================================================
        // AFFICHAGE QUESTION FATOU
        // =================================================

        ajouterMessage(
            question,
            "user"
        );


        assistantInput.value =
            "";


        assistantInput.disabled =
            true;


        // =================================================
        // MESSAGE D'ATTENTE
        // =================================================

        const messageAttente =
            document.createElement(
                "div"
            );


        messageAttente.className =
            "message message-ai";


        messageAttente.textContent =
            "Je recherche dans les informations officielles du Consulat...";


        assistantConversation.appendChild(
            messageAttente
        );


        assistantConversation.scrollTop =
            assistantConversation.scrollHeight;


        try {

            // =================================================
            // APPEL API IA CITOYEN
            // =================================================

            const reponse =
                await fetch(
                    "/api/ia-citoyen",
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
                                    CONSULAT_ID,

                                tenantCode:
                                    TENANT,

                                question:
                                    question
                            })
                    }
                );


            if (!reponse.ok) {

                throw new Error(
                    "Erreur lors de l'appel à l'assistant citoyen."
                );
            }


            const resultat =
                await reponse.json();


            messageAttente.remove();


            // =================================================
            // REPONSE AUTORISEE
            // =================================================

            if (
                resultat.statut ===
                "REPONSE_AUTORISEE"
            ) {

                ajouterMessage(
                    resultat.reponse,
                    "ai",
                    resultat.sources || []
                );

            }

            // =================================================
            // ESCALADE HUMAINE
            // =================================================

            else if (
                resultat.statut ===
                "ESCALADE_HUMAINE"
            ) {

                ajouterMessage(
                    resultat.reponse,
                    "ai"
                );


                const messageEscalade =
                    document.createElement(
                        "div"
                    );


                messageEscalade.className =
                    "message message-ai";


                messageEscalade.innerHTML = `
                    <strong>
                        Un agent du Consulat peut prendre le relais.
                    </strong>
                `;


                assistantConversation.appendChild(
                    messageEscalade
                );

            }

            // =================================================
            // AUTRE CAS
            // =================================================

            else {

                ajouterMessage(
                    resultat.reponse ||
                    "Je ne peux pas répondre à cette question pour le moment.",
                    "ai"
                );
            }


        } catch (erreur) {

            console.error(
                erreur
            );


            messageAttente.remove();


            ajouterMessage(
                "Une erreur est survenue. Vous pouvez contacter directement le Consulat.",
                "ai"
            );

        } finally {

            assistantInput.disabled =
                false;


            assistantInput.focus();
        }
    }
);


// =========================================================
// CHARGEMENT MON CONSULAT
// =========================================================

async function chargerMonConsulat() {

    try {

        const reponse =
            await fetch(
                `/api/mon-consulat/${PERSONNE_ID}?tenant=${TENANT}&organisation=${CONSULAT_ID}`
            );


        if (!reponse.ok) {

            throw new Error(
                "Impossible de charger Mon Consulat."
            );
        }


        const data =
            await reponse.json();


        document
            .getElementById(
                "consulatName"
            )
            .textContent =
                data.organisation.nom;


        afficherPublications(
            data.publications || []
        );


        afficherDemandes(
            data.demandes || []
        );


        afficherNotifications(
            data.notifications || []
        );


    } catch (erreur) {

        console.error(
            erreur
        );


        document
            .getElementById(
                "consulatName"
            )
            .textContent =
                "Mon Consulat indisponible";
    }
}


// =========================================================
// DÉMARRAGE PAGE
// =========================================================

chargerMonConsulat();