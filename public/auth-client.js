/* SATEER — contrôle de session côté interface.
 * La sécurité réelle reste assurée par les routes backend.
 */
(async function verifierSessionInterface() {
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
            return;
        }
        const data = await response.json();
        window.SATEER_USER = data.personne;
        window.dispatchEvent(new CustomEvent("sateer:session-ready", { detail: data.personne }));
    } catch (_) {
        const retour = window.location.pathname + window.location.search;
        window.location.replace("/login.html?returnTo=" + encodeURIComponent(retour));
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
            window.SATEER_USER = event.detail;
            installerBouton();
        }
    });

    // Cas où l'identité a déjà été chargée avant l'installation du listener.
    if (window.SATEER_USER) {
        installerBouton();
    }
})();
