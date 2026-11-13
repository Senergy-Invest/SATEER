"use strict";
/** Tests A1 sans DB, sans réseau et sans service démarré. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const P = path.join(__dirname, "..");
const entree = require(path.join(P, "public/institution-experience-entry.js"));
const ctx = { organisations: [
    { id: 11, nom: "Consulat fictif", type: "CONSULAT", tenant_code: "SN" },
    { id: 22, nom: "Ambassade fictive", type: "AMBASSADE", tenant_code: "SN" },
    { id: 23, nom: "Ambassade étrangère", type: "AMBASSADE", tenant_code: "EX" }
] };
assert.equal(entree.presentationPour("CONSULAT"), null, "Le pilote consulaire reste inchangé");
assert.equal(entree.presentationPour("AMBASSADE").code, "MON_AMBASSADE");
assert.equal(entree.selectionnerOrganisationAutorisee(ctx, "22", "SN", "AMBASSADE")?.id, 22);
for (const [id,tenant,type] of [[11,"SN","AMBASSADE"],[22,"EX","AMBASSADE"],[23,"SN","AMBASSADE"],[99,"SN","AMBASSADE"],[22,"SN","CONSULAT"],["22 OR 1=1","SN","AMBASSADE"],["0x16","SN","AMBASSADE"],[22,"bad","AMBASSADE"]]) {
    assert.equal(entree.selectionnerOrganisationAutorisee(ctx,id,tenant,type),null, "Aucun accès sans rattachement exact");
}
assert.equal(entree.lienExperience(entree.presentationPour("AMBASSADE"),22,"SN"), "/ambassade.html?organisation=22&tenant=SN");
assert.equal(entree.lienExperience(entree.presentationPour("AMBASSADE"),-1,"SN"),null);
// DOM minimal : s'assurer que l'institution ne traverse jamais innerHTML.
class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.textContent = ""; this.attributes = {}; }
    append(...nodes) { this.children.push(...nodes); }
    setAttribute(n,v) { this.attributes[n]=v; }
}
const carte = entree.creerCarte({ id:22,type:"AMBASSADE",nom:"<script>alert(1)</script>" },"SN",{ createElement:t=>new Element(t) });
assert.equal(carte?.children[0]?.children[1]?.children[2]?.textContent,"<script>alert(1)</script>");
assert.equal(carte?.children[2]?.href,"/ambassade.html?organisation=22&tenant=SN");
assert.equal(entree.creerCarte(ctx.organisations[0],"SN",{createElement:t=>new Element(t)}),null);
const app = fs.readFileSync(path.join(P,"public/app.js"),"utf8");
const index = fs.readFileSync(path.join(P,"public/index.html"),"utf8");
const page = fs.readFileSync(path.join(P,"public/ambassade.html"),"utf8");
const amb = fs.readFileSync(path.join(P,"public/ambassade.js"),"utf8");
assert.match(app,/org\.type === "AMBASSADE"/);
assert.match(app,/org\.type === "CONSULAT"/);
assert.match(index,/<script src="\/institution-experience-entry\.js"><\/script>/);
assert.match(page,/auth-client\.js/);
assert.match(page,/institution-experience-entry\.js/);
assert.match(page,/ambassade\.js/);
assert.match(amb,/method:\s*"GET"/, "A2 n’autorise que la lecture");
assert.doesNotMatch(amb,/method:\s*"(?:POST|PUT|PATCH|DELETE)"/, "Pas de mutation côté Ambassade");
assert.doesNotMatch(amb,/innerHTML/, "Aucune injection HTML des noms institutionnels");
console.log("AMBASSADE_A1_CONTRATS_PASS : rattachement tenant, type d'organisation, liens, XSS, absence de mutation, Consulat préservé");
