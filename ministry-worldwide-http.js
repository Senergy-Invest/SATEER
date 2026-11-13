"use strict";
/** A4b : route READ-ONLY, jamais de sources fournies par la requête HTTP. */
const { SourcesMinisteriellesIndisponibles, validerLotMinisteriel, exigerReseauAncre } =
  require("./ministry-worldwide-source-contract");
const CODE = /^[A-Z][A-Z0-9_-]{0,49}$/;
const PERIODE = /^\d{4}-(0[1-9]|1[0-2])$/;
const ID = /^[1-9][0-9]*$/;
function creerRouteSupervisionMinisterielle({ router, trouverOrganisation, verifierPermission,
  chargerLot, composer, horloge = () => new Date().toISOString() } = {}) {
  if (!router || typeof router.get !== "function" ||
      typeof trouverOrganisation !== "function" || typeof verifierPermission !== "function" ||
      typeof chargerLot !== "function" || typeof composer !== "function" ||
      typeof horloge !== "function") throw new TypeError("DEPENDANCES_SUPERVISION_INVALIDES");
  router.get("/:organisationId", async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    const personneId = Number(req.auth?.personneId);
    if (!Number.isSafeInteger(personneId) || personneId <= 0)
      return res.status(401).json({ statut: "AUTHENTIFICATION_REQUISE" });
    const texteId = req.params?.organisationId;
    const organisationId = typeof texteId === "string" && ID.test(texteId) ? Number(texteId) : NaN;
    const tenantCode = req.query?.tenant, periode = req.query?.periode;
    if (!Number.isSafeInteger(organisationId) || organisationId <= 0 ||
        typeof tenantCode !== "string" || !CODE.test(tenantCode) ||
        typeof periode !== "string" || !PERIODE.test(periode))
      return res.status(400).json({ statut: "CONTEXTE_INVALIDE" });
    try {
      const org = await trouverOrganisation(organisationId, tenantCode);
      if (!org || Number(org.id) !== organisationId || org.type !== "MINISTERE")
        return res.status(403).json({ statut: "ACCES_SUPERVISION_REFUSE" });
      const decision = await verifierPermission({ personneId, organisationId, tenantCode,
        permissionCode: "VIEW_MINISTRY_WORLDWIDE", uniteId: null });
      if (decision?.succes !== true || decision?.autorise !== true ||
          decision?.portee !== "ORGANISATION")
        return res.status(403).json({ statut: "ACCES_SUPERVISION_REFUSE" });
      // Le serveur fournit ce fournisseur. Ni URL distante, ni annuaire, ni métriques
      // ni liste de références autorisées ne proviennent de req.query / req.body.
      const dateReference = horloge();
      const lot = await chargerLot({ personneId, tenantCode, organisationId, periode, dateReference });
      const source = validerLotMinisteriel(lot, { tenantCode, organisationId, periode, dateReference });
      const vue = exigerReseauAncre(composer({ ...source, periode, dateReference }), tenantCode, organisationId);
      return res.status(200).json({ statut: "SUPERVISION_MINISTERIELLE", provenance: source.provenancePublique,
        supervision: vue });
    } catch (erreur) {
      if (erreur instanceof SourcesMinisteriellesIndisponibles)
        return res.status(503).json({ statut: "SOURCES_NON_CONFIGUREES" });
      // Aucune erreur SQL ou provenance interne n'est renvoyée au navigateur.
      console.error("Supervision ministérielle indisponible :", erreur?.code || "ERREUR_CONTRAT");
      return res.status(503).json({ statut: "SUPERVISION_INDISPONIBLE" });
    }
  });
  return router;
}
module.exports = Object.freeze({ creerRouteSupervisionMinisterielle });
