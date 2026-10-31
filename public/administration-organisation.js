"use strict";

// Administration institutionnelle générique — uniquement les APIs et droits existants.
const params = new URLSearchParams(window.location.search);
const byId = id => document.getElementById(id);
const state = {
    organisationId: Number(params.get("organisation")) || null,
    tenantCode: null,
    units: [],
    roles: [],
    catalogueCapacites: [],
    cataloguePermissions: [],
    busy: false
};
const idValide = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;

function noeud(tag, texte, classe) {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texte !== undefined) el.textContent = texte;
    return el;
}
function message(texte, error = false) {
    const el = byId("pilotStatut");
    el.textContent = texte;
    el.dataset.error = String(error);
}
function uri(path) {
    const url = new URL("/api/organisations/" + state.organisationId + path, location.origin);
    url.searchParams.set("tenant", state.tenantCode);
    return url.pathname + url.search;
}
async function api(path, options = {}) {
    const response = await fetch(path, {
        credentials: "same-origin",
        ...options,
        headers: {
            ...(options.body ? {"Content-Type": "application/json"} : {}),
            ...(options.headers || {})
        }
    });
    let data;
    try { data = await response.json(); } catch { data = {}; }
    if (!response.ok) {
        const code = data.statut || data.erreur || "Erreur HTTP " + response.status;
        throw new Error(code + (response.status === 403 ? " — permission insuffisante" : ""));
    }
    return data;
}
async function mutation(path, options, confirmation) {
    if (state.busy) return;
    state.busy = true;
    try {
        const body = JSON.stringify({tenantCode: state.tenantCode, ...(options.body || {})});
        await api(path, {method: options.method || "POST", body});
        message(confirmation);
        await chargerAdministration();
    } catch (err) {
        message(err.message, true);
    } finally {
        state.busy = false;
    }
}
function selectOptions(element, data, label, preferred, emptyText) {
    element.replaceChildren();
    if (emptyText) element.appendChild(new Option(emptyText, ""));
    for (const item of data) element.appendChild(new Option(label(item), String(item.id)));
    if (preferred && data.some(item => Number(item.id) === Number(preferred))) {
        element.value = String(preferred);
    }
}
function carteTexte(titre, details, action) {
    const container = noeud("div", undefined, "pilot-item");
    const text = noeud("div");
    text.append(noeud("strong", titre), noeud("small", details));
    container.appendChild(text);
    if (action) container.appendChild(action);
    return container;
}
function bouton(label, callback, danger = false, disabled = false) {
    const btn = noeud("button", label, danger ? "danger" : "");
    btn.type = "button";
    btn.disabled = disabled;
    if (!disabled) btn.addEventListener("click", callback);
    return btn;
}
function metadataRole(role) {
    if (typeof role.metadata === "object" && role.metadata) return role.metadata;
    if (typeof role.metadata === "string") {
        try { return JSON.parse(role.metadata); } catch { return {}; }
    }
    return {};
}
function roleProtege(role) { return metadataRole(role).systemProtected === true; }
function renderUnites() {
    const list = byId("pilotUnites");
    list.replaceChildren();
    const selected = byId("pilotUniteCapacites").value;
    const previousParent = byId("pilotParent").value;
    selectOptions(byId("pilotParent"), state.units,
        u => (u.nom || u.code) + " [" + u.code + "]", previousParent,
        "Racine de l'organisation");
    selectOptions(byId("pilotUniteCapacites"), state.units.filter(u => u.actif !== false),
        u => u.nom || u.code, selected);
    if (!state.units.length) list.appendChild(noeud("p", "Aucune unité configurée.", "pilot-muted"));
    for (const unit of state.units) {
        const parent = state.units.find(u => Number(u.id) === Number(unit.parent_unit_id));
        const info = (parent ? "Sous-unité de " + parent.nom : "Unité racine")
            + " · " + unit.code + (unit.actif === false ? " · inactive" : "");
        list.appendChild(carteTexte(unit.nom, info));
    }
}
function renderRoles() {
    const list = byId("pilotRoles");
    list.replaceChildren();
    const previous = byId("pilotRole").value;
    selectOptions(byId("pilotRole"), state.roles.filter(r => r.actif !== false),
        r => r.nom + (roleProtege(r) ? " (protégé)" : ""), previous);
    if (!state.roles.length) list.appendChild(noeud("p", "Aucun rôle configuré.", "pilot-muted"));
    for (const role of state.roles) {
        const protectedRole = roleProtege(role);
        const disabled = role.actif === false;
        const detail = role.code + " · " + role.scope
            + (protectedRole ? " · protégé" : "")
            + (disabled ? " · inactif" : "");
        const action = protectedRole ? null : bouton(
            disabled ? "Réactiver" : "Désactiver",
            () => mutation(
                uri("/roles/" + role.id + (disabled ? "/activate" : "/disable")),
                {}, disabled ? "Rôle réactivé." : "Rôle désactivé."
            ),
            !disabled
        );
        list.appendChild(carteTexte(role.nom, detail, action));
    }
}
async function chargerCapacites() {
    const list = byId("pilotCapacites");
    list.replaceChildren();
    const unitId = Number(byId("pilotUniteCapacites").value);
    if (!idValide(unitId)) {
        list.appendChild(noeud("p", "Sélectionnez une unité.", "pilot-muted"));
        return;
    }
    try {
        const result = await api(uri("/units/" + unitId + "/capabilities"));
        if (Number(byId("pilotUniteCapacites").value) !== unitId) return;
        const active = new Set((result.capabilities || []).map(c => Number(c.capability_id)));
        if (!state.catalogueCapacites.length) list.appendChild(noeud("p", "Aucune capacité disponible.", "pilot-muted"));
        for (const cap of state.catalogueCapacites) {
            const enabled = active.has(Number(cap.id));
            const action = bouton(enabled ? "Désactiver" : "Activer",
                () => mutation(
                    uri("/units/" + unitId + "/capabilities"
                        + (enabled ? "/" + cap.id + "/disable" : "")),
                    {body: enabled ? {} : {capabilityId: cap.id}},
                    enabled ? "Capacité désactivée." : "Capacité activée."
                ),
                enabled
            );
            list.appendChild(carteTexte(cap.nom || cap.code, cap.code, action));
        }
    } catch (err) {
        list.appendChild(noeud("p", "Chargement refusé : " + err.message, "pilot-muted"));
    }
}
async function chargerPermissions() {
    const list = byId("pilotPermissions");
    list.replaceChildren();
    const roleId = Number(byId("pilotRole").value);
    const role = state.roles.find(r => Number(r.id) === roleId);
    if (!role) {
        list.appendChild(noeud("p", "Sélectionnez un rôle.", "pilot-muted"));
        return;
    }
    try {
        const result = await api(uri("/roles/" + roleId + "/permissions"));
        if (Number(byId("pilotRole").value) !== roleId) return;
        const active = new Set((result.permissions || []).map(p => Number(p.permission_id)));
        if (!state.cataloguePermissions.length) list.appendChild(noeud("p", "Aucune permission disponible.", "pilot-muted"));
        for (const permission of state.cataloguePermissions) {
            const enabled = active.has(Number(permission.id));
            const action = bouton(
                roleProtege(role) ? "Rôle protégé" : (enabled ? "Retirer" : "Accorder"),
                () => mutation(
                    uri("/roles/" + roleId + "/permissions"
                        + (enabled ? "/" + permission.id + "/disable" : "")),
                    {body: enabled ? {} : {permissionId: permission.id}},
                    enabled ? "Permission retirée." : "Permission accordée."
                ),
                enabled, roleProtege(role)
            );
            list.appendChild(carteTexte(permission.nom || permission.code, permission.code, action));
        }
    } catch (err) {
        list.appendChild(noeud("p", "Chargement refusé : " + err.message, "pilot-muted"));
    }
}
async function chargerAdministration() {
    const response = await Promise.all([
        api(uri("/structure")),
        api(uri("/unit-capabilities")),
        api(uri("/roles")),
        api("/api/permissions")
    ]);
    const structure = response[0], caps = response[1], roles = response[2], permissions = response[3];
    byId("pilotOrganisation").textContent = structure.organisation?.nom || "Organisation";
    state.units = structure.units || [];
    state.roles = roles.roles || [];
    state.catalogueCapacites = caps.capabilities || [];
    state.cataloguePermissions = permissions.permissions || [];
    renderUnites();
    renderRoles();
    await Promise.all([chargerCapacites(), chargerPermissions()]);
}
async function initialiser() {
    try {
        const context = await window.SATEER_CONTEXT_READY;
        const org = await window.SATEER_choisirOrganisation(state.organisationId);
        if (!org) throw new Error("Organisation non sélectionnée ou non autorisée.");
        state.organisationId = Number(org.id);
        state.tenantCode = context.tenantCode;
        const back = new URL("/organisation-consulat.html", location.origin);
        back.searchParams.set("organisation", String(state.organisationId));
        back.searchParams.set("tenant", state.tenantCode);
        byId("pilotRetour").href = back.pathname + back.search;
        await chargerAdministration();
        message("Administration chargée. Les droits de chaque opération sont vérifiés côté serveur.");
    } catch (err) {
        message("Administration indisponible : " + err.message, true);
    }
}
byId("pilotUniteCapacites").addEventListener("change", () => chargerCapacites());
byId("pilotRole").addEventListener("change", () => chargerPermissions());
byId("pilotCreerUnite").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget, data = new FormData(form);
    await mutation(uri("/units"), {
        body: {
            nom: String(data.get("nom") || "").trim(),
            code: String(data.get("code") || "").trim().toUpperCase(),
            type: String(data.get("type") || "").trim().toUpperCase(),
            parentUnitId: data.get("parentUnitId") ? Number(data.get("parentUnitId")) : null
        }
    }, "Unité créée.");
});
byId("pilotCreerRole").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget, data = new FormData(form);
    await mutation(uri("/roles"), {
        body: {
            nom: String(data.get("nom") || "").trim(),
            code: String(data.get("code") || "").trim().toUpperCase(),
            scope: String(data.get("scope") || "UNIT")
        }
    }, "Rôle créé.");
});
initialiser();