"use strict";
/**
 * A2 : adaptateur de LECTURE des publications institutionnelles.
 * - Pas de SQL, pas de nouveau moteur Communication.
 * - Autorisation : session + lien effectif (personne, tenant, organisation)
 *   + type réel de l'organisation lu en base.
 * - L'audience est décidée par la fonction existante Communication.
 * - Aucun accès aux dossiers, pièces ou messages privés.
 */
const TENANT_CODE = /^[A-Z][A-Z0-9_-]{0,49}$/;
const ORGANISATION_ID = /^[1-9][0-9]*$/;

function creerRoutesCommunicationsInstitutionnelles({
    router,
    listerOrganisationsPersonne,
    trouverOrganisation,
    listerPublicationsVisibles
} = {}) {
    if (!router || typeof router.get !== "function" ||
        typeof listerOrganisationsPersonne !== "function" ||
        typeof trouverOrganisation !== "function" ||
        typeof listerPublicationsVisibles !== "function") {
        throw new TypeError("Dépendances du routeur institutionnel obligatoires.");
    }

    router.get("/:organisationId/publications", async (req, res) => {
        res.set("Cache-Control", "no-store");
        const personneId = Number(req.auth?.personneId);
        if (!Number.isSafeInteger(personneId) || personneId <= 0) {
            return res.status(401).json({ statut: "AUTHENTIFICATION_REQUISE" });
        }
        const idText = req.params?.organisationId;
        const tenantCode = req.query?.tenant;
        const organisationId = typeof idText === "string" && ORGANISATION_ID.test(idText)
            ? Number(idText) : NaN;
        if (!Number.isSafeInteger(organisationId) || organisationId <= 0 ||
            typeof tenantCode !== "string" || !TENANT_CODE.test(tenantCode)) {
            return res.status(400).json({ statut: "CONTEXTE_INVALIDE" });
        }
        try {
            const rattachements = await listerOrganisationsPersonne(personneId, tenantCode);
            const rattache = Array.isArray(rattachements) && rattachements.some(o =>
                Number(o.id) === organisationId && o.tenant_code === tenantCode && o.type === "AMBASSADE"
            );
            if (!rattache) return res.status(403).json({ statut: "ORGANISATION_NON_AUTORISEE" });

            // Ne pas se fier exclusivement au type déclaré dans le contexte.
            const organisation = await trouverOrganisation(organisationId, tenantCode);
            if (!organisation || organisation.type !== "AMBASSADE" ||
                Number(organisation.id) !== organisationId) {
                return res.status(403).json({ statut: "ORGANISATION_NON_AUTORISEE" });
            }
            const publications = await listerPublicationsVisibles(personneId, organisationId, tenantCode);
            if (!Array.isArray(publications)) throw new Error("Résultat Communication invalide");
            // Une projection minimale protège les données privées et empêche
            // de donner au frontend des champs techniques sans contrat.
            const visibles = publications
                .filter(p => p && Number(p.organisation_id) === organisationId && p.statut === "PUBLIEE")
                .map(p => ({
                    id: p.id,
                    titre: p.titre,
                    contenu: p.contenu,
                    categorie: p.categorie,
                    priorite: p.priorite,
                    date_publication: p.date_publication,
                    communication_channel_nom: p.communication_channel_nom || null
                }));
            return res.status(200).json({
                statut: "PUBLICATIONS_INSTITUTIONNELLES",
                organisation: { id: organisationId, nom: organisation.nom, type: "AMBASSADE" },
                publications: visibles
            });
        } catch (erreur) {
            console.error("Lecture institutionnelle indisponible :", erreur?.message || erreur);
            return res.status(500).json({ statut: "LECTURE_INDISPONIBLE" });
        }
    });
    return router;
}
module.exports = Object.freeze({ creerRoutesCommunicationsInstitutionnelles });
