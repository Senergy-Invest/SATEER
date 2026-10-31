
const express = require("express");
const path = require("path");

const {
    obtenirMonSateerDatabase,
    trouverOrganisationParIdEtTenantDatabase,
    listerPublicationsVisiblesPourPersonneDatabase,
    listerPublicationsParOrganisationEtTenantDatabase,
    listerDemandesPersonneDatabase,
    listerNotificationsPersonneDatabase,
    creerDemandeDatabase,
    listerReponsesDemandeCitoyenDatabase,
    listerHistoriqueDemandeCitoyenDatabase,
    listerDemandesOrganisationDatabase,
    prendreEnChargeDemandeDatabase,
    repondreDemandeDatabase,

    obtenirStructureOrganisationDatabase,

    creerOrganisationUnitDatabase,
    modifierOrganisationUnitDatabase,
    deplacerOrganisationUnitDatabase,
    desactiverOrganisationUnitDatabase,

    listerMembresOrganisationUnitDatabase,
    affecterMembreOrganisationUnitDatabase,
    modifierMembreOrganisationUnitDatabase,
    desactiverMembreOrganisationUnitDatabase,

    listerCapabilitiesUnitDatabase,
    listerCapabilitiesOrganisationUnitDatabase,
    activerCapabilityOrganisationUnitDatabase,
    modifierCapabilityOrganisationUnitDatabase,
    desactiverCapabilityOrganisationUnitDatabase,

    listerRolesOrganisationDatabase,
    creerRoleOrganisationDatabase,
    modifierRoleOrganisationDatabase,
    desactiverRoleOrganisationDatabase,
    reactiverRoleOrganisationDatabase,
    listerPermissionsDatabase,
    listerPermissionsRoleOrganisationDatabase,
    ajouterPermissionRoleOrganisationDatabase,
    modifierPermissionRoleOrganisationDatabase,
    desactiverPermissionRoleOrganisationDatabase,
    roleOrganisationEstProtegeDatabase,

    obtenirDashboardConsulatDatabase,
    obtenirDashboardStrategiqueConsulatDatabase,
    listerDelegationsDashboardOperationnelDatabase,
    accorderAccesDashboardOperationnelDatabase,
    revoquerAccesDashboardOperationnelDatabase,
    obtenirEcosystemeOrganisationDatabase,
    obtenirPermissionsEffectivesDatabase,
    obtenirUnitesWorkspaceOverviewDatabase,
    listerDemandesWorkspaceUnitDatabase,
    orienterDemandeWorkspaceUnitDatabase,
    listerOrganisationsPersonneDatabase
} = require("./services-database");

const {
    repondreAvecIACitoyen
} = require("./services");

const {
    controlerQuestionAssistant
} = require("./assistant-guard");

// =========================================================
// AUTHENTIFICATION SATEER
// =========================================================

const {
    authRouter,
    exigerSession
} = require("./auth-http");


// AUTORISATIONS GENERIQUES SATEER
const {
    exigerPermission,
    verifierPermissionPersonneDatabase
} = require("./auth-authorization");

const { exigerTenantTransactionVerifie } = require("./database-request-context");
const { publierDansCanalInstitutionnel } = require("./communication-pilot");

const app = express();

const PORT = Number(process.env.PORT || 3000);


app.use(
    express.json()
);

// =========================================================
// ROUTES D'AUTHENTIFICATION
// =========================================================

app.use(
    "/api/auth",
    authRouter
);

app.use(
    express.static(
        path.join(
            __dirname,
            "public"
        )
    )
);

// Contexte derive de la session et des rattachements actifs.
app.get("/api/context", exigerSession, async (req, res) => {
    try {
        const tenantCode = String(req.query.tenant || "SN").trim();
        if (!tenantCode || tenantCode.length > 50) return res.status(400).json({ statut: "TENANT_INVALIDE" });
        const organisations = await listerOrganisationsPersonneDatabase(Number(req.auth.personneId), tenantCode);
        return res.set("Cache-Control", "no-store").json({
            statut: "CONTEXTE_CHARGE",
            personne: { id: Number(req.auth.personneId), prenom: req.auth.prenom, nom: req.auth.nom },
            tenantCode,
            organisations
        });
    } catch (erreur) {
        console.error("Erreur chargement contexte authentifie :", erreur);
        return res.status(500).json({ statut: "ERREUR_CONTEXTE" });
    }
});

// =========================================================
// CONTROLES D'AUTORISATION DU CIRCUIT METIER
// =========================================================
// Les décisions utilisent exclusivement req.auth.personneId.
// Les identifiants envoyes par le navigateur ne definissent
// jamais l'identite de l'acteur.

async function chargerDroitsActeur(req, organisationId, tenantCode) {
    if (!req.auth || !req.auth.personneId) {
        return { succes: false, code: "SESSION_REQUISE" };
    }

    const organisation = Number(organisationId);
    if (!Number.isSafeInteger(organisation) || organisation <= 0
        || typeof tenantCode !== "string" || !tenantCode.trim()) {
        return { succes: false, code: "CONTEXTE_AUTORISATION_INVALIDE" };
    }

    return obtenirPermissionsEffectivesDatabase(
        req.auth.personneId,
        organisation,
        tenantCode
    );
}

function acteurPossedePermission(droits, permissionCode, uniteId = null) {
    if (!droits || !droits.succes) return false;
    if ((droits.permissionsOrganisation || []).includes(permissionCode)) return true;
    if (uniteId === null || uniteId === undefined) return false;
    const unite = (droits.permissionsParUnite || []).find(
        item => Number(item.uniteId) === Number(uniteId)
    );
    return Boolean(unite && (unite.permissions || []).includes(permissionCode));
}

function unitesAvecPermission(droits, permissionCodes) {
    if (!droits || !droits.succes) return [];
    return (droits.permissionsParUnite || [])
        .filter(item => (item.permissions || []).some(code => permissionCodes.includes(code)))
        .map(item => Number(item.uniteId));
}


function capabilityActive(capabilities, code) {
    return (capabilities || []).some(
        capability => capability.code === code && capability.actif !== false
    );
}

async function chargerContexteWorkspaceUnite(
    req,
    organisationId,
    unitId,
    tenantCode
) {
    const droits = await chargerDroitsActeur(
        req,
        organisationId,
        tenantCode
    );

    if (!droits.succes) {
        return { succes: false, code: droits.code || "ACCES_REFUSE" };
    }

    const permissionsUnite = (droits.permissionsParUnite || []).find(
        item => Number(item.uniteId) === Number(unitId)
    );

    const permissionsEffectives = new Set([
        ...(droits.permissionsOrganisation || []),
        ...((permissionsUnite && permissionsUnite.permissions) || [])
    ]);

    const peutAcceder =
        permissionsEffectives.has("VIEW_UNIT")
        || permissionsEffectives.has("VIEW_INCOMING")
        || permissionsEffectives.has("VIEW_CASE")
        || permissionsEffectives.has("TAKE_CASE")
        || permissionsEffectives.has("PROCESS_CASE")
        || permissionsEffectives.has("RESPOND_CASE")
        || permissionsEffectives.has("ROUTE_CASE")
        || permissionsEffectives.has("VIEW_SUPERVISED_UNITS")
        || permissionsEffectives.has("VIEW_ORGANISATION");

    if (!peutAcceder) {
        return { succes: false, code: "ACCES_UNITE_REFUSE" };
    }

    const resultatCapacites =
        await listerCapabilitiesOrganisationUnitDatabase(
            Number(organisationId),
            Number(unitId),
            tenantCode
        );

    if (!resultatCapacites.succes) {
        return { succes: false, code: resultatCapacites.code || "UNITE_INTROUVABLE" };
    }

    const capabilities = resultatCapacites.capabilities || [];
    const permission = code => permissionsEffectives.has(code);

    const features = {
        canViewInbox:
            capabilityActive(capabilities, "VIEW_INBOX")
            && (permission("VIEW_INCOMING") || permission("VIEW_CASE")),

        canReceiveIncoming:
            capabilityActive(capabilities, "RECEIVE_INCOMING")
            && permission("VIEW_INCOMING"),

        canRouteCases:
            capabilityActive(capabilities, "ROUTE_CASES")
            && permission("ROUTE_CASE"),

        canTakeCases:
            capabilityActive(capabilities, "TAKE_CASES")
            && permission("TAKE_CASE"),

        canProcessCases:
            capabilityActive(capabilities, "PROCESS_CASES")
            && permission("PROCESS_CASE"),

        canRespondCases:
            capabilityActive(capabilities, "RESPOND_CASES")
            && permission("RESPOND_CASE"),

        canViewMembers:
            permission("VIEW_UNIT_MEMBERS")
            || permission("ASSIGN_MEMBER")
            || permission("CHANGE_MEMBER_ROLE")
            || permission("REMOVE_MEMBER"),

        canManageMembers:
            capabilityActive(capabilities, "MANAGE_UNIT_MEMBERS")
            && (
                permission("ASSIGN_MEMBER")
                || permission("CHANGE_MEMBER_ROLE")
                || permission("REMOVE_MEMBER")
            ),

        canViewAnalytics:
            capabilityActive(capabilities, "VIEW_UNIT_ANALYTICS")
            && (
                permission("VIEW_UNIT_ANALYTICS")
                || permission("VIEW_ORGANISATION_ANALYTICS")
            ),

        canUseAi:
            capabilityActive(capabilities, "USE_AI_ASSISTANT")
            && permission("USE_AI_ASSISTANT"),

        canManageProjects:
            capabilityActive(capabilities, "MANAGE_PROJECTS")
            && permission("MANAGE_PROJECTS"),

        canManagePublications:
            capabilityActive(capabilities, "MANAGE_PUBLICATIONS")
            && permission("MANAGE_PUBLICATIONS"),

        canTargetCommunication:
            capabilityActive(capabilities, "TARGET_COMMUNICATION")
            && permission("TARGET_COMMUNICATION"),

        canSuperviseUnits:
            capabilityActive(capabilities, "SUPERVISE_UNITS")
            && permission("VIEW_SUPERVISED_UNITS")
    };

    features.canOpenWorkspace = true;
    features.readOnly = !(
        features.canRouteCases
        || features.canTakeCases
        || features.canProcessCases
        || features.canRespondCases
        || features.canManageMembers
        || features.canManageProjects
        || features.canManagePublications
        || features.canTargetCommunication
        || features.canUseAi
    );

    return {
        succes: true,
        droits,
        permissions: Array.from(permissionsEffectives).sort(),
        unite: resultatCapacites.unite,
        capabilities,
        features
    };
}


// Les rôles institutionnels protégés ne peuvent pas être
// modifiés par l'administration opérationnelle.
async function exigerRoleNonProtege(req, res, next) {
    try {
        const organisationId = Number(req.params.organisationId);
        const roleId = Number(req.params.roleId);
        const tenantCode = req.body?.tenantCode || req.query?.tenant || "SN";

        if (!Number.isSafeInteger(organisationId) || organisationId <= 0
            || !Number.isSafeInteger(roleId) || roleId <= 0) {
            return res.status(400).json({ statut: "CONTEXTE_ROLE_INVALIDE" });
        }

        const resultat = await roleOrganisationEstProtegeDatabase(
            organisationId,
            roleId,
            tenantCode
        );

        if (!resultat.succes) {
            return res.status(404).json({ statut: resultat.code });
        }

        if (resultat.protege) {
            return res.status(403).json({
                statut: "ROLE_INSTITUTIONNEL_PROTEGE",
                role: resultat.role.code
            });
        }

        return next();
    } catch (erreur) {
        console.error("Erreur vérification rôle protégé :", erreur);
        return res.status(500).json({ statut: "ERREUR_CONTROLE_ROLE" });
    }
}


// =========================================================
// API - MON SATEER
// =========================================================

app.get(
    "/api/mon-sateer/:personneId",
    exigerSession,
    async (req, res) => {

        try {

            // L'identite vient de la session, jamais de l'URL.
            const personneId = Number(req.auth.personneId);


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
// CANAL OFFICIEL — diffusion dans SATEER uniquement, sans email externe
// =========================================================
app.get(
    "/api/organisations/:organisationId/canal-officiel",
    ...exigerPermission("MANAGE_PUBLICATIONS", "ORGANISATION"),
    async (req, res) => {
        try {
            const publications = await listerPublicationsParOrganisationEtTenantDatabase(
                Number(req.params.organisationId), String(req.query.tenant || "")
            );
            return res.set("Cache-Control", "no-store").json({
                statut:"PUBLICATIONS_CHARGEES", publications
            });
        } catch (erreur) {
            console.error("Canal officiel - liste :", erreur);
            return res.status(500).json({statut:"ERREUR_CANAL_OFFICIEL"});
        }
    }
);

app.post(
    "/api/organisations/:organisationId/canal-officiel",
    ...exigerPermission("MANAGE_PUBLICATIONS", "ORGANISATION"),
    exigerTenantTransactionVerifie,
    async (req, res) => {
        try {
            const organisationId = Number(req.params.organisationId);
            const tenantCode = String(req.body?.tenantCode || "").trim();
            const audienceType = String(req.body?.audienceType || "TOUS").trim().toUpperCase();

            if (audienceType !== "TOUS") {
                const decision = await verifierPermissionPersonneDatabase({
                    personneId:req.auth.personneId, organisationId, tenantCode,
                    permissionCode:"TARGET_COMMUNICATION"
                });
                if (!decision.succes || !decision.autorise ||
                    decision.portee !== "ORGANISATION") {
                    return res.status(403).json({statut:"CIBLAGE_COMMUNICATION_NON_AUTORISE"});
                }
            }

            const resultat = await publierDansCanalInstitutionnel({
                organisationId,
                tenantId:Number(req.databaseContext.tenantId),
                personneId:Number(req.auth.personneId),
                titre:req.body?.titre,
                contenu:req.body?.contenu,
                categorie:req.body?.categorie,
                priorite:req.body?.priorite,
                audienceType,
                audienceValeur:req.body?.audienceValeur
            });
            if (!resultat.succes) {
                const httpCode = ["PUBLICATION_INVALIDE", "ASSOCIATION_INVALIDE"].includes(resultat.code)
                    ? 400 : resultat.code === "ASSOCIATION_NON_CONNECTEE" ? 403 : 404;
                return res.status(httpCode).json({statut:resultat.code});
            }
            return res.status(201).json({
                statut:"PUBLICATION_DIFFUSEE_SATEER",
                canal:"SATEER",
                publication:resultat.publication,
                notificationsCreees:resultat.notificationsCreees,
                emailExterne:"NON_CONNECTE"
            });
        } catch (erreur) {
            console.error("Canal officiel - publication :", erreur);
            return res.status(500).json({statut:"ERREUR_PUBLICATION_CANAL"});
        }
    }
);

// =========================================================
// API - MON CONSULAT
// =========================================================

app.get(
    "/api/mon-consulat/:personneId",
    exigerSession,
    async (req, res) => {

        try {

            // L'identite vient de la session, jamais de l'URL.
            const personneId = Number(req.auth.personneId);


            const tenantCode =
                req.query.tenant || "SN";


            const organisationId = Number(req.query.organisation);
            if (!Number.isSafeInteger(organisationId) || organisationId <= 0) {
                return res.status(400).json({ statut: "ORGANISATION_REQUISE" });
            }
            const organisationsAutorisees = await listerOrganisationsPersonneDatabase(personneId, tenantCode);
            if (!organisationsAutorisees.some(item => Number(item.id) === organisationId)) {
                return res.status(403).json({ statut: "PERSONNE_HORS_ORGANISATION" });
            }
            const organisation = await trouverOrganisationParIdEtTenantDatabase(organisationId, tenantCode);


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
    exigerSession,
    async (req, res) => {

        try {

            const {
                organisationId,
                tenantCode,
                question
            } = req.body;


            if (
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
                    Number(req.auth.personneId),
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
    exigerSession,
    async (req, res) => {

        try {

            const {
                organisationId,
                tenantCode,
                useCase,
                question
            } = req.body;


            // =================================================
            // VALIDATION TECHNIQUE
            // =================================================

            if (
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


            const organisationsAutorisees = await listerOrganisationsPersonneDatabase(
                Number(req.auth.personneId),
                tenantCode
            );
            if (!organisationsAutorisees.some(item => Number(item.id) === Number(organisationId))) {
                return res.status(403).json({ statut: "PERSONNE_HORS_ORGANISATION" });
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
                        Number(req.auth.personneId),
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
    exigerSession,
    exigerTenantTransactionVerifie,
    async (req, res) => {

        try {

            const {
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


            const organisationsAutorisees = await listerOrganisationsPersonneDatabase(
                Number(req.auth.personneId),
                tenantCode
            );
            if (!organisationsAutorisees.some(item => Number(item.id) === Number(organisationId))) {
                return res.status(403).json({ statut: "PERSONNE_HORS_ORGANISATION" });
            }
            // =================================================
            // CRÉATION POSTGRESQL
            // =================================================

            const demande =
                await creerDemandeDatabase(

                    Number(req.auth.personneId),

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
    exigerSession,
    async (req, res) => {

        try {

            const demandeId =
                Number(
                    req.params.demandeId
                );


            const personneId = Number(req.auth.personneId);


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
                !Number.isSafeInteger(demandeId) || demandeId <= 0 ||
                !Number.isSafeInteger(organisationId) || organisationId <= 0 ||
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
    ...exigerPermission("VIEW_ORGANISATION", "ORGANISATION"),
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
    ...exigerPermission("CREATE_UNIT", "ORGANISATION"),
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
    ...exigerPermission("UPDATE_UNIT", "UNIT"),
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
    ...exigerPermission("MOVE_UNIT", "UNIT"),
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
    ...exigerPermission("DISABLE_UNIT", "UNIT"),
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
    ...exigerPermission("VIEW_UNIT_MEMBERS", "UNIT"),
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
    ...exigerPermission("ASSIGN_MEMBER", "UNIT"),
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
    ...exigerPermission("CHANGE_MEMBER_ROLE", "UNIT"),
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
    ...exigerPermission("REMOVE_MEMBER", "UNIT"),
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
// API - ADMINISTRATION GÉNÉRIQUE DES CAPABILITIES
// =========================================================


// =========================================================
// CATALOGUE DES CAPABILITIES POUR UNITÉS
// =========================================================

app.get(
    "/api/organisations/:organisationId/unit-capabilities",
    ...exigerPermission("VIEW_ORGANISATION", "ORGANISATION"),
    async (req, res) => {

        try {

            const organisationId =
                Number(req.params.organisationId);

            const tenantCode =
                req.query.tenant || "SN";


            const resultat =
                await listerCapabilitiesUnitDatabase(
                    organisationId,
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
                    "CAPABILITIES_UNIT_CHARGEES",

                capabilities:
                    resultat.capabilities
            });

        } catch (erreur) {

            console.error(
                "Erreur catalogue capabilities :",
                erreur
            );


            return res
                .status(500)
                .json({
                    statut:
                        "ERREUR_CAPABILITIES_UNIT"
                });
        }
    }
);


// =========================================================
// CAPABILITIES ACTIVES D'UNE UNITÉ
// =========================================================

app.get(
    "/api/organisations/:organisationId/units/:unitId/capabilities",
    ...exigerPermission("VIEW_UNIT", "UNIT"),
    async (req, res) => {

        try {

            const organisationId =
                Number(req.params.organisationId);

            const unitId =
                Number(req.params.unitId);

            const tenantCode =
                req.query.tenant || "SN";


            const resultat =
                await listerCapabilitiesOrganisationUnitDatabase(
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
                    "CAPABILITIES_UNITE_CHARGEES",

                unite:
                    resultat.unite,

                capabilities:
                    resultat.capabilities
            });

        } catch (erreur) {

            console.error(
                "Erreur capabilities unité :",
                erreur
            );


            return res
                .status(500)
                .json({
                    statut:
                        "ERREUR_CAPABILITIES_UNITE"
                });
        }
    }
);


// =========================================================
// ACTIVER UNE CAPABILITY
// =========================================================

app.post(
    "/api/organisations/:organisationId/units/:unitId/capabilities",
    ...exigerPermission("CONFIGURE_UNIT_CAPABILITIES", "UNIT"),
    async (req, res) => {

        try {

            const organisationId =
                Number(req.params.organisationId);

            const unitId =
                Number(req.params.unitId);

            const capabilityId =
                Number(req.body.capabilityId);

            const tenantCode =
                req.body.tenantCode
                || req.query.tenant
                || "SN";


            if (
                !organisationId
                || !unitId
                || !capabilityId
            ) {

                return res
                    .status(400)
                    .json({
                        statut:
                            "DONNEES_CAPABILITY_INVALIDES"
                    });
            }


            const resultat =
                await activerCapabilityOrganisationUnitDatabase(
                    organisationId,
                    unitId,
                    tenantCode,
                    capabilityId,
                    req.body.configuration || {}
                );


            if (!resultat.succes) {

                return res
                    .status(404)
                    .json({
                        statut:
                            resultat.code
                    });
            }


            return res
                .status(201)
                .json({
                    statut:
                        "CAPABILITY_UNITE_ACTIVEE",

                    capability:
                        resultat.capability,

                    affectation:
                        resultat.affectation
                });

        } catch (erreur) {

            console.error(
                "Erreur activation capability :",
                erreur
            );


            return res
                .status(500)
                .json({
                    statut:
                        "ERREUR_ACTIVATION_CAPABILITY"
                });
        }
    }
);


// =========================================================
// MODIFIER LA CONFIGURATION
// =========================================================

app.patch(
    "/api/organisations/:organisationId/units/:unitId/capabilities/:capabilityId",
    ...exigerPermission("CONFIGURE_UNIT_CAPABILITIES", "UNIT"),
    async (req, res) => {

        try {

            const organisationId =
                Number(req.params.organisationId);

            const unitId =
                Number(req.params.unitId);

            const capabilityId =
                Number(req.params.capabilityId);

            const tenantCode =
                req.body.tenantCode
                || req.query.tenant
                || "SN";


            if (
                req.body.configuration === undefined
            ) {

                return res
                    .status(400)
                    .json({
                        statut:
                            "CONFIGURATION_MANQUANTE"
                    });
            }


            const resultat =
                await modifierCapabilityOrganisationUnitDatabase(
                    organisationId,
                    unitId,
                    capabilityId,
                    tenantCode,
                    req.body.configuration
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
                    "CAPABILITY_UNITE_MODIFIEE",

                affectation:
                    resultat.affectation
            });

        } catch (erreur) {

            console.error(
                "Erreur modification capability :",
                erreur
            );


            return res
                .status(500)
                .json({
                    statut:
                        "ERREUR_MODIFICATION_CAPABILITY"
                });
        }
    }
);


// =========================================================
// DÉSACTIVER UNE CAPABILITY
// =========================================================

app.post(
    "/api/organisations/:organisationId/units/:unitId/capabilities/:capabilityId/disable",
    ...exigerPermission("CONFIGURE_UNIT_CAPABILITIES", "UNIT"),
    async (req, res) => {

        try {

            const organisationId =
                Number(req.params.organisationId);

            const unitId =
                Number(req.params.unitId);

            const capabilityId =
                Number(req.params.capabilityId);

            const tenantCode =
                req.body.tenantCode
                || req.query.tenant
                || "SN";


            const resultat =
                await desactiverCapabilityOrganisationUnitDatabase(
                    organisationId,
                    unitId,
                    capabilityId,
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
                    "CAPABILITY_UNITE_DESACTIVEE",

                affectation:
                    resultat.affectation
            });

        } catch (erreur) {

            console.error(
                "Erreur désactivation capability :",
                erreur
            );


            return res
                .status(500)
                .json({
                    statut:
                        "ERREUR_DESACTIVATION_CAPABILITY"
                });
        }
    }
);
// =========================================================
// SATEER CORE - UNIT WORKSPACE ENGINE
// =========================================================

// Synthèse dynamique des unités pour les dashboards institutionnels.
app.get(
    "/api/organisations/:organisationId/units/overview",
    exigerSession,
    async (req, res) => {
        try {
            const organisationId = Number(req.params.organisationId);
            const tenantCode = String(req.query.tenant || "").trim();

            if (
                !Number.isSafeInteger(organisationId) || organisationId <= 0
                || !tenantCode
            ) {
                return res.status(400).json({
                    statut: "CONTEXTE_ORGANISATION_INVALIDE"
                });
            }

            const droits = await chargerDroitsActeur(
                req,
                organisationId,
                tenantCode
            );

            if (!droits.succes) {
                return res.status(403).json({ statut: "ACCES_REFUSE" });
            }

            const peutVoirToutes =
                acteurPossedePermission(droits, "VIEW_ORGANISATION")
                || acteurPossedePermission(droits, "VIEW_SUPERVISED_UNITS");

            const unites = await obtenirUnitesWorkspaceOverviewDatabase(
                organisationId,
                tenantCode
            );

            const visibles = (unites || [])
                .filter(unite =>
                    peutVoirToutes
                    || acteurPossedePermission(droits, "VIEW_UNIT", unite.id)
                    || acteurPossedePermission(droits, "VIEW_INCOMING", unite.id)
                    || acteurPossedePermission(droits, "VIEW_CASE", unite.id)
                )
                .map(unite => {
                    const canViewMembers =
                        acteurPossedePermission(droits, "VIEW_UNIT_MEMBERS", unite.id)
                        || acteurPossedePermission(droits, "ASSIGN_MEMBER", unite.id)
                        || acteurPossedePermission(droits, "CHANGE_MEMBER_ROLE", unite.id)
                        || acteurPossedePermission(droits, "REMOVE_MEMBER", unite.id);

                    const canViewAnalytics =
                        acteurPossedePermission(droits, "VIEW_UNIT_ANALYTICS", unite.id)
                        || acteurPossedePermission(droits, "VIEW_ORGANISATION_ANALYTICS");

                    return {
                        id: unite.id,
                        organisation_id: unite.organisation_id,
                        parent_unit_id: unite.parent_unit_id,
                        code: unite.code,
                        nom: unite.nom,
                        type: unite.type,
                        capabilities: unite.capabilities || [],
                        members_count: canViewMembers ? unite.members_count : null,
                        total_cases: canViewAnalytics ? unite.total_cases : null,
                        new_cases: canViewAnalytics ? unite.new_cases : null,
                        in_progress_cases: canViewAnalytics ? unite.in_progress_cases : null,
                        treated_cases: canViewAnalytics ? unite.treated_cases : null,
                        urgent_cases: canViewAnalytics ? unite.urgent_cases : null,
                        canViewMembers,
                        canViewAnalytics,
                        canOpenWorkspace:
                            peutVoirToutes
                            || acteurPossedePermission(droits, "VIEW_UNIT", unite.id)
                            || acteurPossedePermission(droits, "VIEW_INCOMING", unite.id)
                            || acteurPossedePermission(droits, "VIEW_CASE", unite.id)
                    };
                });

            return res.json({
                statut: "UNITES_WORKSPACE_CHARGEES",
                organisationId,
                tenantCode,
                unites: visibles
            });
        } catch (erreur) {
            console.error("Erreur synthèse unités Workspace :", erreur);
            return res.status(500).json({
                statut: "ERREUR_SYNTHESE_UNITES"
            });
        }
    }
);


// Contexte fonctionnel d'une unité : capacités + permissions + membres + charge.
app.get(
    "/api/organisations/:organisationId/units/:unitId/workspace",
    exigerSession,
    async (req, res) => {
        try {
            const organisationId = Number(req.params.organisationId);
            const unitId = Number(req.params.unitId);
            const tenantCode = String(req.query.tenant || "").trim();

            if (
                !Number.isSafeInteger(organisationId) || organisationId <= 0
                || !Number.isSafeInteger(unitId) || unitId <= 0
                || !tenantCode
            ) {
                return res.status(400).json({
                    statut: "CONTEXTE_WORKSPACE_INVALIDE"
                });
            }

            const contexte = await chargerContexteWorkspaceUnite(
                req,
                organisationId,
                unitId,
                tenantCode
            );

            if (!contexte.succes) {
                const status = contexte.code === "UNITE_INTROUVABLE" ? 404 : 403;
                return res.status(status).json({
                    statut: contexte.code || "ACCES_REFUSE"
                });
            }

            const synthese = await obtenirUnitesWorkspaceOverviewDatabase(
                organisationId,
                tenantCode
            );

            const statsBrutes = (synthese || []).find(
                unite => Number(unite.id) === unitId
            ) || null;

            const stats = statsBrutes
                ? {
                    members_count: contexte.features.canViewMembers
                        ? statsBrutes.members_count
                        : null,
                    total_cases: contexte.features.canViewAnalytics
                        ? statsBrutes.total_cases
                        : null,
                    new_cases: contexte.features.canViewAnalytics
                        ? statsBrutes.new_cases
                        : null,
                    in_progress_cases: contexte.features.canViewAnalytics
                        ? statsBrutes.in_progress_cases
                        : null,
                    treated_cases: contexte.features.canViewAnalytics
                        ? statsBrutes.treated_cases
                        : null,
                    urgent_cases: contexte.features.canViewAnalytics
                        ? statsBrutes.urgent_cases
                        : null
                }
                : null;

            let membres = [];
            let currentMembership = null;

            // L'utilisateur peut toujours connaître son propre rôle dans l'unité.
            // La liste complète des membres reste réservée aux permissions dédiées.
            const resultatMembres = await listerMembresOrganisationUnitDatabase(
                organisationId,
                unitId,
                tenantCode
            );

            if (resultatMembres.succes) {
                const membresUnite = resultatMembres.membres || [];
                const membreConnecte = membresUnite.find(
                    membre => Number(membre.personne_id) === Number(req.auth.personneId)
                ) || null;

                const membrePublic = membre => ({
                    personne_id: membre.personne_id,
                    prenom: membre.prenom,
                    nom: membre.nom,
                    role_code: membre.role_code,
                    role_nom: membre.role_nom,
                    role_legacy: membre.role_legacy,
                    principal: membre.principal
                });

                currentMembership = membreConnecte
                    ? membrePublic(membreConnecte)
                    : null;

                if (contexte.features.canViewMembers) {
                    membres = membresUnite.map(membrePublic);
                }
            }

            let routingTargets = [];
            if (contexte.features.canRouteCases) {
                const routeCapability = contexte.capabilities.find(
                    capability => capability.code === "ROUTE_CASES"
                );
                const allowedIds = routeCapability?.configuration
                    && Array.isArray(routeCapability.configuration.allowedDestinationUnitIds)
                    ? new Set(routeCapability.configuration.allowedDestinationUnitIds.map(Number))
                    : null;

                routingTargets = (synthese || [])
                    .filter(unite =>
                        Number(unite.id) !== unitId
                        && (!allowedIds || allowedIds.has(Number(unite.id)))
                        && (unite.capabilities || []).some(code =>
                            [
                                "RECEIVE_INCOMING",
                                "TAKE_CASES",
                                "PROCESS_CASES",
                                "RESPOND_CASES"
                            ].includes(code)
                        )
                    )
                    .map(unite => ({
                        id: unite.id,
                        code: unite.code,
                        nom: unite.nom,
                        type: unite.type
                    }));
            }

            return res.json({
                statut: "WORKSPACE_UNITE_CHARGE",
                organisationId,
                tenantCode,
                unit: contexte.unite,
                capabilities: contexte.capabilities.map(capability => ({
                    id: capability.capability_id,
                    code: capability.code,
                    nom: capability.nom,
                    description: capability.description,
                    scope: capability.scope,
                    actif: capability.actif
                })),
                permissions: contexte.permissions,
                features: contexte.features,
                stats,
                members: membres,
                currentMembership,
                routingTargets,
                currentUser: {
                    id: req.auth.personneId,
                    prenom: req.auth.prenom,
                    nom: req.auth.nom
                }
            });
        } catch (erreur) {
            console.error("Erreur chargement Unit Workspace :", erreur);
            return res.status(500).json({
                statut: "ERREUR_WORKSPACE_UNITE"
            });
        }
    }
);


// Boîte de réception générique d'une unité.
app.get(
    "/api/organisations/:organisationId/units/:unitId/inbox",
    exigerSession,
    async (req, res) => {
        try {
            const organisationId = Number(req.params.organisationId);
            const unitId = Number(req.params.unitId);
            const tenantCode = String(req.query.tenant || "").trim();
            const statut = req.query.statut
                ? String(req.query.statut).trim()
                : null;

            if (
                !Number.isSafeInteger(organisationId) || organisationId <= 0
                || !Number.isSafeInteger(unitId) || unitId <= 0
                || !tenantCode
            ) {
                return res.status(400).json({
                    statut: "CONTEXTE_INBOX_INVALIDE"
                });
            }

            const contexte = await chargerContexteWorkspaceUnite(
                req,
                organisationId,
                unitId,
                tenantCode
            );

            if (!contexte.succes) {
                return res.status(403).json({
                    statut: contexte.code || "ACCES_REFUSE"
                });
            }

            if (!contexte.features.canViewInbox) {
                return res.status(403).json({
                    statut: "CAPACITE_OU_PERMISSION_INBOX_REQUISE"
                });
            }

            const demandes = await listerDemandesWorkspaceUnitDatabase(
                organisationId,
                tenantCode,
                unitId,
                contexte.features.canReceiveIncoming,
                statut
            );

            return res.json({
                statut: "INBOX_WORKSPACE_CHARGEE",
                unitId,
                demandes: demandes || []
            });
        } catch (erreur) {
            console.error("Erreur inbox Workspace :", erreur);
            return res.status(500).json({
                statut: "ERREUR_INBOX_WORKSPACE"
            });
        }
    }
);


// Orienter ou réorienter un dossier depuis le contexte de l'unité.
app.post(
    "/api/organisations/:organisationId/units/:unitId/cases/:demandeId/route",
    exigerSession,
    exigerTenantTransactionVerifie,
    async (req, res) => {
        try {
            const organisationId = Number(req.params.organisationId);
            const unitId = Number(req.params.unitId);
            const demandeId = Number(req.params.demandeId);
            const tenantCode = String(req.body?.tenantCode || "").trim();
            const destinationUnitId = Number(req.body?.destinationUnitId);
            const motif = req.body?.motif == null ? null : String(req.body.motif).trim();

            if (
                !Number.isSafeInteger(organisationId) || organisationId <= 0
                || !Number.isSafeInteger(unitId) || unitId <= 0
                || !Number.isSafeInteger(demandeId) || demandeId <= 0
                || !Number.isSafeInteger(destinationUnitId) || destinationUnitId <= 0
                || !tenantCode
                || (motif && motif.length > 2000)
            ) {
                return res.status(400).json({
                    statut: "PARAMETRES_ORIENTATION_INVALIDES"
                });
            }

            const contexte = await chargerContexteWorkspaceUnite(
                req,
                organisationId,
                unitId,
                tenantCode
            );

            if (!contexte.succes) {
                return res.status(403).json({
                    statut: contexte.code || "ACCES_REFUSE"
                });
            }

            if (!contexte.features.canRouteCases) {
                return res.status(403).json({
                    statut: "CAPACITE_OU_PERMISSION_ROUTAGE_REQUISE"
                });
            }

            const resultat = await orienterDemandeWorkspaceUnitDatabase(
                demandeId,
                organisationId,
                tenantCode,
                unitId,
                destinationUnitId,
                motif,
                Number(req.auth.personneId)
            );

            if (!resultat.succes) {
                const status = resultat.code === "DEMANDE_INTROUVABLE"
                    || resultat.code === "UNITE_SOURCE_INTROUVABLE"
                    ? 404
                    : (resultat.code === "DESTINATION_INVALIDE"
                        ? 400
                        : (resultat.code === "DESTINATION_NON_AUTORISEE" ? 403 : 409));

                return res.status(status).json({
                    statut: resultat.code
                });
            }

            return res.json({
                statut: "DOSSIER_ORIENTE",
                demande: resultat.demande,
                destination: resultat.destination
            });
        } catch (erreur) {
            console.error("Erreur routage Workspace :", erreur);
            return res.status(500).json({
                statut: "ERREUR_ROUTAGE_WORKSPACE"
            });
        }
    }
);


// Prendre en charge un dossier dans son unité de destination.
app.post(
    "/api/organisations/:organisationId/units/:unitId/cases/:demandeId/take",
    exigerSession,
    exigerTenantTransactionVerifie,
    async (req, res) => {
        try {
            const organisationId = Number(req.params.organisationId);
            const unitId = Number(req.params.unitId);
            const demandeId = Number(req.params.demandeId);
            const tenantCode = String(req.body?.tenantCode || "").trim();

            if (
                !Number.isSafeInteger(organisationId) || organisationId <= 0
                || !Number.isSafeInteger(unitId) || unitId <= 0
                || !Number.isSafeInteger(demandeId) || demandeId <= 0
                || !tenantCode
            ) {
                return res.status(400).json({
                    statut: "PARAMETRES_PRISE_EN_CHARGE_INVALIDES"
                });
            }

            const contexte = await chargerContexteWorkspaceUnite(
                req,
                organisationId,
                unitId,
                tenantCode
            );

            if (!contexte.succes) {
                return res.status(403).json({
                    statut: contexte.code || "ACCES_REFUSE"
                });
            }

            if (!contexte.features.canTakeCases) {
                return res.status(403).json({
                    statut: "CAPACITE_OU_PERMISSION_PRISE_EN_CHARGE_REQUISE"
                });
            }

            const resultat = await prendreEnChargeDemandeDatabase(
                demandeId,
                Number(req.auth.personneId),
                organisationId,
                tenantCode,
                unitId
            );

            if (!resultat) {
                return res.status(409).json({
                    statut: "PRISE_EN_CHARGE_IMPOSSIBLE"
                });
            }

            return res.json({
                statut: "DOSSIER_PRISE_EN_CHARGE",
                demande: resultat
            });
        } catch (erreur) {
            console.error("Erreur prise en charge Workspace :", erreur);
            return res.status(500).json({
                statut: "ERREUR_PRISE_EN_CHARGE_WORKSPACE"
            });
        }
    }
);


// Répondre à un dossier depuis son unité de destination.
app.post(
    "/api/organisations/:organisationId/units/:unitId/cases/:demandeId/respond",
    exigerSession,
    exigerTenantTransactionVerifie,
    async (req, res) => {
        try {
            const organisationId = Number(req.params.organisationId);
            const unitId = Number(req.params.unitId);
            const demandeId = Number(req.params.demandeId);
            const tenantCode = String(req.body?.tenantCode || "").trim();
            const contenu = typeof req.body?.contenu === "string"
                ? req.body.contenu.trim()
                : "";

            if (
                !Number.isSafeInteger(organisationId) || organisationId <= 0
                || !Number.isSafeInteger(unitId) || unitId <= 0
                || !Number.isSafeInteger(demandeId) || demandeId <= 0
                || !tenantCode
                || !contenu
                || contenu.length > 20000
            ) {
                return res.status(400).json({
                    statut: "PARAMETRES_REPONSE_INVALIDES"
                });
            }

            const contexte = await chargerContexteWorkspaceUnite(
                req,
                organisationId,
                unitId,
                tenantCode
            );

            if (!contexte.succes) {
                return res.status(403).json({
                    statut: contexte.code || "ACCES_REFUSE"
                });
            }

            if (!contexte.features.canRespondCases) {
                return res.status(403).json({
                    statut: "CAPACITE_OU_PERMISSION_REPONSE_REQUISE"
                });
            }

            const resultat = await repondreDemandeDatabase(
                demandeId,
                Number(req.auth.personneId),
                organisationId,
                tenantCode,
                contenu,
                unitId
            );

            if (!resultat) {
                return res.status(409).json({
                    statut: "REPONSE_IMPOSSIBLE",
                    erreur: "Le dossier doit être en cours dans cette unité."
                });
            }

            return res.json({
                statut: "REPONSE_ENVOYEE",
                resultat
            });
        } catch (erreur) {
            console.error("Erreur réponse Workspace :", erreur);
            return res.status(500).json({
                statut: "ERREUR_REPONSE_WORKSPACE"
            });
        }
    }
);


// =========================================================
// API - ADMINISTRATION GÉNÉRIQUE DES RÔLES ET PERMISSIONS
// =========================================================


// =========================================================
// LISTER LES RÔLES D'UNE ORGANISATION
// =========================================================

app.get(
    "/api/organisations/:organisationId/roles",
    ...exigerPermission("VIEW_ORGANISATION", "ORGANISATION"),
    async (req, res) => {

        try {

            const organisationId =
                Number(req.params.organisationId);

            const tenantCode =
                req.query.tenant || "SN";


            const resultat =
                await listerRolesOrganisationDatabase(
                    organisationId,
                    tenantCode
                );


            return res.json({
                statut:
                    "ROLES_ORGANISATION_CHARGES",

                roles:
                    resultat.roles
            });

        } catch (erreur) {

            console.error(
                "Erreur chargement rôles :",
                erreur
            );


            return res
                .status(500)
                .json({
                    statut:
                        "ERREUR_ROLES_ORGANISATION"
                });
        }
    }
);


// =========================================================
// CRÉER UN RÔLE
// =========================================================

app.post(
    "/api/organisations/:organisationId/roles",
    ...exigerPermission("MANAGE_ROLES", "ORGANISATION"),
    async (req, res) => {

        try {

            const organisationId =
                Number(req.params.organisationId);

            const tenantCode =
                req.body.tenantCode
                || req.query.tenant
                || "SN";


            const resultat =
                await creerRoleOrganisationDatabase(
                    organisationId,
                    tenantCode,
                    req.body
                );


            if (!resultat.succes) {

                const codeHttp =
                    resultat.code ===
                    "ROLE_CODE_EXISTANT"
                        ? 409
                        : 400;


                return res
                    .status(codeHttp)
                    .json({
                        statut:
                            resultat.code
                    });
            }


            return res
                .status(201)
                .json({
                    statut:
                        "ROLE_ORGANISATION_CREE",

                    role:
                        resultat.role
                });

        } catch (erreur) {

            console.error(
                "Erreur création rôle :",
                erreur
            );


            return res
                .status(500)
                .json({
                    statut:
                        "ERREUR_CREATION_ROLE"
                });
        }
    }
);


// =========================================================
// MODIFIER UN RÔLE
// =========================================================

app.patch(
    "/api/organisations/:organisationId/roles/:roleId",
    ...exigerPermission("MANAGE_ROLES", "ORGANISATION"),
    exigerRoleNonProtege,
    async (req, res) => {

        try {

            const organisationId =
                Number(req.params.organisationId);

            const roleId =
                Number(req.params.roleId);

            const tenantCode =
                req.body.tenantCode
                || req.query.tenant
                || "SN";


            const resultat =
                await modifierRoleOrganisationDatabase(
                    organisationId,
                    roleId,
                    tenantCode,
                    req.body
                );


            if (!resultat.succes) {

                return res
                    .status(
                        resultat.code ===
                        "ROLE_CODE_EXISTANT"
                            ? 409
                            : 404
                    )
                    .json({
                        statut:
                            resultat.code
                    });
            }


            return res.json({
                statut:
                    "ROLE_ORGANISATION_MODIFIE",

                role:
                    resultat.role
            });

        } catch (erreur) {

            console.error(
                "Erreur modification rôle :",
                erreur
            );


            return res
                .status(500)
                .json({
                    statut:
                        "ERREUR_MODIFICATION_ROLE"
                });
        }
    }
);


// =========================================================
// DÉSACTIVER UN RÔLE
// =========================================================

app.post(
    "/api/organisations/:organisationId/roles/:roleId/disable",
    ...exigerPermission("MANAGE_ROLES", "ORGANISATION"),
    exigerRoleNonProtege,
    async (req, res) => {

        try {

            const organisationId =
                Number(req.params.organisationId);

            const roleId =
                Number(req.params.roleId);

            const tenantCode =
                req.body.tenantCode
                || req.query.tenant
                || "SN";


            const resultat =
                await desactiverRoleOrganisationDatabase(
                    organisationId,
                    roleId,
                    tenantCode
                );


            if (!resultat.succes) {

                if (
                    resultat.code ===
                    "ROLE_UTILISE_PAR_AFFECTATIONS_ACTIVES"
                ) {

                    return res
                        .status(409)
                        .json({
                            statut:
                                resultat.code,

                            affectationsActives:
                                resultat.affectationsActives
                        });
                }


                return res
                    .status(404)
                    .json({
                        statut:
                            resultat.code
                    });
            }


            return res.json({
                statut:
                    "ROLE_ORGANISATION_DESACTIVE",

                role:
                    resultat.role
            });

        } catch (erreur) {

            console.error(
                "Erreur désactivation rôle :",
                erreur
            );


            return res
                .status(500)
                .json({
                    statut:
                        "ERREUR_DESACTIVATION_ROLE"
                });
        }
    }
);


// =========================================================
// RÉACTIVER UN RÔLE
// =========================================================

app.post(
    "/api/organisations/:organisationId/roles/:roleId/activate",
    ...exigerPermission("MANAGE_ROLES", "ORGANISATION"),
    exigerRoleNonProtege,
    async (req, res) => {

        try {

            const organisationId =
                Number(req.params.organisationId);

            const roleId =
                Number(req.params.roleId);

            const tenantCode =
                req.body.tenantCode
                || req.query.tenant
                || "SN";


            const resultat =
                await reactiverRoleOrganisationDatabase(
                    organisationId,
                    roleId,
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
                    "ROLE_ORGANISATION_ACTIVE",

                role:
                    resultat.role
            });

        } catch (erreur) {

            console.error(
                "Erreur réactivation rôle :",
                erreur
            );


            return res
                .status(500)
                .json({
                    statut:
                        "ERREUR_REACTIVATION_ROLE"
                });
        }
    }
);


// =========================================================
// CATALOGUE GLOBAL DES PERMISSIONS
// =========================================================

app.get(
    "/api/permissions",
    exigerSession,
    async (req, res) => {

        try {

            const resultat =
                await listerPermissionsDatabase();


            return res.json({
                statut:
                    "PERMISSIONS_CHARGEES",

                permissions:
                    resultat.permissions
            });

        } catch (erreur) {

            console.error(
                "Erreur chargement permissions :",
                erreur
            );


            return res
                .status(500)
                .json({
                    statut:
                        "ERREUR_PERMISSIONS"
                });
        }
    }
);


// =========================================================
// PERMISSIONS D'UN RÔLE
// =========================================================

app.get(
    "/api/organisations/:organisationId/roles/:roleId/permissions",
    ...exigerPermission("VIEW_ORGANISATION", "ORGANISATION"),
    async (req, res) => {

        try {

            const organisationId =
                Number(req.params.organisationId);

            const roleId =
                Number(req.params.roleId);

            const tenantCode =
                req.query.tenant || "SN";


            const resultat =
                await listerPermissionsRoleOrganisationDatabase(
                    organisationId,
                    roleId,
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
                    "PERMISSIONS_ROLE_CHARGEES",

                role:
                    resultat.role,

                permissions:
                    resultat.permissions
            });

        } catch (erreur) {

            console.error(
                "Erreur permissions rôle :",
                erreur
            );


            return res
                .status(500)
                .json({
                    statut:
                        "ERREUR_PERMISSIONS_ROLE"
                });
        }
    }
);


// =========================================================
// AJOUTER / RÉACTIVER UNE PERMISSION SUR UN RÔLE
// =========================================================

app.post(
    "/api/organisations/:organisationId/roles/:roleId/permissions",
    ...exigerPermission("MANAGE_ROLE_PERMISSIONS", "ORGANISATION"),
    exigerRoleNonProtege,
    async (req, res) => {

        try {

            const organisationId =
                Number(req.params.organisationId);

            const roleId =
                Number(req.params.roleId);

            const permissionId =
                Number(req.body.permissionId);

            const tenantCode =
                req.body.tenantCode
                || req.query.tenant
                || "SN";


            if (!permissionId) {

                return res
                    .status(400)
                    .json({
                        statut:
                            "PERMISSION_ID_MANQUANTE"
                    });
            }


            const resultat =
                await ajouterPermissionRoleOrganisationDatabase(
                    organisationId,
                    roleId,
                    permissionId,
                    tenantCode,
                    req.body.configuration || {}
                );


            if (!resultat.succes) {

                return res
                    .status(404)
                    .json({
                        statut:
                            resultat.code
                    });
            }


            return res
                .status(201)
                .json({
                    statut:
                        "PERMISSION_ROLE_ACTIVEE",

                    permission:
                        resultat.permission,

                    affectation:
                        resultat.affectation
                });

        } catch (erreur) {

            console.error(
                "Erreur ajout permission rôle :",
                erreur
            );


            return res
                .status(500)
                .json({
                    statut:
                        "ERREUR_AJOUT_PERMISSION_ROLE"
                });
        }
    }
);


// =========================================================
// MODIFIER CONFIGURATION PERMISSION ↔ RÔLE
// =========================================================

app.patch(
    "/api/organisations/:organisationId/roles/:roleId/permissions/:permissionId",
    ...exigerPermission("MANAGE_ROLE_PERMISSIONS", "ORGANISATION"),
    exigerRoleNonProtege,
    async (req, res) => {

        try {

            const organisationId =
                Number(req.params.organisationId);

            const roleId =
                Number(req.params.roleId);

            const permissionId =
                Number(req.params.permissionId);

            const tenantCode =
                req.body.tenantCode
                || req.query.tenant
                || "SN";


            if (
                req.body.configuration === undefined
            ) {

                return res
                    .status(400)
                    .json({
                        statut:
                            "CONFIGURATION_MANQUANTE"
                    });
            }


            const resultat =
                await modifierPermissionRoleOrganisationDatabase(
                    organisationId,
                    roleId,
                    permissionId,
                    tenantCode,
                    req.body.configuration
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
                    "PERMISSION_ROLE_MODIFIEE",

                affectation:
                    resultat.affectation
            });

        } catch (erreur) {

            console.error(
                "Erreur modification permission rôle :",
                erreur
            );


            return res
                .status(500)
                .json({
                    statut:
                        "ERREUR_MODIFICATION_PERMISSION_ROLE"
                });
        }
    }
);


// =========================================================
// DÉSACTIVER UNE PERMISSION D'UN RÔLE
// =========================================================

app.post(
    "/api/organisations/:organisationId/roles/:roleId/permissions/:permissionId/disable",
    ...exigerPermission("MANAGE_ROLE_PERMISSIONS", "ORGANISATION"),
    exigerRoleNonProtege,
    async (req, res) => {

        try {

            const organisationId =
                Number(req.params.organisationId);

            const roleId =
                Number(req.params.roleId);

            const permissionId =
                Number(req.params.permissionId);

            const tenantCode =
                req.body.tenantCode
                || req.query.tenant
                || "SN";


            const resultat =
                await desactiverPermissionRoleOrganisationDatabase(
                    organisationId,
                    roleId,
                    permissionId,
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
                    "PERMISSION_ROLE_DESACTIVEE",

                affectation:
                    resultat.affectation
            });

        } catch (erreur) {

            console.error(
                "Erreur désactivation permission rôle :",
                erreur
            );


            return res
                .status(500)
                .json({
                    statut:
                        "ERREUR_DESACTIVATION_PERMISSION_ROLE"
                });
        }
    }
);
// =========================================================
// ACCÈS AU DASHBOARD OPÉRATIONNEL
// =========================================================

app.get(
    "/api/organisations/:organisationId/dashboard-operationnel/acces",
    exigerSession,
    async (req, res) => {
        try {
            const organisationId = Number(req.params.organisationId);
            const tenantCode = req.query.tenant || "SN";
            const droits = await chargerDroitsActeur(req, organisationId, tenantCode);

            if (!droits.succes) {
                return res.status(403).json({ statut: "ACCES_REFUSE" });
            }

            const rolePermissions = droits.permissionsOrganisationRole || [];
            const delegatedPermissions = droits.permissionsDelegueesOrganisation || [];

            return res.json({
                statut: "ACCES_DASHBOARD_OPERATIONNEL",
                peutConsulter: acteurPossedePermission(droits, "VIEW_OPERATIONAL_DASHBOARD"),
                peutGererAcces: acteurPossedePermission(droits, "MANAGE_OPERATIONAL_DASHBOARD_ACCESS"),
                sourceAcces: rolePermissions.includes("VIEW_OPERATIONAL_DASHBOARD")
                    ? "ROLE"
                    : (delegatedPermissions.includes("VIEW_OPERATIONAL_DASHBOARD") ? "DELEGATION" : "AUCUN")
            });
        } catch (erreur) {
            console.error("Erreur vérification accès dashboard opérationnel :", erreur);
            return res.status(500).json({ statut: "ERREUR_ACCES_DASHBOARD" });
        }
    }
);


// =========================================================
// ESPACES INSTITUTIONNELS DISPONIBLES POUR LA SESSION
// =========================================================

app.get(
    "/api/organisations/:organisationId/dashboards/acces",
    exigerSession,
    async (req, res) => {
        try {
            const organisationId = Number(req.params.organisationId);
            const tenantCode = req.query.tenant || "SN";
            const droits = await chargerDroitsActeur(req, organisationId, tenantCode);

            if (!droits.succes) {
                return res.status(403).json({ statut: "ACCES_REFUSE" });
            }

            return res.json({
                statut: "ESPACES_INSTITUTIONNELS_CHARGES",
                dashboards: {
                    strategique: acteurPossedePermission(droits, "VIEW_STRATEGIC_DASHBOARD"),
                    operationnel: acteurPossedePermission(droits, "VIEW_OPERATIONAL_DASHBOARD"),
                    gererAccesOperationnel: acteurPossedePermission(droits, "MANAGE_OPERATIONAL_DASHBOARD_ACCESS")
                }
            });
        } catch (erreur) {
            console.error("Erreur chargement espaces institutionnels :", erreur);
            return res.status(500).json({ statut: "ERREUR_ESPACES_INSTITUTIONNELS" });
        }
    }
);


// =========================================================
// GESTION DES DÉLÉGATIONS DE CONSULTATION OPÉRATIONNELLE
// =========================================================

app.get(
    "/api/organisations/:organisationId/dashboard-operationnel/delegations",
    ...exigerPermission("MANAGE_OPERATIONAL_DASHBOARD_ACCESS", "ORGANISATION"),
    async (req, res) => {
        try {
            const resultat = await listerDelegationsDashboardOperationnelDatabase(
                Number(req.params.organisationId),
                req.query.tenant || "SN"
            );
            return res.json({ statut: "DELEGATIONS_DASHBOARD_CHARGEES", membres: resultat.membres });
        } catch (erreur) {
            console.error("Erreur chargement délégations dashboard :", erreur);
            return res.status(500).json({ statut: "ERREUR_DELEGATIONS_DASHBOARD" });
        }
    }
);

app.post(
    "/api/organisations/:organisationId/dashboard-operationnel/delegations",
    ...exigerPermission("MANAGE_OPERATIONAL_DASHBOARD_ACCESS", "ORGANISATION"),
    async (req, res) => {
        try {
            const personneId = Number(req.body.personneId);
            if (!Number.isSafeInteger(personneId) || personneId <= 0) {
                return res.status(400).json({ statut: "PERSONNE_ID_INVALIDE" });
            }

            const resultat = await accorderAccesDashboardOperationnelDatabase(
                Number(req.params.organisationId),
                personneId,
                Number(req.auth.personneId),
                req.body.tenantCode || req.query.tenant || "SN",
                typeof req.body.motif === "string" ? req.body.motif.trim().slice(0, 500) : null
            );

            if (!resultat.succes) {
                return res.status(400).json({ statut: resultat.code });
            }

            return res.status(resultat.dejaAutorise ? 200 : 201).json({
                statut: resultat.dejaAutorise ? "ACCES_DEJA_HERITE_DU_ROLE" : "ACCES_OPERATIONNEL_DELEGUE",
                source: resultat.source || "DELEGATION",
                delegation: resultat.delegation || null
            });
        } catch (erreur) {
            console.error("Erreur attribution accès dashboard :", erreur);
            return res.status(500).json({ statut: "ERREUR_ATTRIBUTION_ACCES" });
        }
    }
);

app.delete(
    "/api/organisations/:organisationId/dashboard-operationnel/delegations/:personneId",
    ...exigerPermission("MANAGE_OPERATIONAL_DASHBOARD_ACCESS", "ORGANISATION"),
    async (req, res) => {
        try {
            const resultat = await revoquerAccesDashboardOperationnelDatabase(
                Number(req.params.organisationId),
                Number(req.params.personneId),
                Number(req.auth.personneId),
                req.query.tenant || "SN"
            );

            if (!resultat.succes) {
                return res.status(404).json({ statut: resultat.code });
            }

            return res.json({ statut: "ACCES_OPERATIONNEL_REVOQUE", delegation: resultat.delegation });
        } catch (erreur) {
            console.error("Erreur révocation accès dashboard :", erreur);
            return res.status(500).json({ statut: "ERREUR_REVOCATION_ACCES" });
        }
    }
);


// =========================================================
// API - DASHBOARD STRATÉGIQUE DU CHEF DE MISSION
// =========================================================

app.get(
    "/api/organisations/:organisationId/dashboard-strategique",
    ...exigerPermission("VIEW_STRATEGIC_DASHBOARD", "ORGANISATION"),
    async (req, res) => {
        try {
            const dashboard = await obtenirDashboardStrategiqueConsulatDatabase(
                Number(req.params.organisationId),
                req.query.tenant || "SN"
            );

            if (!dashboard) {
                return res.status(404).json({ statut: "DASHBOARD_STRATEGIQUE_INTROUVABLE" });
            }

            return res.json(dashboard);
        } catch (erreur) {
            console.error("Erreur dashboard stratégique :", erreur);
            return res.status(500).json({ statut: "ERREUR_DASHBOARD_STRATEGIQUE" });
        }
    }
);


// =========================================================
// API - DASHBOARD OPÉRATIONNEL D'UNE ORGANISATION
// =========================================================

app.get(
    "/api/organisations/:organisationId/dashboard-operationnel",
    ...exigerPermission("VIEW_OPERATIONAL_DASHBOARD", "ORGANISATION"),
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
    ...exigerPermission("VIEW_ORGANISATION", "ORGANISATION"),
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
    exigerSession,
    async (req, res) => {
        try {
            const organisationId = Number(req.query.organisationId);
            const unitId = Number(req.query.unitId);
            const tenantCode = String(req.query.tenant || "").trim();
            const statut = req.query.statut
                ? String(req.query.statut).trim()
                : null;

            if (
                !Number.isSafeInteger(organisationId) || organisationId <= 0
                || !Number.isSafeInteger(unitId) || unitId <= 0
                || !tenantCode
            ) {
                return res.status(400).json({
                    statut: "CONTEXTE_INBOX_INVALIDE"
                });
            }

            const contexte = await chargerContexteWorkspaceUnite(
                req,
                organisationId,
                unitId,
                tenantCode
            );

            if (!contexte.succes || !contexte.features.canViewInbox) {
                return res.status(403).json({
                    statut: "ACCES_REFUSE",
                    permissionRequise: "VIEW_INBOX + VIEW_INCOMING"
                });
            }

            const demandes = await listerDemandesWorkspaceUnitDatabase(
                organisationId,
                tenantCode,
                unitId,
                contexte.features.canReceiveIncoming,
                statut
            );

            return res.json({
                statut: "DEMANDES_CHARGEES",
                unitId,
                demandes: demandes || []
            });
        } catch (erreur) {
            console.error("Erreur chargement demandes agent :", erreur);
            return res.status(500).json({
                statut: "ERREUR_DEMANDES_AGENT"
            });
        }
    }
);


// =========================================================
// API - SECRÉTARIAT - DEMANDES À ORIENTER
// =========================================================

app.get(
    "/api/secretariat/demandes",
    exigerSession,
    async (req, res) => {
        try {
            const organisationId = Number(req.query.organisationId);
            const unitId = Number(req.query.unitId);
            const tenantCode = String(req.query.tenant || "").trim();

            if (
                !Number.isSafeInteger(organisationId) || organisationId <= 0
                || !Number.isSafeInteger(unitId) || unitId <= 0
                || !tenantCode
            ) {
                return res.status(400).json({
                    statut: "CONTEXTE_INBOX_INVALIDE"
                });
            }

            const contexte = await chargerContexteWorkspaceUnite(
                req,
                organisationId,
                unitId,
                tenantCode
            );

            if (
                !contexte.succes
                || !contexte.features.canViewInbox
                || !contexte.features.canReceiveIncoming
                || !contexte.features.canRouteCases
            ) {
                return res.status(403).json({
                    statut: "ACCES_REFUSE",
                    permissionRequise: "VIEW_INCOMING + ROUTE_CASE"
                });
            }

            const demandes = await listerDemandesWorkspaceUnitDatabase(
                organisationId,
                tenantCode,
                unitId,
                true,
                "NOUVELLE"
            );

            return res.json({
                statut: "DEMANDES_SECRETARIAT_CHARGEES",
                unitId,
                demandes: demandes || []
            });
        } catch (erreur) {
            console.error("Erreur demandes secrétariat :", erreur);
            return res.status(500).json({
                statut: "ERREUR_DEMANDES_SECRETARIAT"
            });
        }
    }
);


// =========================================================
// API - COMPATIBILITÉ SECRÉTARIAT - ORIENTER UN DOSSIER
// =========================================================

app.post(
    "/api/secretariat/demandes/:demandeId/orientation",
    exigerSession,
    exigerTenantTransactionVerifie,
    async (req, res) => {
        try {
            const demandeId = Number(req.params.demandeId);
            const organisationId = Number(req.body?.organisationId);
            const unitId = Number(req.body?.unitId);
            const destinationUnitId = Number(req.body?.destinationUnitId);
            const tenantCode = String(req.body?.tenantCode || "").trim();
            const motif = req.body?.motif == null ? null : String(req.body.motif).trim();

            if (
                !Number.isSafeInteger(demandeId) || demandeId <= 0
                || !Number.isSafeInteger(organisationId) || organisationId <= 0
                || !Number.isSafeInteger(unitId) || unitId <= 0
                || !Number.isSafeInteger(destinationUnitId) || destinationUnitId <= 0
                || !tenantCode
                || (motif && motif.length > 2000)
            ) {
                return res.status(400).json({
                    statut: "PARAMETRES_ORIENTATION_INVALIDES"
                });
            }

            const contexte = await chargerContexteWorkspaceUnite(
                req,
                organisationId,
                unitId,
                tenantCode
            );

            if (!contexte.succes || !contexte.features.canRouteCases) {
                return res.status(403).json({
                    statut: "ACCES_REFUSE",
                    permissionRequise: "ROUTE_CASE"
                });
            }

            const resultat = await orienterDemandeWorkspaceUnitDatabase(
                demandeId,
                organisationId,
                tenantCode,
                unitId,
                destinationUnitId,
                motif,
                Number(req.auth.personneId)
            );

            if (!resultat.succes) {
                const status = resultat.code === "DEMANDE_INTROUVABLE"
                    || resultat.code === "UNITE_SOURCE_INTROUVABLE"
                    ? 404
                    : (resultat.code === "DESTINATION_INVALIDE"
                        ? 400
                        : (resultat.code === "DESTINATION_NON_AUTORISEE" ? 403 : 409));

                return res.status(status).json({
                    statut: resultat.code || "ORIENTATION_IMPOSSIBLE"
                });
            }

            return res.json({
                statut: "DEMANDE_ORIENTEE",
                demande: resultat.demande,
                destination: resultat.destination
            });
        } catch (erreur) {
            console.error("Erreur orientation demande :", erreur);
            return res.status(500).json({
                statut: "ERREUR_ORIENTATION"
            });
        }
    }
);


// =========================================================
// API - ESPACE AGENT - PRISE EN CHARGE
// =========================================================

app.post(
    "/api/agent/demandes/:demandeId/prise-en-charge",
    exigerSession,
    exigerTenantTransactionVerifie,
    async (req, res) => {

        try {

            const demandeId =
                Number(
                    req.params.demandeId
                );


            const {
                organisationId,
                tenantCode
            } = req.body;


            if (
                !Number.isSafeInteger(demandeId) || demandeId <= 0 ||
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


            const demandesContexte = await listerDemandesOrganisationDatabase(
                Number(organisationId), tenantCode, null
            );
            const demandeCible = (demandesContexte || []).find(
                item => Number(item.id) === demandeId
            );
            if (!demandeCible || !demandeCible.destination_unit_id) {
                return res.status(404).json({ statut: "DEMANDE_INTROUVABLE" });
            }

            const unitId = Number(demandeCible.destination_unit_id);
            const contexte = await chargerContexteWorkspaceUnite(
                req,
                Number(organisationId),
                unitId,
                tenantCode
            );

            if (!contexte.succes || !contexte.features.canTakeCases) {
                return res.status(403).json({
                    statut: "ACCES_REFUSE",
                    permissionRequise: "TAKE_CASES + TAKE_CASE"
                });
            }

            const resultat =
                await prendreEnChargeDemandeDatabase(

                    demandeId,

                    Number(req.auth.personneId),

                    Number(
                        organisationId
                    ),

                    tenantCode,
                    unitId
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
    exigerSession,
    exigerTenantTransactionVerifie,
    async (req, res) => {

        try {

            const demandeId =
                Number(
                    req.params.demandeId
                );


            const {
                organisationId,
                tenantCode,
                contenu
            } = req.body;


            // =================================================
            // VALIDATION
            // =================================================

            if (
                !Number.isSafeInteger(demandeId) || demandeId <= 0 ||
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


            if (!demande.destination_unit_id) {
                return res.status(404).json({
                    statut: "DEMANDE_SANS_UNITE_DESTINATAIRE"
                });
            }

            const unitId = Number(demande.destination_unit_id);
            const contexte = await chargerContexteWorkspaceUnite(
                req,
                Number(organisationId),
                unitId,
                tenantCode
            );

            if (!contexte.succes || !contexte.features.canRespondCases) {
                return res.status(403).json({
                    statut: "ACCES_REFUSE",
                    permissionRequise: "RESPOND_CASES + RESPOND_CASE"
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

                    Number(req.auth.personneId),

                    Number(
                        organisationId
                    ),

                    tenantCode,

                    String(
                        contenu
                    ).trim(),
                    unitId
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