'use strict';
/**
 * P335BQ - Aucun réseau / aucune base / aucun navigateur réel.
 * Valide la construction du lien vers l'unique page courriers de Bordeaux.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const {installerLien} = require(path.join(ROOT, 'public/sateer-vice-email-entry.js'));
const TENANT = 'P6V_3B5AC5AB9DB04657';
function mock() {
  let action = null;
  const refresh = {id:'sx-p2-refresh'};
  const actions = {
    querySelector(selector) { return selector === '#sx-p2-refresh' ? refresh : null; },
    insertBefore(node) { node.parentNode = this; },
  };
  const compact = {querySelector(selector) { return selector === '.sx-p2-actions' ? actions : null; }};
  const doc = {
    getElementById(id) { return id==='sx-p2-root' ? compact : id==='sateer-vice-email-entry' ? action : null; },
    createElement(tag) {
      const attributes = new Map();
      const el = {tag, parentNode:null,children:[],className:'',href:'',
        setAttribute(key,val) { attributes.set(key,String(val)); },
        getAttribute(key) { return attributes.get(key) ?? null; },
        removeAttribute(key) { attributes.delete(key); if(key==='href') delete this.href; },
        append(...nodes) { this.children.push(...nodes); },
      };
      if(tag==='a') action=el;
      return el;
    },
    querySelectorAll() { return []; },
  };
  return {doc,get action(){return action;}};
}
test('sans contexte, ne pas fabriquer de lien sensible', () => {
  const m=mock();
  assert.equal(installerLien(m.doc,{search:''}), 'CONTEXTE_MANQUANT');
  assert.equal(m.action.getAttribute('aria-disabled'),'true');
  assert.equal(m.action.href,undefined);
});
test('depuis Mon SATEER sans paramètres URL, contexte du dashboard autorisé active le lien', () => {
  const m=mock();
  assert.equal(installerLien(m.doc,{search:''},{organisationId:70,tenant:TENANT}),'INSTALLE_DANS_P2_VISIBLE');
  const url=new URL(m.action.href,'http://127.0.0.1:3200');
  assert.equal(url.pathname,'/email-secretariat-demo.html');
  assert.equal(url.searchParams.get('organisation'),'70');
  assert.equal(url.searchParams.get('tenant'),TENANT);
  assert.equal(m.action.getAttribute('aria-disabled'),null);
});
test('URL avec organisation et tenant : conserve la navigation existante', () => {
  const m=mock();
  assert.equal(installerLien(m.doc,{search:'?organisation=70&tenant='+TENANT}),'INSTALLE_DANS_P2_VISIBLE');
});
test('URL contradictoire avec le dashboard : désactiver le lien', () => {
  const m=mock();
  assert.equal(installerLien(m.doc,{search:'?organisation=71&tenant='+TENANT},{organisationId:70,tenant:TENANT}),'CONTEXTE_MANQUANT');
  assert.equal(m.action.getAttribute('aria-disabled'),'true');
});
test('tenant malformé : lien interdit', () => {
  const m=mock();
  assert.equal(installerLien(m.doc,{search:''},{organisationId:70,tenant:'tenant/erreur'}),'CONTEXTE_MANQUANT');
});
test('le refresh P2 fournit contexte organisation et tenant après dashboard autorisé', () => {
  const p2=fs.readFileSync(path.join(ROOT,'public/sateer-p2.js'),'utf8');
  const link=fs.readFileSync(path.join(ROOT,'public/sateer-vice-email-entry.js'),'utf8');
  assert.match(p2, /sateer:vice-dashboard-refreshed', \{ detail: \{ organisationId: orgId, tenant \} \}/);
  assert.match(link, /addEventListener\('sateer:vice-dashboard-refreshed'/);
  assert.match(link, /dashboardContext = event\.detail \|\| null/);
});
test('la page du secrétariat accepte les deux noms du paramètre sans contourner les permissions HTTP', () => {
  const page=fs.readFileSync(path.join(ROOT,'public/email-secretariat-demo.js'),'utf8');
  assert.match(page, /params\.get\('organisation'\) \|\| params\.get\('organisationId'\)/);
  assert.match(page, /credentials:'same-origin'/);
  const entry=fs.readFileSync(path.join(ROOT,'public/dashboard-vice-consul.html'),'utf8');
  assert.match(entry,/sateer-vice-email-entry\.js\?v=p335bq/);
  assert.match(entry,/sateer-p2\.js\?v=p335bq/);
});
