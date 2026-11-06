"use strict";
// Recette UI hors réseau et sans PostgreSQL : droits simulés, code UI réel.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sourcePath = path.join(__dirname, "..", "public", "app.js");
const source = fs.readFileSync(sourcePath, "utf8");
const bootMarker = 'document.getElementById("notificationButton")?.addEventListener';
assert.equal(source.split(bootMarker).length, 2, "Marqueur d'initialisation de l'accueil modifié");
assert.ok(source.indexOf('await afficherRelaisAssociatifs(organisations, contexte.tenantCode, directLists.flat());') > 0,
  "Chargement des relais institutionnels absent");
assert.ok(source.indexOf('await afficherAccesProfessionnels(contexte);') > source.indexOf('await afficherRelaisAssociatifs(organisations, contexte.tenantCode, directLists.flat());'),
  "Régression : les espaces professionnels doivent rester après la phase institutionnelle");

class NodeMock {
  constructor(tag = "div") {
    this.tagName = tag;
    this.children = [];
    this.hidden = false;
    this.textContent = "";
    this.className = "";
    this.classList = { toggle() {} };
  }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.children.push(node); return node; }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  setAttribute(name, value) { this[name] = value; }
}

function session(api) {
  const elements = new Map();
  const document = {
    createElement: tag => new NodeMock(tag),
    getElementById: id => {
      if (!elements.has(id)) elements.set(id, new NodeMock());
      return elements.get(id);
    }
  };
  document.getElementById("professionnelsSection").hidden = true;
  const fetchLog = [];
  const fetch = async url => {
    fetchLog.push(url);
    const answer = await api(url);
    return {
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      json: async () => answer.body || {}
    };
  };
  const contexte = vm.createContext({
    document, fetch, URLSearchParams,
    console: { warn() {}, error() {} },
    window: {}
  });
  vm.runInContext(source.split(bootMarker)[0], contexte, { filename: "app.js" });
  return { contexte, elements, fetchLog, section: document.getElementById("professionnelsSection"), container: document.getElementById("professionnelsContainer") };
}

const consulat = { id: 70, nom: "Consulat de recette", type: "CONSULAT", tenant_code: "P6V_DEMO" };
const association = { id: 132, nom: "Association de recette", type: "ASSOCIATION", tenant_code: "P6V_DEMO" };
const donnees = orgs => ({ organisations: orgs, tenantCode: "P6V_DEMO", personne: { id: 322, prenom: "Vice-Consul" } });
const response = (dashboards, associationStatus = 403, summaryStatus = 200) => url => {
  if (url.includes("/dashboards/acces")) return { status: 200, body: { dashboards } };
  if (url.includes("/association-partners")) return { status: associationStatus };
  if (url.includes("/api/mon-sateer/")) return { status: summaryStatus, body: { notifications: [] } };
  if (url.includes("/api/mon-consulat/")) return { status: 200, body: { publications: [], demandes: [] } };
  return { status: 404 };
};
const hrefs = container => container.children.map(el => el.href);
const text = element => element.children.flatMap(el => [el.textContent, ...el.children.map(x => x.textContent)]).join(" ");

async function test(label, callback) { await callback(); console.log("PASS", label); }
(async () => {
  await test("Vice-Consul associatif : accès professionnel visible sans permission dashboard", async () => {
    const s = session(response({ operationnel: false, strategique: false }, 200));
    await s.contexte.afficherAccesProfessionnels(donnees([consulat]));
    assert.equal(s.section.hidden, false);
    assert.equal(s.container.children.length, 1);
    assert.match(text(s.container.children[0]), /Mon espace professionnel/);
    assert.deepEqual(hrefs(s.container), ["/dashboard-vice-consul.html?organisation=70&tenant=P6V_DEMO"]);
    assert.ok(s.fetchLog.some(u => u.includes("association-partners?tenant=P6V_DEMO")));
  });
  await test("Gestion associative interdite : aucun accès ajouté", async () => {
    const s = session(response({ operationnel: false, strategique: false }, 403));
    await s.contexte.afficherAccesProfessionnels(donnees([consulat]));
    assert.equal(s.section.hidden, true);
    assert.equal(s.container.children.length, 0);
  });
  await test("Accès opérationnel existant conservé sans doublon", async () => {
    const s = session(response({ operationnel: true, strategique: false }, 200));
    await s.contexte.afficherAccesProfessionnels(donnees([consulat]));
    assert.deepEqual(hrefs(s.container), ["/dashboard-vice-consul.html?organisation=70&tenant=P6V_DEMO"]);
    assert.equal(s.fetchLog.filter(u => u.includes("association-partners")).length, 0);
  });
  await test("Accès stratégique existant conservé", async () => {
    const s = session(response({ operationnel: false, strategique: true }));
    await s.contexte.afficherAccesProfessionnels(donnees([consulat]));
    assert.deepEqual(hrefs(s.container), ["/dashboard-consul.html?organisation=70&tenant=P6V_DEMO"]);
  });
  await test("Gestion associative autorisée même si endpoint dashboards refusé", async () => {
    const s = session(url => url.includes("/dashboards/acces") ? { status: 403 } : { status: 200 });
    await s.contexte.afficherAccesProfessionnels(donnees([consulat]));
    assert.equal(s.section.hidden, false);
    assert.equal(s.container.children.length, 1);
  });
  await test("Association : lien professionnel préexistant conservé", async () => {
    const s = session(response({ operationnel: false, strategique: false }));
    await s.contexte.afficherAccesProfessionnels(donnees([association]));
    assert.deepEqual(hrefs(s.container), ["/association-communications.html?organisation=132&tenant=P6V_DEMO"]);
  });
  await test("Pas de rattachement : aucun accès professionnel", async () => {
    const s = session(response({ operationnel: true }));
    await s.contexte.afficherAccesProfessionnels(donnees([]));
    assert.equal(s.section.hidden, true);
    assert.equal(s.fetchLog.length, 0);
  });
  await test("Résumé personnel indisponible : accès professionnel encore visible", async () => {
    const s = session(response({ operationnel: false, strategique: false }, 200, 503));
    s.contexte.window.SATEER_CONTEXT_READY = Promise.resolve(donnees([consulat]));
    await s.contexte.chargerMonSateer();
    assert.equal(s.section.hidden, false);
    assert.equal(s.container.children.length, 1);
    assert.equal(s.elements.get("notificationsContainer").children.length, 1);
  });
  console.log("PROFESSIONAL_HOME_ACCESS_PASS : 8/8 scénarios UI hors ligne");
})().catch(error => { console.error(error); process.exitCode = 1; });
