#!/usr/bin/env node
/* Test navigateur simulé : deux titres identiques doivent montrer des numéros distincts. */
'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('public/unit-workspace.js', 'utf8');
assert.equal((source.match(/\binitialiser\(\);/g) || []).length, 1, 'point entree inattendu');

class Node {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.textContent = '';
    this.className = '';
    this.hidden = false;
    this.classList = { toggle() {}, add() {}, remove() {} };
  }
  append(...items) { this.children.push(...items); }
  appendChild(item) { this.append(item); return item; }
  replaceChildren(...items) { this.children = [...items]; }
  addEventListener() {}
}
function flatten(node) {
  if (typeof node === 'string') return node;
  return [node.textContent, ...(node.children || []).map(flatten)].filter(Boolean).join(' | ');
}
const nodes = new Map();
const document = {
  createElement: tag => new Node(tag),
  getElementById: id => { if (!nodes.has(id)) nodes.set(id,new Node('div')); return nodes.get(id); },
  querySelectorAll: () => []
};
const context = {
  window: { location: { search: '?organisation=70&unit=116&tenant=P6V_3B5AC5AB9DB04657' } },
  document, URLSearchParams,
  console
};
const loaded = source.replace(/\binitialiser\(\);/,
  'globalThis.__test = { state, renderInbox, selectCase };');
vm.runInNewContext(loaded,context,{ filename: 'unit-workspace.js' });
const app = context.__test;
assert.ok(app,'API de test inaccessible');
app.state.workspace = { features: {} };
app.state.demandes = [
  { id:136, objet:'[DEMO BORDEAUX] Simulation carte consulaire', prenom:'Samba', nom:'CitoyenDemo', statut:'NOUVELLE', priorite:'NORMALE', categorie:'CARTE_CONSULAIRE' },
  { id:137, objet:'[DEMO BORDEAUX] Simulation carte consulaire', prenom:'Samba', nom:'CitoyenDemo', statut:'NOUVELLE', priorite:'NORMALE', categorie:'CARTE_CONSULAIRE' }
];
app.renderInbox();
const list = document.getElementById('workspaceInboxList');
assert.equal(list.children.length,2,'doit afficher exactement deux dossiers');
assert.match(flatten(list.children[0]),/Dossier n°136/,'n°136 non visible dans la ligne');
assert.match(flatten(list.children[1]),/Dossier n°137/,'n°137 non visible dans la ligne');
assert.match(flatten(list.children[0]),/Samba CitoyenDemo/,'nom du demandeur perdu');
assert.match(flatten(list.children[0]),/NOUVELLE/,'statut perdu');
console.log('PASS : demandes de meme titre distinguees par les numeros 136 et 137');
app.selectCase(136);
const detail=document.getElementById('workspaceCaseDetail');
assert.match(flatten(detail),/N° de dossier[\s\S]*n°136/,'n° absent du detail');
assert.match(flatten(detail),/Usager[\s\S]*Samba CitoyenDemo/,'usager du detail absent');
assert.equal(app.state.selectedCaseId,136);
console.log('PASS : numero du dossier 136 conserve dans le detail selectionne');
app.selectCase(137);
assert.match(flatten(document.getElementById('workspaceCaseDetail')),/N° de dossier[\s\S]*n°137/,'selection n°137 incorrecte');
console.log('PASS : dossier 137 se distingue du 136 sans confusion');
console.log('BORDEAUX_NUMEROS_DOSSIERS_PASS : 3/3, sans API ni ecriture PostgreSQL');
