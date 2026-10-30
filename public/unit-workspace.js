(function () {
    "use strict";

    const params = new URLSearchParams(window.location.search);
    const organisationId = Number(params.get("organisation"));
    const unitId = Number(params.get("unit"));
    const tenantCode = String(params.get("tenant") || "").trim();

    const state = {
        workspace: null,
        demandes: [],
        selectedCaseId: null,
        activeTab: null,
        loading: false
    };

    const el = id => document.getElementById(id);

    function attendreSession() {
        if (window.SATEER_USER) {
            return Promise.resolve(window.SATEER_USER);
        }

        return new Promise(resolve => {
            window.addEventListener(
                "sateer:session-ready",
                event => resolve(event.detail || window.SATEER_USER || null),
                { once: true }
            );
        });
    }

    async function api(url, options = {}) {
        const response = await fetch(url, {
            credentials: "same-origin",
            cache: "no-store",
            headers: {
                "Accept": "application/json",
                ...(options.body ? { "Content-Type": "application/json" } : {}),
                ...(options.headers || {})
            },
            ...options
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(
                data.erreur || data.statut || `Erreur HTTP ${response.status}`
            );
            error.status = response.status;
            error.data = data;
            throw error;
        }

        return data;
    }

    function afficherErreur(message) {
        el("workspaceMain").hidden = true;
        el("workspaceError").hidden = false;
        el("workspaceErrorMessage").textContent = message;
    }

    function afficherToast(message, type = "success") {
        const toast = el("workspaceToast");
        toast.textContent = message;
        toast.dataset.type = type;
        toast.classList.add("visible");

        window.setTimeout(() => {
            toast.classList.remove("visible");
        }, 3600);
    }

    function creerElement(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
    }

    function creerStat(label, value, modifier = "") {
        const item = creerElement("article", `unit-workspace-stat ${modifier}`.trim());
        item.append(
            creerElement("span", "unit-workspace-stat-label", label),
            creerElement(
                "strong",
                "unit-workspace-stat-value",
                value === null || value === undefined ? "—" : value
            )
        );
        return item;
    }

    function capabilityNames() {
        const capabilities = state.workspace?.capabilities || [];
        return capabilities.map(capability => capability.nom || capability.code);
    }

    function renderWorkspace() {
        const workspace = state.workspace;
        const unit = workspace.unit || {};
        const user = workspace.currentUser || {};
        const membership = workspace.currentMembership;
        const features = workspace.features || {};
        const stats = workspace.stats || {};

        el("workspaceUnitName").textContent = unit.nom || "Unité";
        el("workspaceUnitContext").textContent =
            `${unit.type || "Unité organisationnelle"} · ${unit.code || ""}`.trim();

        el("workspaceCurrentUser").textContent =
            [user.prenom, user.nom].filter(Boolean).join(" ")
            || "Utilisateur connecté";

        const roleLabel = membership
            ? (membership.role_nom || membership.role_code || membership.role_legacy || "Membre")
            : "Accès organisationnel";

        el("workspaceUnitContext").textContent += ` · ${roleLabel}`;

        const back = el("workspaceBackLink");
        back.href = "/";
        back.addEventListener("click", event => {
            if (window.history.length > 1) {
                event.preventDefault();
                window.history.back();
            }
        });

        const statsContainer = el("workspaceStats");
        statsContainer.replaceChildren();
        statsContainer.hidden = false;

        if (features.canViewAnalytics) {
            statsContainer.append(
                creerStat("Membres", stats.members_count),
                creerStat("Nouveaux dossiers", stats.new_cases),
                creerStat("En cours", stats.in_progress_cases),
                creerStat(
                    "Urgents",
                    stats.urgent_cases,
                    Number(stats.urgent_cases || 0) > 0 ? "is-alert" : ""
                )
            );
        } else if (features.canViewMembers) {
            statsContainer.appendChild(creerStat("Membres", stats.members_count));
            statsContainer.style.gridTemplateColumns = "minmax(0, 180px)";
        } else {
            statsContainer.hidden = true;
        }

        const capabilitiesContainer = el("workspaceCapabilities");
        capabilitiesContainer.replaceChildren();

        if (capabilityNames().length === 0) {
            capabilitiesContainer.appendChild(
                creerElement("p", "muted", "Aucune capacité active.")
            );
        } else {
            (workspace.capabilities || []).forEach(capability => {
                capabilitiesContainer.appendChild(
                    creerElement(
                        "span",
                        "unit-workspace-tag",
                        capability.nom || capability.code
                    )
                );
            });
        }

        renderTabs(features);

        if (features.canViewMembers) {
            renderMembers(workspace.members || []);
        }

        if (features.canViewAnalytics) {
            renderAnalytics(stats);
        }

        el("workspaceMain").hidden = false;

        if (features.canViewInbox) {
            activateTab("inbox");
            loadInbox();
        } else if (features.canViewMembers) {
            activateTab("members");
        } else if (features.canViewAnalytics) {
            activateTab("analytics");
        } else {
            const empty = creerElement(
                "p",
                "muted",
                "Aucun écran fonctionnel n'est encore associé aux capacités accessibles de cette unité."
            );
            el("workspaceMain").appendChild(empty);
        }
    }

    function renderTabs(features) {
        const tabs = el("workspaceTabs");
        tabs.replaceChildren();

        const available = [];
        if (features.canViewInbox) available.push(["inbox", "Boîte de réception"]);
        if (features.canViewMembers) available.push(["members", "Membres"]);
        if (features.canViewAnalytics) available.push(["analytics", "Statistiques"]);

        available.forEach(([id, label]) => {
            const button = creerElement("button", "unit-workspace-tab", label);
            button.type = "button";
            button.dataset.tab = id;
            button.addEventListener("click", () => activateTab(id));
            tabs.appendChild(button);
        });

        tabs.hidden = available.length <= 1;
    }

    function activateTab(tab) {
        state.activeTab = tab;

        el("workspaceInboxSection").hidden = tab !== "inbox";
        el("workspaceMembersSection").hidden = tab !== "members";
        el("workspaceAnalyticsSection").hidden = tab !== "analytics";

        document.querySelectorAll(".unit-workspace-tab").forEach(button => {
            button.classList.toggle("active", button.dataset.tab === tab);
        });
    }

    function renderMembers(members) {
        const container = el("workspaceMembers");
        container.replaceChildren();

        if (!members.length) {
            container.appendChild(
                creerElement("p", "muted", "Aucun membre actif dans cette unité.")
            );
            return;
        }

        members.forEach(member => {
            const card = creerElement("article", "unit-workspace-member");
            const name = [
                member.prenom,
                member.nom
            ].filter(Boolean).join(" ");

            card.append(
                creerElement("strong", "", name || `Personne #${member.personne_id}`),
                creerElement(
                    "span",
                    "muted",
                    member.role_nom || member.role_code || member.role_legacy || "Membre"
                )
            );

            if (member.principal) {
                card.appendChild(creerElement("span", "unit-workspace-tag", "Affectation principale"));
            }

            container.appendChild(card);
        });
    }

    function renderAnalytics(stats) {
        const container = el("workspaceAnalytics");
        container.replaceChildren(
            creerStat("Dossiers affectés", stats.total_cases),
            creerStat("Nouveaux", stats.new_cases),
            creerStat("En cours", stats.in_progress_cases),
            creerStat("Traités", stats.treated_cases),
            creerStat("Urgents", stats.urgent_cases)
        );
    }

    async function loadInbox() {
        const list = el("workspaceInboxList");
        list.replaceChildren(creerElement("p", "muted", "Chargement des dossiers…"));

        const status = el("workspaceStatusFilter").value;
        const query = new URLSearchParams({ tenant: tenantCode });
        if (status) query.set("statut", status);

        try {
            const result = await api(
                `/api/organisations/${organisationId}/units/${unitId}/inbox?${query.toString()}`
            );

            state.demandes = result.demandes || [];
            renderInbox();

            if (
                state.selectedCaseId !== null
                && state.demandes.some(item => Number(item.id) === Number(state.selectedCaseId))
            ) {
                selectCase(state.selectedCaseId);
            } else {
                state.selectedCaseId = null;
                renderCasePlaceholder();
            }
        } catch (error) {
            list.replaceChildren(
                creerElement("p", "unit-workspace-inline-error", error.message)
            );
        }
    }

    function renderInbox() {
        const list = el("workspaceInboxList");
        list.replaceChildren();

        if (!state.demandes.length) {
            list.appendChild(
                creerElement("p", "muted", "Aucun dossier pour ce filtre.")
            );
            return;
        }

        state.demandes.forEach(demande => {
            const button = creerElement("button", "unit-workspace-case-item");
            button.type = "button";
            button.classList.toggle(
                "selected",
                Number(demande.id) === Number(state.selectedCaseId)
            );

            const heading = creerElement("strong", "", demande.objet || "Sans objet");
            const citizen = [
                demande.prenom,
                demande.nom
            ].filter(Boolean).join(" ");

            const meta = creerElement(
                "span",
                "unit-workspace-case-meta",
                `${citizen || "Usager"} · ${demande.statut || "—"}`
            );

            const priority = creerElement(
                "span",
                `unit-workspace-priority ${String(demande.priorite || "").toLowerCase()}`,
                demande.priorite || "Normale"
            );

            button.append(heading, meta, priority);
            button.addEventListener("click", () => selectCase(demande.id));
            list.appendChild(button);
        });
    }

    function renderCasePlaceholder() {
        el("workspaceCasePlaceholder").hidden = false;
        el("workspaceCaseDetail").hidden = true;
        el("workspaceCaseDetail").replaceChildren();
    }

    function addDetailLine(container, label, value) {
        const line = creerElement("div", "unit-workspace-detail-line");
        line.append(
            creerElement("span", "unit-workspace-detail-label", label),
            creerElement("strong", "unit-workspace-detail-value", value || "Non renseigné")
        );
        container.appendChild(line);
    }

    function selectCase(caseId) {
        const demande = state.demandes.find(
            item => Number(item.id) === Number(caseId)
        );

        if (!demande) return;

        state.selectedCaseId = Number(caseId);
        renderInbox();

        const placeholder = el("workspaceCasePlaceholder");
        const detail = el("workspaceCaseDetail");
        placeholder.hidden = true;
        detail.hidden = false;
        detail.replaceChildren();

        const title = creerElement("h2", "unit-workspace-case-title", demande.objet || "Dossier");
        const status = creerElement(
            "span",
            "unit-workspace-status",
            demande.statut || "Statut inconnu"
        );

        const top = creerElement("div", "unit-workspace-case-top");
        top.append(title, status);
        detail.appendChild(top);

        addDetailLine(
            detail,
            "Usager",
            [demande.prenom, demande.nom].filter(Boolean).join(" ")
        );
        addDetailLine(detail, "Catégorie", demande.categorie);
        addDetailLine(detail, "Priorité", demande.priorite);
        addDetailLine(detail, "Territoire", demande.territoire);
        addDetailLine(
            detail,
            "Affectation",
            [demande.assignee_prenom, demande.assignee_nom].filter(Boolean).join(" ")
        );
        addDetailLine(detail, "Unité destinataire", demande.destination_nom || "À orienter");

        detail.appendChild(
            creerElement("p", "unit-workspace-description", demande.description || "Aucune description.")
        );

        renderCaseActions(detail, demande);
    }

    function renderCaseActions(container, demande) {
        const features = state.workspace.features || {};
        const actions = creerElement("section", "unit-workspace-actions");
        actions.appendChild(creerElement("h3", "", "Actions disponibles"));

        let hasAction = false;

        if (
            features.canTakeCases
            && demande.statut === "NOUVELLE"
            && Number(demande.destination_unit_id) === unitId
        ) {
            hasAction = true;
            const take = creerElement("button", "button button-primary", "Prendre en charge");
            take.type = "button";
            take.addEventListener("click", () => takeCase(demande.id, take));
            actions.appendChild(take);
        }

        if (
            features.canRespondCases
            && demande.statut === "EN_COURS"
        ) {
            hasAction = true;
            const form = creerElement("form", "unit-workspace-action-form");
            const label = creerElement("label", "", "Réponse à transmettre");
            const textarea = document.createElement("textarea");
            textarea.required = true;
            textarea.maxLength = 20000;
            textarea.rows = 5;
            textarea.placeholder = "Rédige la réponse destinée à l'usager…";
            const submit = creerElement("button", "button button-primary", "Envoyer la réponse");
            submit.type = "submit";

            form.append(label, textarea, submit);
            form.addEventListener("submit", event => {
                event.preventDefault();
                respondCase(demande.id, textarea.value, submit);
            });
            actions.appendChild(form);
        }

        if (
            features.canRouteCases
            && demande.statut !== "TRAITEE"
        ) {
            hasAction = true;
            const form = creerElement("form", "unit-workspace-action-form");
            const label = creerElement("label", "", "Orienter vers une autre unité");
            const select = document.createElement("select");
            select.required = true;

            const placeholder = document.createElement("option");
            placeholder.value = "";
            placeholder.textContent = "Choisir une unité destinataire";
            select.appendChild(placeholder);

            (state.workspace.routingTargets || []).forEach(target => {
                const option = document.createElement("option");
                option.value = String(target.id);
                option.textContent = target.nom;
                select.appendChild(option);
            });

            const motif = document.createElement("textarea");
            motif.rows = 2;
            motif.maxLength = 2000;
            motif.placeholder = "Motif d'orientation (facultatif)";

            const submit = creerElement("button", "button button-secondary", "Orienter le dossier");
            submit.type = "submit";
            submit.disabled = (state.workspace.routingTargets || []).length === 0;

            form.append(label, select, motif, submit);
            form.addEventListener("submit", event => {
                event.preventDefault();
                routeCase(demande.id, Number(select.value), motif.value, submit);
            });
            actions.appendChild(form);
        }

        if (!hasAction) {
            actions.appendChild(
                creerElement("p", "muted", "Aucune action disponible pour ce dossier avec tes permissions actuelles.")
            );
        }

        container.appendChild(actions);
    }

    async function takeCase(caseId, button) {
        button.disabled = true;
        button.textContent = "Prise en charge…";

        try {
            await api(
                `/api/organisations/${organisationId}/units/${unitId}/cases/${caseId}/take`,
                {
                    method: "POST",
                    body: JSON.stringify({ tenantCode })
                }
            );

            afficherToast("Dossier pris en charge.");
            await loadInbox();
        } catch (error) {
            afficherToast(error.message, "error");
            button.disabled = false;
            button.textContent = "Prendre en charge";
        }
    }

    async function respondCase(caseId, contenu, button) {
        if (!contenu.trim()) return;

        button.disabled = true;
        button.textContent = "Envoi…";

        try {
            await api(
                `/api/organisations/${organisationId}/units/${unitId}/cases/${caseId}/respond`,
                {
                    method: "POST",
                    body: JSON.stringify({ tenantCode, contenu: contenu.trim() })
                }
            );

            afficherToast("Réponse envoyée à l'usager.");
            await loadInbox();
        } catch (error) {
            afficherToast(error.message, "error");
            button.disabled = false;
            button.textContent = "Envoyer la réponse";
        }
    }

    async function routeCase(caseId, destinationUnitId, motif, button) {
        if (!destinationUnitId) return;

        button.disabled = true;
        button.textContent = "Orientation…";

        try {
            await api(
                `/api/organisations/${organisationId}/units/${unitId}/cases/${caseId}/route`,
                {
                    method: "POST",
                    body: JSON.stringify({
                        tenantCode,
                        destinationUnitId,
                        motif: motif.trim() || null
                    })
                }
            );

            afficherToast("Dossier orienté vers l'unité sélectionnée.");
            await loadInbox();
        } catch (error) {
            afficherToast(error.message, "error");
            button.disabled = false;
            button.textContent = "Orienter le dossier";
        }
    }

    async function initialiser() {
        if (
            !Number.isSafeInteger(organisationId) || organisationId <= 0
            || !Number.isSafeInteger(unitId) || unitId <= 0
            || !tenantCode
        ) {
            afficherErreur("Le contexte organisation / unité / tenant est incomplet dans l'adresse.");
            return;
        }

        try {
            await attendreSession();

            const query = new URLSearchParams({ tenant: tenantCode });
            state.workspace = await api(
                `/api/organisations/${organisationId}/units/${unitId}/workspace?${query.toString()}`
            );

            el("workspaceError").hidden = true;
            el("workspaceMain").hidden = false;

            renderWorkspace();

            el("workspaceStatusFilter").addEventListener("change", loadInbox);
        } catch (error) {
            afficherErreur(
                error.status === 403
                    ? "Tu ne disposes pas des permissions nécessaires pour ouvrir cette unité."
                    : (error.message || "Impossible de charger le Workspace.")
            );
        }
    }

    initialiser();
})();
