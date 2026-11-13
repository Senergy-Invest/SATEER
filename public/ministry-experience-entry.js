"use strict";
/** A4c — entrée de présentation uniquement, aucun droit accordé. */
(function () {
  const TENANT = /^[A-Z][A-Z0-9_-]{0,49}$/;
  function creerCarte(organisation, tenantCode, documentRef) {
    if (!organisation || organisation.type !== "MINISTERE" ||
        !Number.isSafeInteger(Number(organisation.id)) || Number(organisation.id) <= 0 ||
        typeof tenantCode !== "string" || !TENANT.test(tenantCode) || !documentRef) return null;
    const el = (tag, className, value) => {
      const node = documentRef.createElement(tag);
      if (className) node.className = className;
      if (value != null) node.textContent = String(value);
      return node;
    };
    const card = el("article", "sx-consulat-card sx-ministry-card");
    const head = el("div", "sx-card-top");
    const glyph = el("div", "sx-consulat-icon", "🌐");
    glyph.setAttribute("aria-hidden", "true");
    const title = el("div", "sx-card-heading");
    title.append(el("p", "sx-card-kicker", "EXPÉRIENCE INSTITUTIONNELLE · RECETTE"),
      el("h3", "sx-card-title", "Supervision ministérielle"),
      el("p", "sx-card-subtitle", organisation.nom || "Ministère"));
    head.append(glyph, title);
    const link = el("a", "sx-open-consulat", "Ouvrir la supervision");
    link.href = "/ministry-worldwide.html?" + new URLSearchParams({
      organisation: String(organisation.id), tenant: tenantCode
    }).toString();
    card.append(head, el("p", "sx-card-description",
      "Réseau mondial des ambassades et consulats ; statistiques uniquement lorsqu'elles sont autorisées et validées."), link);
    return card;
  }
  window.SATEER_MINISTRY_PRESENTATION = Object.freeze({ creerCarte });
})();
