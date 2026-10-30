const PERSONNE_ID = 1;
const TENANT = "SN";


function iconeExperience(code) {

    switch (code) {

        case "MON_CONSULAT":
            return "🇸🇳";

        case "MON_AMBASSADE":
            return "🏛️";

        case "DIASPORA":
            return "🌍";

        default:
            return "◈";
    }
}


function descriptionExperience(code) {

    switch (code) {

        case "MON_CONSULAT":
            return "Démarches, informations et échanges avec votre Consulat.";

        case "MON_AMBASSADE":
            return "Informations nationales et services de votre Ambassade.";

        case "DIASPORA":
            return "Informations et opportunités pertinentes pour votre profil.";

        default:
            return "Accéder à votre espace SATEER.";
    }
}


function classeStatut(statut) {

    return (
        "status status-" +
        String(statut)
            .toLowerCase()
    );
}


function afficherExperiences(
    experiences
) {

    const container =
        document.getElementById(
            "experiencesContainer"
        );


    container.innerHTML = "";


    for (
        const experience
        of experiences
    ) {

        const card =
            document.createElement(
                "article"
            );


        card.className =
            "experience-card";


        card.innerHTML = `
            <div class="experience-icon">
                ${iconeExperience(experience.code)}
            </div>

            <h3>
                ${experience.nom}
            </h3>

            <p>
                ${descriptionExperience(experience.code)}
            </p>
        `;

if (
    experience.code ===
    "MON_CONSULAT"
) {

    card.addEventListener(
        "click",
        () => {

            window.location.href =
                "/consulat.html";
        }
    );
}
        container.appendChild(
            card
        );
    }
}


function afficherDemandes(
    demandes
) {

    const container =
        document.getElementById(
            "demandesContainer"
        );


    container.innerHTML = "";


    if (
        !demandes ||
        demandes.length === 0
    ) {

        container.innerHTML = `
            <div class="empty">
                Aucune demande récente.
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
                    ${demande.organisation || "Institution"}
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


function afficherNotifications(
    notifications
) {

    const container =
        document.getElementById(
            "notificationsContainer"
        );


    const badge =
        document.getElementById(
            "notificationBadge"
        );


    container.innerHTML = "";


    const nonLues =
        (
            notifications || []
        ).filter(
            notification =>
                notification.statut ===
                "NON_LUE"
        );


    if (
        nonLues.length > 0
    ) {

        badge.textContent =
            nonLues.length;

        badge.classList.remove(
            "hidden"
        );

    } else {

        badge.classList.add(
            "hidden"
        );
    }


    if (
        !notifications ||
        notifications.length === 0
    ) {

        container.innerHTML = `
            <div class="empty">
                Aucune notification.
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


async function chargerEspacesInstitutionnels() {
    const container = document.getElementById("experiencesContainer");
    if (!container) return;

    try {
        const response = await fetch(
            `/api/organisations/1/dashboards/acces?tenant=${TENANT}`,
            { credentials: "same-origin", cache: "no-store" }
        );
        if (!response.ok) return;

        const data = await response.json();
        const dashboards = data.dashboards || {};
        const espaces = [];

        if (dashboards.strategique) {
            espaces.push({
                titre: "Dashboard stratégique",
                description: "Pilotage institutionnel, résultats et vision globale du Consulat.",
                url: `/dashboard-consul.html?organisation=1&tenant=${TENANT}`,
                icone: "◆"
            });
        }

        if (dashboards.operationnel) {
            espaces.push({
                titre: "Dashboard opérationnel",
                description: "Suivi de l'activité, des unités et des opérations du Consulat.",
                url: `/dashboard-vice-consul.html?organisation=1&tenant=${TENANT}`,
                icone: "◈"
            });
        }

        espaces.forEach(espace => {
            const card = document.createElement("article");
            card.className = "experience-card";
            card.tabIndex = 0;
            card.setAttribute("role", "link");

            const icon = document.createElement("div");
            icon.className = "experience-icon";
            icon.textContent = espace.icone;

            const title = document.createElement("h3");
            title.textContent = espace.titre;

            const description = document.createElement("p");
            description.textContent = espace.description;

            card.append(icon, title, description);
            card.addEventListener("click", () => { window.location.href = espace.url; });
            card.addEventListener("keydown", event => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    window.location.href = espace.url;
                }
            });
            container.appendChild(card);
        });
    } catch (erreur) {
        console.error("Erreur chargement des espaces institutionnels :", erreur);
    }
}


async function chargerMonSateer() {

    try {

        const reponse =
            await fetch(
                `/api/mon-sateer/${PERSONNE_ID}?tenant=${TENANT}`
            );


        if (!reponse.ok) {

            throw new Error(
                "Impossible de charger Mon SATEER."
            );
        }


        const data =
            await reponse.json();


        const personne =
            data.personne;


        document.getElementById(
            "welcomeTitle"
        ).textContent =
            `Bonjour ${personne.prenom} 👋`;


        document.getElementById(
            "welcomeSubtitle"
        ).textContent =
            personne.territoire
                ? `Votre espace Sénégal • ${personne.territoire}`
                : "Votre espace Sénégal";


        afficherExperiences(
            data.experiences || []
        );

        // Les espaces institutionnels sont affichés selon les permissions effectives.
        await chargerEspacesInstitutionnels();

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


        document.getElementById(
            "welcomeSubtitle"
        ).textContent =
            "Impossible de charger votre espace.";
    }
}


chargerMonSateer();