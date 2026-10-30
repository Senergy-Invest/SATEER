// Point d'entrée historique conservé pour les anciens liens.
// Le traitement des dossiers est désormais assuré par le Unit Workspace générique.
(function () {
    "use strict";

    const params = new URLSearchParams(window.location.search);
    const organisation = params.get("organisation");
    const unit = params.get("unit");
    const tenant = params.get("tenant");

    if (organisation && unit && tenant) {
        const destination = new URL("/unit-workspace.html", window.location.origin);
        destination.searchParams.set("organisation", organisation);
        destination.searchParams.set("unit", unit);
        destination.searchParams.set("tenant", tenant);
        window.location.replace(destination.toString());
        return;
    }

    const container = document.getElementById("agentDemandesContainer");
    if (container) {
        container.textContent =
            "L'espace agent a été remplacé par le Workspace générique. " +
            "Ouvre l'unité concernée depuis le tableau de bord opérationnel.";
    }
})();
