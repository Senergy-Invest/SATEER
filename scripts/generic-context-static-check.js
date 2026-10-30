const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const checks = [];

function check(label, ok) {
    checks.push({ label, ok: Boolean(ok) });
}

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const server = read("server.js");
const services = read("services-database.js");
const authClient = read("public/auth-client.js");
const migration026 = read("database/026_pilot_unit_routing_allowlists.sql");

check("Le contexte authentifié est exposé", /app\.get\(["']\/api\/context["'],\s*exigerSession/.test(server));
check("L'identité du contexte vient de la session", /Number\(req\.auth\.personneId\)/.test(server));
check("Les organisations viennent des rattachements personne-organisation", /listerOrganisationsPersonneDatabase/.test(server) && /FROM relations_personne_organisation rel/.test(services));
check("Le client attend le chargement du contexte", /window\.SATEER_CONTEXT_READY/.test(authClient));
check("Mon Consulat n'utilise plus d'organisation par défaut", !/req\.query\.organisation\s*\|\|\s*1/.test(server));
check("La création de demandes vérifie le rattachement", /PERSONNE_HORS_ORGANISATION/.test(server.slice(server.indexOf('"/api/demandes"'), server.indexOf('"/api/demandes"') + 6000)));
check("L'assistant vérifie le rattachement", /PERSONNE_HORS_ORGANISATION/.test(server.slice(server.indexOf('"/api/assistant/message"'), server.indexOf('"/api/assistant/message"') + 6000)));

const runtimeFiles = [
    "public/app.js",
    "public/consulat.js",
    "public/demande.js",
    "public/demande-detail.js",
    "public/assistant.js",
    "public/dashboard-consul.js",
    "public/dashboard-vice-consul.js",
    "public/organisation-consulat.js",
    "public/secretariat.js"
];

for (const file of runtimeFiles) {
    const source = read(file);
    check(file + " : aucun identifiant personne codé en dur", !/PERSONNE_ID\s*=\s*1/.test(source));
    check(file + " : aucun fallback organisation 1", !/organisation\s*\|\|\s*1|organisation=1|organisationId\s*=\s*1/.test(source));
}

const htmlFiles = [
    ["public/index.html", "app.js"],
    ["public/consulat.html", "consulat.js"],
    ["public/demande.html", "demande.js"],
    ["public/demande-detail.html", "demande-detail.js"],
    ["public/assistant.html", "assistant.js"],
    ["public/dashboard-consul.html", "dashboard-consul.js"],
    ["public/dashboard-vice-consul.html", "dashboard-vice-consul.js"],
    ["public/organisation-consulat.html", "organisation-consulat.js"],
    ["public/secretariat.html", "secretariat.js"]
];

for (const [file, pageScript] of htmlFiles) {
    const source = read(file);
    check(file + " : auth-client chargé avant le script métier",
        source.indexOf('/auth-client.js') >= 0
        && source.indexOf('/auth-client.js') < source.indexOf(pageScript));
}

const migration024 = read("database/024_dashboards_consul_viceconsul.sql");
const migration025 = read("database/025_pilot_dashboard_role_configuration.sql");
check("Migration 024 indépendante de l'identifiant organisation 1", !/organisation_id\s*=\s*1/.test(migration024));
check("Migration 025 explicitement limitée au pilote", /PILOTE BORDEAUX/.test(migration025) && /organisation_id\s*=\s*1/.test(migration025));

check("Le routage refuse une allowlist absente", /!Array\.isArray\(allowedDestinationUnitIds\)/.test(services));
check("La configuration pilote définit les destinations autorisées", /PILOTE BORDEAUX/.test(migration026) && /allowedDestinationUnitIds/.test(migration026));
const failures = checks.filter(item => !item.ok);
for (const item of checks) {
    process.stdout.write((item.ok ? "PASS " : "FAIL ") + item.label + "\n");
}
process.stdout.write("\n" + (checks.length - failures.length) + "/" + checks.length + " contrôles réussis.\n");
if (failures.length) process.exit(1);
