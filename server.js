const express = require("express");
const path = require("path");

const {
    obtenirMonSateerDatabase,
    trouverOrganisationParIdEtTenantDatabase,
    listerPublicationsVisiblesPourPersonneDatabase,
    listerDemandesPersonneDatabase,
    listerNotificationsPersonneDatabase
} = require("./services-database");

const {
    repondreAvecIACitoyen
} = require("./services");


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