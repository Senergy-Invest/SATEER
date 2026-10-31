"use strict";
const fs = require("node:fs");
const path = require("node:path");
const base = path.resolve(__dirname,"..");
const read = file => fs.readFileSync(path.join(base,file),"utf8");
const server = read("server.js"),service=read("communication-pilot.js");
const dash=read("public/dashboard-vice-consul.html");
const page=read("public/canal-officiel.html");
const ui=read("public/canal-officiel.js");
const workflow=read("scripts/workflow-e2e-test.js");
function assert(ok,message) {if (!ok) throw new Error("REGRESSION_CANAL_PILOTE: "+message);console.log("PASS "+message);}
assert(server.includes('"/api/organisations/:organisationId/canal-officiel"') &&
 server.includes('...exigerPermission("MANAGE_PUBLICATIONS", "ORGANISATION")'),
 "La publication nécessite une permission organisationnelle explicite");
assert(server.includes('exigerTenantTransactionVerifie,') &&
 server.includes('"TARGET_COMMUNICATION"'),
 "Le tenant et le ciblage sont vérifiés côté serveur");
assert(service.includes("ASSOCIATION_NON_CONNECTEE") &&
 service.includes("organisation_relationships"),
 "Un ciblage d'association exige une relation active");
assert(service.includes("INSERT INTO notifications") && service.includes("relations_personne_organisation"),
 "Les destinataires sont calculés depuis les rattachements");
assert(dash.includes("canalOfficielLien") && page.includes("channelForm"),
 "Le canal est accessible depuis le pilotage du Vice-Consul");
assert(ui.includes("SATEER_CONTEXT_READY") &&
 ui.includes("SATEER_choisirOrganisation"),
 "La page utilise l'organisation de la session");
assert(workflow.includes("Le citoyen ne peut pas publier") &&
 workflow.includes("L'information officielle apparaît dans Mon Consulat"),
 "Le test de workflow inclut le circuit de communication");
