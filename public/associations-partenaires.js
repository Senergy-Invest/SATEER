"use strict";
(async function initAssociationsPartenaires() {
  const params = new URLSearchParams(location.search);
  const context = await window.SATEER_CONTEXT_READY;
  const organisation = await window.SATEER_choisirOrganisation(params.get("organisation"), "CONSULAT");
  const list = document.getElementById("associations");
  const requests = document.getElementById("requests");
  const history = document.getElementById("history");
  const status = document.getElementById("status");
  if (!organisation) {
    list.textContent = "Aucun Consulat autorisé n’a été sélectionné.";
    return;
  }
  const tenant = organisation.tenant_code || context.tenantCode;
  if (!tenant) { list.textContent = "Contexte de l’organisation indisponible."; return; }
  document.getElementById("back").href = `/dashboard-vice-consul.html?${new URLSearchParams({organisation:String(organisation.id),tenant})}`;
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
  async function load() {
    list.textContent = "Chargement…"; requests.textContent = "Chargement…"; history.textContent = "Chargement…";
    try {
      const data = await call(`${base}/association-partners?tenant=${encodeURIComponent(tenant)}`);
      list.replaceChildren(); document.getElementById("count").textContent = `${data.associations.length} association(s)`;
      if (!data.associations.length) list.textContent = "Aucune association existante dans ce tenant.";
      for (const association of data.associations) {
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
          relayed.href = `/publication-institutionnelle.html?${new URLSearchParams({organisation:String(organisation.id),tenant})}#publicationHistory`;
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
    } catch (error) { list.textContent = `Associations indisponibles : ${error.message}`; }

    try {
      const data = await call(`${base}/association-join-requests?tenant=${encodeURIComponent(tenant)}`);
      requests.replaceChildren();
      if (!data.demandes.length) requests.textContent = "Aucune demande en attente.";
      for (const request of data.demandes) {
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
      requests.textContent = error.message === "ACCES_REFUSE" ? "Aucune demande en attente." : `Demandes indisponibles : ${error.message}`;
    }
    try {
      const data = await call(`${base}/association-relay-history?tenant=${encodeURIComponent(tenant)}`);
      history.replaceChildren();
      if (!data.relais.length) history.textContent = "Aucun relais effectué.";
      for (const relay of data.relais) {
        const row = document.createElement("article"); row.className = "partner-history";
        const title = document.createElement("strong"); title.textContent = relay.titre;
        const details = document.createElement("small");
        details.textContent = `Source officielle : ${relay.original_author_first_name} ${relay.original_author_last_name} · Relais par ${relay.association_nom} · ${new Date(relay.date_relais).toLocaleString()}`;
        row.append(title,details);
        if (relay.association_comment) { const comment = document.createElement("p"); comment.textContent = `Commentaire de l’association : ${relay.association_comment}`; row.append(comment); }
        history.append(row);
      }
    } catch (error) { history.textContent = `Historique indisponible : ${error.message}`; }
  }
  await load();
})().catch(error => console.error("Associations partenaires:", error));
