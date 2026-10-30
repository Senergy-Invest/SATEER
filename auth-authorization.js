// =========================================================
// SATEER CORE
// CONTROLE GENERIQUE DES AUTORISATIONS
// =========================================================
//
// Les permissions proviennent de PostgreSQL.
//
// Aucun nom d'unite ou de role institutionnel
// n'est code en dur.
//
// Une permission peut s'appliquer :
// - a toute une organisation
// - a une unite precise
//
// L'identite HTTP est fournie par une session verifiee.
// =========================================================

const {
    exigerSession
} = require("./auth-http");

const {
    obtenirPermissionsEffectivesDatabase
} = require("./services-database");


// =========================================================
// VERIFIER UNE PERMISSION DANS LES DROITS CALCULES
// =========================================================

function verifierDansDroits(
    droits,
    permissionCode,
    uniteId = null
) {

    const permissionsOrganisation =
        droits.permissionsOrganisation || [];

    // Une permission organisationnelle s'applique
    // au contexte de l'organisation.

    if (
        permissionsOrganisation.includes(
            permissionCode
        )
    ) {

        return {
            autorise: true,
            portee: "ORGANISATION"
        };
    }


    // En l'absence d'unite cible, les permissions
    // locales ne donnent aucun droit global.

    if (uniteId === null) {

        return {
            autorise: false,
            portee: null
        };
    }


    const unite =
        (droits.permissionsParUnite || [])
            .find(
                element =>
                    Number(element.uniteId) ===
                    Number(uniteId)
            );


    if (
        unite
        && unite.permissions.includes(
            permissionCode
        )
    ) {

        return {
            autorise: true,
            portee: "UNIT"
        };
    }


    return {
        autorise: false,
        portee: null
    };
}


// =========================================================
// VERIFIER LES PERMISSIONS D'UNE PERSONNE
// =========================================================
//
// Cette fonction calcule une autorisation.
//
// Elle ne prouve pas l'identite de l'appelant.
// En HTTP, seule exigerSession fournit cette identite.
// =========================================================

async function verifierPermissionPersonneDatabase({
    personneId,
    organisationId,
    tenantCode,
    permissionCode,
    uniteId = null
}) {

    const personne = Number(personneId);
    const organisation = Number(organisationId);

    const unite =
        uniteId === null
            ? null
            : Number(uniteId);


    if (
        !Number.isSafeInteger(personne)
        || personne <= 0
        || !Number.isSafeInteger(organisation)
        || organisation <= 0
        || typeof tenantCode !== "string"
        || tenantCode.trim() === ""
        || typeof permissionCode !== "string"
        || permissionCode.trim() === ""
        || (
            unite !== null
            && (
                !Number.isSafeInteger(unite)
                || unite <= 0
            )
        )
    ) {

        return {
            succes: false,
            autorise: false,
            code: "PARAMETRES_AUTORISATION_INVALIDES"
        };
    }


    const droits =
        await obtenirPermissionsEffectivesDatabase(
            personne,
            organisation,
            tenantCode
        );


    if (!droits.succes) {

        return {
            succes: false,
            autorise: false,
            code: droits.code
        };
    }


    const decision =
        verifierDansDroits(
            droits,
            permissionCode,
            unite
        );


    return {
        succes: true,
        autorise: decision.autorise,
        permission: permissionCode,
        organisationId: organisation,
        uniteId: unite,
        portee: decision.portee
    };
}


// =========================================================
// MIDDLEWARE HTTP GENERIQUE
// =========================================================
//
// Utilisation future :
//
// ...exigerPermission("CREATE_UNIT")
//
// ...exigerPermission("PROCESS_CASE", "UNIT")
//
// La personne vient exclusivement de req.auth.
//
// Les routes doivent toujours verifier le perimetre
// reel des objets qu'elles manipulent.
// =========================================================

function exigerPermission(
    permissionCode,
    perimetre = "ORGANISATION"
) {

    if (
        !["ORGANISATION", "UNIT"].includes(
            perimetre
        )
    ) {

        throw new Error(
            "PERIMETRE_PERMISSION_INVALIDE"
        );
    }


    return [
        exigerSession,

        async (req, res, next) => {

            try {

                const organisationId =
                    Number(
                        req.params.organisationId
                    );

                const tenantCode =
                    req.body?.tenantCode
                    || req.query?.tenant;


                const uniteId =
                    perimetre === "UNIT"
                        ? Number(req.params.unitId)
                        : null;


                if (
                    !Number.isSafeInteger(
                        organisationId
                    )
                    || organisationId <= 0
                    || !tenantCode
                    || (
                        perimetre === "UNIT"
                        && (
                            !Number.isSafeInteger(uniteId)
                            || uniteId <= 0
                        )
                    )
                ) {

                    return res.status(400).json({
                        statut: "CONTEXTE_AUTORISATION_INVALIDE"
                    });
                }


                const resultat =
                    await verifierPermissionPersonneDatabase({
                        personneId:
                            req.auth.personneId,

                        organisationId,

                        tenantCode,

                        permissionCode,

                        uniteId
                    });


                if (
                    !resultat.succes
                    || !resultat.autorise
                ) {

                    return res.status(403).json({
                        statut: "ACCES_REFUSE",
                        permissionRequise:
                            permissionCode
                    });
                }


                req.autorisation = {
                    organisationId,
                    uniteId,
                    permission:
                        permissionCode,
                    portee:
                        resultat.portee
                };


                next();

            } catch (erreur) {

                console.error(
                    "Erreur controle autorisation :",
                    erreur
                );


                return res.status(500).json({
                    statut:
                        "ERREUR_AUTORISATION"
                });
            }
        }
    ];
}


// =========================================================
// EXPORTS
// =========================================================

module.exports = {
    verifierPermissionPersonneDatabase,
    exigerPermission
};