"use strict";

// Small DOM/event harness for the P6 form. It exercises the shipped browser
// script without adding a browser or DOM dependency.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const labels = {
  PASSEPORT: "Passeport",
  CARTE_CONSULAIRE: "Carte consulaire",
  ETAT_CIVIL: "État civil"
};
const bureauNames = { "11": "Bureau Passeports", "12": "Bureau État civil" };
const elements = new Map();
class Element {
  constructor(id = "") {
    this.id = id; this.value = ""; this.textContent = ""; this.children = [];
    this.listeners = {}; this.disabled = false; this.className = "";
    this.classList = { toggle() {} };
  }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = [...children]; }
  setAttribute() {}
  get selectedOptions() { return [{ value: this.value, textContent: bureauNames[this.value] || labels[this.value] || this.value }]; }
}
for (const id of ["sx-p6-status", "sx-p6-rule-form", "sx-p6-save", "sx-p4-demo-type", "sx-p4-demo-unit", "sx-p6-rules", "sx-p6-refresh"]) {
  elements.set(id, new Element(id));
}
elements.get("sx-p4-demo-unit").value = "";
const rules = new Map();
const requests = [];
const confirmations = [];
const document = {
  getElementById(id) { return elements.get(id) || null; },
  createElement(tag) { const element = new Element(); element.tagName = tag; return element; }
};
const window = {
  SATEER_CONTEXT_READY: Promise.resolve({ tenantCode: "P6V_FRONTEND_TEST" }),
  SATEER_choisirOrganisation: async () => ({ id: 77 })
};
async function fetchMock(path, options = {}) {
  const method = options.method || "GET";
  if (method === "PUT") {
    const body = JSON.parse(options.body); requests.push(body);
    const rule = { categorie: body.categorie, destinationUnitId: body.destinationUnitId,
      bureau: bureauNames[String(body.destinationUnitId)], actif: true, destinationValide: true };
    rules.set(body.categorie, rule);
    return { ok: true, json: async () => ({ regle: rule }) };
  }
  return { ok: true, json: async () => ({ regles: [...rules.values()] }) };
}
function flatten(node) { return `${node.textContent || ""}${(node.children || []).map(flatten).join("")}`; }

(async () => {
  const source = fs.readFileSync(require.resolve("../public/p6-routing-ui.js"), "utf8");
  vm.runInNewContext(source, {
    document, window, location: { search: "?organisation=77", origin: "http://127.0.0.1:3200" },
    URLSearchParams, encodeURIComponent, fetch: fetchMock,
    confirm: message => { confirmations.push(message); return true; },
    console, Error, Number, String, Boolean, Array, Promise
  });
  const form = elements.get("sx-p6-rule-form");
  assert.equal(form.listeners.submit.length, 1, "un seul gestionnaire de sauvegarde est attaché au formulaire");
  await new Promise(resolve => setTimeout(resolve, 0));

  for (const [category, unit] of [["PASSEPORT", "11"], ["CARTE_CONSULAIRE", "11"], ["ETAT_CIVIL", "12"]]) {
    elements.get("sx-p4-demo-type").value = category;
    elements.get("sx-p4-demo-unit").value = unit;
    await form.listeners.submit[0]({ preventDefault() {} });
    assert.deepEqual(requests.at(-1), { tenantCode: "P6V_FRONTEND_TEST", categorie: category, destinationUnitId: Number(unit) });
    assert.match(confirmations.at(-1), new RegExp(`${category} → ${bureauNames[unit]}`));
    assert.match(elements.get("sx-p6-status").textContent, new RegExp(`${category} → ${bureauNames[unit]}`));
    assert.equal(elements.get("sx-p6-rules").children.length, requests.length, "la liste rend toutes les règles renvoyées après chaque sauvegarde");
  }
  assert.deepEqual([...rules.keys()], ["PASSEPORT", "CARTE_CONSULAIRE", "ETAT_CIVIL"]);
  process.stdout.write("PASS P6 frontend submit: 3 catégories exactes, payloads et confirmations concordants, 3 règles affichées\n");
})().catch(error => { process.stderr.write(`ÉCHEC P6 frontend: ${error.stack || error.message}\n`); process.exitCode = 1; });
