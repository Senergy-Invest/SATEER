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


const loading =
    document.getElementById(
        "secretariatLoading"
    );


const erreur =
    document.getElementById(
        "secretariatErreur"
    );


const demandesContainer =
    document.getElementById(
        "secretariatDemandes"
    );


// =========================================================
// CHARGEMENT
// =========================================================

async function chargerSecretariat() {

    try {

        loading.hidden =
            false;

        erreur.hidden =
            true;

        demandesContainer.hidden =
            true;


        const reponse =
            await fetch(
                `/api/agent/demandes?organisationId=${organisationId}&tenant=${tenant}`
            );


        const donnees =
            await reponse.json();


        if (!reponse.ok) {

            throw new Error(
                donnees.erreur
                || "Impossible de charger les demandes."
            );
        }


        const demandes =
            extraireDemandes(
                donnees
            );


        afficherStatistiques(
            demandes
        );


        afficherDemandes(
            demandes
        );


        loading.hidden =
            true;

        demandesContainer.hidden =
            false;

    } catch (exception) {

        console.error(
            "Erreur Secrétariat :",
            exception
        );


        loading.hidden =
            true;

        demandesContainer.hidden =
            true;

        erreur.hidden =
            false;

        erreur.textContent =
            exception.message;
    }
}


// =========================================================
// EXTRACTION
// =========================================================

function extraireDemandes(
    donnees
) {

    if (
        Array.isArray(
            donnees
        )
    ) {

        return donnees;
    }


    if (
        Array.isArray(
            donnees.demandes
        )
    ) {

        return donnees.demandes;
    }


    return [];
}


// =========================================================
// STATISTIQUES
// =========================================================

function afficherStatistiques(
    demandes
) {

    const nouvelles =
        demandes.filter(
            (demande) =>
                normaliserStatut(
                    demande.statut
                ) === "NOUVELLE"
        ).length;


    const enCours =
        demandes.filter(
            (demande) =>
                normaliserStatut(
                    demande.statut
                ) === "EN_COURS"
        ).length;


    const traitees =
        demandes.filter(
            (demande) =>
                normaliserStatut(
                    demande.statut
                ) === "TRAITEE"
        ).length;


    const prioritaires =
        demandes.filter(
            (demande) =>
                demande.urgente === true
                ||
                demande.urgent === true
                ||
                demande.importante === true
                ||
                demande.important === true
        ).length;


    document.getElementById(
        "secretariatNouvelles"
    ).textContent =
        nouvelles;


    document.getElementById(
        "secretariatEnCours"
    ).textContent =
        enCours;


    document.getElementById(
        "secretariatTraitees"
    ).textContent =
        traitees;


    document.getElementById(
        "secretariatPrioritaires"
    ).textContent =
        prioritaires;
}


// =========================================================
// DEMANDES
// =========================================================

function afficherDemandes(
    demandes
) {

    demandesContainer.innerHTML =
        "";


    if (
        demandes.length === 0
    ) {

        const vide =
            document.createElement(
                "div"
            );


        vide.className =
            "dashboard-empty";


        vide.textContent =
            "Aucune demande reçue.";


        demandesContainer.appendChild(
            vide
        );


        return;
    }


    demandes.forEach(
        (demande) => {

            const card =
                document.createElement(
                    "article"
                );


            card.className =
                "secretariat-request-card";


            const contenu =
                document.createElement(
                    "div"
                );


            contenu.className =
                "secretariat-request-main";


            const titre =
                document.createElement(
                    "h3"
                );


            titre.textContent =
                demande.objet
                || demande.titre
                || demande.sujet
                || `Demande #${demande.id}`;


            const auteur =
                document.createElement(
                    "p"
                );


            auteur.className =
                "muted";


            auteur.textContent =
                obtenirNomDemandeur(
                    demande
                );


            contenu.appendChild(
                titre
            );


            contenu.appendChild(
                auteur
            );


            const droite =
                document.createElement(
                    "div"
                );


            droite.className =
                "secretariat-request-side";


            const statut =
                document.createElement(
                    "span"
                );


            statut.className =
                "dashboard-status";


            statut.textContent =
                normaliserStatut(
                    demande.statut
                );


            droite.appendChild(
                statut
            );


            if (
                demande.id
            ) {

                const lien =
                    document.createElement(
                        "a"
                    );


                lien.className =
                    "button button-secondary";


                lien.href =
                    `/demande-detail.html?demande=${demande.id}&organisation=${organisationId}&tenant=${tenant}`;


                lien.textContent =
                    "Voir";


                droite.appendChild(
                    lien
                );
            }


            card.appendChild(
                contenu
            );


            card.appendChild(
                droite
            );


            demandesContainer.appendChild(
                card
            );
        }
    );
}


// =========================================================
// OUTILS
// =========================================================

function obtenirNomDemandeur(
    demande
) {

    if (
        demande.personne_prenom
        ||
        demande.personne_nom
    ) {

        return [
            demande.personne_prenom,
            demande.personne_nom
        ]
            .filter(Boolean)
            .join(" ");
    }


    if (
        demande.prenom
        ||
        demande.nom
    ) {

        return [
            demande.prenom,
            demande.nom
        ]
            .filter(Boolean)
            .join(" ");
    }


    if (
        demande.demandeur
    ) {

        return demande.demandeur;
    }


    return "Demandeur";
}


function normaliserStatut(
    statut
) {

    return String(
        statut || "NOUVELLE"
    )
        .trim()
        .toUpperCase();
}


// =========================================================
// DÉMARRAGE
// =========================================================

chargerSecretariat();