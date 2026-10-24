// =========================================================
// SATEER - ASSISTANT GUARD
// =========================================================
//
// Couche générique de sécurité placée AVANT les assistants.
//
// Objectifs :
// - détecter plusieurs questions dans un même message
// - comprendre la précision demandée
// - empêcher une réponse générique lorsqu'une donnée précise
//   n'est pas disponible dans une source validée
//
// Cette couche pourra être réutilisée plus tard pour :
// - Mon Consulat
// - Mon Ambassade
// - SATEER Energy
// - Diaspora
// - autres assistants SATEER
// =========================================================


// =========================================================
// NORMALISATION
// =========================================================

function normaliserTexte(texte) {

    return String(
        texte || ""
    )
        .normalize("NFD")
        .replace(
            /[\u0300-\u036f]/g,
            ""
        )
        .toLowerCase()
        .trim();
}


// =========================================================
// DÉTECTION DE PLUSIEURS QUESTIONS
// =========================================================

function contientPlusieursQuestions(
    question
) {

    const texte =
        String(
            question || ""
        );


    // ---------------------------------------------
    // Plusieurs points d'interrogation
    // ---------------------------------------------

    const interrogations =
        (
            texte.match(/\?/g) ||
            []
        ).length;


    if (
        interrogations > 1
    ) {

        return true;
    }


    // ---------------------------------------------
    // Liste numérotée :
    // 1. ...
    // 2. ...
    // 3. ...
    // ---------------------------------------------

    const questionsNumerotees =
        texte.match(
            /(?:^|\s)\d+\s*[.)]\s+/g
        ) || [];


    if (
        questionsNumerotees.length > 1
    ) {

        return true;
    }


    return false;
}


// =========================================================
// DÉTECTION DU SUJET
// =========================================================

function detecterSujet(
    question
) {

    const texte =
        normaliserTexte(
            question
        );


    if (
        texte.includes(
            "passeport"
        )
    ) {

        return "PASSEPORT";
    }


    if (
        texte.includes(
            "carte consulaire"
        )
    ) {

        return "CARTE_CONSULAIRE";
    }


    if (
        texte.includes(
            "naissance"
        )
    ) {

        return "ETAT_CIVIL_NAISSANCE";
    }


    if (
        texte.includes(
            "rendez-vous"
        ) ||
        texte.includes(
            "rendez vous"
        )
    ) {

        return "RENDEZ_VOUS";
    }


    return "INCONNU";
}


// =========================================================
// DÉTECTION DES INFORMATIONS DEMANDÉES
// =========================================================

function detecterIntentions(
    question
) {

    const texte =
        normaliserTexte(
            question
        );


    const intentions =
        [];


    // -----------------------------------------------------
    // PIÈCES / DOCUMENTS
    // -----------------------------------------------------

    if (
        texte.includes(
            "document"
        ) ||
        texte.includes(
            "documents"
        ) ||
        texte.includes(
            "piece"
        ) ||
        texte.includes(
            "pieces"
        ) ||
        texte.includes(
            "justificatif"
        )
    ) {

        intentions.push(
            "PIECES"
        );
    }


    // -----------------------------------------------------
    // TARIF / PRIX
    // -----------------------------------------------------

    if (
        texte.includes(
            "combien coute"
        ) ||
        texte.includes(
            "combien ca coute"
        ) ||
        texte.includes(
            "prix"
        ) ||
        texte.includes(
            "tarif"
        ) ||
        texte.includes(
            "cout"
        ) ||
        texte.includes(
            "payer"
        )
    ) {

        intentions.push(
            "TARIF"
        );
    }


    // -----------------------------------------------------
    // DÉLAI
    // -----------------------------------------------------

    if (
        texte.includes(
            "combien de temps"
        ) ||
        texte.includes(
            "delai"
        ) ||
        texte.includes(
            "quand"
        )
    ) {

        intentions.push(
            "DELAI"
        );
    }


    // -----------------------------------------------------
    // RETRAIT
    // -----------------------------------------------------

    if (
        texte.includes(
            "recuperer"
        ) ||
        texte.includes(
            "retirer"
        ) ||
        texte.includes(
            "retrait"
        )
    ) {

        intentions.push(
            "RETRAIT"
        );
    }


    // -----------------------------------------------------
    // SUIVI INDIVIDUEL
    // -----------------------------------------------------

    if (
        texte.includes(
            "ou est"
        ) ||
        texte.includes(
            "suivre"
        ) ||
        texte.includes(
            "suivi"
        ) ||
        texte.includes(
            "statut"
        ) ||
        texte.includes(
            "etat de mon"
        )
    ) {

        intentions.push(
            "SUIVI"
        );
    }


    // -----------------------------------------------------
    // PROCÉDURE
    // -----------------------------------------------------

    if (
        texte.includes(
            "comment renouveler"
        ) ||
        texte.includes(
            "comment faire"
        ) ||
        texte.includes(
            "que dois-je faire"
        ) ||
        texte.includes(
            "que dois je faire"
        ) ||
        texte.includes(
            "procedure"
        )
    ) {

        intentions.push(
            "PROCEDURE"
        );
    }


    return [
        ...new Set(
            intentions
        )
    ];
}


// =========================================================
// RÉPONSES DE SÉCURITÉ
// =========================================================

function construireReponseInformationManquante(
    sujet,
    intentions
) {

    const labels = {

        PIECES:
            "la liste exacte des pièces à fournir",

        TARIF:
            "le tarif exact",

        DELAI:
            "le délai exact",

        RETRAIT:
            "les modalités précises de retrait",

        SUIVI:
            "le suivi individuel de votre dossier"
    };


    const informations =
        intentions
            .filter(
                intention =>
                    labels[intention]
            )
            .map(
                intention =>
                    labels[intention]
            );


    if (
        informations.length === 0
    ) {

        return null;
    }


    // -----------------------------------------------------
    // Une seule information
    // -----------------------------------------------------

    if (
        informations.length === 1
    ) {

        return (
            "Je ne dispose pas actuellement d'une information institutionnelle validée concernant " +
            informations[0] +
            " pour cette démarche. " +
            "Je préfère ne pas vous communiquer une information qui pourrait être incorrecte. " +
            "Vous pouvez contacter le Consulat afin qu'un agent vous apporte une confirmation."
        );
    }


    // -----------------------------------------------------
    // Plusieurs informations précises
    // -----------------------------------------------------

    const derniere =
        informations[
            informations.length - 1
        ];


    const debut =
        informations
            .slice(
                0,
                -1
            )
            .join(", ");


    return (
        "Votre question porte sur plusieurs informations précises : " +
        debut +
        " et " +
        derniere +
        ". " +
        "Ces informations ne figurent pas encore dans les sources institutionnelles validées auxquelles j'ai accès. " +
        "Je préfère ne rien inventer. " +
        "Vous pouvez contacter le Consulat afin qu'un agent vous apporte une confirmation."
    );
}


// =========================================================
// CONTRÔLE PRINCIPAL
// =========================================================

function controlerQuestionAssistant(
    question
) {

    // -----------------------------------------------------
    // Question vide
    // -----------------------------------------------------

    if (
        !question ||
        !String(question).trim()
    ) {

        return {

            autoriserMoteur:
                false,

            reponse: {

                statut:
                    "QUESTION_INVALIDE",

                confiance:
                    "FAIBLE",

                categorie:
                    "INCONNUE",

                reponse:
                    "Veuillez saisir une question.",

                sources:
                    [],

                escaladeHumaine:
                    false
            }
        };
    }


    // -----------------------------------------------------
    // Plusieurs questions séparées
    // -----------------------------------------------------

    if (
        contientPlusieursQuestions(
            question
        )
    ) {

        return {

            autoriserMoteur:
                false,

            reponse: {

                statut:
                    "PRECISION_REQUISE",

                confiance:
                    "ELEVEE",

                categorie:
                    "MULTI_QUESTION",

                reponse:
                    "Votre message contient plusieurs questions. Pour vous répondre avec précision et éviter toute confusion, posez-les une par une.",

                sources:
                    [],

                escaladeHumaine:
                    false
            }
        };
    }


    const sujet =
        detecterSujet(
            question
        );


    const intentions =
        detecterIntentions(
            question
        );


    // -----------------------------------------------------
    // CAS PILOTE PASSEPORT
    //
    // Notre connaissance validée permet actuellement
    // l'orientation générale vers la procédure de
    // renouvellement.
    //
    // Elle ne contient pas encore les données précises
    // suivantes :
    // - pièces
    // - tarif
    // - délai
    // - retrait
    // - suivi individuel
    // -----------------------------------------------------

    if (
        sujet === "PASSEPORT"
    ) {

        const intentionsPrecises =
            intentions.filter(
                intention =>
                    [
                        "PIECES",
                        "TARIF",
                        "DELAI",
                        "RETRAIT",
                        "SUIVI"
                    ].includes(
                        intention
                    )
            );


        if (
            intentionsPrecises.length > 0
        ) {

            const reponse =
                construireReponseInformationManquante(
                    sujet,
                    intentionsPrecises
                );


            return {

                autoriserMoteur:
                    false,

                reponse: {

                    statut:
                        "ESCALADE_HUMAINE",

                    confiance:
                        "ELEVEE",

                    categorie:
                        "PASSEPORT",

                    reponse:
                        reponse,

                    sources:
                        [],

                    escaladeHumaine:
                        true
                }
            };
        }
    }


    // -----------------------------------------------------
    // Sinon :
    // on laisse travailler le moteur IA citoyen existant.
    // -----------------------------------------------------

    return {

        autoriserMoteur:
            true,

        sujet:
            sujet,

        intentions:
            intentions
    };
}


// =========================================================
// EXPORTS
// =========================================================

module.exports = {

    controlerQuestionAssistant,

    detecterSujet,

    detecterIntentions,

    contientPlusieursQuestions
};