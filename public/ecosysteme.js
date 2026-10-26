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
// CHARGEMENT
// =========================================================

async function chargerEcosysteme() {

    try {

        const reponse =
            await fetch(
                `/api/organisations/${organisationId}/ecosysteme?tenant=${tenant}`
            );


        const donnees =
            await reponse.json();


        if (!reponse.ok) {

            throw new Error(
                donnees.erreur
                || "Impossible de charger l'écosystème."
            );
        }


        afficherEcosysteme(
            donnees
        );

    } catch (erreur) {

        console.error(
            "Erreur page écosystème :",
            erreur
        );

    }
}


// =========================================================
// AFFICHAGE GLOBAL
// =========================================================

function afficherEcosysteme(
    donnees
) {

    document.getElementById(
        "organisationNom"
    ).textContent =
        donnees.organisation.nom;


    document.getElementById(
        "resumeOrganisations"
    ).textContent =
        donnees.resume.organisations;


    document.getElementById(
        "resumeRattachements"
    ).textContent =
        donnees.resume.rattachementsEnAttente;


    document.getElementById(
        "resumeInvitations"
    ).textContent =
        donnees.resume.invitationsEnAttente;


    afficherOrganisations(
        donnees.organisations || []
    );


    afficherRattachements(
        donnees.rattachementsEnAttente || []
    );


    afficherInvitations(
        donnees.invitationsEnAttente || []
    );
}


// =========================================================
// ORGANISATIONS
// =========================================================

function afficherOrganisations(
    organisations
) {

    const container =
        document.getElementById(
            "organisationsListe"
        );


    container.innerHTML =
        "";


    if (
        organisations.length === 0
    ) {

        afficherVide(
            container,
            "Aucune organisation reliée."
        );

        return;
    }


    organisations.forEach(
        (organisation) => {

            const card =
                document.createElement(
                    "article"
                );


            card.className =
                "ecosystem-directory-card";


            const contenu =
                document.createElement(
                    "div"
                );


            contenu.className =
                "ecosystem-directory-main";


            const badge =
                document.createElement(
                    "span"
                );


            badge.className =
                "ecosystem-directory-badge";


            badge.textContent =
                libelleTypeOrganisation(
                    organisation.type
                );


            const titre =
                document.createElement(
                    "h3"
                );


            titre.textContent =
                organisation.nom;


            const relation =
                document.createElement(
                    "p"
                );


            relation.textContent =
                libelleRelation(
                    organisation.relation_type
                );


            contenu.appendChild(
                badge
            );


            contenu.appendChild(
                titre
            );


            contenu.appendChild(
                relation
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


            card.appendChild(
                contenu
            );


            card.appendChild(
                statut
            );


            container.appendChild(
                card
            );
        }
    );
}


// =========================================================
// RATTACHEMENTS
// =========================================================

function afficherRattachements(
    rattachements
) {

    const container =
        document.getElementById(
            "rattachementsListe"
        );


    container.innerHTML =
        "";


    if (
        rattachements.length === 0
    ) {

        afficherVide(
            container,
            "Aucune demande de rattachement en attente."
        );

        return;
    }


    rattachements.forEach(
        (rattachement) => {

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


            const nom =
                document.createElement(
                    "strong"
                );


            nom.textContent =
                rattachement.nom;


            const type =
                document.createElement(
                    "span"
                );


            type.textContent =
                libelleRelation(
                    rattachement.type_relation
                );


            informations.appendChild(
                nom
            );


            informations.appendChild(
                type
            );


            const statut =
                document.createElement(
                    "span"
                );


            statut.className =
                "dashboard-status";


            statut.textContent =
                rattachement.statut;


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
// INVITATIONS
// =========================================================

function afficherInvitations(
    invitations
) {

    const container =
        document.getElementById(
            "invitationsListe"
        );


    container.innerHTML =
        "";


    if (
        invitations.length === 0
    ) {

        afficherVide(
            container,
            "Aucune invitation en attente."
        );

        return;
    }


    invitations.forEach(
        (invitation) => {

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


            const nom =
                document.createElement(
                    "strong"
                );


            nom.textContent =
                invitation.nom_organisation
                || invitation.email;


            const email =
                document.createElement(
                    "span"
                );


            email.textContent =
                invitation.email;


            informations.appendChild(
                nom
            );


            informations.appendChild(
                email
            );


            const statut =
                document.createElement(
                    "span"
                );


            statut.className =
                "dashboard-status";


            statut.textContent =
                invitation.statut;


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
// ÉTAT VIDE
// =========================================================

function afficherVide(
    container,
    message
) {

    const vide =
        document.createElement(
            "div"
        );


    vide.className =
        "dashboard-empty";


    vide.textContent =
        message;


    container.appendChild(
        vide
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

        ENTREPRISE:
            "Entreprise",

        ENTREPRISE_PUBLIQUE:
            "Entreprise publique",

        BANQUE:
            "Banque",

        AMBASSADE:
            "Ambassade",

        CONSULAT:
            "Consulat",

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

chargerEcosysteme();