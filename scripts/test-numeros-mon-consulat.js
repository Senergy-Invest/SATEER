'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');

const source = fs.readFileSync(path.join(process.cwd(), 'public/consulat.js'), 'utf8');
const start = source.indexOf('function afficherDemandes(');
const end = source.indexOf('// =========================================================', start + 100);
assert(start >= 0 && end > start, 'fonction liste des demandes présente');
const fnSource = source.slice(start, end);
assert.match(fnSource, /Dossier n°\$\{demande\.id\}/, 'référence construite depuis id API');
assert.match(fnSource, /sousTitre\.textContent\s*=/, 'identifiant écrit avec textContent');

class MockElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.listeners = {};
    this.textContent = '';
    this._innerHTML = '';
    this.type = '';
    this.className = '';
  }
  set innerHTML(value) { this._innerHTML = value; this.children = []; }
  get innerHTML() { return this._innerHTML; }
  appendChild(child) { this.children.push(child); }
  addEventListener(event, callback) { this.listeners[event] = callback; }
}
const list = new MockElement('div');
const env = {
  document: {
    getElementById(id) {
      assert.equal(id, 'demandesConsulatContainer');
      return list;
    },
    createElement(name) { return new MockElement(name); }
  },
  classeStatut(status) { return `statut-${status}`; },
  CONSULAT_ID: 70,
  URL,
  URLSearchParams,
  console,
  window: {
    SATEER_CONTEXT: { tenantCode: 'P6V_3B5AC5AB9DB04657' },
    location: {
      search: '?organisation=70&tenant=P6V_3B5AC5AB9DB04657',
      origin: 'http://127.0.0.1:3200',
      href: 'http://127.0.0.1:3200/consulat.html?organisation=70&tenant=P6V_3B5AC5AB9DB04657'
    }
  }
};
vm.createContext(env);
vm.runInContext(`${fnSource}\nthis.render = afficherDemandes;`, env);
const rows = [
  {id:132, objet:'Première demande de passeport', categorie:'PASSEPORT', statut:'EN_COURS'},
  {id:134, objet:"Demande de copie d'acte de naissance", categorie:'ETAT_CIVIL', statut:'EN_COURS'},
  {id:136, objet:'Simulation carte consulaire', categorie:'CARTE_CONSULAIRE', statut:'TRAITEE'},
  {id:137, objet:'Simulation carte consulaire', categorie:'CARTE_CONSULAIRE', statut:'NOUVELLE'}
];
env.render(rows);
assert.equal(list.children.length, 4);
for (let i = 0; i < rows.length; i++) {
  const item = list.children[i];
  const [content, status] = item.children;
  assert.equal(content.children[0].textContent, rows[i].objet);
  assert.equal(content.children[1].textContent, `Dossier n°${rows[i].id} · ${rows[i].categorie}`);
  assert.equal(status.textContent, rows[i].statut);
  assert.equal(typeof item.listeners.click, 'function');
}
console.log('PASS : les quatre demandes de Samba affichent leur numéro réel');
const ref136 = list.children[2].children[0].children[1].textContent;
const ref137 = list.children[3].children[0].children[1].textContent;
assert.notEqual(ref136, ref137);
console.log('PASS : deux demandes de même titre distinguées (136 et 137)');
list.children[2].listeners.click();
assert.match(env.window.location.href, /demande=136/);
assert.match(env.window.location.href, /organisation=70/);
assert.match(env.window.location.href, /tenant=P6V_3B5AC5AB9DB04657/);
console.log('PASS : clic vers dossier 136 conserve organisation et tenant');
// L'API renvoie des chaînes non fiables: garder textContent, jamais innerHTML.
const dangerous = '<img src=x onerror=alert(1)>';
env.render([{id:152, objet:dangerous, categorie:dangerous, statut:'NOUVELLE'}]);
// Un nouveau rendu remplace correctement les anciennes lignes.
assert.equal(list.children.length, 1);
const last = list.children[0];
assert.equal(last.children[0].children[1].textContent, `Dossier n°152 · ${dangerous}`);
assert.equal(last.children[0].children[0].textContent, dangerous);
console.log('PASS : le contenu externe reste du texte et non du HTML exécuté');
console.log('BORDEAUX_NUMEROS_MON_CONSULAT_PASS : 4/4');
