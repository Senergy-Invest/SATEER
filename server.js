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
    orienterDemandeDatabase,

    obtenirStructureOrganisationDatabase,

    creerOrganisationUnitDatabase,
    modifierOrganisationUnitDatabase,
    deplacerOrganisationUnitDatabase,
    desactiverOrganisationUnitDatabase,

    listerMembresOrganisationUnitDatabase,
    affecterMembreOrganisationUnitDatabase,
    modifierMembreOrganisationUnitDatabase,
    desactiverMembreOrganisationUnitDatabase,

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
// API - ADMINISTRATION GÉNÉRIQUE DES UNITÉS
// =========================================================


// =========================================================
// CRÉER UNE UNITÉ / SOUS-UNITÉ
// =========================================================

app.post(
    "/api/organisations/:organisationId/units",
    async (req, res) => {

        try {

            const organisationId =
                Number(req.params.organisationId);

            const tenantCode =
                req.body.tenantCode
                || req.query.tenant
                || "SN";


            const {
                parentUnitId = null,
                code,
                nom,
                type,
                metadata = {}
            } = req.body;


            if (
                !organisationId
                || !code
                || !nom
                || !type
            ) {

                return res
                    .status(400)
                    .json({
                        statut:
                            "DONNEES_UNITE_INVALIDES",

                        erreur:
                            "organisationId, code, nom et type sont obligatoires."
                    });
            }


            const resultat =
                await creerOrganisationUnitDatabase(
                    organisationId,
                    tenantCode,
                    {
                        parentUnitId:
                            parentUnitId === null
                                ? null
                                : Number(parentUnitId),

                        code,
                        nom,
                        type,
                        metadata
                    }
                );


            if (!resultat.succes) {

                const statutHttp =
                    resultat.code === "ORGANISATION_INTROUVABLE"
                        ? 404
                        : 409;


                return res
                    .status(statutHttp)
                    .json({
                        statut:
                            resultat.code
                    });
            }


            return res
                .status(201)
                .json({
                    statut:
                        "UNITE_CREEE",

                    unite:
                        resultat.unite
                });

        } catch (erreur) {

            console.error(
                "Erreur création unité :",
                erreur
            );


            return res
                .status(500)
                .json({
                    statut:
                        "ERREUR_CREATION_UNITE",

                    erreur:
                        "Impossible de créer l unité."
                });
        }
    }
);


// =========================================================
// MODIFIER UNE UNITÉ
// =========================================================

app.patch(
    "/api/organisations/:organisationId/units/:unitId",
    async (req, res) => {

        try {

            const organisationId =
                Number(req.params.organisationId);

            const unitId =
                Number(req.params.unitId);

            const tenantCode =
                req.body.tenantCode
                || req.query.tenant
                || "SN";


            if (
                !organisationId
                || !unitId
            ) {

                return res
                    .status(400)
                    .json({
                        statut:
                            "IDENTIFIANTS_INVALIDES"
                    });
            }


            const resultat =
                await modifierOrganisationUnitDatabase(
                    organisationId,
                    unitId,
                    tenantCode,
                    {
                        nom: req.body.nom,
                        type: req.body.type,
                        metadata: req.body.metadata
                    }
                );


            if (!resultat.succes) {

                return res
                    .status(404)
                    .json({
                        statut:
                            resultat.code
                    });
            }


            return res.json({
                statut:
                    "UNITE_MODIFIEE",

                unite:
                    resultat.unite
            });

        } catch (erreur) {

            console.error(
                "Erreur modification unité :",
                erreur
            );


            return res
                .status(500)
                .json({
                    statut:
                        "ERREUR_MODIFICATION_UNITE",

                    erreur:
                        "Impossible de modifier l unité."
                });
        }
    }
);


// =========================================================
// DÉPLACER UNE UNITÉ
// =========================================================

app.post(
    "/api/organisations/:organisationId/units/:unitId/move",
    async (req, res) => {

        try {

            const organisationId =
                Number(req.params.organisationId);

            const unitId =
                Number(req.params.unitId);

            const tenantCode =
                req.body.tenantCode
                || req.query.tenant
                || "SN";


            let nouveauParentUnitId =
                req.body.parentUnitId;


            if (
                nouveauParentUnitId === undefined
                || nouveauParentUnitId === ""
            ) {

                nouveauParentUnitId = null;
            }


            if (nouveauParentUnitId !== null) {

                nouveauParentUnitId =
                    Number(nouveauParentUnitId);


                if (!nouveauParentUnitId) {

                    return res
                        .status(400)
                        .json({
                            statut:
                                "PARENT_INVALIDE"
                        });
                }
            }


            const resultat =
                await deplacerOrganisationUnitDatabase(
                    organisationId,
                    unitId,
                    tenantCode,
                    nouveauParentUnitId
                );


            if (!resultat.succes) {

                const erreursConflit = [
                    "PARENT_IDENTIQUE_UNITE",
                    "BOUCLE_ORGANISATION_INTERDITE"
                ];


                const statutHttp =
                    erreursConflit.includes(
                        resultat.code
                    )
                        ? 409
                        : 404;


                return res
                    .status(statutHttp)
                    .json({
                        statut:
                            resultat.code
                    });
            }


            return res.json({
                statut:
                    "UNITE_DEPLACEE",

                unite:
                    resultat.unite
            });

        } catch (erreur) {

            console.error(
                "Erreur déplacement unité :",
                erreur
            );


            return res
                .status(500)
                .json({
                    statut:
                        "ERREUR_DEPLACEMENT_UNITE",

                    erreur:
                        "Impossible de déplacer l unité."
                });
        }
    }
);


// =========================================================
// DÉSACTIVER UNE UNITÉ
// =========================================================

app.post(
    "/api/organisations/:organisationId/units/:unitId/disable",
    async (req, res) => {

        try {

            const organisationId =
                Number(req.params.organisationId);

            const unitId =
                Number(req.params.unitId);

            const tenantCode =
                req.body.tenantCode
                || req.query.tenant
                || "SN";


            const resultat =
                await desactiverOrganisationUnitDatabase(
                    organisationId,
                    unitId,
                    tenantCode
                );


            if (!resultat.succes) {

                const erreursConflit = [
                    "UNITE_CONTIENT_SOUS_UNITES_ACTIVES",
                    "UNITE_CONTIENT_MEMBRES_ACTIFS"
                ];


                const statutHttp =
                    erreursConflit.includes(
                        resultat.code
                    )
                        ? 409
                        : 404;


                return res
                    .status(statutHttp)
                    .json({
                        statut:
                            resultat.code
                    });
            }


            return res.json({
                statut:
                    "UNITE_DESACTIVEE",

                unite:
                    resultat.unite
            });

        } catch (erreur) {

            console.error(
                "Erreur désactivation unité :",
                erreur
            );


            return res
                .status(500)
                .json({
                    statut:
                        "ERREUR_DESACTIVATION_UNITE",

                    erreur:
                        "Impossible de désactiver l unité."
                });
        }
    }
);
// =========================================================
// API - ADMINISTRATION GÉNÉRIQUE DES MEMBRES D'UNE UNITÉ
// =========================================================


// =========================================================
// LISTER LES MEMBRES
// =========================================================

app.get(
    "/api/organisations/:organisationId/units/:unitId/members",
    async (req, res) => {

        try {

            const organisationId =
                Number(req.params.organisationId);

            const unitId =
                Number(req.params.unitId);

            const tenantCode =
                req.query.tenant || "SN";


            if (
                !organisationId
                || !unitId
            ) {

                return res
                    .status(400)
                    .json({
                        statut:
                            "IDENTIFIANTS_INVALIDES"
                    });
            }


            const resultat =
                await listerMembresOrganisationUnitDatabase(
                    organisationId,
                    unitId,
                    tenantCode
                );


            if (!resultat.succes) {

                return res
                    .status(404)
                    .json({
                        statut:
                            resultat.code
                    });
            }


            return res.json({
                statut:
                    "MEMBRES_UNITE_CHARGES",

                unite:
                    resultat.unite,

                membres:
                    resultat.membres
            });

        } catch (erreur) {

            console.error(
                "Erreur liste membres unité :",
                erreur
            );


            return res
                .status(500)
                .json({
                    statut:
                        "ERREUR_MEMBRES_UNITE"
                });
        }
    }
);


// =========================================================
// AFFECTER UNE PERSONNE À UNE UNITÉ
// =========================================================

app.post(
    "/api/organisations/:organisationId/units/:unitId/members",
    async (req, res) => {

        try {

            const organisationId =
                Number(req.params.organisationId);

            const unitId =
                Number(req.params.unitId);

            const tenantCode =
                req.body.tenantCode
                || req.query.tenant
                || "SN";

            const personneId =
                Number(req.body.personneId);

            const roleId =
                Number(req.body.roleId);


            if (
                !organisationId
                || !unitId
                || !personneId
                || !roleId
            ) {

                return res
                    .status(400)
                    .json({
                        statut:
                            "DONNEES_AFFECTATION_INVALIDES"
                    });
            }


            const resultat =
                await affecterMembreOrganisationUnitDatabase(
                    organisationId,
                    unitId,
                    tenantCode,
                    {
                        personneId,
                        roleId,

                        principal:
                            req.body.principal === true,

                        metadata:
                            req.body.metadata || {}
                    }
                );


            if (!resultat.succes) {

                const erreurs404 = [
                    "UNITE_INTROUVABLE",
                    "PERSONNE_HORS_ORGANISATION",
                    "ROLE_UNITE_INVALIDE"
                ];


                const statutHttp =
                    erreurs404.includes(
                        resultat.code
                    )
                        ? 404
                        : 409;


                return res
                    .status(statutHttp)
                    .json({
                        statut:
                            resultat.code
                    });
            }


            return res
                .status(201)
                .json({
                    statut:
                        "MEMBRE_AFFECTE",

                    affectation:
                        resultat.affectation,

                    personne:
                        resultat.personne,

                    role:
                        resultat.role
                });

        } catch (erreur) {

            console.error(
                "Erreur affectation membre :",
                erreur
            );


            return res
                .status(500)
                .json({
                    statut:
                        "ERREUR_AFFECTATION_MEMBRE"
                });
        }
    }
);


// =========================================================
// MODIFIER UNE AFFECTATION
// =========================================================

app.patch(
    "/api/organisations/:organisationId/units/:unitId/members/:relationId",
    async (req, res) => {

        try {

            const organisationId =
                Number(req.params.organisationId);

            const unitId =
                Number(req.params.unitId);

            const relationId =
                Number(req.params.relationId);

            const tenantCode =
                req.body.tenantCode
                || req.query.tenant
                || "SN";


            if (
                !organisationId
                || !unitId
                || !relationId
            ) {

                return res
                    .status(400)
                    .json({
                        statut:
                            "IDENTIFIANTS_INVALIDES"
                    });
            }


            const donnees = {};


            if (req.body.roleId !== undefined) {

                const roleId =
                    Number(req.body.roleId);


                if (!roleId) {

                    return res
                        .status(400)
                        .json({
                            statut:
                                "ROLE_INVALIDE"
                        });
                }


                donnees.roleId =
                    roleId;
            }


            if (req.body.principal !== undefined) {

                donnees.principal =
                    req.body.principal === true;
            }


            if (req.body.metadata !== undefined) {

                donnees.metadata =
                    req.body.metadata;
            }


            const resultat =
                await modifierMembreOrganisationUnitDatabase(
                    organisationId,
                    unitId,
                    relationId,
                    tenantCode,
                    donnees
                );


            if (!resultat.succes) {

                const statutHttp =
                    resultat.code ===
                    "AFFECTATION_ROLE_EXISTANTE"
                        ? 409
                        : 404;


                return res
                    .status(statutHttp)
                    .json({
                        statut:
                            resultat.code
                    });
            }


            return res.json({
                statut:
                    "AFFECTATION_MODIFIEE",

                affectation:
                    resultat.affectation
            });

        } catch (erreur) {

            console.error(
                "Erreur modification affectation :",
                erreur
            );


            return res
                .status(500)
                .json({
                    statut:
                        "ERREUR_MODIFICATION_AFFECTATION"
                });
        }
    }
);


// =========================================================
// DÉSACTIVER UNE AFFECTATION
// =========================================================

app.post(
    "/api/organisations/:organisationId/units/:unitId/members/:relationId/disable",
    async (req, res) => {

        try {

            const organisationId =
                Number(req.params.organisationId);

            const unitId =
                Number(req.params.unitId);

            const relationId =
                Number(req.params.relationId);

            const tenantCode =
                req.body.tenantCode
                || req.query.tenant
                || "SN";


            const resultat =
                await desactiverMembreOrganisationUnitDatabase(
                    organisationId,
                    unitId,
                    relationId,
                    tenantCode
                );


            if (!resultat.succes) {

                return res
                    .status(404)
                    .json({
                        statut:
                            resultat.code
                    });
            }


            return res.json({
                statut:
                    "AFFECTATION_DESACTIVEE",

                affectation:
                    resultat.affectation
            });

        } catch (erreur) {

            console.error(
                "Erreur désactivation affectation :",
                erreur
            );


            return res
                .status(500)
                .json({
                    statut:
                        "ERREUR_DESACTIVATION_AFFECTATION"
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

        statut,

        "CONSULAR_SERVICE",

        false
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
// API - SECRÉTARIAT - DEMANDES À ORIENTER
// =========================================================

app.get(
    "/api/secretariat/demandes",
    async (req, res) => {

        try {

            const organisationId =
                Number(
                    req.query.organisationId
                );


            const tenantCode =
                req.query.tenant;


            if (
                !organisationId
                ||
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

                    "NOUVELLE",

                    null,

                    true
                );


            return res.json({

                statut:
                    "DEMANDES_SECRETARIAT_CHARGEES",

                demandes:
                    demandes || []
            });


        } catch (erreur) {

            console.error(
                "Erreur demandes secrétariat :",
                erreur
            );


            return res
                .status(500)
                .json({

                    statut:
                        "ERREUR_DEMANDES_SECRETARIAT",

                    erreur:
                        "Impossible de charger les demandes du Secrétariat."
                });
        }
    }
);

// =========================================================
// API - SECRÉTARIAT - ORIENTER UNE DEMANDE
// =========================================================

app.post(
    "/api/secretariat/demandes/:demandeId/orientation",
    async (req, res) => {

        try {

            const demandeId =
                Number(
                    req.params.demandeId
                );


            const {
                organisationId,
                tenantCode,
                destinationUnitId,
                motif,
                orienteePar
            } = req.body;


            if (
                !demandeId
                ||
                !organisationId
                ||
                !tenantCode
                ||
                !destinationUnitId
            ) {

                return res
                    .status(400)
                    .json({

                        statut:
                            "REQUETE_INVALIDE",

                        erreur:
                            "Paramètres d'orientation manquants."
                    });
            }


            const resultat =
                await orienterDemandeDatabase(

                    demandeId,

                    Number(
                        organisationId
                    ),

                    tenantCode,

                    Number(
                        destinationUnitId
                    ),

                    motif
                        ? String(motif).trim()
                        : null,

                    orienteePar
                        ? Number(orienteePar)
                        : null
                );


            if (
                !resultat.succes
            ) {

                if (
                    resultat.raison ===
                    "DEMANDE_INTROUVABLE"
                ) {

                    return res
                        .status(404)
                        .json({

                            statut:
                                "DEMANDE_INTROUVABLE",

                            erreur:
                                "La demande n'existe pas dans cette organisation."
                        });
                }


                if (
                    resultat.raison ===
                    "DESTINATION_INVALIDE"
                ) {

                    return res
                        .status(400)
                        .json({

                            statut:
                                "DESTINATION_INVALIDE",

                            erreur:
                                "Le service de destination est invalide."
                        });
                }


                return res
                    .status(409)
                    .json({

                        statut:
                            "ORIENTATION_IMPOSSIBLE",

                        erreur:
                            "Impossible d'orienter cette demande."
                    });
            }


            return res.json({

                statut:
                    "DEMANDE_ORIENTEE",

                message:
                    "La demande a été orientée.",

                demande:
                    resultat.demande,

                destination:
                    resultat.destination
            });


        } catch (erreur) {

            console.error(
                "Erreur orientation demande :",
                erreur
            );


            return res
                .status(500)
                .json({

                    statut:
                        "ERREUR_ORIENTATION",

                    erreur:
                        "Impossible d'orienter la demande."
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