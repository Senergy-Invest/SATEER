"use strict";
(async function initAssociationCommunications() {
  const params = new URLSearchParams(location.search);
  const context = await window.SATEER_CONTEXT_READY;
  const association = await window.SATEER_choisirOrganisation(params.get("organisation"), "ASSOCIATION");
  const feed = document.getElementById("communications");
  const feedStatus = document.getElementById("feedStatus");
  const channelBox = document.getElementById("channels");
  const channelStatus = document.getElementById("channelStatus");
  if (!association) { feed.textContent = "Aucune association autorisée sélectionnée."; return; }
  const tenant = association.tenant_code || context.tenantCode;
  if (!tenant) { feed.textContent = "Contexte de l’organisation indisponible."; return; }
  const assocBase = `/api/organisations/${encodeURIComponent(association.id)}`;
  document.getElementById("associationName").textContent = association.nom;
  document.getElementById("back").href = `/index.html`;

  async function call(path, options = {}) {
    const response = await fetch(path, { credentials:"same-origin", cache:"no-store", ...options });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.statut || `HTTP ${response.status}`);
    return body;
  }
  function makeButton(label, onClick, secondary = false) {
    const button = document.createElement("button"); button.type = "button"; button.textContent = label;
    if (secondary) button.className = "btn-outline";
    button.addEventListener("click", onClick); return button;
  }

  async function loadInvitations() {
    const section = document.getElementById("invitationsSection");
    const box = document.getElementById("invitations");
    try {
      const data = await call(`${assocBase}/communication-invitations?tenant=${encodeURIComponent(tenant)}`);
      box.replaceChildren(); section.hidden = data.invitations.length === 0;
      for (const invite of data.invitations) {
        const item = document.createElement("article"); item.className = "association-item";
        const name = document.createElement("h3"); name.textContent = invite.organisation_source_nom;
        const actions = document.createElement("div"); actions.className = "actions";
        for (const [decision,label] of [["ACCEPTER","Accepter"],["REFUSER","Refuser"]]) {
          actions.append(makeButton(label, async () => {
            const status = document.getElementById("feedStatus"); status.textContent = "Traitement de l’invitation…";
            try {
              await call(`${assocBase}/communication-invitations/${invite.id}/decision`, {
                method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tenantCode:tenant,decision})
              });
              status.textContent = decision === "ACCEPTER" ? "Relation activée avec le Consulat." : "Invitation refusée.";
              await loadAll();
            } catch (error) { status.textContent = `Décision impossible : ${error.message}`; }
          }, decision === "REFUSER"));
        }
        item.append(name,actions); box.append(item);
      }
    } catch (error) {
      section.hidden = true;
      if (error.message !== "ACCES_REFUSE") feedStatus.textContent = `Invitations indisponibles : ${error.message}`;
    }
  }

  async function loadCommunications() {
    feedStatus.textContent = "Chargement des communications…"; feed.replaceChildren();
    try {
      const data = await call(`${assocBase}/association-communications?tenant=${encodeURIComponent(tenant)}`);
      document.getElementById("feedCount").textContent = `${data.publications.length} communication(s)`;
      feedStatus.textContent = data.canRelay
        ? "Vous pouvez relayer les publications explicitement autorisées."
        : "Consultation autorisée. Le relais exige un rôle associatif dédié.";
      if (!data.publications.length) { feed.textContent = "Aucune communication accessible pour le moment."; return; }
      for (const publication of data.publications) {
        const item = document.createElement("article"); item.className = "association-item";
        const title = document.createElement("h3"); title.textContent = publication.titre || "Information officielle";
        const source = document.createElement("p"); source.className = "official-source";
        source.textContent = `Source officielle : ${publication.issuer_name} · ${publication.author_first_name || "Auteur institutionnel"} ${publication.author_last_name || ""}`;
        const meta = document.createElement("p"); meta.className = "association-meta";
        meta.textContent = `${publication.categorie || "Information"} · ${publication.priorite || "Normale"} · ${publication.date_publication ? new Date(publication.date_publication).toLocaleString() : "Date indisponible"}`;
        const body = document.createElement("p"); body.className = "association-body"; body.textContent = publication.contenu || "";
        item.append(title,source,meta,body);
        if (publication.relay_id) {
          const relayed = document.createElement("p"); relayed.className = "association-comment";
          const when = publication.date_relais ? new Date(publication.date_relais).toLocaleString() : "";
          relayed.textContent = `Relayée par ${publication.relay_author_first_name || "un responsable de l’association"} ${publication.relay_author_last_name || ""}${when ? ` · ${when}` : ""}`;
          item.append(relayed);
          if (publication.association_comment) {
            const comment = document.createElement("p"); comment.className = "association-comment";
            comment.textContent = `Commentaire de l’association : ${publication.association_comment}`; item.append(comment);
          }
        }
        for (const media of Array.isArray(publication.medias) ? publication.medias : []) {
          if (typeof media.url !== "string" || !media.url.startsWith(`/api/organisations/${publication.issuer_id}/publications/${publication.id}/media/`)) continue;
          if (media.type === "IMAGE") {
            const image = document.createElement("img"); image.src = media.url; image.alt = "Illustration de la communication officielle";
            image.loading = "lazy"; image.style.cssText = "max-width:100%;max-height:340px;object-fit:contain"; item.append(image);
          } else if (media.type === "DOCUMENT") {
            const link = document.createElement("a"); link.href = media.url; link.textContent = "Consulter la pièce jointe officielle";
            link.target = "_blank"; link.rel = "noopener noreferrer"; item.append(link);
          }
        }
        if (data.canRelay && publication.relay_allowed && !publication.relay_id) {
          const commentLabel = document.createElement("label"); commentLabel.className = "field";
          commentLabel.textContent = "Commentaire facultatif de l’association (séparé du texte officiel)";
          const comment = document.createElement("textarea"); comment.maxLength = 1000; comment.placeholder = "Ajoutez un contexte clairement attribué à l’association";
          commentLabel.append(comment);
          const actions = document.createElement("div"); actions.className = "actions";
          actions.append(makeButton("Relayer à mes membres", async buttonEvent => {
            const button = buttonEvent.currentTarget; button.disabled = true; feedStatus.textContent = "Relais en cours…";
            try {
              await call(`${assocBase}/association-relays`, {
                method:"POST",headers:{"Content-Type":"application/json"},
                body:JSON.stringify({tenantCode:tenant,publicationId:Number(publication.id),associationComment:comment.value.trim() || null})
              });
              feedStatus.textContent = "Communication relayée. Le contenu officiel reste inchangé."; await loadAll();
            } catch (error) { feedStatus.textContent = `Relais refusé : ${error.message}`; button.disabled = false; }
          }));
          item.append(commentLabel,actions);
        } else if (!publication.relay_allowed) {
          const notAllowed = document.createElement("p"); notAllowed.className = "association-meta";
          notAllowed.textContent = "Consultation autorisée; le Consulat n’a pas autorisé le relais de cette publication."; item.append(notAllowed);
        }
        feed.append(item);
      }
    } catch (error) {
      document.getElementById("feedCount").textContent = "Indisponible";
      feedStatus.textContent = `Communications indisponibles : ${error.message}`;
    }
  }

  async function loadChannels() {
    channelBox.textContent = "Chargement…";
    try {
      const data = await call(`${assocBase}/association-channels?tenant=${encodeURIComponent(tenant)}`);
      channelBox.replaceChildren();
      if (!data.canaux.length) { channelBox.textContent = "Aucun canal public disponible via les relations actives."; return; }
      for (const channel of data.canaux) {
        const item = document.createElement("article"); item.className = "association-item";
        const name = document.createElement("h3"); name.textContent = channel.nom;
        const source = document.createElement("p"); source.className = "association-meta"; source.textContent = `Canal du Consulat · ${channel.issuer_name}`;
        const control = document.createElement("label"); control.className = "association-toggle";
        const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = channel.notifications_enabled;
        checkbox.setAttribute("aria-label", `Notifications pour ${channel.nom}`);
        checkbox.addEventListener("change", async () => {
          checkbox.disabled = true; channelStatus.textContent = "Mise à jour des notifications…";
          try {
            await call(`${assocBase}/association-channels/${channel.id}/subscribe?tenant=${encodeURIComponent(tenant)}`, { method:checkbox.checked ? "POST" : "DELETE" });
            channelStatus.textContent = checkbox.checked ? `Notifications activées pour « ${channel.nom} ».` : `Notifications désactivées pour « ${channel.nom} ».`;
          } catch (error) { checkbox.checked = !checkbox.checked; channelStatus.textContent = `Préférence non modifiée : ${error.message}`; }
          finally {
            labelText.textContent = checkbox.checked ? "Recevoir les notifications" : "Notifications désactivées";
            checkbox.disabled = false;
          }
        });
        const labelText = document.createElement("span"); labelText.textContent = checkbox.checked ? "Recevoir les notifications" : "Notifications désactivées";
        control.append(checkbox,labelText); item.append(name,source,control); channelBox.append(item);
      }
    } catch (error) { channelBox.textContent = `Canaux indisponibles : ${error.message}`; }
  }

  async function loadConsulates() {
    const section = document.getElementById("joinSection");
    const form = document.getElementById("joinForm");
    const info = document.getElementById("joinInfo");
    const connectedInfo = document.getElementById("connectedConsulates");
    const select = document.getElementById("consulateSelect");
    const button = document.getElementById("requestButton");
    section.hidden = true;
    form.hidden = true;
    button.disabled = true;
    select.replaceChildren(new Option("Choisir un Consulat…", ""));
    try {
      // Seul un gestionnaire d'association dispose de ce droit côté serveur.
      const data = await call(`${assocBase}/available-consulates?tenant=${encodeURIComponent(tenant)}`);
      const consulats = Array.isArray(data.consulats) ? data.consulats : [];
      const connectes = consulats.filter(c => c.connected);
      const enAttente = consulats.filter(c => !c.connected && c.request_pending);
      const disponibles = consulats.filter(c => !c.connected && !c.request_pending);
      connectedInfo.textContent = [
        connectes.length ? `Déjà partenaire : ${connectes.map(c => c.nom).join(", ")}.` : "",
        enAttente.length ? `Demandes en attente : ${enAttente.map(c => c.nom).join(", ")}.` : ""
      ].filter(Boolean).join(" ");
      section.hidden = false;
      if (!disponibles.length) {
        info.textContent = "Aucun nouveau Consulat disponible pour un rattachement.";
        return;
      }
      info.textContent = "Vous pouvez demander un nouveau rattachement. Il ne sera actif qu'après acceptation par le Consulat.";
      for (const consulate of disponibles) select.add(new Option(consulate.nom, String(consulate.id)));
      form.hidden = false;
      button.disabled = false;
    } catch (error) {
      // Échec fermé : aucun formulaire ni bouton pour un membre non habilité.
      if (error.message === "ACCES_REFUSE") return;
      section.hidden = false;
      info.textContent = "Les rattachements sont temporairement indisponibles.";
      connectedInfo.textContent = "";
    }
  }
  document.getElementById("requestButton").addEventListener("click", async () => {
      const section = document.getElementById("joinSection");
      const form = document.getElementById("joinForm");
      const button = document.getElementById("requestButton");
      if (section.hidden || form.hidden || button.disabled) return;
      const select = document.getElementById("consulateSelect");
      const consulateId = Number(select.value);
      const status = document.getElementById("requestStatus");
      if (!Number.isSafeInteger(consulateId) || consulateId <= 0) { status.textContent = "Choisissez un Consulat."; return; }
      status.textContent = "Envoi de la demande…";
      button.disabled = true;
      try {
        await call(`${assocBase}/communication-join-requests`, { method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tenantCode:tenant,targetOrganisationId:consulateId,message:document.getElementById("requestMessage").value.trim() || null}) });
        status.textContent = "Demande transmise. Le Consulat doit l’accepter avant l’activation de la relation.";
        await loadConsulates();
      } catch (error) { status.textContent = `Demande impossible : ${error.message}`; }
      finally { if (!section.hidden && !form.hidden) button.disabled = false; }
  });

  async function loadAll() { await Promise.all([loadInvitations(),loadCommunications(),loadChannels(),loadConsulates()]); }
  await loadAll();
})().catch(error => console.error("Association communications:", error));
