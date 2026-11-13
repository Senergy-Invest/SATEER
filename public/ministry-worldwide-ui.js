"use strict";
/** A4c — interface purement lectrice de l'API A4b, sans données de démonstration. */
(function () {
  const TENANT = /^[A-Z][A-Z0-9_-]{0,49}$/;
  const MOIS = /^\d{4}-(0[1-9]|1[0-2])$/;
  const TYPES = new Set(["MINISTERE", "AMBASSADE", "CONSULAT"]);
  const ETATS = new Set(["RACCORDE", "EN_RECETTE", "NON_DEPLOYE"]);
  const NOMS = Object.freeze({ demandesRecues: "Demandes reçues (rapports validés)", demandesTraitees: "Demandes traitées (rapports validés)", dossiersEnCours: "Dossiers en cours (rapports validés)" });
  function positif(value) { return typeof value === "number" && Number.isSafeInteger(value) && value > 0; }
  function ref(tenantCode, organisationId) { return `${tenantCode}:${organisationId}`; }
  function verifierReponse(data, tenantCode, organisationId) {
    if (!data || data.statut !== "SUPERVISION_MINISTERIELLE" ||
        !data.provenance || typeof data.provenance.revisionAnnuaire !== "string" ||
        typeof data.provenance.revisionReporting !== "string" ||
        !data.supervision || !Array.isArray(data.supervision.organisations) ||
        !Array.isArray(data.supervision.relations) || !data.supervision.couverture ||
        !data.supervision.indicateurs || !data.supervision.indicateurs.totauxRenseignes)
      throw new Error("REPONSE_SUPERVISION_INVALIDE");
    const racine = ref(tenantCode, organisationId);
    const nodes = new Map();
    for (const o of data.supervision.organisations) {
      if (!o || !TENANT.test(o.tenantCode) || !positif(o.organisationId) ||
          !TYPES.has(o.type) || !ETATS.has(o.statutDeploiement) ||
          typeof o.nom !== "string" || typeof o.paysImplantation !== "string" ||
          o.reference !== ref(o.tenantCode, o.organisationId) || nodes.has(o.reference))
        throw new Error("POSTE_SUPERVISION_INVALIDE");
      nodes.set(o.reference, o);
    }
    if (!nodes.has(racine) || nodes.get(racine).type !== "MINISTERE")
      throw new Error("RACINE_MINISTERIELLE_INVALIDE");
    return { racine, nodes, data };
  }
  function ordonnerReseau(vue, limite = 200) {
    const links = new Map();
    for (const r of vue.data.supervision.relations) {
      if (!r || !vue.nodes.has(r.parent) || !vue.nodes.has(r.enfant) ||
          !["SUPERVISION", "ADMINISTRATIVE_TUTELLE"].includes(r.type))
        throw new Error("RELATION_SUPERVISION_INVALIDE");
      if (!links.has(r.parent)) links.set(r.parent, []);
      links.get(r.parent).push(r.enfant);
    }
    const queue = [{ reference:vue.racine, profondeur:0 }];
    const visited = new Set();
    const out = [];
    for (let i = 0; i < queue.length && out.length < limite; i++) {
      const item = queue[i];
      if (visited.has(item.reference)) continue;
      visited.add(item.reference);
      out.push({ ...item, poste:vue.nodes.get(item.reference) });
      for (const child of (links.get(item.reference) || []).sort()) {
        if (!visited.has(child)) queue.push({ reference:child, profondeur:item.profondeur+1 });
      }
    }
    if (visited.size !== vue.nodes.size && out.length < limite) throw new Error("RESEAU_NON_ANCRE");
    return { items:out, tronque:out.length < vue.nodes.size };
  }
  function element(tag, className, texte) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (texte != null) node.textContent = String(texte);
    return node;
  }
  function blocStat(valeur, label) {
    const box = element("div", "mw-stat");
    box.append(element("small", "", label), element("strong", "", valeur));
    return box;
  }
  function effacer() {
    document.getElementById("mwIndicateurs").replaceChildren();
    document.getElementById("mwReseau").replaceChildren();
    document.getElementById("mwProvenance").textContent = "";
  }
  function afficher(data, tenantCode, organisationId) {
    const vue = verifierReponse(data, tenantCode, organisationId);
    const classement = ordonnerReseau(vue);
    const couverture = data.supervision.couverture;
    const metriques = data.supervision.indicateurs.totauxRenseignes;
    const metricsContainer = document.getElementById("mwIndicateurs");
    const rowsContainer = document.getElementById("mwReseau");
    // Construction avant exposition des noeuds ; jamais de HTML venant de la réponse.
    const stats = document.createDocumentFragment();
    stats.append(blocStat(couverture.inventoriees, "Organisations dans le périmètre autorisé"),
      blocStat(couverture.raccordees, "Postes raccordés"),
      blocStat(couverture.nonDeployees, "Postes non déployés"),
      blocStat(couverture.avecRapport, "Rapports valides reçus"));
    if (couverture.avecRapport > 0) {
      for (const [key,label] of Object.entries(NOMS)) {
        if (Number.isSafeInteger(metriques[key]) && metriques[key] >= 0) stats.append(blocStat(metriques[key], label));
      }
    }
    const liste = element("ol", "mw-list");
    for (const row of classement.items) {
      const poste = row.poste;
      const item = element("li", "mw-node");
      item.dataset.depth = String(Math.min(row.profondeur, 3));
      item.append(element("strong", "", poste.nom),
        element("small", "", [poste.type, poste.paysImplantation, poste.statutDeploiement, poste.etatReporting].filter(Boolean).join(" · ")));
      liste.append(item);
    }
    metricsContainer.replaceChildren(stats);
    rowsContainer.replaceChildren(liste);
    if (classement.tronque) rowsContainer.append(element("p", "mw-note", "Affichage limité aux 200 premiers postes. Affinez le périmètre via une source institutionnelle habilitée."));
    if (couverture.avecRapport > 0) metricsContainer.append(element("p", "mw-note",
      "Totaux partiels des seuls rapports valides reçus, jamais une mesure mondiale exhaustive sans couverture intégrale certifiée."));
    else metricsContainer.append(element("p", "mw-note", "Aucune statistique validée disponible pour la période : données absentes ≠ activité nulle."));
    document.getElementById("mwProvenance").textContent =
      "Provenance : annuaire « " + data.provenance.revisionAnnuaire + " » · reporting « " + data.provenance.revisionReporting + " » · validation « " + data.provenance.valideLe + " ».";
    return couverture;
  }
  async function initialiser() {
    const status = document.getElementById("mwStatut");
    const content = document.getElementById("mwContenu");
    try {
      const args = new URLSearchParams(window.location.search);
      const t = args.get("tenant"), rawId = args.get("organisation");
      const id = typeof rawId === "string" && /^[1-9]\d*$/.test(rawId) ? Number(rawId) : NaN;
      if (!TENANT.test(t || "") || !positif(id)) throw new Error("CONTEXTE_INVALIDE");
      const ctx = await window.SATEER_CONTEXT_READY;
      const org = Array.isArray(ctx?.organisations) && ctx.organisations.find(o =>
        Number(o.id) === id && o.tenant_code === t && o.type === "MINISTERE");
      if (!org) { status.textContent = "Accès indisponible : aucun rattachement ministériel autorisé dans cette session.";return; }
      document.getElementById("mwOrganisation").textContent = org.nom || "Ministère";
      const month = document.getElementById("mwPeriode");
      month.value = new Date().toISOString().slice(0,7);
      content.hidden = false;
      let requeteCourante = 0;
      async function charger() {
        const numeroRequete = ++requeteCourante;
        effacer();
        if (!MOIS.test(month.value)) { status.textContent = "Période invalide.";return; }
        status.textContent = "Vérification des habilitations et des sources de reporting…";
        try {
          const url = "/api/ministry-worldwide/" + encodeURIComponent(String(id)) + "?" + new URLSearchParams({tenant:t,periode:month.value});
          const response = await fetch(url,{method:"GET",credentials:"same-origin",cache:"no-store",headers:{Accept:"application/json"}});
          const data = await response.json().catch(() => ({}));
          if (numeroRequete !== requeteCourante) return;
          if (response.status === 403) { status.textContent = "Accès non habilité à la supervision ministérielle. Aucune donnée affichée.";return; }
          if (response.status === 503 && data.statut === "SOURCES_NON_CONFIGUREES") {
            status.textContent = "Sources institutionnelles non configurées : aucun chiffre officiel disponible à ce stade.";return;
          }
          if (!response.ok) { status.textContent = "Supervision indisponible. Aucune donnée conservée à l'écran.";return; }
          const couverture = afficher(data,t,id);
          status.textContent = "Périmètre autorisé chargé : " + couverture.inventoriees + " organisations ; " + couverture.avecRapport + " rapports valides. Les chiffres restent limités au périmètre déclaré.";
        } catch (error) {
          if (numeroRequete !== requeteCourante) return;
          effacer();
          status.textContent = "Supervision indisponible ou réponse invalide. Aucune statistique présentée.";
        }
      }
      document.getElementById("mwForm").addEventListener("submit", event => {event.preventDefault();void charger();});
      await charger();
    } catch (e) {
      effacer();
      status.textContent = "Session ou contexte institutionnel indisponible. Revenez à Mon SATEER.";
    }
  }
  window.SATEER_MINISTRY_UI = Object.freeze({ verifierReponse, ordonnerReseau });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => {void initialiser();});
  else void initialiser();
})();
