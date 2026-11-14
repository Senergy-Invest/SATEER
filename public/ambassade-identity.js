"use strict";
/**
 * A11 — Identité visuelle de l'Ambassade.
 * N'accorde aucun droit. Active seulement le thème si le Core a déjà retourné
 * une organisation de type AMBASSADE dans le tenant demandé et rattachée au compte.
 * L'accès aux données reste contrôlé exclusivement par les API SATEER.
 */
(function (root) {
  const PAGES = Object.freeze({
    "/ambassade.html": "Espace de la mission diplomatique",
    "/demande.html": "Nouvelle demande à l'Ambassade",
    "/demande-detail.html": "Suivi d'une demande à l'Ambassade",
    "/unit-workspace.html": "Bureau de la mission diplomatique",
    "/publication-institutionnelle.html": "Communication de l'Ambassade"
  });
  const TENANT = /^[A-Z][A-Z0-9_-]{0,49}$/;
  const ID = /^[1-9][0-9]*$/;

  function identifierAmbassade({ pathname, search, contexte } = {}) {
    if (typeof pathname !== "string" || !Object.hasOwn(PAGES, pathname)) return null;
    const params = new URLSearchParams(typeof search === "string" ? search : "");
    if ((pathname === "/demande.html" || pathname === "/demande-detail.html") &&
        params.get("source") !== "MON_AMBASSADE") return null;
    if (pathname === "/publication-institutionnelle.html" && params.get("from") !== "AMBASSADE") return null;
    const orgRaw = params.get("organisation");
    const tenant = params.get("tenant");
    if (!orgRaw || !ID.test(orgRaw) || !tenant || !TENANT.test(tenant)) return null;
    const orgId = Number(orgRaw);
    if (!Number.isSafeInteger(orgId) || orgId <= 0) return null;
    if (!Array.isArray(contexte?.organisations)) return null;
    const org = contexte.organisations.find(o => Number(o?.id) === orgId &&
      o.type === "AMBASSADE" && o.tenant_code === tenant);
    if (!org) return null;
    return Object.freeze({
      organisationId: orgId,
      organisationNom: typeof org.nom === "string" && org.nom.trim() ? org.nom.trim() : "Ambassade de recette",
      tenantCode: tenant,
      pageLabel: PAGES[pathname],
      isAccueil: pathname === "/ambassade.html"
    });
  }

  function creer(doc, tag, classe, texte) {
    const element = doc.createElement(tag);
    if (classe) element.className = classe;
    if (texte !== undefined) element.textContent = String(texte);
    return element;
  }

  function appliquerIdentite(doc, identite) {
    if (!identite || !doc?.body?.classList) return false;
    doc.body.classList.add("sx-ambassade-mode");
    doc.title = identite.pageLabel + " · SATEER";
    const enTete = doc.querySelector("header.header, .unit-workspace-header, .com-banner");
    if (enTete) {
      const signature = creer(doc, "span", "sx-ambassade-signature", "MISSION DIPLOMATIQUE · RECETTE");
      signature.setAttribute("aria-label", "Environnement de recette Ambassade");
      enTete.append(signature);
    }
    if (!identite.isAccueil) {
      const main = doc.querySelector("main");
      if (main) {
        const banner = creer(doc, "div", "sx-ambassade-context", "");
        banner.setAttribute("role", "note");
        const titre = creer(doc, "strong", "sx-ambassade-context-title", identite.pageLabel);
        const soustitre = creer(doc, "span", "sx-ambassade-context-detail",
          identite.organisationNom + " · Tenant " + identite.tenantCode);
        banner.append(titre, soustitre);
        main.prepend(banner);
      }
    }
    return true;
  }

  async function initialiser(win) {
    if (!win?.document || !win?.location || !win?.SATEER_CONTEXT_READY) return false;
    try {
      const contexte = await win.SATEER_CONTEXT_READY;
      const identite = identifierAmbassade({
        pathname: win.location.pathname,
        search: win.location.search,
        contexte
      });
      return appliquerIdentite(win.document, identite);
    } catch {
      // Echec ou absence de session : le thème institutionnel n'est pas appliqué.
      return false;
    }
  }

  const api = Object.freeze({ identifierAmbassade, appliquerIdentite, initialiser });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root && root.document && root.location) void initialiser(root);
})(typeof window !== "undefined" ? window : null);
