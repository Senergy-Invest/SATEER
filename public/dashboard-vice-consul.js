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

chargerDashboard();