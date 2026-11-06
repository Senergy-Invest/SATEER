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
const libellesCategoriePublication = { INFORMATION: "Information", ANNONCE: "Annonce", COMMUNIQUE: "Communiqué", ALERTE: "Alerte" };
const libellesPrioritePublication = { NORMALE: "Normale", HAUTE: "Importante", URGENTE: "Urgente" };
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
        item.id = `publication-${pub.id}`;
        const top = document.createElement("div");
        top.className = "publication-top";
        for (const [cls, valeur] of [["publication-category", libellesCategoriePublication[pub.categorie] || "Information"], ["publication-priority", libellesPrioritePublication[pub.priorite] || "Normale"]]) {
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
    if (window.location.hash.startsWith("#publication-")) {
        requestAnimationFrame(() => document.getElementById(decodeURIComponent(window.location.hash.slice(1)))?.scrollIntoView({ block: "start" }));
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

                // Le tenant doit accompagner le lien : sinon /api/context
                // renvoie tenantCode=null et le detail est refuse a tort.
                const destination = new URL("/demande-detail.html", window.location.origin);
                const tenant = new URLSearchParams(window.location.search).get("tenant")
                    || window.SATEER_CONTEXT?.tenantCode;
                if (!tenant) {
                    console.error("SATEER: contexte tenant absent pour le detail de demande.");
                    return;
                }
                destination.searchParams.set("demande", String(demande.id));
                destination.searchParams.set("organisation", String(CONSULAT_ID));
                destination.searchParams.set("tenant", tenant);
                destination.searchParams.set("source", "MON_CONSULAT");
                window.location.href = destination.pathname + destination.search;
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


    container.replaceChildren();


    if (
        !notifications ||
        notifications.length === 0
    ) {

        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "Aucune notification du Consulat.";
        container.appendChild(empty);

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


        const icon = document.createElement("div");
        icon.className = "notification-icon";
        icon.textContent = "🔔";
        const content = document.createElement("div");
        const title = document.createElement("p");
        title.className = "notification-title";
        title.textContent = notification.titre || "Notification";
        const message = document.createElement("p");
        message.className = "notification-message";
        message.textContent = notification.message || "";
        content.append(title, message);
        if (notification.type === "PUBLICATION_CANAL" && notification.reference_type === "PUBLICATION" && Number.isSafeInteger(Number(notification.reference_id)) && Number(notification.reference_id) > 0) {
            const link = document.createElement("a");
            const target = new URL("/consulat.html", window.location.origin);
            target.searchParams.set("organisation", String(CONSULAT_ID));
            const tenant = new URLSearchParams(window.location.search).get("tenant");
            if (tenant) target.searchParams.set("tenant", tenant);
            target.hash = `publication-${Number(notification.reference_id)}`;
            link.href = target.pathname + target.search + target.hash;
            link.textContent = "Ouvrir l'information →";
            content.appendChild(link);
        }
        item.append(icon, content);


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

        const manageChannels = document.getElementById("manageChannelsLink");
        if (manageChannels) {
            const target = new URL("/mes-canaux.html", window.location.origin);
            target.searchParams.set("organisation", String(CONSULAT_ID));
            target.searchParams.set("tenant", contexte.tenantCode);
            manageChannels.href = target.pathname + target.search;
        }


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
