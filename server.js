const express = require("express");
const path = require("path");

const {
    obtenirMonSateerDatabase,
    trouverOrganisationParIdEtTenantDatabase,
    listerPublicationsVisiblesPourPersonneDatabase,
    listerDemandesPersonneDatabase,
    listerNotificationsPersonneDatabase,
    creerDemandeDatabase,
    listerReponsesDemandeCitoyenDatabase,
    listerHistoriqueDemandeCitoyenDatabase,
    listerDemandesOrganisationDatabase,
    prendreEnChargeDemandeDatabase,
    repondreDemandeDatabase,
    obtenirStructureOrganisationDatabase,
    obtenirDashboardConsulatDatabase,
    obtenirEcosystemeOrganisationDatabase
} = require("./services-database");

const {
    repondreAvecIACitoyen
} = require("./services");

const {
    controlerQuestionAssistant
} = require("./assistant-guard");


const app = express();

const PORT = 3000;


app.use(
    express.json()
);


app.use(
    express.static(
        path.join(
            __dirname,
            "public"
        )
    )
);


// =========================================================
// API - MON SATEER
// =========================================================

app.get(
    "/api/mon-sateer/:personneId",
    async (req, res) => {

        try {

            const personneId =
                Number(
                    req.params.personneId
                );


            const tenantCode =
                req.query.tenant || "SN";


            const monSateer =
                await obtenirMonSateerDatabase(
                    personneId,
                    tenantCode
                );


            if (!monSateer) {

                return res
                    .status(404)
                    .json({
                        erreur:
                            "Espace Mon SATEER introuvable."
                    });
            }


            res.json(
                monSateer
            );


        } catch (erreur) {

            console.error(
                erreur
            );


            res
                .status(500)
                .json({
                    erreur:
                        "Erreur serveur."
                });
        }
    }
);
// =========================================================
// API - MON CONSULAT
// =========================================================

app.get(
    "/api/mon-consulat/:personneId",
    async (req, res) => {

        try {

            const personneId =
                Number(
                    req.params.personneId
                );


            const tenantCode =
                req.query.tenant || "SN";


            const organisationId =
                Number(
                    req.query.organisation || 1
                );


            const organisation =
                await trouverOrganisationParIdEtTenantDatabase(
                    organisationId,
                    tenantCode
                );


            if (!organisation) {

                return res
                    .status(404)
                    .json({
                        erreur:
                            "Consulat introuvable."
                    });
            }


            const publications =
                await listerPublicationsVisiblesPourPersonneDatabase(
                    personneId,
                    organisationId,
                    tenantCode
                );


            const demandes =
                await listerDemandesPersonneDatabase(
                    personneId,
                    organisationId,
                    tenantCode
                );


            const notificationsToutes =
                await listerNotificationsPersonneDatabase(
                    personneId,
                    tenantCode
                );


            const notifications =
                notificationsToutes.filter(
                    notification =>
                        Number(
                            notification.organisation_id
                        ) === organisationId
                );


            res.json({

                organisation:
                    organisation,

                publications:
                    publications,

                demandes:
                    demandes,

                notifications:
                    notifications
            });


        } catch (erreur) {

            console.error(
                erreur
            );


            res
                .status(500)
                .json({
                    erreur:
                        "Erreur serveur Mon Consulat."
                });
        }
    }
);
// =========================================================
// API - IA CITOYEN
// =========================================================

app.post(
    "/api/ia-citoyen",
    async (req, res) => {

        try {

            const {
                personneId,
                organisationId,
                tenantCode,
                question
            } = req.body;


            if (
                !personneId ||
                !organisationId ||
                !tenantCode ||
                !question
            ) {

                return res
                    .status(400)
                    .json({
                        erreur:
                            "Paramètres manquants."
                    });
            }


            const resultat =
                await repondreAvecIACitoyen(
                    Number(personneId),
                    Number(organisationId),
                    tenantCode,
                    question
                );


            res.json(
                resultat
            );


        } catch (erreur) {

            console.error(
                erreur
            );


            res
                .status(500)
                .json({
                    erreur:
                        "Erreur IA Citoyen."
                });
        }
    }
);
// =========================================================
// API - ASSISTANT GÉNÉRIQUE
// =========================================================

// =========================================================
// API - ASSISTANT GÉNÉRIQUE
// =========================================================

app.post(
    "/api/assistant/message",
    async (req, res) => {

        try {

            const {
                personneId,
                organisationId,
                tenantCode,
                useCase,
                question
            } = req.body;


            // =================================================
            // VALIDATION TECHNIQUE
            // =================================================

            if (
                !personneId ||
                !organisationId ||
                !tenantCode ||
                !useCase ||
                !question
            ) {

                return res
                    .status(400)
                    .json({

                        statut:
                            "REQUETE_INVALIDE",

                        erreur:
                            "Paramètres assistant manquants."
                    });
            }


            // =================================================
            // CONTRÔLE GÉNÉRIQUE SATEER
            // =================================================

            const controle =
                controlerQuestionAssistant(
                    question
                );


            if (
                !controle.autoriserMoteur
            ) {

                return res.json(
                    controle.reponse
                );
            }


            // =================================================
            // ROUTAGE PAR USE CASE
            // =================================================

            if (
                useCase ===
                "CITIZEN_ASSISTANT"
            ) {

                const resultat =
                    await repondreAvecIACitoyen(
                        Number(
                            personneId
                        ),
                        Number(
                            organisationId
                        ),
                        tenantCode,
                        question
                    );


                return res.json(
                    resultat
                );
            }


            // =================================================
            // USE CASE INCONNU
            // =================================================

            return res
                .status(400)
                .json({

                    statut:
                        "USE_CASE_NON_SUPPORTE",

                    erreur:
                        "Cet assistant n'est pas encore disponible."
                });


        } catch (erreur) {

            console.error(
                "Erreur Assistant SATEER :",
                erreur
            );


            return res
                .status(500)
                .json({

                    statut:
                        "ERREUR_ASSISTANT",

                    erreur:
                        "Erreur assistant SATEER."
                });
        }
    }
);
// =========================================================
// API - CRÉER UNE DEMANDE
// =========================================================

app.post(
    "/api/demandes",
    async (req, res) => {

        try {

            const {
                personneId,
                organisationId,
                tenantCode,
                categorie,
                objet,
                message,
                priorite,
                canal
            } = req.body;


            // =================================================
            // VALIDATION
            // =================================================

            if (
                !personneId ||
                !organisationId ||
                !tenantCode ||
                !categorie ||
                !objet ||
                !message
            ) {

                return res
                    .status(400)
                    .json({

                        statut:
                            "REQUETE_INVALIDE",

                        erreur:
                            "Veuillez compléter tous les champs obligatoires."
                    });
            }


            // =================================================
            // CRÉATION POSTGRESQL
            // =================================================

            const demande =
                await creerDemandeDatabase(

                    Number(
                        personneId
                    ),

                    Number(
                        organisationId
                    ),

                    tenantCode,

                    categorie,

                    objet,

                    message,

                    priorite ||
                        "NORMALE",

                    canal ||
                        "MON_CONSULAT"
                );


            // =================================================
            // RÉPONSE
            // =================================================

            return res
                .status(201)
                .json({

                    statut:
                        "DEMANDE_CREEE",

                    message:
                        "Votre demande a bien été envoyée.",

                    demande:
                        demande
                });


        } catch (erreur) {

            console.error(
                "Erreur création demande SATEER :",
                erreur
            );


            return res
                .status(500)
                .json({

                    statut:
                        "ERREUR_CREATION_DEMANDE",

                    erreur:
                        "Impossible d'enregistrer la demande pour le moment."
                });
        }
    }
);
// =========================================================
// API - DÉTAIL D'UNE DEMANDE CITOYEN
// =========================================================

// =========================================================
// API - DÉTAIL D'UNE DEMANDE CITOYEN
// =========================================================

app.get(
    "/api/demandes/:demandeId",
    async (req, res) => {

        try {

            const demandeId =
                Number(
                    req.params.demandeId
                );


            const personneId =
                Number(
                    req.query.personneId
                );


            const organisationId =
                Number(
                    req.query.organisationId
                );


            const tenantCode =
                req.query.tenant;


            // =================================================
            // VALIDATION
            // =================================================

            if (
                !demandeId ||
                !personneId ||
                !organisationId ||
                !tenantCode
            ) {

                return res
                    .status(400)
                    .json({

                        statut:
                            "REQUETE_INVALIDE",

                        erreur:
                            "Paramètres de demande manquants."
                    });
            }


            // =================================================
            // DEMANDES ACCESSIBLES
            // =================================================

            const demandes =
                await listerDemandesPersonneDatabase(

                    personneId,

                    organisationId,

                    tenantCode
                );


            // =================================================
            // DEMANDE CIBLÉE
            // =================================================

            const demande =
                demandes.find(
                    item =>
                        Number(
                            item.id
                        ) === demandeId
                );


            if (
                !demande
            ) {

                return res
                    .status(404)
                    .json({

                        statut:
                            "DEMANDE_INTROUVABLE",

                        erreur:
                            "Cette demande est introuvable ou vous n'êtes pas autorisé à la consulter."
                    });
            }


            // =================================================
            // RÉPONSES
            // =================================================

            const reponses =
                await listerReponsesDemandeCitoyenDatabase(

                    demandeId,

                    personneId,

                    organisationId,

                    tenantCode
                );


            // =================================================
            // HISTORIQUE
            // =================================================

            const historique =
                await listerHistoriqueDemandeCitoyenDatabase(

                    demandeId,

                    personneId,

                    organisationId,

                    tenantCode
                );


            // =================================================
            // RÉPONSE API
            // =================================================

            return res.json({

                statut:
                    "DEMANDE_TROUVEE",

                demande:
                    demande,

                reponses:
                    reponses || [],

                historique:
                    historique || []
            });


        } catch (erreur) {

            console.error(
                "Erreur détail demande SATEER :",
                erreur
            );


            return res
                .status(500)
                .json({

                    statut:
                        "ERREUR_DETAIL_DEMANDE",

                    erreur:
                        "Impossible de charger cette demande."
                });
        }
    }
);
// =========================================================
// API - STRUCTURE INTERNE D'UNE ORGANISATION
// =========================================================

app.get(
    "/api/organisations/:organisationId/structure",
    async (req, res) => {

        try {

            const organisationId =
                Number(
                    req.params.organisationId
                );


            const tenantCode =
                req.query.tenant || "SN";


            if (!organisationId) {

                return res
                    .status(400)
                    .json({
                        erreur:
                            "organisationId invalide."
                    });
            }


            const structure =
                await obtenirStructureOrganisationDatabase(
                    organisationId,
                    tenantCode
                );


            if (!structure) {

                return res
                    .status(404)
                    .json({
                        erreur:
                            "Organisation introuvable."
                    });
            }


            return res.json(
                structure
            );

        } catch (erreur) {

            console.error(
                "Erreur API structure organisation :",
                erreur
            );


            return res
                .status(500)
                .json({
                    erreur:
                        "Impossible de charger la structure de l'organisation."
                });
        }
    }
);
// =========================================================
// API - DASHBOARD OPÉRATIONNEL D'UNE ORGANISATION
// =========================================================

app.get(
    "/api/organisations/:organisationId/dashboard-operationnel",
    async (req, res) => {

        try {

            const organisationId =
                Number(
                    req.params.organisationId
                );


            const tenantCode =
                req.query.tenant || "SN";


            if (!organisationId) {

                return res
                    .status(400)
                    .json({
                        erreur:
                            "organisationId invalide."
                    });
            }


            const dashboard =
                await obtenirDashboardConsulatDatabase(
                    organisationId,
                    tenantCode
                );


            if (!dashboard) {

                return res
                    .status(404)
                    .json({
                        erreur:
                            "Dashboard institutionnel introuvable."
                    });
            }


            return res.json(
                dashboard
            );

        } catch (erreur) {

            console.error(
                "Erreur API dashboard opérationnel :",
                erreur
            );


            return res
                .status(500)
                .json({
                    erreur:
                        "Impossible de charger le dashboard opérationnel."
                });
        }
    }
);

// =========================================================
// API - ÉCOSYSTÈME D'UNE ORGANISATION
// =========================================================

app.get(
    "/api/organisations/:organisationId/ecosysteme",
    async (req, res) => {

        try {

            const organisationId =
                Number(
                    req.params.organisationId
                );


            const tenantCode =
                req.query.tenant || "SN";


            if (!organisationId) {

                return res
                    .status(400)
                    .json({
                        erreur:
                            "organisationId invalide."
                    });
            }


            const ecosysteme =
                await obtenirEcosystemeOrganisationDatabase(
                    organisationId,
                    tenantCode
                );


            if (!ecosysteme) {

                return res
                    .status(404)
                    .json({
                        erreur:
                            "Écosystème institutionnel introuvable."
                    });
            }


            return res.json(
                ecosysteme
            );

        } catch (erreur) {

            console.error(
                "Erreur API écosystème organisation :",
                erreur
            );


            return res
                .status(500)
                .json({
                    erreur:
                        "Impossible de charger l'écosystème institutionnel."
                });
        }
    }
);
// =========================================================
// API - ESPACE AGENT - LISTE DES DEMANDES
// =========================================================

app.get(
    "/api/agent/demandes",
    async (req, res) => {

        try {

            const organisationId =
                Number(
                    req.query.organisationId
                );


            const tenantCode =
                req.query.tenant;


            const statut =
                req.query.statut ||
                null;


            if (
                !organisationId ||
                !tenantCode
            ) {

                return res
                    .status(400)
                    .json({

                        statut:
                            "REQUETE_INVALIDE",

                        erreur:
                            "Organisation ou tenant manquant."
                    });
            }


            const demandes =
                await listerDemandesOrganisationDatabase(

                    organisationId,

                    tenantCode,

                    statut
                );


            return res.json({

                statut:
                    "DEMANDES_CHARGEES",

                demandes:
                    demandes || []
            });


        } catch (erreur) {

            console.error(
                "Erreur chargement demandes agent :",
                erreur
            );


            return res
                .status(500)
                .json({

                    statut:
                        "ERREUR_DEMANDES_AGENT",

                    erreur:
                        "Impossible de charger les demandes."
                });
        }
    }
);


// =========================================================
// API - ESPACE AGENT - PRISE EN CHARGE
// =========================================================

app.post(
    "/api/agent/demandes/:demandeId/prise-en-charge",
    async (req, res) => {

        try {

            const demandeId =
                Number(
                    req.params.demandeId
                );


            const {
                agentPersonneId,
                organisationId,
                tenantCode
            } = req.body;


            if (
                !demandeId ||
                !agentPersonneId ||
                !organisationId ||
                !tenantCode
            ) {

                return res
                    .status(400)
                    .json({

                        statut:
                            "REQUETE_INVALIDE",

                        erreur:
                            "Paramètres de prise en charge manquants."
                    });
            }


            const resultat =
                await prendreEnChargeDemandeDatabase(

                    demandeId,

                    Number(
                        agentPersonneId
                    ),

                    Number(
                        organisationId
                    ),

                    tenantCode
                );


            if (
                !resultat
            ) {

                return res
                    .status(409)
                    .json({

                        statut:
                            "PRISE_EN_CHARGE_IMPOSSIBLE",

                        erreur:
                            "Cette demande ne peut pas être prise en charge."
                    });
            }


            return res.json({

                statut:
                    "DEMANDE_PRISE_EN_CHARGE",

                message:
                    "La demande est maintenant prise en charge.",

                demande:
                    resultat
            });


        } catch (erreur) {

            console.error(
                "Erreur prise en charge demande :",
                erreur
            );


            return res
                .status(500)
                .json({

                    statut:
                        "ERREUR_PRISE_EN_CHARGE",

                    erreur:
                        "Impossible de prendre en charge cette demande."
                });
        }
    }
);


// =========================================================
// API - ESPACE AGENT - RÉPONSE AU CITOYEN
// =========================================================

// =========================================================
// API - ESPACE AGENT - RÉPONSE AU CITOYEN
// =========================================================

app.post(
    "/api/agent/demandes/:demandeId/reponse",
    async (req, res) => {

        try {

            const demandeId =
                Number(
                    req.params.demandeId
                );


            const {
                agentPersonneId,
                organisationId,
                tenantCode,
                contenu
            } = req.body;


            // =================================================
            // VALIDATION
            // =================================================

            if (
                !demandeId ||
                !agentPersonneId ||
                !organisationId ||
                !tenantCode ||
                !contenu ||
                !String(contenu).trim()
            ) {

                return res
                    .status(400)
                    .json({

                        statut:
                            "REQUETE_INVALIDE",

                        erreur:
                            "Paramètres de réponse manquants."
                    });
            }


            // =================================================
            // VÉRIFICATION DU WORKFLOW
            // =================================================

            const demandes =
                await listerDemandesOrganisationDatabase(

                    Number(
                        organisationId
                    ),

                    tenantCode,

                    null
                );


            const demande =
                demandes.find(
                    item =>
                        Number(
                            item.id
                        ) === demandeId
                );


            if (
                !demande
            ) {

                return res
                    .status(404)
                    .json({

                        statut:
                            "DEMANDE_INTROUVABLE",

                        erreur:
                            "Demande introuvable."
                    });
            }


            if (
                demande.statut !==
                "EN_COURS"
            ) {

                return res
                    .status(409)
                    .json({

                        statut:
                            "WORKFLOW_INVALIDE",

                        erreur:
                            "La demande doit être prise en charge avant qu'une réponse puisse être envoyée."
                    });
            }


            // =================================================
            // ENVOI DE LA RÉPONSE
            // =================================================

            const resultat =
                await repondreDemandeDatabase(

                    demandeId,

                    Number(
                        agentPersonneId
                    ),

                    Number(
                        organisationId
                    ),

                    tenantCode,

                    String(
                        contenu
                    ).trim()
                );


            if (
                !resultat
            ) {

                return res
                    .status(409)
                    .json({

                        statut:
                            "REPONSE_IMPOSSIBLE",

                        erreur:
                            "Cette demande ne peut pas recevoir cette réponse."
                    });
            }


            return res.json({

                statut:
                    "REPONSE_ENVOYEE",

                message:
                    "La réponse a été envoyée au citoyen.",

                resultat:
                    resultat
            });


        } catch (erreur) {

            console.error(
                "Erreur réponse demande citoyen :",
                erreur
            );


            return res
                .status(500)
                .json({

                    statut:
                        "ERREUR_REPONSE_DEMANDE",

                    erreur:
                        "Impossible d'envoyer la réponse."
                });
        }
    }
);
// =========================================================
// DÉMARRAGE
// =========================================================

app.listen(
    PORT,
    () => {

        console.log("");
        console.log(
            "========================================"
        );

        console.log(
            "SATEER WEB"
        );

        console.log(
            "========================================"
        );

        console.log(
            `http://localhost:${PORT}`
        );

        console.log("");
    }
);