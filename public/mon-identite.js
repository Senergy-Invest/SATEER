"use strict";
/* Lot 1R.2 : identité Core sans contexte consulaire et validation claire des dates.
 * Aucun numéro de document ni donnée personnelle n'est journalisé.
 */
const $ = id => document.getElementById(id);
const ids = ["dateNaissance", "nationalite", "adresse", "ville", "codePostal"];

function afficher(data) {
    const p = data.personne || {};
    $("prenom").textContent = p.prenom || "Non renseigné";
    $("nom").textContent = p.nom || "Non renseigné";
    $("paysResidence").textContent = p.paysResidence || "Non renseigné";
    for (const id of ids) $(id).value = (data.declaration || {})[id] || "";
}
function validerDateOptionnelle(valeur) {
    if (valeur === "") return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valeur)) return false;
    const [an, mois, jour] = valeur.split("-").map(Number);
    const d = new Date(Date.UTC(an, mois - 1, jour));
    const aujourdHui = new Date();
    return d.toISOString().slice(0, 10) === valeur &&
        d <= aujourdHui && an >= aujourdHui.getUTCFullYear() - 130;
}
function fixerBornesDate() {
    const aujourdHui = new Date();
    const iso = aujourdHui.toISOString().slice(0, 10);
    const date = $("dateNaissance");
    date.max = iso;
    date.min = String(aujourdHui.getUTCFullYear() - 130).padStart(4, "0") + "-01-01";
}
function motifSauvegarde(http, statut) {
    if (statut === "DATE_INVALIDE")
        return "Date de naissance invalide : vérifiez le calendrier et choisissez une date passée. Ce champ peut rester vide.";
    if (statut === "CHAMP_INVALIDE" || statut === "CHAMPS_IDENTITE_INVALIDES")
        return "Un champ est invalide. Vérifiez les caractères et longueurs puis réessayez.";
    if (statut === "ORIGINE_OU_FORMAT_NON_AUTORISE" || http === 403)
        return "Modification refusée par la protection de session/origine (403). Rechargez la page depuis SATEER.";
    if (http === 401) return "Session expirée. Reconnectez-vous à Mon SATEER.";
    if (http === 500) return "Erreur du serveur (500). Vos informations n'ont pas été confirmées enregistrées.";
    return "Enregistrement refusé (HTTP " + http + ", statut " + (statut || "non précisé") + ").";
}
async function charger() {
    const message = $("saveStatus");
    try {
        const r = await fetch("/api/mon-identite", { credentials: "same-origin", cache: "no-store" });
        if (!r.ok) {
            const erreur = new Error("PROFIL_HTTP_" + r.status);
            erreur.http = r.status;
            throw erreur;
        }
        afficher(await r.json());
        $("enregistrer").disabled = false;
        message.textContent = "";
    } catch (e) {
        const http = Number(e.http || 0);
        if (http === 401) message.textContent = "Session expirée. Reconnectez-vous à Mon SATEER.";
        else if (http === 404) message.textContent = "API du profil introuvable (404) : redémarrez le serveur SATEER sur le port 3100.";
        else if (http === 500) message.textContent = "Erreur du serveur (500) : vérifiez la migration d'identité 029.";
        else if (http === 403) message.textContent = "Accès au profil refusé (403) : vérifiez la session.";
        else message.textContent = "Profil indisponible" + (http ? " (HTTP " + http + ")" : " (réseau ou initialisation)") + ".";
        console.warn("Mon identité : chargement impossible", http || "ERREUR_RESEAU_OU_SCRIPT");
        $("enregistrer").disabled = true;
    }
}
$("identityForm").addEventListener("submit", async ev => {
    ev.preventDefault();
    const bouton = $("enregistrer");
    const message = $("saveStatus");
    const champDate = $("dateNaissance");
    // Les dates manquantes sont admises ; une date non valide n'est jamais envoyée.
    if ((champDate.validity && !champDate.validity.valid) || !validerDateOptionnelle(champDate.value.trim())) {
        message.textContent = "Date de naissance invalide : saisissez une date passée valide ou laissez ce champ vide.";
        champDate.focus();
        return;
    }
    bouton.disabled = true;
    message.textContent = "Enregistrement…";
    try {
        const payload = Object.fromEntries(ids.map(id => [id, $(id).value.trim()]));
        const r = await fetch("/api/mon-identite", {
            method: "PATCH", credentials: "same-origin", cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const resultat = await r.json().catch(() => ({}));
        if (!r.ok) {
            message.textContent = motifSauvegarde(r.status, resultat.statut);
            return;
        }
        afficher(resultat);
        message.textContent = "Votre déclaration a été enregistrée. Elle reste non vérifiée.";
    } catch (_) {
        message.textContent = "Connexion indisponible. L'enregistrement n'est pas confirmé ; réessayez.";
    } finally {
        bouton.disabled = false;
    }
});
$("enregistrer").disabled = true;
fixerBornesDate();
charger();
