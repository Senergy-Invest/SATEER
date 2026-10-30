(() => {
    const form = document.getElementById("loginForm");
    const error = document.getElementById("loginError");
    const submit = document.getElementById("loginSubmit");
    const params = new URLSearchParams(window.location.search);
    const rawReturnTo = params.get("returnTo") || "/index.html";

    // Résoudre la destination avec le parseur URL du navigateur.
    // Cela rejette aussi les variantes ambiguës utilisant des antislashs
    // ou des URL externes, pas seulement les chaînes commençant par //.
    let returnTo = "/index.html";
    try {
        const destination = new URL(rawReturnTo, window.location.origin);
        if (destination.origin === window.location.origin) {
            returnTo = destination.pathname + destination.search + destination.hash;
        }
    } catch (_) {
        // Garder la destination locale par défaut.
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        error.hidden = true;
        submit.disabled = true;
        submit.textContent = "Connexion…";
        try {
            const response = await fetch("/api/auth/login", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify({
                    identifiant: document.getElementById("identifiant").value.trim(),
                    motDePasse: document.getElementById("motDePasse").value
                })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error("Identifiant ou mot de passe incorrect.");
            window.location.replace(returnTo);
        } catch (e) {
            error.textContent = e.message || "Connexion impossible. Réessaie.";
            error.hidden = false;
        } finally {
            submit.disabled = false;
            submit.textContent = "Se connecter";
        }
    });
})();
