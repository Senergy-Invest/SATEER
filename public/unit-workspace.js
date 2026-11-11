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
                `Dossier n°${demande.id} · ${citizen || "Usager"} · ${demande.statut || "—"}`
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

        addDetailLine(detail, "N° de dossier", `n°${demande.id}`);
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
        renderAgentJournal(detail, demande.id);
        if (typeof window.SATEER_P7_SHOW_CASE === 'function') {
            window.SATEER_P7_SHOW_CASE(detail, demande.id).catch(() => {});
        }
    }

    // P3.3.5K — Journal Agent lisible et accessible, données existantes en lecture seule.
    async function renderAgentJournal(container, demandeId) {
        const cssId = 'sateer-agent-journal-css';
        if (!document.getElementById(cssId)) {
            const style = document.createElement('link');
            style.id = cssId;
            style.rel = 'stylesheet';
            style.href = '/sateer-agent-journal.css?v=p335k';
            document.head.appendChild(style);
        }

        const element = (tag, className, content) => {
            const node = document.createElement(tag);
            if (className) node.className = className;
            if (content !== undefined && content !== null) node.textContent = String(content);
            return node;
        };
        const section = element('section', 'sateer-agent-journal');
        section.setAttribute('aria-label', 'Échanges et historique du dossier');
        const header = element('header', 'saj-header');
        const heading = element('div', 'saj-heading');
        heading.append(
            element('span', 'saj-kicker', 'SUIVI DU DOSSIER · LECTURE SEULE'),
            element('h3', 'saj-title', 'Échanges et historique'),
            element('p', 'saj-subtitle', 'Retrouvez les messages transmis et les étapes du traitement, sans modifier le dossier.')
        );
        const counts = element('div', 'saj-counts');
        header.append(heading, counts);
        const status = element('p', 'saj-loading', 'Chargement des échanges…');
        status.setAttribute('role', 'status');
        section.append(header, status);
        container.appendChild(section);

        const url = `/api/pilot-procedures/dossiers/${encodeURIComponent(demandeId)}/journal-agent?` +
            new URLSearchParams({organisationId:String(organisationId),tenant:tenantCode,unitId:String(unitId)});

        try {
            const response = await fetch(url, {credentials:'same-origin', cache:'no-store'});
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const data = await response.json();
            if (data.statut !== 'JOURNAL_AGENT_CHARGE' || Number(data.dossierId) !== Number(demandeId)) {
                throw new Error('JOURNAL_INATTENDU');
            }
            // Ne jamais afficher le journal d'un ancien dossier après un changement de sélection.
            if (!section.isConnected) return;
            status.remove();
            const messages = Array.isArray(data.messages) ? data.messages : [];
            const historique = Array.isArray(data.historique) ? data.historique : [];
            const pluriel = (count, singular, plural) => count + ' ' + (count === 1 ? singular : plural);
            counts.append(
                element('span', 'saj-count', pluriel(messages.length, 'message', 'messages')),
                element('span', 'saj-count', pluriel(historique.length, 'événement', 'événements'))
            );
            const formatDate = value => {
                const date = value ? new Date(value) : null;
                return date && !Number.isNaN(date.getTime())
                    ? date.toLocaleString('fr-FR', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})
                    : 'Date non renseignée';
            };
            const formatAuteur = item => {
                const name = [item.auteur_prenom, item.auteur_nom].filter(Boolean).join(' ').trim();
                if (name) return name;
                return /ORIENTATION|ROUTAGE/.test(String(item.action || '')) ? 'Système SATEER' : 'Auteur non renseigné';
            };
            const types = {
                REPONSE: ['Information transmise', 'info'],
                DOCUMENT_PRET: ['Document prêt au retrait', 'ready'],
                DOCUMENT_REMIS: ['Remise du document', 'done'],
                DOCUMENT_PRET_CONFIRME: ['Document prêt au retrait', 'ready'],
                DOCUMENT_REMIS_CONFIRME: ['Remise du document', 'done']
            };
            const labelMessage = type => types[type] || ['Message au citoyen', 'info'];
            const labelsActions = {
                CREATION: 'Demande créée', CREATION_DEMANDE:'Demande créée',
                PIECES_TRANSMISES:'Pièces transmises', PRISE_EN_CHARGE:'Prise en charge',
                REPONSE_ENVOYEE:'Information transmise', DOCUMENT_PRET_CONFIRME:'Document prêt au retrait',
                DOCUMENT_REMIS_CONFIRME:'Document remis', DOCUMENT_REMIS:'Document remis',
                ORIENTATION:'Dossier orienté', ORIENTATION_AUTOMATIQUE:'Orientation automatique',
                ROUTAGE:'Dossier orienté', AFFECTATION:'Affectation modifiée'
            };
            const labelAction = raw => labelsActions[raw] ||
                String(raw || 'Événement du dossier').replaceAll('_', ' ').toLowerCase().replace(/^./, c => c.toUpperCase());
            const labelStatut = raw => ({NOUVELLE:'Nouvelle',EN_COURS:'En cours',TRAITEE:'Traitée'})[raw] ||
                String(raw || '').replaceAll('_', ' ').toLowerCase();

            const tabs = element('nav', 'saj-switch');
            tabs.setAttribute('aria-label', 'Afficher les échanges ou les événements');
            const paneMessages = element('div', 'saj-panel');
            const paneHistory = element('div', 'saj-panel');
            const buttons = [];
            const panes = [paneMessages, paneHistory];
            const select = index => {
                buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
                panes.forEach((pane, i) => {pane.hidden = i !== index;});
            };
            for (const [index, title, count] of [[0, 'Messages au citoyen', messages.length], [1, 'Historique des actions', historique.length]]) {
                const button = element('button', 'saj-switch-button', title);
                button.type = 'button';
                button.append(element('span', 'saj-switch-count', count));
                button.addEventListener('click', () => select(index));
                tabs.appendChild(button);
                buttons.push(button);
            }
            section.append(tabs, paneMessages, paneHistory);

            paneMessages.append(element('p', 'saj-panel-intro', 'Les échanges sont classés du plus récent au plus ancien. Ouvrez un message pour le relire.'));
            if (!messages.length) paneMessages.append(element('p','saj-empty','Aucun message envoyé pour ce dossier.'));
            messages.forEach((message, index) => {
                const [title, tone] = labelMessage(message.type);
                const card = element('details', 'saj-message saj-tone-' + tone);
                card.open = index === 0;
                const summary = element('summary', 'saj-message-summary');
                const top = element('span', 'saj-message-top');
                top.append(element('span', 'saj-tag', title), element('span', 'saj-message-date', formatDate(message.date_creation)));
                const author = element('span', 'saj-message-author', formatAuteur(message));
                const rawContent = String(message.contenu || 'Message sans contenu.');
                const preview = rawContent.replace(/\s+/g, ' ').trim();
                summary.append(top, author, element('span', 'saj-message-preview', preview.slice(0, 125) + (preview.length > 125 ? '…' : '')));
                const body = element('div', 'saj-message-body');
                body.append(element('p', 'saj-message-text', rawContent));
                card.append(summary, body);
                paneMessages.appendChild(card);
            });

            paneHistory.append(element('p', 'saj-panel-intro', 'Une chronologie des actions réellement enregistrées, de la plus récente à la plus ancienne.'));
            if (!historique.length) paneHistory.append(element('p', 'saj-empty', 'Aucun événement enregistré pour ce dossier.'));
            const timeline = element('ol', 'saj-timeline');
            historique.forEach((entry, index) => {
                const tone = /DOCUMENT_REMIS/.test(String(entry.action || '')) ? 'done'
                    : /DOCUMENT_PRET/.test(String(entry.action || '')) ? 'ready' : 'info';
                const li = element('li', 'saj-event saj-event-' + tone + (index === 0 ? ' saj-event-latest' : ''));
                const head = element('div','saj-event-head');
                head.append(element('strong', 'saj-event-title', labelAction(entry.action)),
                    element('time', 'saj-event-date', formatDate(entry.date_action)));
                li.append(head, element('span', 'saj-event-actor', formatAuteur(entry)));
                if (entry.ancien_statut && entry.nouveau_statut && entry.ancien_statut !== entry.nouveau_statut) {
                    const transition = element('div','saj-transition');
                    transition.append(
                        element('span','saj-transition-state',labelStatut(entry.ancien_statut)),
                        element('span','saj-transition-arrow','→'),
                        element('span','saj-transition-state',labelStatut(entry.nouveau_statut))
                    );
                    li.append(transition);
                }
                if (entry.commentaire) li.append(element('p','saj-event-note',entry.commentaire));
                timeline.appendChild(li);
            });
            paneHistory.appendChild(timeline);
            section.append(element('p', 'saj-footer', 'Journal en lecture seule · 100 derniers messages et 100 derniers événements au maximum.'));
            select(0);
        } catch (error) {
            if (section.isConnected) {
                status.className = 'saj-error';
                status.textContent = 'Journal momentanément indisponible (' + error.message + '). Aucune action n’a été modifiée.';
            }
        }
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

            const operationLabel = creerElement("label", "", "Nature de l'action");
            const operation = document.createElement("select");
            [
                ["MESSAGE", "Envoyer une information — dossier toujours en cours"],
                ["DOCUMENT_PRET", "Confirmer un document réellement prêt au retrait"],
                ["DOCUMENT_REMIS", "Confirmer la remise effective du document — clôturer"]
            ].forEach(([value, title]) => {
                const option = document.createElement("option");
                option.value = value;
                option.textContent = title;
                operation.appendChild(option);
            });
            const validationLabel = creerElement("label", "unit-workspace-document-confirmation");
            const validation = document.createElement("input");
            validation.type = "checkbox";
            const validationText = document.createElement("span");
            validationText.textContent = " Je confirme personnellement la disponibilité physique du document ou sa remise effective, selon l'action choisie.";
            validationLabel.append(validation, validationText);
            validationLabel.hidden = true;
            operation.addEventListener("change", () => {
                validationLabel.hidden = operation.value === "MESSAGE";
                validation.checked = false;
                submit.textContent = operation.value === "MESSAGE" ? "Envoyer le message" : (operation.value === "DOCUMENT_PRET" ? "Confirmer document prêt" : "Confirmer la remise");
            });
            submit.textContent = "Envoyer le message";
            form.append(operationLabel, operation, label, textarea, validationLabel, submit);
            form.addEventListener("submit", event => {
                event.preventDefault();
                if (operation.value !== "MESSAGE" && !validation.checked) {
                    afficherToast("Confirme explicitement la disponibilité ou la remise avant de poursuivre.", "error");
                    return;
                }
                respondCase(demande.id, textarea.value, submit, operation.value, validation.checked);
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

    async function respondCase(caseId, contenu, button, operation = "MESSAGE", confirmation = false) {
        if (!contenu.trim()) return;

        button.disabled = true;
        button.textContent = "Envoi…";

        let operationEnregistree = false;
        try {
            const capabilityResponse = await fetch('/api/pilot/document-workflow/capabilities', {
                credentials: 'same-origin', cache: 'no-store'
            });
            if (!capabilityResponse.ok || (await capabilityResponse.json()).version !== 'P3.3.5G') {
                throw new Error('Serveur non redémarré ou workflow indisponible : envoi bloqué.');
            }
            await api(
                `/api/organisations/${organisationId}/units/${unitId}/cases/${caseId}/respond`,
                {
                    method: "POST",
                    body: JSON.stringify({ tenantCode, contenu: contenu.trim(), operation, confirmation })
                }
            );

            operationEnregistree = true;
            const retourMetier = operation === "MESSAGE"
                ? "Message enregistré — dossier toujours en cours."
                : operation === "DOCUMENT_PRET"
                    ? "Disponibilité du document enregistrée — dossier non clôturé."
                    : "Remise du document enregistrée — dossier clôturé.";
            afficherToast(retourMetier);
            let actualisationReussie = true;
            try {
                await loadInbox();
            } catch (erreurActualisation) {
                actualisationReussie = false;
            }
            // Accusé visible après le rechargement de la boîte de réception.
            // Le dossier et la nature de l'action restent identifiables par l'agent.
            try {
                const precedent = document.getElementById("sateer-workflow-accuse");
                if (precedent) precedent.remove();
                const accuse = document.createElement("div");
                accuse.id = "sateer-workflow-accuse";
                accuse.setAttribute("role", "status");
                accuse.setAttribute("aria-live", "polite");
                accuse.tabIndex = -1;
                accuse.style.cssText = "border:1px solid #637e8e;border-left:4px solid #356b65;border-radius:6px;padding:12px 14px;margin:12px 0;font-weight:600;background:#f3f8f6;color:#183a34;";
                accuse.textContent = "Dossier n°" + caseId + " — " + retourMetier +
                    (actualisationReussie ? "" : " L'affichage des dossiers n'a pas pu être actualisé ; l'action a été acceptée par le serveur.");
                const emplacement = document.querySelector(".unit-workspace-actions") || document.querySelector("main") || document.body;
                emplacement.prepend(accuse);
                accuse.focus({preventScroll: true});
                accuse.scrollIntoView({block: "nearest"});
            } catch (erreurAffichage) {
                // Une erreur d'affichage ne doit jamais transformer une action
                // déjà validée par le serveur en échec réessayable.
                afficherToast(retourMetier);
            }
        } catch (error) {
            if (operationEnregistree) {
                afficherToast("Action acceptée par le serveur, mais son affichage a échoué. Ne renvoyez pas le message.", "error");
            } else {
                afficherToast(error.message, "error");
                button.disabled = false;
                button.textContent = operation === "MESSAGE" ? "Envoyer le message" :
                    (operation === "DOCUMENT_PRET" ? "Confirmer document prêt" : "Confirmer la remise");
            }
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
