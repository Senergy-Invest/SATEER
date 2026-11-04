"use strict";
/* SATEER 1S.2 — expérience documentaire citoyenne, sans toucher au stockage. */
(() => {
    const $ = id => document.getElementById(id);
    const status = $("documentStatus");
    const form = $("documentForm");
    const save = $("saveDocument");
    const liste = $("documentList");
    if (!status || !form || !save || !liste) return;

    const titres = { CNI: "Carte nationale d'identité", PASSEPORT: "Passeport" };
    const api = "/api/mes-pieces-identite";
    const documents = new Map();
    let enCours = false;
    const message = (texte, niveau = "info") => {
        status.textContent = texte;
        status.dataset.niveau = niveau;
    };
    const json = response => response.json().catch(() => ({}));

    function dateISO(date) {
        if (!date) return true;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
        const [an, mois, jour] = date.split("-").map(Number);
        if (an < 1900 || an > 2100) return false;
        const d = new Date(Date.UTC(an, mois - 1, jour));
        return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
    }
    function erreurDates(delivrance, expiration) {
        const aujourdHui = new Date().toISOString().slice(0, 10);
        const anMaximum = String(new Date().getUTCFullYear() + 30) + "-12-31";
        if (!dateISO(delivrance)) return "Date de délivrance invalide. Utilisez une vraie date au format JJ/MM/AAAA.";
        if (!dateISO(expiration)) return "Date d'expiration invalide. Utilisez une vraie date au format JJ/MM/AAAA.";
        if (delivrance && delivrance > aujourdHui) return "La date de délivrance ne peut pas être dans le futur.";
        if (expiration && expiration > anMaximum) return "La date d'expiration ne peut pas dépasser 30 ans après l'année actuelle.";
        if (delivrance && expiration && expiration < delivrance) return "L'expiration doit être postérieure ou égale à la date de délivrance.";
        return null;
    }
    function reponseErreur(code, http) {
        switch (code) {
            case "DATE_DOCUMENT_INVALIDE":
                return "Dates refusées : vérifiez la délivrance (pas dans le futur), l'expiration (après la délivrance, au plus 30 ans après l'année actuelle) et le calendrier.";
            case "NUMERO_DOCUMENT_INVALIDE":
                return "Numéro incorrect : 5 à 32 lettres ou chiffres. Utilisez uniquement une référence fictive.";
            case "PAYS_EMETTEUR_INVALIDE":
                return "Pays émetteur incorrect : utilisez deux lettres, par exemple SN.";
            case "ORIGINE_OU_FORMAT_NON_AUTORISE":
                return "Requête refusée par le contrôle d'origine. Rechargez la page depuis le serveur SATEER.";
            default:
                return "Enregistrement refusé (" + (code || "HTTP " + http) + ").";
        }
    }
    function preparerFormulaire(type) {
        if (!Object.hasOwn(titres, type)) return;
        const doc = documents.get(type);
        $("documentType").value = type;
        $("documentNumber").value = "";
        $("documentCountry").value = doc?.paysEmetteur || "SN";
        $("documentIssued").value = doc?.dateDelivrance || "";
        $("documentExpires").value = doc?.dateExpiration || "";
        form.hidden = false;
        message(doc
            ? "Remplacer " + titres[type].toLowerCase() + " : saisissez de nouveau un numéro fictif. Le numéro existant ne peut pas être relu en clair."
            : "Ajouter " + titres[type].toLowerCase() + " : renseignez un numéro fictif. Les dates sont facultatives.");
        $("documentNumber").focus();
        if (typeof form.scrollIntoView === "function") form.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    function ligneDocument(type, doc) {
        const row = document.createElement("div");
        row.className = "identity-document-record";
        const info = document.createElement("div");
        const titre = document.createElement("strong");
        titre.textContent = titres[type];
        info.append(titre);
        const detail = document.createElement("small");
        if (!doc) detail.textContent = "Non renseigné · Référence non vérifiée";
        else {
            const expiration = doc.dateExpiration ? " · expire le " + doc.dateExpiration : "";
            detail.textContent = doc.numeroMasque + expiration + " · Déclaré, non vérifié" +
                (doc.validite === "EXPIRE" ? " · Document expiré" : "");
        }
        info.append(detail);
        row.append(info);
        const actions = document.createElement("div");
        actions.className = "identity-document-actions";
        const bouton = document.createElement("button");
        bouton.type = "button";
        bouton.className = "identity-document-action";
        bouton.textContent = doc ? "Remplacer" : "Ajouter";
        bouton.setAttribute("aria-label", (doc ? "Remplacer " : "Ajouter ") + titres[type]);
        bouton.addEventListener("click", () => preparerFormulaire(type));
        actions.append(bouton);
        if (doc) {
            const supprimerBouton = document.createElement("button");
            supprimerBouton.type = "button";
            supprimerBouton.className = "identity-document-delete";
            supprimerBouton.textContent = "Supprimer";
            supprimerBouton.setAttribute("aria-label", "Supprimer la référence " + titres[type]);
            supprimerBouton.addEventListener("click", () => supprimer(type));
            actions.append(supprimerBouton);
        }
        row.append(actions);
        return row;
    }
    async function charger() {
        try {
            const r = await fetch(api, { credentials: "same-origin", cache: "no-store" });
            const data = await json(r);
            if (!r.ok) throw new Error(data.statut || "HTTP " + r.status);
            if (!Array.isArray(data.documents)) throw new Error("REPONSE_DOCUMENTS_INVALIDE");
            documents.clear();
            for (const doc of data.documents) {
                if (Object.hasOwn(titres, doc.type)) documents.set(doc.type, doc);
            }
            liste.replaceChildren();
            for (const type of Object.keys(titres)) {
                liste.append(ligneDocument(type, documents.get(type)));
            }
            form.hidden = false;
            message("Choisissez « Ajouter » sur la CNI ou le passeport. Ces références restent personnelles et non vérifiées.");
            return true;
        } catch (e) {
            form.hidden = true;
            liste.replaceChildren();
            message("Impossible de charger les références (" + e.message + "). Vérifiez la session et le serveur de test.", "erreur");
            return false;
        }
    }
    async function supprimer(type) {
        if (enCours || !window.confirm("Supprimer la référence " + titres[type] + " de votre compte SATEER ?")) return;
        enCours = true;
        try {
            const r = await fetch(api + "/" + encodeURIComponent(type), {
                method: "DELETE", credentials: "same-origin", cache: "no-store",
                headers: { "Content-Type": "application/json" }
            });
            const data = await json(r);
            if (!r.ok) return message("Suppression refusée : " + (data.statut || r.status), "erreur");
            await charger();
            message("Référence fictive supprimée de votre profil.", "succes");
        } catch (_) { message("Suppression non confirmée. Réessayez.", "erreur"); }
        finally { enCours = false; }
    }
    $("documentType").addEventListener("change", event => preparerFormulaire(event.target.value));
    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (enCours) return;
        const type = $("documentType").value;
        const numero = $("documentNumber").value;
        const paysEmetteur = $("documentCountry").value.trim().toUpperCase();
        const dateDelivrance = $("documentIssued").value;
        const dateExpiration = $("documentExpires").value;
        if (!Object.hasOwn(titres, type)) return message("Choisissez CNI ou passeport.", "erreur");
        if (!/^[A-Z0-9]{5,32}$/.test(numero.trim().toUpperCase().replace(/[ -]/g, ""))) {
            return message("Numéro non conforme : 5 à 32 lettres/chiffres. Utilisez une référence fictive.", "erreur");
        }
        if (!/^[A-Z]{2}$/.test(paysEmetteur)) {
            return message("Pays émetteur : saisissez exactement deux lettres (exemple : SN).", "erreur");
        }
        const erreur = erreurDates(dateDelivrance, dateExpiration);
        if (erreur) return message(erreur + " Vous pouvez aussi laisser les dates vides.", "erreur");
        enCours = true;
        save.disabled = true;
        message("Enregistrement chiffré en cours…");
        try {
            const r = await fetch(api + "/" + encodeURIComponent(type), {
                method: "PUT", credentials: "same-origin", cache: "no-store",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ numero, paysEmetteur, dateDelivrance, dateExpiration })
            });
            const data = await json(r);
            if (!r.ok) return message(reponseErreur(data.statut, r.status), "erreur");
            $("documentNumber").value = "";
            $("documentIssued").value = "";
            $("documentExpires").value = "";
            const charge = await charger();
            if (charge) message("Référence enregistrée et affichée sous forme masquée. Elle reste déclarative et non vérifiée.", "succes");
        } catch (_) { message("Enregistrement non confirmé : vérifiez la connexion au serveur.", "erreur"); }
        finally { enCours = false; save.disabled = false; }
    });
    form.hidden = true;
    charger();
})();
