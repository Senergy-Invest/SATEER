const params = new URLSearchParams(window.location.search);
let CONSULAT_ID = Number(params.get("organisation")) || null;


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
        String(
            statut || ""
        )
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


    container.innerHTML =
        "";


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


    container.innerHTML =
        "";


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
                "button"
            );


        item.type =
            "button";


        item.className =
            "list-item demande-list-button";


        const contenu =
            document.createElement(
                "div"
            );


        contenu.className =
            "list-main";


        const titre =
            document.createElement(
                "p"
            );


        titre.className =
            "list-title";


        titre.textContent =
            demande.objet;


        const sousTitre =
            document.createElement(
                "p"
            );


        sousTitre.className =
            "list-subtitle";


        sousTitre.textContent =
            demande.categorie;


        contenu.appendChild(
            titre
        );


        contenu.appendChild(
            sousTitre
        );


        const statut =
            document.createElement(
                "span"
            );


        statut.className =
            classeStatut(
                demande.statut
            );


        statut.textContent =
            demande.statut;


        item.appendChild(
            contenu
        );


        item.appendChild(
            statut
        );


        item.addEventListener(
            "click",
            () => {

                window.location.href =
                    `/demande-detail.html?demande=${demande.id}&organisation=${CONSULAT_ID}&source=MON_CONSULAT`;
            }
        );


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


    container.innerHTML =
        "";


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
// BOUTON NOUVELLE DEMANDE
// =========================================================

const nouvelleDemandeButton =
    document.getElementById(
        "nouvelleDemandeButton"
    );


if (
    nouvelleDemandeButton
) {

    nouvelleDemandeButton.addEventListener(
        "click",
        async () => {
            const contexte = await window.SATEER_CONTEXT_READY;
            const organisation = await window.SATEER_choisirOrganisation(CONSULAT_ID, "CONSULAT");
            if (!organisation) return;
            CONSULAT_ID = Number(organisation.id);
            window.location.href =
                `/demande.html?organisation=${CONSULAT_ID}&tenant=${encodeURIComponent(contexte.tenantCode)}&source=MON_CONSULAT`;
        }
    );
}


// =========================================================
// BOUTON MES DÉMARCHES
// =========================================================

const mesDemarchesButton =
    document.getElementById(
        "mesDemarchesButton"
    );


if (
    mesDemarchesButton
) {

    mesDemarchesButton.addEventListener(
        "click",
        () => {

            const sectionDemandes =
                document.getElementById(
                    "demandesConsulatContainer"
                );


            if (
                sectionDemandes
            ) {

                sectionDemandes.scrollIntoView({
                    behavior:
                        "smooth",

                    block:
                        "center"
                });
            }
        }
    );
}


// =========================================================
// CHARGEMENT MON CONSULAT
// =========================================================

async function chargerMonConsulat() {

    try {
        const contexte = await window.SATEER_CONTEXT_READY;
        const organisation = await window.SATEER_choisirOrganisation(CONSULAT_ID, "CONSULAT");
        if (!organisation) {
            document.getElementById("consulatName").textContent =
                "Sélectionnez un rattachement consulaire dans votre espace SATEER.";
            return;
        }
        CONSULAT_ID = Number(organisation.id);
        const url = new URL(window.location.href);
        url.searchParams.set("organisation", String(CONSULAT_ID));
        url.searchParams.set("tenant", contexte.tenantCode);
        window.history.replaceState({}, "", url);

        const reponse =
            await fetch(
                `/api/mon-consulat/${contexte.personne.id}?tenant=${encodeURIComponent(contexte.tenantCode)}&organisation=${CONSULAT_ID}`,
                { credentials: "same-origin", cache: "no-store" }
            );


        if (
            !reponse.ok
        ) {

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
// INITIALISATION
// =========================================================

chargerMonConsulat();