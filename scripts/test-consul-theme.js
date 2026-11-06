'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = process.cwd();
const js = fs.readFileSync(path.join(root, 'public/sateer-consul-theme.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/sateer-consul-theme.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/dashboard-consul.html'), 'utf8');
assert.match(html, /sateer-consul-theme\.css/);
assert.match(html, /sateer-consul-theme\.js/);
assert.match(css, /#fff9f3/);
assert.match(css, /@media \(max-width: 600px\)/);
assert.match(css, /\.strategic-bar-row/);
console.log('PASS theme consulaire charge et styles responsives definis');

function execute(query, context = true) {
  const makeClassList = () => {
    const items = new Set();
    return {add: name => items.add(name), contains: name => items.has(name)};
  };
  const card = () => ({classList:makeClassList()});
  const a = card(), b = card();
  const kpis = {
    kpiDemandesTotal: {closest: () => a},
    kpiUrgentes: {closest: () => b}
  };
  const links = [{
    attr: '/consulat.html',
    classList: makeClassList(),
    getAttribute(key) {assert.equal(key,'href'); return this.attr;},
    setAttribute(key, val) {assert.equal(key,'href'); this.attr=val;}
  }];
  const body = {classList:makeClassList()};
  const doc = {
    body, readyState:'complete',
    getElementById(id) {if(id==='dashboardContenu') return context ? {} : null;return kpis[id] || null;},
    querySelectorAll(sel) {assert.equal(sel,'a[href]');return links;}
  };
  vm.runInNewContext(js, {document:doc, window:{location:{search:query}},URLSearchParams});
  return {a,b,body,links};
}
const valid=execute('?organisation=70&tenant=P6V_3B5AC5AB9DB04657');
assert(valid.body.classList.contains('sateer-consul-refonte'));
assert(valid.a.classList.contains('sateer-strat-kpi--accent'));
assert(valid.b.classList.contains('sateer-strat-kpi--urgent'));
assert.equal(valid.links[0].attr, '/consulat.html?organisation=70&tenant=P6V_3B5AC5AB9DB04657');
console.log('PASS indices de la page, cartes et retour avec tenant preservés');
const invalid=execute('?organisation=70&tenant=../../etc');
assert.equal(invalid.links[0].attr, '/consulat.html');
const absent=execute('?organisation=70&tenant=P6V_3B5AC5AB9DB04657', false);
assert.equal(absent.links[0].attr, '/consulat.html');
assert(!absent.body.classList.contains('sateer-consul-refonte'));
console.log('PASS pas de contexte invente ni de theme sur une autre page');
// Couleurs texte essentielles : verifier le contraste WCAG AA.
function luminance(hex) {
  const vals=hex.replace('#','').match(/.{2}/g).map(v=>parseInt(v,16)/255);
  const [r,g,b]=vals.map(v=> v<=.04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
  return .2126*r+.7152*g+.0722*b;
}
function contrast(a,b) {
  const x=luminance(a), y=luminance(b);
  return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
for(const pair of [['#12243b','#f1f5f9'],['#40536b','#ffffff'],['#ffffff','#102d49'],['#ffffff','#13455a'],['#953d17','#fff9f3']]) {
  assert(contrast(...pair) >= 4.5,`Contraste insuffisant ${pair}`);
}
console.log('PASS contraste AA pour les principaux couples texte/fond');
console.log('BORDEAUX_CONSUL_VISUEL_PASS : 4/4 tests, aucune ecriture metier');
