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


const organisationNom =
    document.getElementById(
        "organisationNom"
    );


const organisationLoading =
    document.getElementById(
        "organisationLoading"
    );


const organisationErreur =
    document.getElementById(
        "organisationErreur"
    );


const organisationTree =
    document.getElementById(
        "organisationTree"
    );


// =========================================================
// CHARGEMENT
// =========================================================

async function chargerOrganisation() {

    try {

        organisationLoading.hidden =
            false;

        organisationErreur.hidden =
            true;

        organisationTree.hidden =
            true;


        const reponse =
            await fetch(
                `/api/organisations/${organisationId}/structure?tenant=${tenant}`
            );


        const donnees =
            await reponse.json();


        if (!reponse.ok) {

            throw new Error(
                donnees.erreur
                || "Impossible de charger l'organisation."
            );
        }


        afficherOrganisation(
            donnees
        );

    } catch (erreur) {

        console.error(
            erreur
        );


        organisationLoading.hidden =
            true;

        organisationTree.hidden =
            true;

        organisationErreur.hidden =
            false;

        organisationErreur.textContent =
            erreur.message;
    }
}


// =========================================================
// AFFICHAGE
// =========================================================

function afficherOrganisation(
    donnees
) {

    organisationNom.textContent =
        donnees.organisation.nom;


    organisationLoading.hidden =
        true;

    organisationErreur.hidden =
        true;

    organisationTree.hidden =
        false;


    organisationTree.innerHTML =
        "";


    const racines =
        donnees.units.filter(
            (unit) =>
                unit.parent_unit_id === null
        );


    racines.forEach(
        (unit) => {

            const element =
                creerUnite(
                    unit,
                    donnees.units
                );


            organisationTree.appendChild(
                element
            );
        }
    );
}


// =========================================================
// CRÉATION RÉCURSIVE D'UNE UNITÉ
// =========================================================

function creerUnite(
    unit,
    toutesLesUnits
) {

    const wrapper =
        document.createElement(
            "div"
        );


    wrapper.className =
        "organisation-unit";


    const card =
        document.createElement(
            "div"
        );


    card.className =
        "organisation-unit-card";


    const titre =
        document.createElement(
            "h3"
        );


    titre.textContent =
        unit.nom;


    const type =
        document.createElement(
            "p"
        );


    type.className =
        "muted";


    type.textContent =
        libelleType(
            unit.type
        );


    card.appendChild(
        titre
    );


    card.appendChild(
        type
    );


    // =====================================================
    // MISSION
    // =====================================================

    if (
        unit.metadata
        &&
        unit.metadata.mission
    ) {

        const mission =
            document.createElement(
                "p"
            );


        mission.className =
            "organisation-mission";


        mission.textContent =
            unit.metadata.mission;


        card.appendChild(
            mission
        );
    }


    // =====================================================
    // ASSISTANT SECRÉTARIAT
    // =====================================================

    if (
        unit.metadata
        &&
        unit.metadata.assistantSecretariat === true
    ) {

        const assistant =
            document.createElement(
                "div"
            );


        assistant.className =
            "organisation-capability";


        assistant.textContent =
            "✦ Assistant secrétariat";


        card.appendChild(
            assistant
        );
    }


    // =====================================================
    // MEMBRES
    // =====================================================

    if (
        Array.isArray(
            unit.membres
        )
        &&
        unit.membres.length > 0
    ) {

        const membres =
            document.createElement(
                "div"
            );


        membres.className =
            "organisation-members";


        unit.membres.forEach(
            (membre) => {

                const membreElement =
                    document.createElement(
                        "div"
                    );


                membreElement.className =
                    "organisation-member";


                const nom =
                    document.createElement(
                        "strong"
                    );


                nom.textContent =
                    `${membre.prenom} ${membre.nom}`;


                const role =
                    document.createElement(
                        "span"
                    );


                role.textContent =
                    libelleRole(
                        membre.role
                    );


                membreElement.appendChild(
                    nom
                );


                membreElement.appendChild(
                    role
                );


                membres.appendChild(
                    membreElement
                );
            }
        );


        card.appendChild(
            membres
        );
    }


    wrapper.appendChild(
        card
    );


    // =====================================================
    // ENFANTS
    // =====================================================

    const enfants =
        toutesLesUnits.filter(
            (enfant) =>
                enfant.parent_unit_id === unit.id
        );


    if (
        enfants.length > 0
    ) {

        const enfantsContainer =
            document.createElement(
                "div"
            );


        enfantsContainer.className =
            "organisation-children";


        enfants.forEach(
            (enfant) => {

                enfantsContainer.appendChild(
                    creerUnite(
                        enfant,
                        toutesLesUnits
                    )
                );
            }
        );


        wrapper.appendChild(
            enfantsContainer
        );
    }


    return wrapper;
}


// =========================================================
// LIBELLÉS
// =========================================================

function libelleType(
    type
) {

    const labels = {

        HEAD_OF_MISSION_OFFICE:
            "Bureau du chef de mission",

        OPERATIONAL_DEPUTY_OFFICE:
            "Bureau de l'adjoint opérationnel",

        SECRETARIAT:
            "Secrétariat",

        SERVICE:
            "Service",

        PROJECT_OFFICE:
            "Bureau de projet"
    };


    return labels[type]
        || type;
}


function libelleRole(
    role
) {

    const labels = {

        HEAD_OF_MISSION:
            "Chef de mission",

        OPERATIONAL_DEPUTY:
            "Adjoint opérationnel",

        UNIT_MANAGER:
            "Responsable",

        AGENT:
            "Agent"
    };


    return labels[role]
        || role;
}


// =========================================================
// DÉMARRAGE
// =========================================================

chargerOrganisation();