"use strict";

// Prevent accidental removal of the authenticated, tenant-scoped transaction gate
// from Bordeaux's institution-sensitive write routes.
const fs = require("node:fs");
const path = require("node:path");
const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const auth = fs.readFileSync(path.join(__dirname, "..", "auth-http.js"), "utf8");
const context = fs.readFileSync(path.join(__dirname, "..", "database-request-context.js"), "utf8");
const guardedRoutes = [
  "/api/demandes",
  "/api/organisations/:organisationId/units/:unitId/cases/:demandeId/route",
  "/api/organisations/:organisationId/units/:unitId/cases/:demandeId/take",
  "/api/organisations/:organisationId/units/:unitId/cases/:demandeId/respond",
  "/api/secretariat/demandes/:demandeId/orientation",
  "/api/agent/demandes/:demandeId/prise-en-charge",
  "/api/agent/demandes/:demandeId/reponse"
];
function assert(ok, message) {
 if (!ok) throw new Error("REGRESSION_CONTEXTE_TENANT: "+message);
 console.log("PASS "+message);
}
assert(auth.includes("await executerRequeteAuthentifieeDansTransaction("),
 "Les routes authentifiées entrent dans la transaction par exigerSession");
assert(context.includes("function exigerTenantTransactionVerifie("),
 "Le garde-fou de tenant validé est présent");
assert(context.includes("resoudreTenantIdPourContexteAuthentifie("),
 "Le tenant provient d'une résolution serveur");
assert(context.includes("obtenirContexteDatabaseCourant()"),
 "Le tenant est comparé au contexte transactionnel PostgreSQL");
for (const route of guardedRoutes) {
 const expected = '    "'+route+'",\n    exigerSession,\n    exigerTenantTransactionVerifie,';
 assert(server.includes(expected), "Route métier protégée : "+route);
}
console.log("SUCCES - garde transactionnelle des mutations institutionnelles vérifiée.");
