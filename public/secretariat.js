// Compatibilité de l'ancien point d'entrée Secrétariat.
// La sélection de l'unité est désormais pilotée par les capacités configurées.
(function () {
    "use strict";

    const params = new URLSearchParams(window.location.search);
    const organisationId = Number(params.get("organisation"));
    const tenantCode = String(params.get("tenant") || "").trim();
    const unitId = Number(params.get("unit") || 0);

    const loading = document.getElementById("secretariatLoading");
    const error = document.getElementById("secretariatErreur");
    const container = document.getElementById("secretariatDemandes");

    function showError(message) {
        if (loading) loading.hidden = true;
        if (error) {
            error.hidden = false;
            error.textContent = message;
        }
    }

    function openWorkspace(id) {
        const query = new URLSearchParams({
            organisation: String(organisationId),
            unit: String(id),
            tenant: tenantCode
        });
        window.location.replace(`/unit-workspace.html?${query.toString()}`);
    }

    async function init() {
        if (
            !Number.isSafeInteger(organisationId) || organisationId <= 0
            || !tenantCode
        ) {
            showError("Le contexte organisation / tenant est incomplet.");
            return;
        }

        if (Number.isSafeInteger(unitId) && unitId > 0) {
            openWorkspace(unitId);
            return;
        }

        try {
            const response = await fetch(
                `/api/organisations/${organisationId}/units/overview?tenant=${encodeURIComponent(tenantCode)}`,
                {
                    credentials: "same-origin",
                    cache: "no-store",
                    headers: { "Accept": "application/json" }
                }
            );

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data.statut || "Impossible de charger les unités accessibles.");
            }

            const intakeUnits = (data.unites || []).filter(unit => {
                const codes = new Set(unit.capabilities || []);
                return codes.has("RECEIVE_INCOMING")
                    && codes.has("ROUTE_CASES")
                    && unit.canOpenWorkspace;
            });

            if (intakeUnits.length === 1) {
                openWorkspace(intakeUnits[0].id);
                return;
            }

            if (loading) loading.hidden = true;
            if (!container) return;
            container.replaceChildren();

            if (!intakeUnits.length) {
                showError("Aucune unité accessible ne possède les capacités de réception et d'orientation.");
                return;
            }

            const intro = document.createElement("p");
            intro.className = "muted";
            intro.textContent = "Plusieurs unités peuvent recevoir et orienter les entrées. Sélectionne le Workspace à ouvrir.";
            container.appendChild(intro);

            intakeUnits.forEach(unit => {
                const card = document.createElement("article");
                card.className = "supervision-card";

                const title = document.createElement("h3");
                title.textContent = unit.nom;

                const detail = document.createElement("p");
                detail.textContent = `${unit.type || "Unité"} · ${unit.members_count || 0} membre(s)`;

                const link = document.createElement("a");
                link.className = "button button-secondary";
                link.textContent = "Ouvrir le Workspace";
                const query = new URLSearchParams({
                    organisation: String(organisationId),
                    unit: String(unit.id),
                    tenant: tenantCode
                });
                link.href = `/unit-workspace.html?${query.toString()}`;

                card.append(title, detail, link);
                container.appendChild(card);
            });
        } catch (err) {
            showError(err.message || "Impossible d'ouvrir le Workspace.");
        }
    }

    init();
})();
