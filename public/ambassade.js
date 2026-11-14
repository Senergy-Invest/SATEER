"use strict";
/** A2 : lecture de publications à travers l'API SATEER existante; aucune écriture. */
function afficherPublicationAmbassade(conteneur, publication) {
    // textContent exclusivement : une publication est une donnée, jamais du HTML exécutable.
    const carte = document.createElement("article");
    const titre = document.createElement("h3");
    titre.textContent = String(publication.titre || "Information institutionnelle");
    const metadonnees = document.createElement("small");
    const parties = [publication.categorie, publication.priorite, publication.communication_channel_nom]
        .filter(Boolean).map(String);
    metadonnees.textContent = parties.join(" · ") || "Information";
    const contenu = document.createElement("p");
    contenu.textContent = String(publication.contenu || "");
    carte.append(titre, metadonnees, contenu);
    conteneur.append(carte);
}
async function chargerPublicationsAmbassade(organisationId, tenantCode) {
    const etat = document.getElementById("ambassadePublicationsStatut");
    const liste = document.getElementById("ambassadePublicationsListe");
    liste.replaceChildren();
    etat.textContent = "Chargement des informations auxquelles votre profil a accès…";
    try {
        const endpoint = "/api/institution-communications/" + encodeURIComponent(organisationId) +
            "/publications?" + new URLSearchParams({ tenant: tenantCode });
        const response = await fetch(endpoint, {
            method: "GET", credentials: "same-origin", cache: "no-store",
            headers: { "Accept": "application/json" }
        });
        if (!response.ok) throw new Error("PUBLICATIONS_INDISPONIBLES");
        const data = await response.json();
        if (data.statut !== "PUBLICATIONS_INSTITUTIONNELLES" ||
            Number(data.organisation?.id) !== Number(organisationId) ||
            data.organisation?.type !== "AMBASSADE" || !Array.isArray(data.publications)) {
            throw new Error("REPONSE_INVALIDE");
        }
        if (data.publications.length === 0) {
            etat.textContent = "Aucune publication accessible à votre profil pour cette ambassade actuellement.";
            return;
        }
        const maximum = 30;
        data.publications.slice(0, maximum).forEach(p => afficherPublicationAmbassade(liste, p));
        etat.textContent = data.publications.length + " publication(s) accessible(s) selon les audiences configurées."
            + (data.publications.length > maximum ? " Seules les 30 premières sont affichées." : "");
    } catch (erreur) {
        console.warn("Mon Ambassade : informations institutionnelles indisponibles.", erreur);
        etat.textContent = "Informations indisponibles pour le moment. Aucun contenu non autorisé n'est affiché.";
    }
}

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
        // Le lien utilise le contexte déjà vérifié ; l'API contrôle de nouveau
        // session, tenant, organisation et canal au moment de l'envoi.
        const demandeLink = document.getElementById("ambassadeDemandeLink");
        if (demandeLink) demandeLink.href = "/demande.html?" + new URLSearchParams({
            organisation: String(organisation.id), tenant: tenantCode,
            source: "MON_AMBASSADE"
        }).toString();
        statut.textContent = "Organisation rattachée à la session. Les publications sont filtrées par les règles Communication.";
        contenu.hidden = false;
        await chargerPublicationsAmbassade(Number(organisation.id), tenantCode);
        await Promise.all([
            window.SATEER_AMBASSADE_OPERATIONS?.charger({
                organisationId: Number(organisation.id), tenantCode
            }),
            window.SATEER_AMBASSADE_PARCOURS?.charger({
                organisationId: Number(organisation.id), tenantCode
            }),
            window.SATEER_AMBASSADE_RESEAU?.charger({
                organisationId: Number(organisation.id), tenantCode
            })
        ]);
    } catch (erreur) {
        console.warn("Mon Ambassade : session ou contexte indisponible.", erreur);
        statut.textContent = "Session ou contexte indisponible. Revenez à Mon SATEER.";
    }
})();
