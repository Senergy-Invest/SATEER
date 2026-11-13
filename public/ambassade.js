"use strict";
/** Page A1 : aucune API métier propre à l'ambassade, aucune écriture. */
(async function initialiserAmbassade() {
    const statut = document.getElementById("ambassadeStatut");
    const contenu = document.getElementById("ambassadeContenu");
    try {
        const params = new URLSearchParams(window.location.search);
        const organisationId = params.get("organisation");
        const tenantCode = params.get("tenant");
        const contexte = await window.SATEER_CONTEXT_READY;
        const presentation = window.SATEER_INSTITUTION_PRESENTATION;
        const organisation = presentation?.selectionnerOrganisationAutorisee(
            contexte, organisationId, tenantCode, "AMBASSADE"
        );
        if (!organisation) {
            statut.textContent = "Accès indisponible : aucun rattachement autorisé à cette ambassade dans ce tenant.";
            return;
        }
        document.getElementById("ambassadeNom").textContent = organisation.nom || "Ambassade";
        statut.textContent = "Rattachement confirmé. Prototype de présentation sans services métier activés.";
        contenu.hidden = false;
    } catch (erreur) {
        console.warn("Mon Ambassade : session ou contexte indisponible.", erreur);
        statut.textContent = "Session ou contexte indisponible. Revenez à Mon SATEER.";
    }
})();
