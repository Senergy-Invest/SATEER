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


let unitesOrientation =
    [];


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


        const [
    reponseDemandes,
    reponseStructure
] =
    await Promise.all([

        fetch(
            `/api/secretariat/demandes?organisationId=${organisationId}&tenant=${tenant}`
        ),

        fetch(
            `/api/organisations/${organisationId}/structure?tenant=${tenant}`
        )

    ]);


        const donneesDemandes =
            await reponseDemandes.json();


        const donneesStructure =
            await reponseStructure.json();


        if (!reponseDemandes.ok) {

            throw new Error(
                donneesDemandes.erreur
                || "Impossible de charger les demandes."
            );
        }


        if (!reponseStructure.ok) {

            throw new Error(
                donneesStructure.erreur
                || "Impossible de charger l'organisation."
            );
        }


        const demandes =
            extraireDemandes(
                donneesDemandes
            );


        preparerUnitesOrientation(
            donneesStructure.units || []
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
// UNITÉS AUTORISÉES POUR L'ORIENTATION
// =========================================================

function preparerUnitesOrientation(
    units
) {

    const codesAutorises =
        new Set([
            "CONSULAR_SERVICE",
            "PROJECT_OFFICE",
            "OPERATIONAL_DEPUTY"
        ]);


    unitesOrientation =
        units.filter(
            (unit) =>
                codesAutorises.has(
                    unit.code
                )
        );
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
                normaliserPriorite(
                    demande.priorite
                ) !== "NORMALE"
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


            // =============================================
            // EN-TÊTE
            // =============================================

            const lignePrincipale =
                document.createElement(
                    "div"
                );


            lignePrincipale.className =
                "secretariat-request-row";


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


            const voir =
                document.createElement(
                    "a"
                );


            voir.className =
                "button button-secondary";


            voir.href =
                `/demande-detail.html?demande=${demande.id}&organisation=${organisationId}&tenant=${tenant}`;


            voir.textContent =
                "Voir";


            droite.appendChild(
                voir
            );


            const orienter =
                document.createElement(
                    "button"
                );


            orienter.type =
                "button";


            orienter.className =
                "button button-secondary";


            orienter.textContent =
                "Orienter";


            droite.appendChild(
                orienter
            );


            lignePrincipale.appendChild(
                contenu
            );


            lignePrincipale.appendChild(
                droite
            );


            card.appendChild(
                lignePrincipale
            );


            // =============================================
            // FORMULAIRE D'ORIENTATION
            // =============================================

            const formulaire =
                creerFormulaireOrientation(
                    demande
                );


            formulaire.hidden =
                true;


            card.appendChild(
                formulaire
            );


            orienter.addEventListener(
                "click",
                () => {

                    formulaire.hidden =
                        !formulaire.hidden;


                    orienter.textContent =
                        formulaire.hidden
                            ? "Orienter"
                            : "Fermer";
                }
            );


            demandesContainer.appendChild(
                card
            );
        }
    );
}


// =========================================================
// FORMULAIRE D'ORIENTATION
// =========================================================

function creerFormulaireOrientation(
    demande
) {

    const formulaire =
        document.createElement(
            "form"
        );


    formulaire.className =
        "secretariat-routing-form";


    // =============================================
    // DESTINATION
    // =============================================

    const groupeDestination =
        document.createElement(
            "div"
        );


    groupeDestination.className =
        "secretariat-form-group";


    const labelDestination =
        document.createElement(
            "label"
        );


    labelDestination.textContent =
        "Service de destination";


    const selectDestination =
        document.createElement(
            "select"
        );


    selectDestination.required =
        true;


    const optionVide =
        document.createElement(
            "option"
        );


    optionVide.value =
        "";


    optionVide.textContent =
        "Choisir une destination";


    selectDestination.appendChild(
        optionVide
    );


    unitesOrientation.forEach(
        (unit) => {

            const option =
                document.createElement(
                    "option"
                );


            option.value =
                unit.id;


            option.textContent =
                unit.nom;


            selectDestination.appendChild(
                option
            );
        }
    );


    groupeDestination.appendChild(
        labelDestination
    );


    groupeDestination.appendChild(
        selectDestination
    );


    // =============================================
    // MOTIF
    // =============================================

    const groupeMotif =
        document.createElement(
            "div"
        );


    groupeMotif.className =
        "secretariat-form-group";


    const labelMotif =
        document.createElement(
            "label"
        );


    labelMotif.textContent =
        "Motif de l'orientation";


    const motif =
        document.createElement(
            "textarea"
        );


    motif.rows =
        3;


    motif.required =
        true;


    motif.placeholder =
        "Ex. Demande de passeport à traiter par le service consulaire";


    groupeMotif.appendChild(
        labelMotif
    );


    groupeMotif.appendChild(
        motif
    );


    // =============================================
    // MESSAGE
    // =============================================

    const message =
        document.createElement(
            "div"
        );


    message.className =
        "secretariat-routing-message";


    // =============================================
    // BOUTON
    // =============================================

    const bouton =
        document.createElement(
            "button"
        );


    bouton.type =
        "submit";


    bouton.className =
        "button";


    bouton.textContent =
        "Confirmer l'orientation";


    formulaire.appendChild(
        groupeDestination
    );


    formulaire.appendChild(
        groupeMotif
    );


    formulaire.appendChild(
        bouton
    );


    formulaire.appendChild(
        message
    );


    // =============================================
    // ENVOI
    // =============================================

    formulaire.addEventListener(
        "submit",
        async (event) => {

            event.preventDefault();


            bouton.disabled =
                true;


            bouton.textContent =
                "Orientation...";


            message.textContent =
                "";


            try {

                const reponse =
                    await fetch(
                        `/api/secretariat/demandes/${demande.id}/orientation`,
                        {
                            method:
                                "POST",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body:
                                JSON.stringify({

                                    organisationId:
                                        organisationId,

                                    tenantCode:
                                        tenant,

                                    destinationUnitId:
                                        Number(
                                            selectDestination.value
                                        ),

                                    motif:
                                        motif.value.trim()
                                })
                        }
                    );


                const resultat =
                    await reponse.json();


                if (!reponse.ok) {

                    throw new Error(
                        resultat.erreur
                        || "Orientation impossible."
                    );
                }


                message.className =
                    "secretariat-routing-message success";


                message.textContent =
                    `✓ Orientée vers ${resultat.destination.nom}`;


                bouton.textContent =
                    "Orientation enregistrée";


                selectDestination.disabled =
                    true;


                motif.disabled =
                    true;

            } catch (exception) {

                console.error(
                    "Erreur orientation :",
                    exception
                );


                message.className =
                    "secretariat-routing-message error";


                message.textContent =
                    exception.message;


                bouton.disabled =
                    false;


                bouton.textContent =
                    "Confirmer l'orientation";
            }
        }
    );


    return formulaire;
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


function normaliserPriorite(
    priorite
) {

    return String(
        priorite || "NORMALE"
    )
        .trim()
        .toUpperCase();
}


// =========================================================
// DÉMARRAGE
// =========================================================

chargerSecretariat();