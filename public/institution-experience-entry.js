"use strict";
/**
 * Catalogue de PRESENTATION des expériences institutionnelles dans Mon SATEER.
 * Ne constitue PAS une activation organisationnelle ni une autorisation d'accès.
 * Les autorisations effectives restent dans les API et les sessions SATEER.
 */
(function (root) {
    const PRESENTATIONS = Object.freeze({
        AMBASSADE: Object.freeze({
            code: "MON_AMBASSADE",
            typeOrganisation: "AMBASSADE",
            titre: "Mon Ambassade",
            description: "Informations et services de votre ambassade, selon les habilitations accordées.",
            chemin: "/ambassade.html",
            icone: "🏛️",
            etat: "PREPARATION"
        })
    });

    function presentationPour(typeOrganisation) {
        return Object.prototype.hasOwnProperty.call(PRESENTATIONS, typeOrganisation)
            ? PRESENTATIONS[typeOrganisation] : null;
    }

    function selectionnerOrganisationAutorisee(contexte, organisationId, tenantCode, typeOrganisation) {
        if (typeof organisationId !== "number" && (typeof organisationId !== "string" || !/^[1-9][0-9]*$/.test(organisationId))) return null;
        const id = Number(organisationId);
        if (!Number.isSafeInteger(id) || id <= 0 || typeof tenantCode !== "string"
            || !/^[A-Z][A-Z0-9_-]{0,49}$/.test(tenantCode)) return null;
        const autorisees = Array.isArray(contexte?.organisations) ? contexte.organisations : [];
        const organisation = autorisees.find((o) => Number(o.id) === id && o.type === typeOrganisation
            && o.tenant_code === tenantCode);
        return organisation || null;
    }

    function lienExperience(presentation, organisationId, tenantCode) {
        if (!presentation || !/^[A-Z][A-Z0-9_-]{0,49}$/.test(tenantCode)) return null;
        if (typeof organisationId !== "number" && (typeof organisationId !== "string" || !/^[1-9][0-9]*$/.test(organisationId))) return null;
        const id = Number(organisationId);
        if (!Number.isSafeInteger(id) || id <= 0) return null;
        return presentation.chemin + "?" + new URLSearchParams({ organisation: String(id), tenant: tenantCode });
    }

    function creerCarte(organisation, tenantCode, doc) {
        const presentation = presentationPour(organisation?.type);
        const href = lienExperience(presentation, organisation?.id, tenantCode);
        if (!href || !doc || typeof doc.createElement !== "function") return null;
        const element = (tag, classe, contenu) => {
            const e = doc.createElement(tag);
            if (classe) e.className = classe;
            if (contenu != null) e.textContent = String(contenu);
            return e;
        };
        const carte = element("article", "sx-consulat-card sx-institution-card");
        const entete = element("div", "sx-card-top");
        const icone = element("div", "sx-consulat-icon", presentation.icone);
        icone.setAttribute("aria-hidden", "true");
        const titre = element("div", "sx-card-heading");
        titre.append(
            element("p", "sx-card-kicker", "EXPÉRIENCE INSTITUTIONNELLE · EN PRÉPARATION"),
            element("h3", "sx-card-title", presentation.titre),
            element("p", "sx-card-subtitle", organisation.nom || "Ambassade")
        );
        entete.append(icone, titre);
        const lien = element("a", "sx-open-consulat", "Ouvrir " + presentation.titre + " →");
        lien.href = href;
        carte.append(entete, element("p", "sx-card-description", presentation.description), lien);
        return carte;
    }

    const API = Object.freeze({ presentationPour, selectionnerOrganisationAutorisee, lienExperience, creerCarte });
    root.SATEER_INSTITUTION_PRESENTATION = API;
    if (typeof module === "object" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
