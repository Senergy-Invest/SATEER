"use strict";
const form = document.querySelector("#formPublication");
const audience = document.querySelector("#audienceType");
const ciblage = document.querySelector("#ciblageLabel");
const result = document.querySelector("#publicationResultat");
const params = new URLSearchParams(location.search);
const organisationId = Number(params.get("organisation"));
const tenantCode = params.get("tenant") || "";

const canalSelect = document.querySelector("#communicationChannelId");
const historyStatus = document.querySelector("#publicationHistoryStatus");
const historyList = document.querySelector("#publicationHistoryList");
const categoryLabels = { INFORMATION:"Information", ANNONCE:"Annonce", COMMUNIQUE:"Communiqué", ALERTE:"Alerte" };
const audienceLabels = { TOUS:"Toutes les personnes autorisées", DEPARTEMENT:"Les personnes du territoire choisi", PROFIL:"Le profil de personnes choisi", ASSOCIATION:"L’association choisie", ORGANISATIONS:"Les organisations choisies" };

// Le choix PROFIL correspond a personnes.profil, pas a un groupe configurable.
const optionProfilPublication = audience?.querySelector('option[value="PROFIL"]');
if (optionProfilPublication) optionProfilPublication.textContent = "Un profil de personnes";

// Les endpoints de relais doivent répondre en JSON, même en cas d'erreur.
// Ne jamais tenter de parser une page HTML d'erreur comme du JSON.
async function lireJsonRelais(response) {
    const contentType = (response.headers && response.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("application/json") && !contentType.includes("+json")) {
        throw new Error(`Réponse serveur non JSON (HTTP ${response.status}). Vérifier le journal du serveur.`);
    }
    let data;
    try { data = await response.json(); }
    catch (_) { throw new Error(`Réponse JSON invalide (HTTP ${response.status}).`); }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error("Réponse de l’API de relais invalide.");
    }
    if (!response.ok) {
        if (response.status === 401) throw new Error("Session expirée : reconnectez-vous.");
        if (response.status === 403) throw new Error("Accès au relais refusé pour ce compte (permission TARGET_COMMUNICATION requise).");
        throw new Error(`${data.statut || "ERREUR_RELAIS"} (HTTP ${response.status}).`);
    }
    return data;
}

async function chargerPublications() {
    if (!historyList || !historyStatus || !Number.isSafeInteger(organisationId) || organisationId <= 0 || !tenantCode) return;
    historyStatus.textContent = "Chargement des publications…";
    try {
        const response = await fetch(`/api/organisations/${organisationId}/publications?tenant=${encodeURIComponent(tenantCode)}`, { credentials:"same-origin", cache:"no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.statut || `HTTP ${response.status}`);
        historyList.replaceChildren();
        const publications = Array.isArray(data.publications) ? data.publications : [];
        if (!publications.length) {
            historyStatus.textContent = "Aucune publication enregistrée pour cette organisation.";
            return;
        }
        historyStatus.textContent = `${publications.length} publication(s) enregistrée(s).`;
        for (const publication of publications) {
            const article = document.createElement("article");
            article.className = "com-sidecard";
            article.style.marginTop = "12px";
            // Reference de la publication retournee par l'API, sans nouveau droit ni nouvel appel.
            const publicationId = String(publication.id ?? "").trim();
            const referenceValide = /^[1-9]\d*$/.test(publicationId);
            const reference = referenceValide ? document.createElement("span") : null;
            if (reference) {
                reference.className = "com-pill";
                reference.textContent = `Publication n°${publicationId}`;
            }
            const title = document.createElement("h3"); title.textContent = publication.titre || "Information";
            const details = document.createElement("p");
            const date = publication.date_publication ? new Date(publication.date_publication).toLocaleString() : "Date indisponible";
            const channel = publication.communication_channel_nom || "Informations générales du Consulat";
            const audience = audienceLabels[publication.audience_type] || "Les personnes autorisées";
            const target = publication.audience_valeur ? ` : ${publication.audience_valeur}` : "";
            details.textContent = `${categoryLabels[publication.categorie] || "Information"} · Canal « ${channel} » · Visible par : ${audience}${target} · ${publication.statut || "État indisponible"} · ${date}`;
            if (reference) article.append(reference);
            article.append(title, details);
            if (["ASSOCIATION", "ORGANISATIONS"].includes(publication.audience_type)) {
                const relayPanel = document.createElement("div");
                relayPanel.className = "com-relay-permissions";
                const relayTitle = document.createElement("strong");
                relayTitle.textContent = "Relais vers les membres d’une association";
                const relayHelp = document.createElement("p");
                relayHelp.textContent = "Autorisez ou révoquez le relais de cette publication. Le texte officiel ne sera jamais modifié.";
                relayPanel.append(relayTitle, relayHelp);
                try {
                    const permissionResponse = await fetch(
                        `/api/organisations/${organisationId}/publications/${publication.id}/association-relay-authorizations?tenant=${encodeURIComponent(tenantCode)}`,
                        { credentials:"same-origin", cache:"no-store" }
                    );
                    const permissionData = await lireJsonRelais(permissionResponse);
                    if (!Array.isArray(permissionData.associations)) throw new Error("Liste des associations absente de la réponse API.");
                    if (!permissionData.associations.length) relayHelp.textContent = "Aucune association active n’est ciblée par cette publication.";
                    for (const association of permissionData.associations) {
                        const row = document.createElement("div"); row.className = "com-relay-permission-row";
                        const label = document.createElement("span");
                        label.textContent = `${association.association_nom} · ${association.relay_authorized ? "Relais autorisé" : "Relais non autorisé"}${association.relay_id ? " · Déjà relayée" : ""}`;
                        const button = document.createElement("button"); button.type = "button";
                        button.textContent = association.relay_authorized ? "Révoquer le relais" : "Autoriser le relais";
                        button.className = association.relay_authorized ? "com-relay-revoke" : "com-relay-allow";
                        button.addEventListener("click", async () => {
                            button.disabled = true;
                            try {
                                const update = await fetch(`/api/organisations/${organisationId}/publications/${publication.id}/association-relay-authorizations/${association.association_id}?tenant=${encodeURIComponent(tenantCode)}`, {
                                    method:"PUT", credentials:"same-origin", headers:{"Content-Type":"application/json"},
                                    body:JSON.stringify({tenantCode,enabled:!association.relay_authorized})
                                });
                                await lireJsonRelais(update);
                                result.textContent = association.relay_authorized
                                    ? `Relais révoqué pour ${association.association_nom}.`
                                    : `Relais autorisé pour ${association.association_nom}.`;
                                await chargerPublications();
                            } catch (error) {
                                result.textContent = `Autorisation non modifiée : ${error.message}`;
                                button.disabled = false;
                            }
                        });
                        row.append(label,button); relayPanel.append(row);
                    }
                } catch (error) {
                    relayHelp.textContent = `État du relais indisponible : ${error.message}`;
                }
                article.append(relayPanel);
            }
            historyList.append(article);
        }
    } catch (error) {
        historyStatus.textContent = `Historique indisponible : ${error.message}`;
    }
}

async function chargerCanauxPublication() {
    try {
        const reponse = await fetch(`/api/organisations/${organisationId}/channels?tenant=${encodeURIComponent(tenantCode)}`, { credentials: "same-origin" });
        if (!reponse.ok) throw new Error("Liste des canaux indisponible");
        const data = await reponse.json();
        const publics = (data.canaux || []).filter(c => c.visibility === "PUBLIC");
        for (const canal of (data.canaux || [])) {
            if (canal.visibility !== "PUBLIC") continue;
            const option = document.createElement("option");
            option.value = String(canal.id);
            option.textContent = canal.nom;
            canalSelect.appendChild(option);
        }
        if (publics.length === 1) canalSelect.value=String(publics[0].id);
        canalSelect.dispatchEvent(new Event("change", { bubbles:true }));
        if (publics.length > 1) {
            const field = canalSelect.closest('.com-field');
            if (field) {field.hidden=false;field.removeAttribute('aria-hidden');}
        }
    } catch (erreur) {
        result.textContent = "Impossible de charger les canaux. La publication générale reste disponible.";
    }
}
if (Number.isSafeInteger(organisationId) && organisationId > 0) chargerCanauxPublication();
chargerPublications();
function synchroniserCiblage() {
    ciblage.hidden = audience.value === "TOUS";
    document.querySelector("#audienceValeur").required = !ciblage.hidden;
}
audience.addEventListener("change", synchroniserCiblage);
synchroniserCiblage();
form.addEventListener("submit", async event => {
    event.preventDefault();
    result.textContent = "Publication en cours...";
    if (!Number.isSafeInteger(organisationId) || organisationId <= 0) {
        result.textContent = "Organisation absente de l'URL."; return;
    }
    const fields = Object.fromEntries(new FormData(form).entries());
    const fichiers = [...document.querySelector("#publicationFichiers").files];
    const lien = document.querySelector("#publicationLien").value.trim();
    if (fichiers.length > 4 || fichiers.some(f => f.size > 8*1024*1024 || !["image/jpeg","image/png","image/webp","application/pdf"].includes(f.type))) {
      result.textContent="Maximum 4 fichiers de 8 Mo : images JPEG/PNG/WebP ou PDF uniquement."; return;
    }
    fields.liensExternes = lien ? [lien] : [];
    if (fields.audienceType === "ORGANISATIONS") {
        const select = document.getElementById("sx-cp-organisations");
        const cibles = [...(select?.selectedOptions || [])].map(o => Number(o.value));
        if (!cibles.length || cibles.some(id => !Number.isSafeInteger(id) || id <= 0)) {
            result.textContent="Selectionnez au moins une organisation autorisee.";
            return;
        }
        fields.organisationsCibles = cibles;
        delete fields.audienceValeur;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    try {
        const response = await fetch(`/api/organisations/${organisationId}/publications`, {
            method: "POST", credentials: "same-origin",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({...fields, tenantCode})
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.statut || "Erreur HTTP");
        let ok = 0, echecs = 0;
        for (const fichier of fichiers) {
          const uploaded = await fetch(`/api/organisations/${organisationId}/publications/${data.publication.id}/media?tenant=${encodeURIComponent(tenantCode)}`, {
            method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/octet-stream"},body:fichier
          });
          if (uploaded.ok) ok++; else echecs++;
        }
        result.textContent = `Publication enregistrée (#${data.publication.id}). ${ok} fichier(s) joint(s).` + (echecs ? ` ATTENTION : ${echecs} fichier(s) non joints. Ne republiez pas tout le message.` : "");
        await chargerPublications();
        if (!echecs) {
            form.reset();
            synchroniserCiblage();
            const publics=[...canalSelect.options].filter(o=>o.value);
            if (publics.length === 1) canalSelect.value=publics[0].value;
        }
    } catch (error) {
        result.textContent = `Échec : ${error.message}`;
    } finally {
        if (submitButton) submitButton.disabled = false;
    }
});
