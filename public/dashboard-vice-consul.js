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


// =========================================================
// CHARGEMENT GLOBAL
// =========================================================

async function chargerDashboard() {

    try {

        const [
            dashboardReponse,
            ecosystemeReponse
        ] =
            await Promise.all([
                fetch(
                    `/api/organisations/${organisationId}/dashboard-operationnel?tenant=${tenant}`
                ),

                fetch(
                    `/api/organisations/${organisationId}/ecosysteme?tenant=${tenant}`
                )
            ]);


        const dashboard =
            await dashboardReponse.json();


        const ecosysteme =
            await ecosystemeReponse.json();


        if (!dashboardReponse.ok) {

            throw new Error(
                dashboard.erreur
                || "Impossible de charger le dashboard."
            );
        }


        if (!ecosystemeReponse.ok) {

            throw new Error(
                ecosysteme.erreur
                || "Impossible de charger l'écosystème."
            );
        }


        afficherDashboard(
            dashboard
        );


        afficherEcosysteme(
            ecosysteme
        );

        await chargerUnitesSupervisees();

    } catch (erreur) {

        console.error(
            "Erreur dashboard Vice-Consul :",
            erreur
        );

    }
}


// =========================================================
// DASHBOARD OPÉRATIONNEL
// =========================================================

function afficherDashboard(
    donnees
) {

    document.getElementById(
        "organisationNom"
    ).textContent =
        donnees.organisation.nom;


    document.getElementById(
        "kpiNouvelles"
    ).textContent =
        donnees.demandes.nouvelles;


    document.getElementById(
        "kpiEnCours"
    ).textContent =
        donnees.demandes.en_cours;


    document.getElementById(
        "kpiTraitees"
    ).textContent =
        donnees.demandes.traitees;


    document.getElementById(
        "kpiSurveillance"
    ).textContent =
        donnees.demandesASurveiller.length;


    const heures =
        Number(
            donnees.delaiTraitement.heures_moyennes
        );


    document.getElementById(
        "kpiDelai"
    ).textContent =
        Number.isFinite(heures)
            ? `${heures.toFixed(2)} h`
            : "—";


    document.getElementById(
        "kpiUsagers"
    ).textContent =
        donnees.diaspora.total_usagers;


    afficherDernieresDemandes(
        donnees.activiteRecente.demandes
    );


    afficherSurveillance(
        donnees.demandesASurveiller
    );


    afficherTerritoiresDashboard(
        donnees.territoires
    );


    afficherPublications(
        donnees.publications
    );
}


// =========================================================
// UNITÉS SUPERVISÉES - DONNÉES DYNAMIQUES
// =========================================================

function capabilityLabel(code) {
    const labels = {
        RECEIVE_INCOMING: "Réception",
        VIEW_INBOX: "Boîte de réception",
        ROUTE_CASES: "Orientation",
        PROCESS_CASES: "Traitement",
        TAKE_CASES: "Prise en charge",
        RESPOND_CASES: "Réponse",
        MANAGE_PROJECTS: "Projets",
        MANAGE_PUBLICATIONS: "Publications",
        TARGET_COMMUNICATION: "Communication",
        USE_AI_ASSISTANT: "Assistant IA",
        VIEW_UNIT_ANALYTICS: "Statistiques",
        MANAGE_UNIT_MEMBERS: "Gestion des membres",
        MANAGE_UNIT_STRUCTURE: "Structure",
        SUPERVISE_UNITS: "Supervision"
    };

    return labels[code] || code;
}

function capabilityIcon(codes) {
    const capabilities = new Set(codes || []);
    if (capabilities.has("RECEIVE_INCOMING")) return "✉";
    if (capabilities.has("TAKE_CASES") || capabilities.has("PROCESS_CASES")) return "▣";
    if (capabilities.has("MANAGE_PROJECTS")) return "◇";
    if (capabilities.has("VIEW_UNIT_ANALYTICS")) return "▥";
    return "▦";
}

function creerStatistiqueUnite(label, value) {
    const item = document.createElement("div");
    item.className = "supervision-unit-stat";

    const name = document.createElement("span");
    name.textContent = label;

    const number = document.createElement("strong");
    number.textContent = value === null || value === undefined ? "—" : String(value);

    item.append(name, number);
    return item;
}

function afficherUnitesSupervisees(unites) {
    const container = document.getElementById("supervisionUnitsGrid");
    const message = document.getElementById("supervisionUnitsMessage");
    if (!container) return;

    container.replaceChildren();

    if (!Array.isArray(unites) || unites.length === 0) {
        const empty = document.createElement("div");
        empty.className = "dashboard-empty";
        empty.textContent = "Aucune unité accessible dans le périmètre de supervision.";
        container.appendChild(empty);
        if (message) message.textContent = "";
        return;
    }

    const unitesParId = new Map(
        unites.map(unite => [Number(unite.id), unite])
    );

    unites.forEach(unite => {
        const card = document.createElement("article");
        card.className = "supervision-card supervision-unit-card";

        const top = document.createElement("div");
        top.className = "supervision-card-top";

        const icon = document.createElement("span");
        icon.className = "supervision-icon";
        icon.textContent = capabilityIcon(unite.capabilities);

        const status = document.createElement("span");
        status.className = "supervision-status";
        status.textContent = "Active";
        top.append(icon, status);

        const title = document.createElement("h3");
        title.textContent = unite.nom || "Unité";

        const parent = unitesParId.get(Number(unite.parent_unit_id));
        const description = document.createElement("p");
        description.className = "muted";
        description.textContent = parent
            ? `${unite.type || "Unité"} · Rattachée à ${parent.nom}`
            : (unite.type || "Unité organisationnelle");

        const stats = document.createElement("div");
        stats.className = "supervision-unit-stats";
        stats.append(
            creerStatistiqueUnite("Membres", unite.members_count),
            creerStatistiqueUnite("Nouvelles", unite.new_cases),
            creerStatistiqueUnite("En cours", unite.in_progress_cases)
        );

        const capabilities = document.createElement("div");
        capabilities.className = "supervision-unit-capabilities";
        (unite.capabilities || []).forEach(code => {
            const tag = document.createElement("span");
            tag.className = "supervision-unit-capability";
            tag.textContent = capabilityLabel(code);
            capabilities.appendChild(tag);
        });

        card.append(top, title, description, stats, capabilities);

        if (unite.canViewAnalytics) {
            const urgent = Number(unite.urgent_cases || 0);
            if (urgent > 0) {
                const alert = document.createElement("p");
                alert.className = "supervision-unit-alert";
                alert.textContent = `Attention : ${urgent} dossier(s) urgent(s) en attente ou en cours.`;
                card.appendChild(alert);
            } else {
                const calm = document.createElement("p");
                calm.className = "supervision-unit-no-alert";
                calm.textContent = "Aucun dossier urgent.";
                card.appendChild(calm);
            }
        } else {
            const restricted = document.createElement("p");
            restricted.className = "supervision-unit-no-alert";
            restricted.textContent = "Indicateurs détaillés non accessibles avec les permissions actuelles.";
            card.appendChild(restricted);
        }

        if (unite.canOpenWorkspace) {
            const link = document.createElement("a");
            link.className = "button button-secondary";
            link.textContent = "Ouvrir le Workspace";

            const query = new URLSearchParams({
                organisation: String(organisationId),
                unit: String(unite.id),
                tenant: String(tenant)
            });

            link.href = `/unit-workspace.html?${query.toString()}`;
            card.appendChild(link);
        } else {
            const unavailable = document.createElement("p");
            unavailable.className = "muted";
            unavailable.textContent = "Accès au Workspace non autorisé.";
            card.appendChild(unavailable);
        }

        container.appendChild(card);
    });

    if (message) {
        message.textContent = `${unites.length} unité(s) affichée(s) selon les droits de supervision.`;
    }
}

async function chargerUnitesSupervisees() {
    const container = document.getElementById("supervisionUnitsGrid");
    const message = document.getElementById("supervisionUnitsMessage");

    const lienStructure = document.getElementById("organisationStructureLink");
    if (lienStructure) {
        const query = new URLSearchParams({
            organisation: String(organisationId),
            tenant: String(tenant)
        });
        lienStructure.href = `/organisation-consulat.html?${query.toString()}`;
    }

    try {
        const response = await fetch(
            `/api/organisations/${organisationId}/units/overview?tenant=${encodeURIComponent(tenant)}`,
            {
                credentials: "same-origin",
                cache: "no-store",
                headers: { "Accept": "application/json" }
            }
        );

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.statut || "Impossible de charger les unités.");
        }

        afficherUnitesSupervisees(data.unites || []);
    } catch (erreur) {
        console.error("Erreur chargement unités supervisées :", erreur);
        if (container) {
            container.replaceChildren();
            const error = document.createElement("div");
            error.className = "dashboard-empty";
            error.textContent = erreur.message || "Unités indisponibles.";
            container.appendChild(error);
        }
        if (message) message.textContent = "";
    }
}


// =========================================================
// ÉCOSYSTÈME
// =========================================================

function afficherEcosysteme(
    donnees
) {

    document.getElementById(
        "ecosystemUsagers"
    ).textContent =
        donnees.resume.usagers;


    document.getElementById(
        "ecosystemOrganisations"
    ).textContent =
        donnees.resume.organisations;


    document.getElementById(
        "ecosystemTerritoires"
    ).textContent =
        donnees.resume.territoires;


    document.getElementById(
        "ecosystemRattachements"
    ).textContent =
        donnees.resume.rattachementsEnAttente;


    document.getElementById(
        "ecosystemInvitations"
    ).textContent =
        donnees.resume.invitationsEnAttente;


    afficherOrganisationsEcosysteme(
        donnees.organisations
    );


    afficherTerritoiresEcosysteme(
        donnees.territoires
    );
}


// =========================================================
// ORGANISATIONS DE L'ÉCOSYSTÈME
// =========================================================

function afficherOrganisationsEcosysteme(
    organisations
) {

    const container =
        document.getElementById(
            "ecosystemOrganisationsListe"
        );


    container.innerHTML =
        "";


    if (
        !organisations
        ||
        organisations.length === 0
    ) {

        const vide =
            document.createElement(
                "div"
            );


        vide.className =
            "dashboard-empty";


        vide.textContent =
            "Aucune organisation reliée.";


        container.appendChild(
            vide
        );


        return;
    }


    organisations.forEach(
        (organisation) => {

            const element =
                document.createElement(
                    "div"
                );


            element.className =
                "ecosystem-organisation-item";


            const informations =
                document.createElement(
                    "div"
                );


            const nom =
                document.createElement(
                    "strong"
                );


            nom.textContent =
                organisation.nom;


            const meta =
                document.createElement(
                    "span"
                );


            meta.textContent =
                `${libelleTypeOrganisation(
                    organisation.type
                )} • ${libelleRelation(
                    organisation.relation_type
                )}`;


            informations.appendChild(
                nom
            );


            informations.appendChild(
                meta
            );


            const statut =
                document.createElement(
                    "span"
                );


            statut.className =
                "ecosystem-status";


            statut.textContent =
                organisation.relation_statut === "ACTIVE"
                    ? "Connectée"
                    : organisation.relation_statut;


            element.appendChild(
                informations
            );


            element.appendChild(
                statut
            );


            container.appendChild(
                element
            );
        }
    );
}


// =========================================================
// TERRITOIRES ÉCOSYSTÈME
// =========================================================

function afficherTerritoiresEcosysteme(
    territoires
) {

    const container =
        document.getElementById(
            "ecosystemTerritoiresListe"
        );


    container.innerHTML =
        "";


    if (
        !territoires
        ||
        territoires.length === 0
    ) {

        const vide =
            document.createElement(
                "div"
            );


        vide.className =
            "dashboard-empty";


        vide.textContent =
            "Aucun territoire renseigné.";


        container.appendChild(
            vide
        );


        return;
    }


    territoires.forEach(
        (territoire) => {

            const element =
                document.createElement(
                    "div"
                );


            element.className =
                "dashboard-list-item";


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
                `${territoire.personnes} personne(s)`;


            element.appendChild(
                nom
            );


            element.appendChild(
                nombre
            );


            container.appendChild(
                element
            );
        }
    );
}


// =========================================================
// DERNIÈRES DEMANDES
// =========================================================

function afficherDernieresDemandes(
    demandes
) {

    const container =
        document.getElementById(
            "dernieresDemandes"
        );


    container.innerHTML =
        "";


    if (
        !demandes
        ||
        demandes.length === 0
    ) {

        container.innerHTML =
            "<p>Aucune demande récente.</p>";

        return;
    }


    demandes.forEach(
        (demande) => {

            const element =
                document.createElement(
                    "div"
                );


            element.className =
                "dashboard-list-item";


            const informations =
                document.createElement(
                    "div"
                );


            const titre =
                document.createElement(
                    "strong"
                );


            titre.textContent =
                demande.objet;


            const citoyen =
                document.createElement(
                    "span"
                );


            citoyen.textContent =
                `${demande.prenom} ${demande.nom}`;


            informations.appendChild(
                titre
            );


            informations.appendChild(
                citoyen
            );


            const statut =
                document.createElement(
                    "span"
                );


            statut.className =
                "dashboard-status";


            statut.textContent =
                demande.statut;


            element.appendChild(
                informations
            );


            element.appendChild(
                statut
            );


            container.appendChild(
                element
            );
        }
    );
}


// =========================================================
// SURVEILLANCE
// =========================================================

function afficherSurveillance(
    demandes
) {

    const container =
        document.getElementById(
            "demandesSurveillance"
        );


    container.innerHTML =
        "";


    if (
        !demandes
        ||
        demandes.length === 0
    ) {

        const vide =
            document.createElement(
                "div"
            );


        vide.className =
            "dashboard-empty";


        vide.textContent =
            "✓ Aucun dossier nécessitant une surveillance particulière.";


        container.appendChild(
            vide
        );


        return;
    }


    demandes.forEach(
        (demande) => {

            const element =
                document.createElement(
                    "div"
                );


            element.className =
                "dashboard-list-item";


            const informations =
                document.createElement(
                    "div"
                );


            const titre =
                document.createElement(
                    "strong"
                );


            titre.textContent =
                demande.objet;


            const meta =
                document.createElement(
                    "span"
                );


            meta.textContent =
                `${demande.prenom} ${demande.nom} • ${demande.territoire}`;


            informations.appendChild(
                titre
            );


            informations.appendChild(
                meta
            );


            const priorite =
                document.createElement(
                    "span"
                );


            priorite.className =
                "dashboard-status";


            priorite.textContent =
                demande.priorite;


            element.appendChild(
                informations
            );


            element.appendChild(
                priorite
            );


            container.appendChild(
                element
            );
        }
    );
}


// =========================================================
// TERRITOIRES DASHBOARD
// =========================================================

function afficherTerritoiresDashboard(
    territoires
) {

    const container =
        document.getElementById(
            "territoiresContainer"
        );


    container.innerHTML =
        "";


    territoires.forEach(
        (territoire) => {

            const element =
                document.createElement(
                    "div"
                );


            element.className =
                "dashboard-list-item";


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
                `${territoire.personnes} usager(s)`;


            element.appendChild(
                nom
            );


            element.appendChild(
                nombre
            );


            container.appendChild(
                element
            );
        }
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
            "publicationsResume"
        );


    const lignes = [
        [
            "Publications totales",
            publications.total
        ],
        [
            "Publiées",
            publications.publiees
        ],
        [
            "Importantes",
            publications.importantes
        ],
        [
            "Urgentes",
            publications.urgentes
        ],
        [
            "Diffusées Diaspora",
            publications.diffusees_diaspora
        ]
    ];


    container.innerHTML =
        "";


    lignes.forEach(
        ([libelle, valeur]) => {

            const element =
                document.createElement(
                    "div"
                );


            element.className =
                "dashboard-list-item";


            const texte =
                document.createElement(
                    "span"
                );


            texte.textContent =
                libelle;


            const nombre =
                document.createElement(
                    "strong"
                );


            nombre.textContent =
                valeur;


            element.appendChild(
                texte
            );


            element.appendChild(
                nombre
            );


            container.appendChild(
                element
            );
        }
    );
}


// =========================================================
// LIBELLÉS
// =========================================================

function libelleTypeOrganisation(
    type
) {

    const labels = {

        ASSOCIATION:
            "Association",

        ENTREPRISE_PUBLIQUE:
            "Entreprise publique",

        ENTREPRISE:
            "Entreprise",

        AMBASSADE:
            "Ambassade",

        CONSULAT:
            "Consulat",

        BANQUE:
            "Banque",

        SATEER:
            "SATEER"
    };


    return labels[type]
        || type;
}


function libelleRelation(
    relation
) {

    const labels = {

        COMMUNITY_MEMBER:
            "Membre de l'écosystème",

        PARTNER:
            "Partenaire",

        REPRESENTATIVE_ORGANISATION:
            "Organisation représentative",

        INSTITUTIONAL_RELATION:
            "Relation institutionnelle"
    };


    return labels[relation]
        || relation;
}


// =========================================================
// DÉMARRAGE
// =========================================================


// =========================================================
// GESTION DES ACCÈS EN LECTURE SEULE
// =========================================================

async function chargerGestionAccesDashboard() {
    const select = document.getElementById("personneDelegation");
    const liste = document.getElementById("delegationsDashboardListe");
    const message = document.getElementById("delegationMessage");

    const response = await fetch(
        `/api/organisations/${organisationId}/dashboard-operationnel/delegations?tenant=${encodeURIComponent(tenant)}`,
        { credentials: "same-origin", cache: "no-store" }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.statut || "Impossible de charger les délégations.");

    const membres = Array.isArray(data.membres) ? data.membres : [];
    select.replaceChildren();

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Choisir un membre à autoriser";
    select.appendChild(placeholder);

    membres.filter(membre => !membre.peutConsulter).forEach(membre => {
        const option = document.createElement("option");
        option.value = String(membre.personne_id);
        option.textContent = `${membre.prenom} ${membre.nom} — ${membre.roles || "Membre"}`;
        select.appendChild(option);
    });

    const boutonAccorder = document.getElementById("accorderDelegation");
    if (select.options.length === 1) {
        select.options[0].textContent = "Aucun autre membre à autoriser";
        select.disabled = true;
        boutonAccorder.disabled = true;
    } else {
        select.disabled = false;
        boutonAccorder.disabled = false;
    }

    liste.replaceChildren();
    membres.forEach(membre => {
        const ligne = document.createElement("div");
        ligne.className = "dashboard-list-item";

        const informations = document.createElement("div");
        const nom = document.createElement("strong");
        nom.textContent = `${membre.prenom} ${membre.nom}`;
        const role = document.createElement("span");
        role.textContent = membre.roles || "Membre du Consulat";
        informations.append(nom, role);
        ligne.appendChild(informations);

        const statut = document.createElement("span");
        statut.className = "dashboard-status";
        statut.textContent = membre.sourceAcces === "ROLE"
            ? "Accès permanent par rôle"
            : (membre.sourceAcces === "DELEGATION" ? "Accès délégué — lecture seule" : "Pas d'accès");
        ligne.appendChild(statut);

        if (membre.sourceAcces === "DELEGATION") {
            const retirer = document.createElement("button");
            retirer.type = "button";
            retirer.className = "button button-secondary";
            retirer.textContent = "Retirer l'accès";
            retirer.addEventListener("click", () => revoquerAccesDashboard(membre.personne_id));
            ligne.appendChild(retirer);
        }

        liste.appendChild(ligne);
    });

    if (!membres.length) {
        const vide = document.createElement("p");
        vide.className = "muted";
        vide.textContent = "Aucun membre avec une affectation institutionnelle active.";
        liste.appendChild(vide);
    }

    message.textContent = "Seule la consultation du dashboard est déléguée. Les permissions institutionnelles et les droits de traitement restent inchangés.";
}


async function accorderAccesDashboard(event) {
    event.preventDefault();
    const personneId = Number(document.getElementById("personneDelegation").value);
    const message = document.getElementById("delegationMessage");
    if (!Number.isSafeInteger(personneId) || personneId <= 0) {
        message.textContent = "Sélectionnez un membre du Consulat.";
        return;
    }

    const response = await fetch(
        `/api/organisations/${organisationId}/dashboard-operationnel/delegations?tenant=${encodeURIComponent(tenant)}`,
        {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({
                personneId,
                tenantCode: tenant,
                motif: document.getElementById("motifDelegation").value.trim() || null
            })
        }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        message.textContent = data.statut || "L'autorisation n'a pas pu être enregistrée.";
        return;
    }

    message.textContent = data.statut === "ACCES_DEJA_HERITE_DU_ROLE"
        ? "Ce membre dispose déjà de cet accès par son rôle."
        : "Accès en lecture seule accordé.";
    document.getElementById("motifDelegation").value = "";
    await chargerGestionAccesDashboard();
}


async function revoquerAccesDashboard(personneId) {
    const message = document.getElementById("delegationMessage");
    const response = await fetch(
        `/api/organisations/${organisationId}/dashboard-operationnel/delegations/${personneId}?tenant=${encodeURIComponent(tenant)}`,
        { method: "DELETE", credentials: "same-origin", headers: { "Accept": "application/json" } }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        message.textContent = data.statut || "L'accès n'a pas pu être retiré.";
        return;
    }
    message.textContent = "Accès délégué retiré.";
    await chargerGestionAccesDashboard();
}


async function initialiserDashboardOperationnel() {
    try {
        const response = await fetch(
            `/api/organisations/${organisationId}/dashboard-operationnel/acces?tenant=${encodeURIComponent(tenant)}`,
            { credentials: "same-origin", cache: "no-store" }
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.statut || "Session ou accès indisponible.");
        if (!data.peutConsulter) {
            throw new Error("Tu ne disposes pas de l'autorisation de consulter le dashboard opérationnel.");
        }

        if (data.sourceAcces === "DELEGATION") {
            document.getElementById("dashboardModeAcces").hidden = false;
        }

        if (data.peutGererAcces) {
            document.getElementById("gestionAccesDashboard").hidden = false;
            await chargerGestionAccesDashboard();
            document.getElementById("delegationForm").addEventListener("submit", accorderAccesDashboard);
        }

        await chargerDashboard();
    } catch (erreur) {
        console.error("Erreur accès dashboard opérationnel :", erreur);
        document.getElementById("organisationNom").textContent =
            erreur.message || "Accès au dashboard impossible.";
    }
}


// =========================================================
// DÉMARRAGE
// =========================================================

initialiserDashboardOperationnel();
