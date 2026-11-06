'use strict';
// Test de navigation purement local, sans API distante ni connexion PostgreSQL.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
function contents(name) { return fs.readFileSync(path.join(ROOT, name), 'utf8'); }

function testRetour(search, contextTenant, expected) {
  const nodes = new Map();
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, { textContent: '', listeners: {}, addEventListener(name, listener) { this.listeners[name] = listener; } });
    return nodes.get(id);
  }
  const window = {
    location: { search, origin: 'http://127.0.0.1:3200', href: '' },
    SATEER_CONTEXT: contextTenant ? { tenantCode: contextTenant } : null,
  };
  const ctx = { window, document: { getElementById: node }, URL, URLSearchParams, console };
  vm.runInNewContext(contents('public/demande.js'), ctx, { filename: 'demande.js' });
  node('backButton').listeners.click();
  assert.equal(window.location.href, expected);
}

class FakeNode {
  constructor(tag, doc) {
    this.tag = tag; this.doc = doc; this.children = []; this.listeners = {};
    this.style = {}; this.dataset = {}; this.value = ''; this.disabled = false;
  }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.append(child); return child; }
  prepend(child) { this.children.unshift(child); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(type, cb) { this.listeners[type] = cb; }
  setAttribute(k, v) { this[k] = v; }
  closest() { return this.doc.section; }
  querySelectorAll() { return []; }
}
async function flush() { await new Promise(resolve => setImmediate(resolve)); }
function findById(node, id) {
  if (!node || typeof node !== 'object') return null;
  if (node.id === id) return node;
  for (const child of node.children || []) {
    const found = findById(child, id);
    if (found) return found;
  }
  return null;
}
function getLinks(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (node.tag === 'a') out.push({ text: node.textContent, href: node.href });
  for (const child of node.children || []) getLinks(child, out);
  return out;
}
async function testSuccessFlow() {
  const org = 70, tenant = 'P6V_3B5AC5AB9DB04657';
  const fixed = {};
  const document = {
    createElement: tag => new FakeNode(tag, document),
    createTextNode: text => ({ textContent: text }),
    querySelector: s => s === 'main' ? document.main : null,
    querySelectorAll: () => [],
    getElementById(id) { return fixed[id] || findById(document.main, id); },
  };
  document.main = new FakeNode('main', document);
  document.section = new FakeNode('section', document);
  document.main.append(document.section);
  fixed.demandeForm = new FakeNode('form', document);
  document.section.append(fixed.demandeForm);
  let sends = 0;
  const fetch = async (url, opt = {}) => {
    let body;
    if (url.includes('/catalogue')) body = { procedures: [{ code: 'CARTE_CONSULAIRE', titre: 'Simulation Bordeaux' }] };
    else if (url.includes('/preparer')) body = { procedure: { code: 'CARTE_CONSULAIRE', titre: 'Simulation Bordeaux' }, pieces: [] };
    else if (url.includes('/envoyer')) { sends++; body = { demande: { id: 136 }, piecesJointes: 0, orientationAutomatique: { statut: 'ORIENTEE' } }; }
    else throw Error('Unexpected fetch: ' + url);
    return { ok: true, json: async () => body };
  };
  const window = {
    SATEER_CONTEXT_READY: Promise.resolve({ tenantCode: tenant }),
    SATEER_choisirOrganisation: async () => ({ id: org }),
  };
  const location = { search: `?organisation=${org}&tenant=${tenant}&source=MON_CONSULAT` };
  vm.runInNewContext(contents('public/p7-citizen-ui.js'), {
    window, document, location, URLSearchParams, URL, fetch, confirm: () => true,
    console, Date, Error, String, Number, Array,
  }, { filename: 'p7-citizen-ui.js' });
  await flush();
  const select = document.getElementById('p7-procedure');
  assert.ok(select, 'sélecteur des démarches absent');
  select.value = 'CARTE_CONSULAIRE';
  await select.listeners.change();
  await flush();
  const consent = document.getElementById('p7-consent');
  assert.ok(consent, 'consentement absent');
  consent.checked = true;
  const send = document.getElementById('p7-send');
  assert.ok(send, 'bouton envoyer absent');
  await send.listeners.click();
  await flush();
  assert.equal(sends, 1, 'une seule requête de soumission');
  assert.equal(select.disabled, true, 'sélecteur désactivé après envoi');
  const links = getLinks(document.getElementById('p7-preview'));
  const byTitle = new Map(links.map(item => [item.text, item.href]));
  assert.equal(byTitle.get('Suivre ce dossier'), `/demande-detail.html?organisation=70&tenant=${tenant}&demande=136&source=MON_CONSULAT`);
  assert.equal(byTitle.get('Créer une autre demande'), `/demande.html?organisation=70&tenant=${tenant}&source=MON_CONSULAT`);
  assert.equal(byTitle.get('Revenir à Mon Consulat'), `/consulat.html?organisation=70&tenant=${tenant}`);
}

(async function main() {
  const tenant = 'P6V_3B5AC5AB9DB04657';
  testRetour(`?organisation=70&tenant=${tenant}&source=MON_CONSULAT`, null, `/consulat.html?organisation=70&tenant=${tenant}`);
  console.log('PASS: retour contextuel après soumission');
  testRetour('?organisation=70&source=MON_CONSULAT', tenant, `/consulat.html?organisation=70&tenant=${tenant}`);
  console.log('PASS: repli tenant depuis le contexte authentifié');
  testRetour('?source=MON_CONSULAT', null, '/');
  console.log('PASS: aucun contexte inventé si organisation/tenant absents');
  testRetour('?source=MON_AMBASSADE', null, '/ambassade.html');
  console.log('PASS: navigation autre expérience inchangée');
  await testSuccessFlow();
  console.log('PASS: envoi simulé -> suivi #136, retour Consulat et nouvelle demande sans perte de tenant');
  console.log('BORDEAUX_NOUVELLE_DEMANDE_RETOUR_PASS : 5/5, aucune écriture DB');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
