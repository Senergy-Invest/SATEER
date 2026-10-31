"use strict";
// Pilot administration surface: basic CI regression checks.
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const read = p => fs.readFileSync(path.join(root, p), "utf8");
const html = read("public/administration-organisation.html");
const js = read("public/administration-organisation.js");
const organisationHtml = read("public/organisation-consulat.html");
const organisationJs = read("public/organisation-consulat.js");
const server = read("server.js");
function check(ok, text) {
 if (!ok) { console.error("FAIL "+text); process.exitCode = 1; }
 else console.log("PASS "+text);
}
check(/auth-client\.js[\s\S]*administration-organisation\.js/.test(html),
 "La page d'administration charge l'authentification avant le code métier");
check(html.includes('id="pilotCreerUnite"') && html.includes('id="pilotCreerRole"'),
 "Les formulaires de création d'unités et de rôles sont présents");
check(html.includes('id="pilotPermissions"') && html.includes('id="pilotCapacites"'),
 "Les interfaces de droits et capacités sont présentes");
check(organisationHtml.includes('id="administrationOrganisationLink"')
 && organisationJs.includes('administrationOrganisationLink'),
 "Un lien permet d'ouvrir l'administration depuis l'organigramme");
check(js.includes("SATEER_CONTEXT_READY") && js.includes("SATEER_choisirOrganisation"),
 "L'administration utilise le contexte authentifié et le choix d'organisation");
check(!/organisationId\s*=\s*1\b|organisation=1\b/.test(js),
 "L'administration ne fixe aucun identifiant d'organisation");
check(js.includes('uri("/unit-capabilities")') && js.includes('uri("/roles")'),
 "La page récupère les catalogues génériques sans liste codée en dur");
check(js.includes('uri("/units")') && js.includes('uri("/roles/" + roleId + "/permissions")'),
 "La page utilise les API métier existantes");
check(js.includes('roleProtege(role)') && js.includes("textContent"),
 "Les rôles protégés sont présentés sans actions et les textes sont échappés");
check(server.includes('exigerPermission("CONFIGURE_UNIT_CAPABILITIES", "UNIT")')
 && server.includes('exigerPermission("MANAGE_ROLE_PERMISSIONS", "ORGANISATION")')
 && server.includes('exigerPermission("CREATE_UNIT", "ORGANISATION")'),
 "Les mutations exigent les permissions dans le backend");
