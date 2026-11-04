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

let publicationsConsulat = [];
function afficherPublications(publications) {
    const container = document.getElementById("publicationsContainer");
    const filtre = document.getElementById("filtreCanalConsulat");
    publicationsConsulat = Array.isArray(publications) ? publications : [];
    const choixPrecedent = filtre.value;
    filtre.replaceChildren();
    filtre.add(new Option("Toutes les informations", ""));
    const canaux = new Map();
    for (const p of publicationsConsulat) {
        if (p.communication_channel_id != null) {
            canaux.set(String(p.communication_channel_id), p.communication_channel_nom || "Canal " + p.communication_channel_id);
        }
    }
    for (const [id, nom] of [...canaux].sort((a,b) => a[1].localeCompare(b[1]))) filtre.add(new Option(nom, id));
    if ([...filtre.options].some(o => o.value === choixPrecedent)) filtre.value = choixPrecedent;
    afficherPublicationsFiltrees();
}
function afficherPublicationsFiltrees() {
    const container = document.getElementById("publicationsContainer");
    const filtre = document.getElementById("filtreCanalConsulat").value;
    const liste = publicationsConsulat.filter(p => !filtre || String(p.communication_channel_id) === filtre);
    container.replaceChildren();
    if (!liste.length) {
        const vide = document.createElement("div");
        vide.className = "empty";
        vide.textContent = "Aucune information officielle disponible pour ce filtre.";
        container.appendChild(vide);
        return;
    }
    for (const pub of liste) {
        const item = document.createElement("article");
        item.className = "publication-card";
        const top = document.createElement("div");
        top.className = "publication-top";
        for (const [cls, valeur] of [["publication-category", pub.categorie], ["publication-priority", pub.priorite]]) {
            const badge = document.createElement("span");
            badge.className = cls;
            badge.textContent = valeur || "";
            top.appendChild(badge);
        }
        const titre = document.createElement("h3");
        titre.textContent = pub.titre || "";
        const contenu = document.createElement("p");
        contenu.textContent = pub.contenu || "";
        const pied = document.createElement("div");
        pied.className = "publication-footer";
        pied.textContent = "🇸🇳 Information officielle" + (pub.communication_channel_nom ? " · " + pub.communication_channel_nom : " · Informations générales");
        item.append(top, titre, contenu);
        const medias = Array.isArray(pub.medias) ? pub.medias : [];
        for (const m of medias) {
            if (m.type === "IMAGE" && typeof m.url === "string" && m.url.startsWith("/api/organisations/")) {
                const img = document.createElement("img");
                img.src = m.url; img.alt = "Illustration de la publication";
                img.loading = "lazy"; img.style.cssText="max-width:100%;max-height:340px;object-fit:contain;border-radius:12px;margin:12px 0";
                item.appendChild(img);
            } else if (m.type === "DOCUMENT" && typeof m.url === "string" && m.url.startsWith("/api/organisations/")) {
                const link = document.createElement("a");
                link.href=m.url;link.textContent="Consulter le document PDF";link.target="_blank";link.rel="noopener noreferrer";
                item.appendChild(link);
            } else if (m.type === "LIEN" && typeof m.url === "string") {
                try {
                    const u=new URL(m.url);
                    if (u.protocol !== "https:" || !["youtube.com","www.youtube.com","youtu.be","www.youtu.be","facebook.com","www.facebook.com","instagram.com","www.instagram.com","tiktok.com","www.tiktok.com"].includes(u.hostname)) continue;
                    const link=document.createElement("a");
                    link.href=u.href;link.textContent="Voir la vidéo ou la publication sur " + u.hostname;
                    link.target="_blank";link.rel="noopener noreferrer";
                    item.appendChild(link);
                } catch (_) {}
            }
        }
        item.appendChild(pied);
        container.appendChild(item);
    }
}
document.getElementById("filtreCanalConsulat").addEventListener("change", afficherPublicationsFiltrees);


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