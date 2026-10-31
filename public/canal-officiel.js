"use strict";

const params = new URLSearchParams(location.search);
const els = id => document.getElementById(id);
let organisationId = Number(params.get("organisation")) || null;
let tenantCode = null;

function statut(texte, error = false) {
    els("channelStatus").textContent = texte;
    els("channelStatus").dataset.error = String(error);
}
function url(path) {
    const search = new URLSearchParams({tenant:tenantCode});
    return "/api/organisations/" + organisationId + path + "?" + search;
}
async function api(path, options = {}) {
    const res = await fetch(path, {
        credentials:"same-origin",cache:"no-store",...options,
        headers: {...(options.body ? {"Content-Type":"application/json"} : {}),...(options.headers||{})}
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.statut || json.erreur || "HTTP " + res.status);
    return json;
}
function newNode(tag, value) {
    const node = document.createElement(tag);
    if (value !== undefined) node.textContent = String(value);
    return node;
}
function afficherHistorique(publications) {
    const list = els("channelHistory");
    list.replaceChildren();
    if (!publications.length) {
        list.appendChild(newNode("p", "Aucune information publiée."));
        return;
    }
    for (const publication of publications) {
        const article = newNode("article");
        article.className = "channel-item";
        const title = newNode("h3", publication.titre);
        const meta = newNode("small",
            [publication.categorie, publication.priorite, publication.audience_type,
             publication.audience_valeur || null,
             publication.date_publication ? new Date(publication.date_publication).toLocaleString("fr-FR") : null
            ].filter(Boolean).join(" · "));
        const message = newNode("p", publication.contenu);
        article.append(title, meta, message);
        list.appendChild(article);
    }
}
function actualiserCiblage() {
    const type = els("audienceType").value;
    els("audienceTextBlock").hidden = !["DEPARTEMENT","PROFIL"].includes(type);
    els("audienceAssociationBlock").hidden = type !== "ASSOCIATION";
    els("audienceValue").required = ["DEPARTEMENT","PROFIL"].includes(type);
    els("audienceAssociation").required = type === "ASSOCIATION";
}
async function chargerAssociations() {
    const list = els("audienceAssociation");
    list.replaceChildren(new Option("Choisir une association", ""));
    try {
        const data = await api(url("/ecosysteme"));
        const candidates = (data.organisations || []).filter(o =>
            o.type === "ASSOCIATION" && o.relation_statut === "ACTIVE"
        );
        for (const o of candidates) list.add(new Option(o.nom, String(o.id)));
    } catch {
        // Publishing to ordinary members remains possible even without ecosystem read rights.
    }
}
async function recharger() {
    const data = await api(url("/canal-officiel"));
    afficherHistorique(data.publications || []);
}
els("audienceType").addEventListener("change", actualiserCiblage);
els("channelForm").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const data = new FormData(form);
    const type = els("audienceType").value;
    const val = type === "ASSOCIATION"
        ? els("audienceAssociation").value
        : ["PROFIL","DEPARTEMENT"].includes(type) ? els("audienceValue").value.trim() : null;
    if (type !== "TOUS" && !val) {
        statut("Choisis les destinataires ciblés.", true);
        return;
    }
    button.disabled = true;
    try {
        const result = await api(url("/canal-officiel"), {
            method:"POST",
            body:JSON.stringify({
                tenantCode,
                titre:String(data.get("titre") || "").trim(),
                contenu:String(data.get("contenu") || "").trim(),
                categorie:String(data.get("categorie") || "INFORMATION").trim(),
                priorite:String(data.get("priorite") || "NORMALE"),
                audienceType:type,
                audienceValeur:val
            })
        });
        statut("Publication enregistrée. " + result.notificationsCreees +
            " notification(s) internes créées. Aucun e-mail externe envoyé.");
        form.reset();
        actualiserCiblage();
        await recharger();
    } catch (error) {
        statut("Publication refusée : " + error.message, true);
    } finally {
        button.disabled = false;
    }
});
async function demarrer() {
    try {
        const ctx = await window.SATEER_CONTEXT_READY;
        const org = await window.SATEER_choisirOrganisation(organisationId);
        if (!org) throw new Error("Organisation non autorisée.");
        organisationId = Number(org.id);
        tenantCode = ctx.tenantCode;
        els("channelOrg").textContent = org.nom;
        const back = new URL("/dashboard-vice-consul.html",location.origin);
        back.searchParams.set("organisation",String(organisationId));
        back.searchParams.set("tenant",tenantCode);
        els("channelBack").href = back.pathname + back.search;
        actualiserCiblage();
        await Promise.all([recharger(),chargerAssociations()]);
        statut("Canal chargé. Publication soumise aux permissions de l'organisation.");
    } catch(error) {
        statut("Canal indisponible : " + error.message +
            ". Une habilitation MANAGE_PUBLICATIONS est nécessaire.",true);
        els("channelForm").querySelector("button").disabled = true;
    }
}
demarrer();
