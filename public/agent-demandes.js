const AGENT_PERSONNE_ID = 3;
const TENANT = "SN";


// =========================================================
// PARAMÈTRES URL
// =========================================================

const params =
    new URLSearchParams(
        window.location.search
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
    ) || "MON_CONSULAT";


// =========================================================
// ÉTAT
// =========================================================

let demandes =
    [];


let demandeSelectionnee =
    null;


let statutActif =
    "";


// =========================================================
// DOM
// =========================================================

const backButton =
    document.getElementById(
        "backButton"
    );


const agentContextLabel =
    document.getElementById(
        "agentContextLabel"
    );


const demandesContainer =
    document.getElementById(
        "agentDemandesContainer"
    );


const detailPanel =
    document.getElementById(
        "agentDetailPanel"
    );


const detailObjet =
    document.getElementById(
        "agentDetailObjet"
    );


const detailStatut =
    document.getElementById(
        "agentDetailStatut"
    );


const detailCitoyen =
    document.getElementById(
        "agentDetailCitoyen"
    );


const detailCategorie =
    document.getElementById(
        "agentDetailCategorie"
    );


const detailTerritoire =
    document.getElementById(
        "agentDetailTerritoire"
    );


const detailAssignee =
    document.getElementById(
        "agentDetailAssignee"
    );


const detailPriorite =
    document.getElementById(
        "agentDetailPriorite"
    );


const detailDate =
    document.getElementById(
        "agentDetailDate"
    );


const detailDescription =
    document.getElementById(
        "agentDetailDescription"
    );


const priseEnChargeBlock =
    document.getElementById(
        "priseEnChargeBlock"
    );


const prendreEnChargeButton =
    document.getElementById(
        "prendreEnChargeButton"
    );


const reponseBlock =
    document.getElementById(
        "reponseBlock"
    );


const reponseInput =
    document.getElementById(
        "agentReponseInput"
    );


const envoyerReponseButton =
    document.getElementById(
        "envoyerReponseButton"
    );


const demandeTermineeBlock =
    document.getElementById(
        "demandeTermineeBlock"
    );


const actionMessage =
    document.getElementById(
        "agentActionMessage"
    );


// =========================================================
// INITIALISATION VISUELLE
// =========================================================

detailPanel.hidden =
    true;


priseEnChargeBlock.hidden =
    true;


reponseBlock.hidden =
    true;


demandeTermineeBlock.hidden =
    true;


// =========================================================
// CONTEXTE
// =========================================================

function configurerContexte() {

    if (
        SOURCE ===
        "MON_CONSULAT"
    ) {

        agentContextLabel.textContent =
            "ESPACE AGENT • MON CONSULAT";

        return;
    }


    if (
        SOURCE ===
        "MON_AMBASSADE"
    ) {

        agentContextLabel.textContent =
            "ESPACE AGENT • MON AMBASSADE";

        return;
    }


    agentContextLabel.textContent =
        "ESPACE AGENT SATEER";
}


// =========================================================
// RETOUR
// =========================================================

backButton.addEventListener(
    "click",
    () => {

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
// CLASSE STATUT
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
// MESSAGE ACTION
// =========================================================

function afficherMessageAction(
    message,
    type = "success"
) {

    actionMessage.textContent =
        message;


    actionMessage.hidden =
        false;


    actionMessage.className =
        type === "error"
            ? "form-message form-message-error"
            : "form-message form-message-success";
}


// =========================================================
// MASQUER TOUTES LES ACTIONS
// =========================================================

function masquerActions() {

    priseEnChargeBlock.hidden =
        true;


    reponseBlock.hidden =
        true;


    demandeTermineeBlock.hidden =
        true;
}


// =========================================================
// CONFIGURER WORKFLOW VISUEL
// =========================================================

function configurerWorkflow(
    statut
) {

    masquerActions();


    // =====================================================
    // NOUVELLE
    //
    // L'AGENT NE PEUT QUE PRENDRE EN CHARGE
    // =====================================================

    if (
        statut ===
        "NOUVELLE"
    ) {

        priseEnChargeBlock.hidden =
            false;


        reponseBlock.hidden =
            true;


        demandeTermineeBlock.hidden =
            true;


        return;
    }


    // =====================================================
    // EN_COURS
    //
    // L'AGENT PEUT MAINTENANT RÉPONDRE
    // =====================================================

    if (
        statut ===
        "EN_COURS"
    ) {

        priseEnChargeBlock.hidden =
            true;


        reponseBlock.hidden =
            false;


        demandeTermineeBlock.hidden =
            true;


        return;
    }


    // =====================================================
    // TRAITEE
    //
    // PLUS AUCUNE ACTION
    // =====================================================

    if (
        statut ===
        "TRAITEE"
    ) {

        priseEnChargeBlock.hidden =
            true;


        reponseBlock.hidden =
            true;


        demandeTermineeBlock.hidden =
            false;


        return;
    }
}


// =========================================================
// AFFICHER LISTE
// =========================================================

function afficherDemandes() {

    demandesContainer.innerHTML =
        "";


    if (
        !demandes ||
        demandes.length === 0
    ) {

        demandesContainer.innerHTML = `
            <div class="empty">
                Aucune demande dans cette catégorie.
            </div>
        `;

        return;
    }


    for (
        const demande
        of demandes
    ) {

        const bouton =
            document.createElement(
                "button"
            );


        bouton.type =
            "button";


        bouton.className =
            "agent-demande-card";


        const citoyen =
            [
                demande.prenom,
                demande.nom
            ]
                .filter(Boolean)
                .join(" ");


        const haut =
            document.createElement(
                "div"
            );


        haut.className =
            "agent-demande-card-top";


        const titre =
            document.createElement(
                "strong"
            );


        titre.textContent =
            demande.objet;


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


        haut.appendChild(
            titre
        );


        haut.appendChild(
            statut
        );


        const meta =
            document.createElement(
                "div"
            );


        meta.className =
            "agent-demande-meta";


        meta.textContent =
            (
                citoyen ||
                "Citoyen"
            ) +
            " • " +
            (
                demande.categorie ||
                "Autre"
            ) +
            " • " +
            formaterDate(
                demande.date_creation
            );


        bouton.appendChild(
            haut
        );


        bouton.appendChild(
            meta
        );


        bouton.addEventListener(
            "click",
            () => {

                selectionnerDemande(
                    demande
                );
            }
        );


        demandesContainer.appendChild(
            bouton
        );
    }
}


// =========================================================
// SÉLECTIONNER DEMANDE
// =========================================================

function selectionnerDemande(
    demande
) {

    demandeSelectionnee =
        demande;


    actionMessage.hidden =
        true;


    reponseInput.value =
        "";


    detailPanel.hidden =
        false;


    detailObjet.textContent =
        demande.objet;


    detailStatut.textContent =
        demande.statut;


    detailStatut.className =
        classeStatut(
            demande.statut
        );


    detailCitoyen.textContent =
        [
            demande.prenom,
            demande.nom
        ]
            .filter(Boolean)
            .join(" ") ||
        "—";


    detailCategorie.textContent =
        demande.categorie ||
        "—";


    detailTerritoire.textContent =
        demande.territoire ||
        demande.pays ||
        "—";


    detailPriorite.textContent =
        demande.priorite ||
        "—";


    detailDate.textContent =
        formaterDate(
            demande.date_creation
        );


    detailDescription.textContent =
        demande.description ||
        "Aucun message.";


    const assignee =
        [
            demande.assignee_prenom,
            demande.assignee_nom
        ]
            .filter(Boolean)
            .join(" ");


    detailAssignee.textContent =
        assignee ||
        "Non assignée";


    // =====================================================
    // WORKFLOW VISUEL STRICT
    // =====================================================

    configurerWorkflow(
        demande.statut
    );


    detailPanel.scrollIntoView({
        behavior:
            "smooth",

        block:
            "start"
    });
}


// =========================================================
// CHARGER DEMANDES
// =========================================================

async function chargerDemandes() {

    try {

        let url =
            `/api/agent/demandes?organisationId=${ORGANISATION_ID}&tenant=${TENANT}`;


        if (
            statutActif
        ) {

            url +=
                `&statut=${encodeURIComponent(statutActif)}`;
        }


        const reponse =
            await fetch(
                url
            );


        const resultat =
            await reponse.json();


        if (
            !reponse.ok
        ) {

            throw new Error(
                resultat.erreur ||
                "Impossible de charger les demandes."
            );
        }


        demandes =
            resultat.demandes ||
            [];


        afficherDemandes();


    } catch (erreur) {

        console.error(
            erreur
        );


        demandesContainer.innerHTML = `
            <div class="form-message form-message-error">
                ${erreur.message}
            </div>
        `;
    }
}


// =========================================================
// FILTRES
// =========================================================

document
    .querySelectorAll(
        ".agent-filter"
    )
    .forEach(
        bouton => {

            bouton.addEventListener(
                "click",
                () => {

                    document
                        .querySelectorAll(
                            ".agent-filter"
                        )
                        .forEach(
                            item => {

                                item.classList.remove(
                                    "active"
                                );
                            }
                        );


                    bouton.classList.add(
                        "active"
                    );


                    statutActif =
                        bouton.dataset.statut ||
                        "";


                    detailPanel.hidden =
                        true;


                    masquerActions();


                    demandeSelectionnee =
                        null;


                    chargerDemandes();
                }
            );
        }
    );


// =========================================================
// PRENDRE EN CHARGE
// =========================================================

prendreEnChargeButton.addEventListener(
    "click",
    async () => {

        if (
            !demandeSelectionnee
        ) {

            return;
        }


        if (
            demandeSelectionnee.statut !==
            "NOUVELLE"
        ) {

            afficherMessageAction(
                "Cette demande n'est plus au statut NOUVELLE.",
                "error"
            );

            return;
        }


        prendreEnChargeButton.disabled =
            true;


        prendreEnChargeButton.textContent =
            "Prise en charge...";


        try {

            const demandeId =
                demandeSelectionnee.id;


            const reponse =
                await fetch(
                    `/api/agent/demandes/${demandeId}/prise-en-charge`,
                    {

                        method:
                            "POST",

                        headers: {

                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify({

                                agentPersonneId:
                                    AGENT_PERSONNE_ID,

                                organisationId:
                                    ORGANISATION_ID,

                                tenantCode:
                                    TENANT
                            })
                    }
                );


            const resultat =
                await reponse.json();


            if (
                !reponse.ok
            ) {

                throw new Error(
                    resultat.erreur ||
                    "Impossible de prendre en charge cette demande."
                );
            }


            // =================================================
            // MISE À JOUR IMMÉDIATE DE L'ÉTAT LOCAL
            // =================================================

            demandeSelectionnee.statut =
                "EN_COURS";


            demandeSelectionnee.assignee_id =
                AGENT_PERSONNE_ID;


            demandeSelectionnee.assignee_prenom =
                "Awa";


            demandeSelectionnee.assignee_nom =
                "Fall";


            // =================================================
            // RAFRAÎCHIR LE DÉTAIL
            // =================================================

            selectionnerDemande(
                demandeSelectionnee
            );


            afficherMessageAction(
                "La demande est maintenant EN_COURS. Vous pouvez rédiger votre réponse."
            );


            // =================================================
            // RAFRAÎCHIR LA LISTE
            // =================================================

            await chargerDemandes();


        } catch (erreur) {

            afficherMessageAction(
                erreur.message,
                "error"
            );


        } finally {

            prendreEnChargeButton.disabled =
                false;


            prendreEnChargeButton.textContent =
                "Prendre en charge";
        }
    }
);


// =========================================================
// ENVOYER RÉPONSE
// =========================================================

envoyerReponseButton.addEventListener(
    "click",
    async () => {

        if (
            !demandeSelectionnee
        ) {

            return;
        }


        // =================================================
        // PROTECTION FRONT
        // =================================================

        if (
            demandeSelectionnee.statut !==
            "EN_COURS"
        ) {

            afficherMessageAction(
                "La demande doit d'abord être prise en charge.",
                "error"
            );

            return;
        }


        const contenu =
            reponseInput.value.trim();


        if (
            !contenu
        ) {

            afficherMessageAction(
                "Veuillez rédiger une réponse.",
                "error"
            );

            return;
        }


        envoyerReponseButton.disabled =
            true;


        envoyerReponseButton.textContent =
            "Envoi en cours...";


        try {

            const reponse =
                await fetch(
                    `/api/agent/demandes/${demandeSelectionnee.id}/reponse`,
                    {

                        method:
                            "POST",

                        headers: {

                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify({

                                agentPersonneId:
                                    AGENT_PERSONNE_ID,

                                organisationId:
                                    ORGANISATION_ID,

                                tenantCode:
                                    TENANT,

                                contenu:
                                    contenu
                            })
                    }
                );


            const resultat =
                await reponse.json();


            if (
                !reponse.ok
            ) {

                throw new Error(
                    resultat.erreur ||
                    "Impossible d'envoyer la réponse."
                );
            }


            // =================================================
            // PASSAGE LOCAL À TRAITEE
            // =================================================

            demandeSelectionnee.statut =
                "TRAITEE";


            selectionnerDemande(
                demandeSelectionnee
            );


            afficherMessageAction(
                "La réponse a été envoyée. La demande est maintenant TRAITEE."
            );


            await chargerDemandes();


        } catch (erreur) {

            afficherMessageAction(
                erreur.message,
                "error"
            );


        } finally {

            envoyerReponseButton.disabled =
                false;


            envoyerReponseButton.textContent =
                "Envoyer la réponse";
        }
    }
);


// =========================================================
// INITIALISATION
// =========================================================

configurerContexte();

masquerActions();

chargerDemandes();