const PERSONNE_ID = 1;
const TENANT = "SN";


// =========================================================
// PARAMÈTRES URL
// =========================================================

const params =
    new URLSearchParams(
        window.location.search
    );


const DEMANDE_ID =
    Number(
        params.get(
            "demande"
        )
    );


const ORGANISATION_ID =
    Number(
        params.get(
            "organisation"
        ) || 1
    );


const SOURCE =
    params.get(
        "source"
    ) || "SATEER";


// =========================================================
// DOM
// =========================================================

const backButton =
    document.getElementById(
        "backButton"
    );


const detailContextLabel =
    document.getElementById(
        "detailContextLabel"
    );


const detailTitle =
    document.getElementById(
        "detailTitle"
    );


const demandeStatut =
    document.getElementById(
        "demandeStatut"
    );


const demandeCategorie =
    document.getElementById(
        "demandeCategorie"
    );


const demandePriorite =
    document.getElementById(
        "demandePriorite"
    );


const demandeOrganisation =
    document.getElementById(
        "demandeOrganisation"
    );


const demandeCanal =
    document.getElementById(
        "demandeCanal"
    );


const demandeDateCreation =
    document.getElementById(
        "demandeDateCreation"
    );


const demandeDateModification =
    document.getElementById(
        "demandeDateModification"
    );


const demandeDescription =
    document.getElementById(
        "demandeDescription"
    );


const historiqueContainer =
    document.getElementById(
        "historiqueContainer"
    );


const reponsesContainer =
    document.getElementById(
        "reponsesContainer"
    );


const detailErreur =
    document.getElementById(
        "detailErreur"
    );


// =========================================================
// CONTEXTE
// =========================================================

function configurerContexte() {

    if (
        SOURCE ===
        "MON_CONSULAT"
    ) {

        detailContextLabel.textContent =
            "MON CONSULAT";

        return;
    }


    if (
        SOURCE ===
        "MON_AMBASSADE"
    ) {

        detailContextLabel.textContent =
            "MON AMBASSADE";

        return;
    }


    detailContextLabel.textContent =
        "SATEER";
}


// =========================================================
// RETOUR
// =========================================================

backButton.addEventListener(
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
// DATE
// =========================================================

function formaterDate(
    date
) {

    if (!date) {

        return "—";
    }


    return new Date(
        date
    ).toLocaleString(
        "fr-FR",
        {
            dateStyle:
                "medium",

            timeStyle:
                "short"
        }
    );
}


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
// DEMANDE
// =========================================================

function afficherDemande(
    demande
) {

    detailTitle.textContent =
        demande.objet;


    demandeStatut.textContent =
        demande.statut;


    demandeStatut.className =
        classeStatut(
            demande.statut
        );


    demandeCategorie.textContent =
        demande.categorie || "—";


    demandePriorite.textContent =
        demande.priorite || "—";


    demandeOrganisation.textContent =
        demande.organisation || "—";


    demandeCanal.textContent =
        demande.canal || "—";


    demandeDateCreation.textContent =
        formaterDate(
            demande.date_creation
        );


    demandeDateModification.textContent =
        formaterDate(
            demande.date_modification
        );


    demandeDescription.textContent =
        demande.description ||
        "Aucun message.";
}


// =========================================================
// LIBELLÉ ACTION
// =========================================================

function libelleAction(
    action
) {

    switch (
        action
    ) {

        case "CREATION":

            return "Demande créée";


        case "PRISE_EN_CHARGE":

            return "Prise en charge";


        case "REPONSE_ENVOYEE":

            return "Réponse envoyée";


        default:

            return action ||
                "Mise à jour";
    }
}


// =========================================================
// HISTORIQUE
// =========================================================

function afficherHistorique(
    historique
) {

    historiqueContainer.innerHTML =
        "";


    if (
        !historique ||
        historique.length === 0
    ) {

        historiqueContainer.innerHTML = `
            <div class="empty">
                Aucun historique disponible.
            </div>
        `;

        return;
    }


    for (
        const evenement
        of historique
    ) {

        const item =
            document.createElement(
                "div"
            );


        item.className =
            "timeline-item";


        const marqueur =
            document.createElement(
                "div"
            );


        marqueur.className =
            "timeline-marker";


        const contenu =
            document.createElement(
                "div"
            );


        contenu.className =
            "timeline-content";


        const titre =
            document.createElement(
                "strong"
            );


        titre.className =
            "timeline-title";


        titre.textContent =
            libelleAction(
                evenement.action
            );


        const date =
            document.createElement(
                "div"
            );


        date.className =
            "timeline-date";


        date.textContent =
            formaterDate(
                evenement.date_action
            );


        contenu.appendChild(
            titre
        );


        contenu.appendChild(
            date
        );


        if (
            evenement.commentaire
        ) {

            const commentaire =
                document.createElement(
                    "p"
                );


            commentaire.className =
                "timeline-comment";


            commentaire.textContent =
                evenement.commentaire;


            contenu.appendChild(
                commentaire
            );
        }


        if (
            evenement.ancien_statut ||
            evenement.nouveau_statut
        ) {

            const transition =
                document.createElement(
                    "div"
                );


            transition.className =
                "timeline-transition";


            if (
                evenement.ancien_statut
            ) {

                transition.textContent =
                    evenement.ancien_statut +
                    " → " +
                    evenement.nouveau_statut;

            } else {

                transition.textContent =
                    "Statut : " +
                    evenement.nouveau_statut;
            }


            contenu.appendChild(
                transition
            );
        }


        const auteur =
            [
                evenement.auteur_prenom,
                evenement.auteur_nom
            ]
                .filter(Boolean)
                .join(" ");


        if (
            auteur
        ) {

            const auteurElement =
                document.createElement(
                    "div"
                );


            auteurElement.className =
                "timeline-author";


            auteurElement.textContent =
                auteur;


            contenu.appendChild(
                auteurElement
            );
        }


        item.appendChild(
            marqueur
        );


        item.appendChild(
            contenu
        );


        historiqueContainer.appendChild(
            item
        );
    }
}


// =========================================================
// RÉPONSES
// =========================================================

function afficherReponses(
    reponses
) {

    reponsesContainer.innerHTML =
        "";


    if (
        !reponses ||
        reponses.length === 0
    ) {

        reponsesContainer.innerHTML = `
            <div class="empty">

                Aucune réponse pour le moment.

                <br><br>

                Votre demande a bien été transmise
                et est en attente de traitement.

            </div>
        `;

        return;
    }


    for (
        const reponse
        of reponses
    ) {

        const item =
            document.createElement(
                "article"
            );


        item.className =
            "demande-reponse-card";


        const auteur =
            [
                reponse.auteur_prenom,
                reponse.auteur_nom
            ]
                .filter(Boolean)
                .join(" ");


        const contenu =
            document.createElement(
                "p"
            );


        contenu.className =
            "demande-reponse-contenu";


        contenu.textContent =
            reponse.contenu;


        const meta =
            document.createElement(
                "div"
            );


        meta.className =
            "demande-reponse-meta";


        meta.textContent =
            (
                auteur ||
                "Institution"
            ) +
            " • " +
            formaterDate(
                reponse.date_creation
            );


        item.appendChild(
            contenu
        );


        item.appendChild(
            meta
        );


        reponsesContainer.appendChild(
            item
        );
    }
}


// =========================================================
// CHARGEMENT
// =========================================================

async function chargerDetailDemande() {

    try {

        if (
            !DEMANDE_ID
        ) {

            throw new Error(
                "Identifiant de demande invalide."
            );
        }


        const reponse =
            await fetch(
                `/api/demandes/${DEMANDE_ID}?personneId=${PERSONNE_ID}&organisationId=${ORGANISATION_ID}&tenant=${TENANT}`
            );


        const resultat =
            await reponse.json();


        if (
            !reponse.ok
        ) {

            throw new Error(
                resultat.erreur ||
                "Impossible de charger cette demande."
            );
        }


        afficherDemande(
            resultat.demande
        );


        afficherHistorique(
            resultat.historique || []
        );


        afficherReponses(
            resultat.reponses || []
        );


    } catch (erreur) {

        console.error(
            erreur
        );


        detailErreur.textContent =
            erreur.message;


        detailErreur.hidden =
            false;


        detailTitle.textContent =
            "Demande indisponible";
    }
}


// =========================================================
// INITIALISATION
// =========================================================

configurerContexte();

chargerDetailDemande();