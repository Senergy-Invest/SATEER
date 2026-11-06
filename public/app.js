/* Lot 1O — Accueil personnel citoyen : uniquement des résumés.
 * Les informations complètes, demandes et communications restent dans Mon Consulat.
 * Les API métier existantes et la vérification d'audience côté serveur sont conservées.
 */
"use strict";

function element(tag, classe, texte) {
    const noeud = document.createElement(tag);
    if (classe) noeud.className = classe;
    if (texte !== undefined && texte !== null) noeud.textContent = String(texte);
    return noeud;
}

function lienVers(path, organisationId, tenantCode) {
    const params = new URLSearchParams({
        organisation: String(organisationId),
        tenant: String(tenantCode)
    });
    return `${path}?${params.toString()}`;
}

function resumeStatutDemandes(demandes) {
    const toutes = Array.isArray(demandes) ? demandes : [];
    const traitees = new Set(["TRAITEE", "TRAITÉE", "CLOTUREE", "CLOTURÉE", "ANNULEE", "ANNULÉE"]);
    return {
        total: toutes.length,
        enCours: toutes.filter(d => !traitees.has(String(d.statut || "").toUpperCase())).length
    };
}

function carteConsulat(organisation, tenantCode) {
    const carte = element("article", "sx-consulat-card");
    carte.setAttribute("aria-label", `Résumé de ${organisation.nom || "votre Consulat"}`);

    const tete = element("div", "sx-card-top");
    const pictogramme = element("div", "sx-consulat-icon", "🇸🇳");
    pictogramme.setAttribute("aria-hidden", "true");
    const info = element("div", "sx-card-heading");
    info.append(element("p", "sx-card-kicker", "EXPÉRIENCE INSTITUTIONNELLE"));
    info.append(element("h3", "sx-card-title", "Mon Consulat"));
    info.append(element("p", "sx-card-subtitle", organisation.nom || "Consulat"));
    tete.append(pictogramme, info);

    const description = element("p", "sx-card-description",
        "Vos informations officielles, démarches, demandes et échanges consulaires dans un seul espace.");
    const resume = element("div", "sx-consulat-summary");
    resume.setAttribute("aria-live", "polite");
    resume.append(element("p", "sx-summary-loading", "Chargement du résumé consulaire…"));

    const aller = element("a", "sx-open-consulat", "Ouvrir Mon Consulat");
    aller.href = lienVers("/consulat.html", organisation.id, tenantCode);
    aller.append(element("span", "sx-link-arrow", "→"));

    carte.append(tete, description, resume, aller);
    return { carte, resume };
}

function afficherResumeConsulat(container, data) {
    container.replaceChildren();
    const publications = Array.isArray(data.publications) ? data.publications : [];
    const demandes = resumeStatutDemandes(data.demandes);
    const chiffres = element("div", "sx-summary-metrics");
    const information = element("div", "sx-summary-metric");
    information.append(element("strong", "", publications.length));
    information.append(element("span", "", "Informations disponibles"));
    const suivi = element("div", "sx-summary-metric");
    suivi.append(element("strong", "", demandes.enCours));
    suivi.append(element("span", "", "Demandes à suivre"));
    chiffres.append(information, suivi);
    container.append(chiffres);

    const actualites = element("div", "sx-recent-news");
    actualites.append(element("h4", "", "À la une du Consulat"));
    if (!publications.length) {
        actualites.append(element("p", "sx-summary-empty", "Aucune information officielle accessible à votre profil pour le moment."));
    } else {
        // L'API renvoie exclusivement les publications visibles par ce compte.
        const visibles = [...publications].sort((a, b) => {
            const da = Date.parse(a.date_publication || "") || 0;
            const db = Date.parse(b.date_publication || "") || 0;
            return db - da || Number(b.id || 0) - Number(a.id || 0);
        });
        for (const publication of visibles.slice(0, 3)) {
            const ligne = element("p", "sx-news-line");
            ligne.append(element("span", "sx-news-dot", "•"));
            ligne.append(element("span", "", publication.titre || "Information officielle"));
            actualites.append(ligne);
        }
    }
    container.append(actualites);
    container.append(element("p", "sx-summary-footnote", "Aucun abonnement nécessaire. Retrouvez le contenu complet dans Mon Consulat."));
}

async function chargerApercuConsulat({ organisation, tenantCode, personneId, resume }) {
    try {
        const url = `/api/mon-consulat/${encodeURIComponent(personneId)}?` +
            new URLSearchParams({ tenant: String(tenantCode), organisation: String(organisation.id) });
        const reponse = await fetch(url, { credentials: "same-origin", cache: "no-store" });
        if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
        const donnees = await reponse.json();
        afficherResumeConsulat(resume, donnees);
        return Array.isArray(donnees.publications) ? donnees.publications.map(p => ({...p, issuer_id:organisation.id})) : [];
    } catch (erreur) {
        console.warn("Résumé consulaire indisponible :", erreur);
        resume.replaceChildren(element("p", "sx-summary-empty",
            "Résumé indisponible momentanément. Ouvrez Mon Consulat pour accéder à vos services."));
        return [];
    }
}

async function afficherRelaisAssociatifs(organisations, tenantCode, publicationsDirectes) {
    const section = document.getElementById("associationRelaysSection");
    const container = document.getElementById("associationRelaysContainer");
    if (!section || !container) return;
    const directs = new Set(publicationsDirectes.map(p => `${p.issuer_id || p.organisation_id || ""}:${p.id}`));
    const seen = new Set();
    for (const association of organisations.filter(o => o.type === "ASSOCIATION" && o.id != null)) {
        const tenant = association.tenant_code || tenantCode;
        if (!tenant) continue;
        try {
            const response = await fetch(`/api/organisations/${encodeURIComponent(association.id)}/association-relays?tenant=${encodeURIComponent(tenant)}`, {credentials:"same-origin",cache:"no-store"});
            if (!response.ok) continue;
            const data = await response.json();
            for (const relay of data.relais || []) {
                const key = `${relay.source_organisation_id}:${relay.publication_id}`;
                if (directs.has(key) || seen.has(key)) continue;
                seen.add(key);
                const card = element("article", "sx-consulat-card");
                card.append(element("p", "sx-card-kicker", "RELAIS ASSOCIATIF · CONTENU OFFICIEL"));
                card.append(element("h3", "sx-card-title", relay.titre || "Information officielle"));
                card.append(element("p", "sx-card-subtitle", `Source officielle : ${relay.issuer_name} · ${[relay.original_author_first_name, relay.original_author_last_name].filter(Boolean).join(" ") || "Auteur institutionnel"}`));
                card.append(element("p", "sx-card-description", relay.contenu || ""));
                card.append(element("p", "sx-summary-footnote", `Relayée par ${association.nom} · ${[relay.relay_author_first_name, relay.relay_author_last_name].filter(Boolean).join(" ") || "responsable associatif"}${relay.date_relais ? ` · ${new Date(relay.date_relais).toLocaleString()}` : ""}`));
                if (relay.association_comment) card.append(element("p", "sx-summary-footnote", `Commentaire de l’association : ${relay.association_comment}`));
                container.append(card);
            }
        } catch (error) { console.warn("Relais associatifs indisponibles :", error); }
    }
    section.hidden = !container.children.length;
}

function afficherIdentite(personne, organisations) {
    const prenom = String(personne.prenom || "").trim();
    const nom = String(personne.nom || "").trim();
    document.getElementById("welcomeTitle").textContent = prenom ? `Bonjour ${prenom} 👋` : "Bienvenue sur Mon SATEER";
    document.getElementById("welcomeSubtitle").textContent =
        "Votre accueil personnel : une identité, vos expériences et vos notifications.";
    const avatar = document.getElementById("accountAvatar");
    if (avatar) avatar.textContent = (prenom || nom || "S").charAt(0).toUpperCase();
    const identite = document.getElementById("identitySummary");
    identite.replaceChildren();
    const nomComplet = [prenom, nom].filter(Boolean).join(" ");
    if (nomComplet) identite.append(element("span", "sx-identity-chip", `Compte : ${nomComplet}`));
    const consuls = organisations.filter(o => o.type === "CONSULAT");
    if (consuls.length) {
        identite.append(element("span", "sx-identity-chip", `${consuls.length} rattachement${consuls.length > 1 ? "s" : ""} consulaire${consuls.length > 1 ? "s" : ""}`));
    }
}

function afficherNotifications(notifications) {
    const cible = document.getElementById("notificationsContainer");
    const badge = document.getElementById("notificationBadge");
    const items = Array.isArray(notifications) ? notifications : [];
    const nonLues = items.filter(n => n.statut === "NON_LUE").length;
    badge.textContent = String(nonLues);
    badge.classList.toggle("hidden", nonLues === 0);
    cible.replaceChildren();
    if (!items.length) {
        cible.append(element("div", "sx-notification-empty", "Aucune notification pour le moment."));
        return;
    }
    for (const notification of items.slice(0, 5)) {
        const item = element("article", "sx-notification-item");
        const texte = element("div", "sx-notification-text");
        texte.append(element("strong", "", notification.titre || "Notification"));
        texte.append(element("p", "", notification.message || ""));
        if (notification.organisation) texte.append(element("small", "", notification.organisation));
        if (notification.type === "PUBLICATION_CANAL" && notification.reference_type === "PUBLICATION"
            && Number.isSafeInteger(Number(notification.organisation_id))
            && Number.isSafeInteger(Number(notification.reference_id)) && notification.tenant_code) {
            const link = element("a", "", "Ouvrir l'information →");
            const destination = new URL("/communication-recue.html", window.location.origin);
            destination.searchParams.set("organisation", String(notification.organisation_id));
            destination.searchParams.set("tenant", notification.tenant_code);
            destination.hash = `publication-${Number(notification.reference_id)}`;
            link.href = destination.pathname + destination.search + destination.hash;
            texte.append(link);
        }
        item.append(element("span", "sx-notification-symbol", "🔔"), texte);
        cible.append(item);
    }
}

async function afficherAccesProfessionnels(contexte) {
    const section = document.getElementById("professionnelsSection");
    const container = document.getElementById("professionnelsContainer");
    if (!section || !container) return;
    container.replaceChildren();
    let nbAssociations = 0;
    let nbFonctions = 0;
    const orgs = Array.isArray(contexte.organisations) ? contexte.organisations : [];
    for (const org of orgs) {
        const tenant = org.tenant_code || contexte.tenantCode;
        if (!tenant || org.id == null) continue;
        if (org.type === "ASSOCIATION") {
            const associationLink = element("a", "sx-professional-card");
            associationLink.href = lienVers("/association-communications.html", org.id, tenant);
            associationLink.append(element("strong", "", "Communications de l’association"));
            associationLink.append(element("span", "", `${org.nom || "Association"} · Canaux, communications et relais autorisés`));
            associationLink.append(element("span", "sx-professional-arrow", "Ouvrir →"));
            container.append(associationLink);
            nbAssociations += 1;
        }

        let dashboards = {};
        try {
            const response = await fetch(
                `/api/organisations/${encodeURIComponent(org.id)}/dashboards/acces?tenant=${encodeURIComponent(tenant)}`,
                { credentials: "same-origin", cache: "no-store" }
            );
            if (response.ok) {
                const data = await response.json();
                dashboards = data.dashboards || {};
            }
        } catch (erreur) {
            console.warn("Accès dashboards indisponibles :", erreur);
        }

        for (const [autorise, titre, path, explication] of [
            [dashboards.operationnel, "Pilotage opérationnel", "/dashboard-vice-consul.html", "Superviser les services et les demandes"],
            [dashboards.strategique, "Pilotage stratégique", "/dashboard-consul.html", "Suivre l'activité générale de la mission"]
        ]) {
            if (!autorise) continue;
            const a = element("a", "sx-professional-card");
            a.href = lienVers(path, org.id, tenant);
            a.append(element("strong", "", titre));
            a.append(element("span", "", `${org.nom || "Organisation"} · ${explication}`));
            a.append(element("span", "sx-professional-arrow", "Ouvrir →"));
            container.append(a);
            nbFonctions += 1;
        }

        // Les agents ont des droits UNIT, distincts des droits de pilotage.
        // Seule l'API, déjà filtrée par les permissions effectives de la session,
        // décide des bureaux que cet utilisateur peut ouvrir.
        // Les dashboards disposent déjà de leur navigation vers les unités.
        if (org.type === "CONSULAT" && !dashboards.operationnel && !dashboards.strategique) {
            try {
                const response = await fetch(
                    `/api/organisations/${encodeURIComponent(org.id)}/units/overview?tenant=${encodeURIComponent(tenant)}`,
                    { credentials: "same-origin", cache: "no-store" }
                );
                if (response.ok) {
                    const data = await response.json();
                    const unites = Array.isArray(data.unites) ? data.unites : [];
                    for (const unite of unites) {
                        const uniteId = Number(unite.id);
                        if (!unite.canOpenWorkspace || !Number.isSafeInteger(uniteId) || uniteId <= 0
                            || Number(unite.organisation_id) !== Number(org.id)) continue;
                        const params = new URLSearchParams({
                            organisation: String(org.id), unit: String(uniteId), tenant: String(tenant)
                        });
                        const lien = element("a", "sx-professional-card");
                        lien.href = `/unit-workspace.html?${params.toString()}`;
                        lien.append(element("strong", "", `Mon bureau · ${unite.nom || "Unité"}`));
                        lien.append(element("span", "", `${org.nom || "Consulat"} · Consulter et traiter les dossiers autorisés`));
                        lien.append(element("span", "sx-professional-arrow", "Ouvrir →"));
                        container.append(lien);
                        nbFonctions += 1;
                    }
                }
            } catch (erreur) {
                console.warn("Bureaux professionnels indisponibles :", erreur);
            }
        }

        // Le réseau associatif est une fonction professionnelle distincte du
        // dashboard opérationnel. Ne jamais déduire le droit à partir d'un
        // titre de fonction, d'un rôle supposé ou du simple rattachement.
        // L'API applique MANAGE_ORGANISATION_RELATIONSHIPS côté serveur.
        if (org.type === "CONSULAT" && !dashboards.operationnel && !dashboards.strategique) {
            try {
                const response = await fetch(
                    `/api/organisations/${encodeURIComponent(org.id)}/association-partners?tenant=${encodeURIComponent(tenant)}`,
                    { credentials: "same-origin", cache: "no-store" }
                );
                if (response.ok) {
                    const a = element("a", "sx-professional-card");
                    a.href = lienVers("/dashboard-vice-consul.html", org.id, tenant);
                    a.append(element("strong", "", "Mon espace professionnel"));
                    a.append(element("span", "", `${org.nom || "Consulat"} · Gestion du réseau associatif`));
                    a.append(element("span", "sx-professional-arrow", "Ouvrir →"));
                    container.append(a);
                    nbFonctions += 1;
                }
            } catch (erreur) {
                console.warn("Accès au réseau associatif indisponible :", erreur);
            }
        }
    }
    const titre = document.getElementById("professionnelsTitle");
    const description = document.getElementById("professionnelsDescription");
    if (nbAssociations && !nbFonctions) {
        if (titre) titre.textContent = "Mes associations";
        if (description) description.textContent = "Retrouvez les communications de vos associations et les informations autorisées.";
    } else if (nbAssociations && nbFonctions) {
        if (titre) titre.textContent = "Mes associations et fonctions professionnelles";
        if (description) description.textContent = "Accédez à vos associations et à vos fonctions selon vos autorisations.";
    } else {
        if (titre) titre.textContent = "Mes fonctions professionnelles";
        if (description) description.textContent = "Ces accès sont distincts de vos expériences personnelles.";
    }
    section.hidden = !container.children.length;
}

async function chargerMonSateer() {
    const experiencesContainer = document.getElementById("experiencesContainer");
    try {
        const contexte = await window.SATEER_CONTEXT_READY;
        const organisations = Array.isArray(contexte.organisations) ? contexte.organisations : [];
        const personneId = contexte.personne.id;

        // On n'affiche jamais Mon Consulat à partir d'une organisation non consulaire.
        const consulats = organisations.filter(org => org.type === "CONSULAT" && org.id != null);
        const apercus = [];
        experiencesContainer.replaceChildren();
        for (const org of consulats) {
            const tenant = org.tenant_code || contexte.tenantCode;
            if (!tenant) continue;
            const { carte, resume } = carteConsulat(org, tenant);
            experiencesContainer.append(carte);
            apercus.push({ organisation: org, tenantCode: tenant, personneId, resume });
        }
        if (!apercus.length) {
            experiencesContainer.append(element("div", "sx-empty-experience",
                "Aucun Consulat rattaché à ce compte. Les expériences disponibles apparaîtront ici après rattachement."));
        }
        afficherIdentite(contexte.personne || {}, organisations);

        // La page personnelle reste utilisable même si l'API du résumé échoue.
        const tenants = [...new Set(organisations.map(org => org.tenant_code || contexte.tenantCode).filter(Boolean))];
        const responses = await Promise.all(tenants.map(async tenant => {
            try {
                const response = await fetch(
                    `/api/mon-sateer/${encodeURIComponent(personneId)}?tenant=${encodeURIComponent(tenant)}`,
                    { credentials: "same-origin", cache: "no-store" }
                );
                if (!response.ok) throw new Error(`Mon SATEER HTTP ${response.status}`);
                return await response.json();
            } catch (erreur) {
                // L'indisponibilité d'un résumé personnel ne doit pas bloquer
                // les espaces institutionnels du compte authentifié.
                console.warn("Résumé Mon SATEER indisponible :", erreur);
                return { notifications: [], resumeIndisponible: true };
            }
        }));
        const data = responses[0] || {};
        if (data.personne) afficherIdentite(data.personne, organisations);
        afficherNotifications(responses.flatMap(item => item.notifications || []));
        if (responses.length && responses.every(item => item.resumeIndisponible)) {
            document.getElementById("notificationsContainer").replaceChildren(
                element("div", "sx-notification-empty", "Notifications indisponibles pour le moment."));
        }
        const directLists = await Promise.all(apercus.map(chargerApercuConsulat));
        await afficherRelaisAssociatifs(organisations, contexte.tenantCode, directLists.flat());
        await afficherAccesProfessionnels(contexte);
    } catch (erreur) {
        console.error("Erreur Mon SATEER :", erreur);
        document.getElementById("notificationsContainer").replaceChildren(
            element("div", "sx-notification-empty", "Notifications indisponibles pour le moment."));
        if (!experiencesContainer.children.length) {
            experiencesContainer.append(element("div", "sx-empty-experience",
                "Impossible de charger vos expériences. Rechargez la page."));
        }
    }
}

document.getElementById("notificationButton")?.addEventListener("click", () => {
    document.getElementById("notificationsTitle")?.scrollIntoView({ behavior: "smooth" });
});

chargerMonSateer();
