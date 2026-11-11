/*
 * SATEER | pilote Bordeaux P3.3.5I.
 * Présentation de l'étape documentaire dans le détail d'une demande déjà autorisée.
 * Les seules preuves de disponibilité utilisées sont les événements explicites de
 * l'historique affiché par le serveur (DOCUMENT_PRET_CONFIRME / DOCUMENT_REMIS_CONFIRME).
 * Ne déduit JAMAIS la disponibilité du statut TRAITEE ni d'une réponse ordinaire.
 * Aucun appel réseau, aucune écriture. Module isolé, provisoire pour le pilote.
 */
(function (root) {
    "use strict";
    function etatDepuisActions(actions) {
        const items = Array.isArray(actions) ? actions : [];
        if (items.includes("DOCUMENT_REMIS_CONFIRME")) return "REMIS";
        if (items.includes("DOCUMENT_PRET_CONFIRME")) return "PRET_A_RETIRER";
        return "NON_CONFIRME";
    }
    function actionsDepuisHistorique(texte) {
        const s = String(texte || "");
        return ["DOCUMENT_PRET_CONFIRME", "DOCUMENT_REMIS_CONFIRME"].filter(code => s.includes(code));
    }
    function texteEtat(etat) {
        if (etat === "PRET_A_RETIRER") return {
            titre: "Document prêt au retrait — confirmation du bureau",
            explication: "Le service a confirmé la disponibilité du document. Le dossier reste ouvert jusqu'à l'enregistrement de sa remise.",
            conseil: "Modalités de retrait non renseignées ici : confirmez le lieu, les horaires, les pièces à présenter et la nécessité d'un rendez-vous auprès du bureau avant de vous déplacer."
        };
        if (etat === "REMIS") return {
            titre: "Remise du document enregistrée",
            explication: "Le bureau a enregistré la remise du document et la clôture de cette étape.",
            conseil: "Consultez l'historique du dossier pour retrouver la trace de cette opération."
        };
        return null;
    }
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { etatDepuisActions, actionsDepuisHistorique, texteEtat };
    }
    if (!root || !root.document) return;
    const document = root.document;
    let dernierEtat = null;
    let enCours = false;
    function creer(tag, cls, contenu) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (contenu) n.textContent = contenu;
        return n;
    }
    function sectionHistorique() {
        const titre = Array.from(document.querySelectorAll("h2,h3"))
            .find(h => /suivi de la demande/i.test(h.textContent || ""));
        if (!titre) return null;
        return titre.closest("section,article") || titre.parentElement;
    }
    const libellesActions = {
        DOCUMENT_PRET_CONFIRME: "Document prêt au retrait",
        DOCUMENT_REMIS_CONFIRME: "Document remis au citoyen"
    };
    function actionsDepuisSection(section) {
        const presentes = actionsDepuisHistorique(section.textContent);
        section.querySelectorAll("[data-sateer-action-original]").forEach(n => {
            const code = n.getAttribute("data-sateer-action-original");
            if (Object.prototype.hasOwnProperty.call(libellesActions, code) && !presentes.includes(code)) presentes.push(code);
        });
        return presentes;
    }
    function humaniserActions(section) {
        // N'intervient que sur les nœuds contenant exactement le code métier.
        // Ne modifie pas le contenu libre des messages envoyés par les agents.
        section.querySelectorAll("*").forEach(n => {
            if (n.children.length) return;
            const valeur = (n.textContent || "").trim();
            if (!Object.prototype.hasOwnProperty.call(libellesActions, valeur)) return;
            n.setAttribute("data-sateer-action-original", valeur);
            n.textContent = libellesActions[valeur];
            // Corriger « Affectation enregistrée » uniquement si ce texte
            // appartient à la MÊME ligne d'historique que l'événement.
            const ligne = typeof n.closest === "function"
                ? n.closest("li,article,.history-item,.history-entry,.timeline-item") : null;
            if (ligne) ligne.querySelectorAll("*").forEach(texte => {
                if (texte.children.length || (texte.textContent || "").trim() !== "Affectation enregistrée") return;
                texte.textContent = valeur === "DOCUMENT_PRET_CONFIRME"
                    ? "Disponibilité confirmée" : "Remise confirmée";
            });
        });
    }
    function clarifierEtapes() {
        document.querySelectorAll("span,strong,p,div,li").forEach(n => {
            if (n.children.length || (n.textContent || "").trim() !== "Réponse apportée") return;
            n.textContent = "Échanges et suivi";
        });
    }
    function rendre() {
        if (enCours) return;
        enCours = true;
        try {
            const section = sectionHistorique();
            const h1 = document.querySelector("h1");
            if (!section || !h1) return;
            const etat = etatDepuisActions(actionsDepuisSection(section));
            humaniserActions(section);
            clarifierEtapes();
            if (etat === dernierEtat) return;
            // Ne pas créer d'indicateur à partir d'un statut historique TRAITEE.
            if (etat === "NON_CONFIRME") return;
            const libelle = texteEtat(etat);
            let cartouche = document.getElementById("sateer-document-availability");
            if (!cartouche) {
                cartouche = creer("section", "sateer-document-availability");
                cartouche.id = "sateer-document-availability";
                cartouche.setAttribute("aria-label", "Disponibilité du document");
                cartouche.style.cssText = "margin:18px 0;padding:16px 18px;border-radius:12px;border:1px solid #a9c5bc;border-left:5px solid #277761;background:#f5faf8;color:#14382f";
                const parent = h1.closest("header") || h1.parentElement;
                if (!parent || !parent.parentNode) return;
                parent.insertAdjacentElement("afterend", cartouche);
            }
            const title = creer("h2", "", libelle.titre);
            title.style.cssText = "margin:0 0 8px;font-size:1.1rem;line-height:1.35";
            const body = creer("p", "", libelle.explication);
            body.style.cssText = "margin:0 0 8px";
            const notice = creer("p", "", libelle.conseil);
            notice.style.cssText = "margin:0;font-size:.92rem";
            if (/\bDEMO\b|\bdémonstration\b/i.test(h1.textContent || "")) {
                const demo = creer("p", "", "Dossier de démonstration : cette confirmation ne concerne aucun document réel.");
                demo.style.cssText = "margin:8px 0 0;font-size:.86rem;font-weight:600";
                cartouche.replaceChildren(title, body, notice, demo);
            } else {
                cartouche.replaceChildren(title, body, notice);
            }
            dernierEtat = etat;
        } finally { enCours = false; }
    }
    // Le détail peut être chargé de manière asynchrone par demande-detail.js.
    // Le recalcul ne modifie le DOM qu'au changement d'état, sans boucle d'observation.
    const observer = new MutationObserver(rendre);
    const init = () => { observer.observe(document.body, {childList:true, subtree:true, characterData:true}); rendre(); };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, {once:true});
    else init();
}(typeof window !== "undefined" ? window : null));
