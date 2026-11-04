"use strict";
const form = document.querySelector("#formPublication");
const audience = document.querySelector("#audienceType");
const ciblage = document.querySelector("#ciblageLabel");
const result = document.querySelector("#publicationResultat");
const params = new URLSearchParams(location.search);
const organisationId = Number(params.get("organisation"));
const tenantCode = params.get("tenant") || "";

const canalSelect = document.querySelector("#communicationChannelId");
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
        if (publics.length > 1) {
            const field = canalSelect.closest('.com-field');
            if (field) {field.hidden=false;field.removeAttribute('aria-hidden');}
        }
    } catch (erreur) {
        result.textContent = "Impossible de charger les canaux. La publication générale reste disponible.";
    }
}
if (Number.isSafeInteger(organisationId) && organisationId > 0) chargerCanauxPublication();
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
        if (!echecs) {
            form.reset();
            synchroniserCiblage();
            const publics=[...canalSelect.options].filter(o=>o.value);
            if (publics.length === 1) canalSelect.value=publics[0].value;
        }
    } catch (error) {
        result.textContent = `Échec : ${error.message}`;
    }
});
