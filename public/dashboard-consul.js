(() => {
    const params = new URLSearchParams(window.location.search);
    const organisationId = Number(params.get("organisation") || 1);
    const tenant = params.get("tenant") || "SN";

    const number = value => {
        const parsed = Number(value || 0);
        return Number.isFinite(parsed) ? new Intl.NumberFormat("fr-FR").format(parsed) : "—";
    };

    function addListItem(container, label, value) {
        const row = document.createElement("div");
        row.className = "dashboard-list-item";
        const title = document.createElement("span");
        title.textContent = label;
        const amount = document.createElement("strong");
        amount.textContent = number(value);
        row.append(title, amount);
        container.appendChild(row);
    }

    function renderEvolution(items) {
        const container = document.getElementById("evolutionMensuelle");
        container.replaceChildren();
        const rows = Array.isArray(items) ? items : [];
        const maximum = Math.max(1, ...rows.map(x => Math.max(Number(x.demandes_recues || 0), Number(x.demandes_cloturees || 0))));

        rows.forEach(item => {
            const row = document.createElement("div");
            const label = document.createElement("div");
            label.className = "strategic-bar-label";
            const date = new Date(`${item.periode}-01T12:00:00`);
            label.textContent = Number.isNaN(date.getTime()) ? item.periode : new Intl.DateTimeFormat("fr-FR", { month: "short", year: "2-digit" }).format(date);

            const received = Number(item.demandes_recues || 0);
            const closed = Number(item.demandes_cloturees || 0);
            const track = document.createElement("div");
            track.className = "strategic-bar-track";
            const fill = document.createElement("div");
            fill.className = "strategic-bar-fill";
            fill.style.width = `${Math.max(1, received / maximum * 100)}%`;
            track.appendChild(fill);

            const values = document.createElement("span");
            values.className = "strategic-bar-value";
            values.textContent = `${number(received)} reçues · ${number(closed)} clôturées`;
            row.className = "strategic-bar-row";
            row.append(label, track, values);
            container.appendChild(row);
        });

        if (!rows.length) {
            const empty = document.createElement("p");
            empty.className = "muted";
            empty.textContent = "Aucune donnée sur la période.";
            container.appendChild(empty);
        }
    }

    function renderSimpleList(elementId, rows, labelField, valueField, emptyText) {
        const container = document.getElementById(elementId);
        container.replaceChildren();
        (Array.isArray(rows) ? rows : []).forEach(item => addListItem(container, item[labelField] || "Non renseigné", item[valueField]));
        if (!container.childElementCount) {
            const empty = document.createElement("p");
            empty.className = "muted";
            empty.textContent = emptyText;
            container.appendChild(empty);
        }
    }

    function afficherDashboard(data) {
        const k = data.indicateurs || {};
        document.getElementById("organisationNom").textContent = data.organisation?.nom || "Consulat";
        document.getElementById("kpiDemandesTotal").textContent = number(k.total);
        document.getElementById("kpiTauxTraitement").textContent = `${number(k.taux_traitement)} %`;
        document.getElementById("kpiDelaiMoyen").textContent = k.delai_moyen_heures === null || k.delai_moyen_heures === undefined ? "—" : `${number(k.delai_moyen_heures)} h`;
        document.getElementById("kpiUrgentes").textContent = number(k.urgentes_ouvertes);
        document.getElementById("kpiUsagers").textContent = number(k.usagers);
        document.getElementById("kpiTerritoires").textContent = number(k.territoires_couverts);
        document.getElementById("kpiNouvelles").textContent = number(k.nouvelles);
        document.getElementById("kpiEnCours").textContent = number(k.en_cours);
        document.getElementById("kpiTraites").textContent = number(k.traitees);
        document.getElementById("kpiImportantes").textContent = number(k.importantes_ouvertes);
        document.getElementById("kpiPublications").textContent = number(k.publications_total);
        document.getElementById("kpiPublicationsPubliees").textContent = number(k.publications_publiees);
        document.getElementById("kpiPublicationsSoumises").textContent = number(k.publications_soumises_diaspora);
        document.getElementById("kpiPublicationsDiffusees").textContent = number(k.publications_diffusees_diaspora);

        renderEvolution(data.evolution_mensuelle);
        renderSimpleList("categoriesDemandes", data.demandes_par_categorie, "categorie", "total", "Aucune demande enregistrée.");
        renderSimpleList("couvertureTerritoriale", data.couverture_territoriale, "territoire", "personnes", "Aucune couverture territoriale renseignée.");
        document.getElementById("dashboardContenu").hidden = false;
    }

    async function chargerAccesOperationnel() {
        const response = await fetch(
            `/api/organisations/${organisationId}/dashboard-operationnel/acces?tenant=${encodeURIComponent(tenant)}`,
            { credentials: "same-origin", cache: "no-store" }
        );
        if (!response.ok) return;
        const data = await response.json().catch(() => ({}));
        if (data.peutConsulter) {
            const section = document.getElementById("accesOperationnelSection");
            const lien = document.getElementById("accesOperationnelLien");
            lien.href = `/dashboard-vice-consul.html?organisation=${organisationId}&tenant=${encodeURIComponent(tenant)}`;
            section.hidden = false;
        }
    }

    async function initialiser() {
        try {
            const response = await fetch(
                `/api/organisations/${organisationId}/dashboard-strategique?tenant=${encodeURIComponent(tenant)}`,
                { credentials: "same-origin", cache: "no-store" }
            );
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                const message = response.status === 403
                    ? "Ton compte ne possède pas l'autorisation de consulter le dashboard stratégique."
                    : (data.statut || "Impossible de charger le dashboard stratégique.");
                throw new Error(message);
            }
            afficherDashboard(data);
            await chargerAccesOperationnel();
        } catch (erreur) {
            document.getElementById("dashboardErreurMessage").textContent = erreur.message || "Erreur de chargement.";
            document.getElementById("dashboardErreur").hidden = false;
            console.error("Erreur dashboard stratégique :", erreur);
        }
    }

    initialiser();
})();
