/* SATEER — contrôle de session côté interface.
 * La sécurité réelle reste assurée par les routes backend.
 */
window.SATEER_choisirOrganisation = async function (organisationId, typeOrganisation) {
    const contexte = await window.SATEER_CONTEXT_READY;
    const candidates = (contexte.organisations || []).filter(item =>
        !typeOrganisation || item.type === typeOrganisation
    );
    if (organisationId) {
        return candidates.find(item => Number(item.id) === Number(organisationId)) || null;
    }
    if (candidates.length === 1) return candidates[0];
    if (candidates.length === 0 || !document.body) return null;

    return new Promise(resolve => {
        const overlay = document.createElement("div");
        overlay.setAttribute("role", "presentation");
        overlay.style.cssText = "position:fixed;inset:0;z-index:2147483001;background:rgba(10,20,35,.62);display:flex;align-items:center;justify-content:center;padding:20px;";
        const dialog = document.createElement("section");
        dialog.setAttribute("role", "dialog");
        dialog.setAttribute("aria-modal", "true");
        dialog.setAttribute("aria-labelledby", "sateer-org-dialog-title");
        dialog.style.cssText = "width:min(100%,460px);background:#fff;color:#172b3a;border-radius:16px;padding:24px;box-shadow:0 18px 60px rgba(0,0,0,.28);font:15px/1.5 system-ui,sans-serif;";
        const title = document.createElement("h2");
        title.id = "sateer-org-dialog-title";
        title.textContent = "Choisir une organisation";
        title.style.cssText = "margin:0 0 8px;font-size:20px;";
        const description = document.createElement("p");
        description.textContent = "Votre compte est rattaché à plusieurs organisations. Sélectionnez le contexte à ouvrir.";
        description.style.cssText = "margin:0 0 16px;color:#536575;";
        const select = document.createElement("select");
        select.setAttribute("aria-label", "Organisation");
        select.style.cssText = "width:100%;padding:12px;border:1px solid #b9c6d0;border-radius:8px;background:#fff;color:#172b3a;";
        candidates.forEach(item => {
            const option = document.createElement("option");
            option.value = String(item.id);
            option.textContent = item.nom + " — " + item.type;
            select.appendChild(option);
        });
        const actions = document.createElement("div");
        actions.style.cssText = "display:flex;justify-content:flex-end;gap:10px;margin-top:20px;";
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.textContent = "Annuler";
        cancel.style.cssText = "padding:10px 14px;border:1px solid #c4ced6;border-radius:8px;background:#fff;color:#172b3a;cursor:pointer;";
        const confirm = document.createElement("button");
        confirm.type = "button";
        confirm.textContent = "Continuer";
        confirm.style.cssText = "padding:10px 16px;border:0;border-radius:8px;background:#17324d;color:#fff;cursor:pointer;";
        const close = value => { overlay.remove(); resolve(value); };
        cancel.addEventListener("click", () => close(null));
        confirm.addEventListener("click", () => close(candidates.find(item => Number(item.id) === Number(select.value)) || null));
        overlay.addEventListener("click", event => { if (event.target === overlay) close(null); });
        actions.append(cancel, confirm);
        dialog.append(title, description, select, actions);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        select.focus();
    });
};
window.SATEER_CONTEXT_READY = (async function verifierSessionInterface() {
    try {
        const response = await fetch("/api/auth/me", {
            method: "GET",
            credentials: "same-origin",
            headers: { "Accept": "application/json" },
            cache: "no-store"
        });
        if (!response.ok) {
            const retour = window.location.pathname + window.location.search;
            window.location.replace("/login.html?returnTo=" + encodeURIComponent(retour));
            throw new Error("AUTHENTIFICATION_REQUISE");
        }
        const data = await response.json();
        window.SATEER_USER = data.personne;
        const tenant = new URLSearchParams(window.location.search).get("tenant") || "SN";
        const contextResponse = await fetch("/api/context?tenant=" + encodeURIComponent(tenant), {
            credentials: "same-origin",
            headers: { "Accept": "application/json" },
            cache: "no-store"
        });
        if (!contextResponse.ok) throw new Error("CONTEXTE_INSTITUTIONNEL_INDISPONIBLE");
        const context = await contextResponse.json();
        window.SATEER_CONTEXT = context;
        window.dispatchEvent(new CustomEvent("sateer:session-ready", { detail: context }));
        return context;
    } catch (erreur) {
        if (erreur.message !== "AUTHENTIFICATION_REQUISE") {
            console.error("Initialisation du contexte SATEER impossible :", erreur);
        }
        throw erreur;
    }
})();

/* SATEER_LOGOUT_UI_V2
 * Bouton global de déconnexion.
 * Le serveur révoque réellement la session via POST /api/auth/logout.
 * Le code de contrôle de session existant ci-dessus est conservé.
 */
(function () {
    "use strict";

    const BUTTON_ID = "sateer-global-logout-button";
    const STYLE_ID = "sateer-global-logout-style";
    const LOGIN_PATH = "/login.html";

    function installerStyle() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            #${BUTTON_ID} {
                position: fixed;
                top: 14px;
                right: 16px;
                z-index: 2147483000;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-height: 42px;
                padding: 10px 15px;
                border: 1px solid rgba(255,255,255,.22);
                border-radius: 999px;
                background: #17324d;
                color: #fff;
                box-shadow: 0 5px 18px rgba(15,35,55,.22);
                font: 600 13px/1.2 -apple-system, BlinkMacSystemFont,
                    "Segoe UI", sans-serif;
                cursor: pointer;
            }
            #${BUTTON_ID}:hover {
                background: #244b6d;
            }
            #${BUTTON_ID}:focus-visible {
                outline: 3px solid #8ec5ff;
                outline-offset: 3px;
            }
            #${BUTTON_ID}:disabled {
                opacity: .7;
                cursor: wait;
            }
            @media (max-width: 600px) {
                #${BUTTON_ID} {
                    top: auto;
                    right: 12px;
                    bottom: 14px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function installerBouton() {
        if (!document.body || document.getElementById(BUTTON_ID)) return;

        installerStyle();

        const bouton = document.createElement("button");
        bouton.type = "button";
        bouton.id = BUTTON_ID;
        bouton.textContent = "↪ Déconnexion";
        bouton.setAttribute("aria-label", "Se déconnecter de SATEER");
        bouton.title = "Fermer cette session SATEER";

        bouton.addEventListener("click", async function () {
            if (!window.confirm("Voulez-vous vraiment vous déconnecter de SATEER ?")) {
                return;
            }

            bouton.disabled = true;
            bouton.textContent = "Déconnexion…";

            try {
                const response = await fetch("/api/auth/logout", {
                    method: "POST",
                    credentials: "same-origin",
                    headers: { "Accept": "application/json" },
                    cache: "no-store"
                });

                const data = await response.json().catch(() => ({}));

                if (!response.ok || data.statut !== "DECONNECTE") {
                    throw new Error(data.statut || ("HTTP " + response.status));
                }

                window.SATEER_USER = null;
                window.location.replace(LOGIN_PATH);
            } catch (erreur) {
                bouton.disabled = false;
                bouton.textContent = "↪ Déconnexion";
                window.alert(
                    "La déconnexion n'a pas pu être confirmée. " +
                    "Vérifie ta connexion puis réessaie. (" +
                    (erreur.message || "Erreur réseau") + ")"
                );
            }
        });

        document.body.appendChild(bouton);
    }

    // Le client de session existant émet cet événement uniquement
    // après une réponse positive de /api/auth/me.
    window.addEventListener("sateer:session-ready", function (event) {
        if (event && event.detail) {
            window.SATEER_CONTEXT = event.detail;
            window.SATEER_USER = event.detail.personne || null;
            installerBouton();
        }
    });

    // Cas où l'identité a déjà été chargée avant l'installation du listener.
    if (window.SATEER_CONTEXT) {
        installerBouton();
    }
})();
