"use strict";
(async function initAssociationsPartenaires() {
  const params = new URLSearchParams(location.search);
  const context = await window.SATEER_CONTEXT_READY;
  const organisation = await window.SATEER_choisirOrganisation(params.get("organisation"), "CONSULAT");
  const list = document.getElementById("associations");
  const requests = document.getElementById("requests");
  const history = document.getElementById("history");
  const status = document.getElementById("status");
  function showRestricted(message) {
    const back = document.getElementById("back");
    back.href = "/index.html";
    back.textContent = "← Retour à Mon SATEER";
    document.getElementById("accessGuardMessage").textContent = message;
    document.getElementById("accessGuard").style.display = "block";
    document.querySelector(".partner-stats").style.display = "none";
    document.querySelector(".partner-layout").style.display = "none";
  }
  if (!organisation) {
    showRestricted("Cet espace est réservé aux responsables habilités du Consulat. Pour consulter les informations de votre association, revenez dans Mon SATEER.");
    return;
  }
  const requestedTenant = params.get("tenant");
  if (organisation.tenant_code && requestedTenant && organisation.tenant_code !== requestedTenant) {
    showRestricted("Le contexte du Consulat ne correspond pas à votre session. Revenez à Mon SATEER pour sélectionner la bonne organisation.");
    return;
  }
  const tenant = organisation.tenant_code || requestedTenant || context.tenantCode;
  if (!tenant) { showRestricted("Contexte de l’organisation indisponible. Revenez à Mon SATEER."); return; }
  const back = document.getElementById("back");
  back.href = `/dashboard-vice-consul.html?${new URLSearchParams({organisation:String(organisation.id),tenant})}`;
  back.textContent = "← Retour au pilotage du Consulat";
  const base = `/api/organisations/${encodeURIComponent(organisation.id)}`;
  async function call(path, options = {}) {
    const response = await fetch(path, { credentials:"same-origin", cache:"no-store", ...options });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.statut || `HTTP ${response.status}`);
    return body;
  }
  const button = (label, action, secondary = false) => {
    const node = document.createElement("button"); node.type = "button"; node.textContent = label;
    if (secondary) node.className = "btn-outline";
    node.addEventListener("click", action); return node;
  };
  const setKpi = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  async function load() {
    list.textContent = "Chargement…"; requests.textContent = "Chargement…"; history.textContent = "Chargement…";
    setKpi("partnerConnectedCount", "—"); setKpi("partnerPendingCount", "—"); setKpi("partnerRelayCount", "—");
    try {
      const data = await call(`${base}/association-partners?tenant=${encodeURIComponent(tenant)}`);
      const all = Array.isArray(data.associations) ? data.associations : [];
      const connectedCount = all.filter(a => a.relation_statut === "ACTIVE" && a.relation_active === true).length;
      setKpi("partnerConnectedCount", String(connectedCount));
      list.replaceChildren(); document.getElementById("count").textContent = `${all.length} association(s)`;
      if (!all.length) list.textContent = "Aucune association existante dans ce tenant.";
      for (const association of all) {
        const card = document.createElement("article"); card.className = "partner-card";
        const top = document.createElement("div"); top.className = "partner-top";
        const name = document.createElement("h3"); name.textContent = association.nom;
        const state = document.createElement("span"); state.className = "chip";
        const connected = association.relation_statut === "ACTIVE" && association.relation_active;
        const invitePending = association.invitation_statut === "EN_ATTENTE";
        const requestPending = association.demande_statut === "EN_ATTENTE";
        state.textContent = connected ? "Connectée" : invitePending ? "Invitation en attente" : requestPending ? "Demande en attente" : "Non connectée";
        top.append(name, state); card.append(top);
        const note = document.createElement("p"); note.className = "partner-sub";
        note.textContent = connected ? "L’association garde son propre espace et ses propres membres." : "La relation ne devient active qu’après acceptation.";
        card.append(note);
        const actions = document.createElement("div"); actions.className = "partner-actions";
        if (!connected && !invitePending && !requestPending) {
          actions.append(button("Inviter cette association", async () => {
            status.textContent = "Création de l’invitation…";
            try {
              await call(`${base}/association-partners/invitations`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({tenantCode:tenant,associationOrganizationId:Number(association.id)}) });
              status.textContent = "Invitation créée dans SATEER. Aucun e-mail n’a été envoyé."; await load();
            } catch (error) { status.textContent = `Invitation impossible : ${error.message}`; }
          }));
        }
        if (connected) {
          const relayed = document.createElement("a"); relayed.className = "btn btn-outline"; relayed.textContent = "Voir les relais";
          relayed.href = "#historyPanel";
          actions.append(relayed);
          actions.append(button("Révoquer la relation", async () => {
            if (!window.confirm(`Révoquer la relation avec ${association.nom} ?`)) return;
            status.textContent = "Révocation en cours…";
            try {
              await call(`${base}/association-partners/${encodeURIComponent(association.relation_id)}?tenant=${encodeURIComponent(tenant)}`, { method:"DELETE" });
              status.textContent = "Relation révoquée. Les autorisations de relais actives ont également été révoquées."; await load();
            } catch (error) { status.textContent = `Révocation impossible : ${error.message}`; }
          }, true));
        }
        card.append(actions); list.append(card);
      }
    } catch (error) {
      if (error.message === "ACCES_REFUSE" || error.message === "HTTP 403") {
        showRestricted("Ce compte ne possède pas l’autorisation de gérer les associations du Consulat.");
        return;
      }
      list.textContent = `Associations indisponibles : ${error.message}`;
    }

    try {
      const data = await call(`${base}/association-join-requests?tenant=${encodeURIComponent(tenant)}`);
      const pending = Array.isArray(data.demandes) ? data.demandes : [];
      setKpi("partnerPendingCount", String(pending.length));
      requests.replaceChildren();
      if (!pending.length) requests.textContent = "Aucune demande en attente.";
      for (const request of pending) {
        const card = document.createElement("article"); card.className = "partner-card";
        const title = document.createElement("h3"); title.textContent = request.association_nom;
        const note = document.createElement("p"); note.className = "partner-sub"; note.textContent = request.message || "Demande de rattachement au réseau institutionnel.";
        const actions = document.createElement("div"); actions.className = "partner-actions";
        for (const [decision,label] of [["ACCEPTER","Accepter"],["REFUSER","Refuser"]]) actions.append(button(label, async () => {
          status.textContent = "Traitement de la demande…";
          try { await call(`${base}/association-join-requests/${request.id}/decision`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tenantCode:tenant,decision})}); status.textContent = decision === "ACCEPTER" ? "Association connectée." : "Demande refusée."; await load(); }
          catch(error) { status.textContent = `Décision impossible : ${error.message}`; }
        }, decision === "REFUSER"));
        card.append(title,note,actions); requests.append(card);
      }
    } catch (error) {
      requests.textContent = error.message === "ACCES_REFUSE" ? "Accès aux demandes non autorisé pour ce profil." : `Demandes indisponibles : ${error.message}`;
    }
    try {
      const data = await call(`${base}/association-relay-history?tenant=${encodeURIComponent(tenant)}`);
      const relays = Array.isArray(data.relais) ? data.relais : [];
      setKpi("partnerRelayCount", String(relays.length));
      history.replaceChildren();
      if (!relays.length) history.textContent = "Aucun relais effectué.";
      for (const relay of relays) {
        const row = document.createElement("article"); row.className = "partner-history";
        const title = document.createElement("strong"); title.textContent = relay.titre;
        const details = document.createElement("small");
        details.textContent = `Source officielle : ${relay.original_author_first_name} ${relay.original_author_last_name} · Relais par ${relay.association_nom} · ${new Date(relay.date_relais).toLocaleString("fr-FR")}`;
        row.append(title,details);
        if (relay.association_comment) { const comment = document.createElement("p"); comment.textContent = `Commentaire de l’association : ${relay.association_comment}`; row.append(comment); }
        history.append(row);
      }
    } catch (error) { history.textContent = `Historique indisponible : ${error.message}`; }
  }
  document.getElementById("refreshPartners")?.addEventListener("click", load);
  await load();
})().catch(error => console.error("Associations partenaires:", error));
