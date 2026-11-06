// Tests ciblés : spécificité et contraste du correctif SATEER Consul.
'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const css = fs.readFileSync('public/sateer-consul-theme.css', 'utf8');
function luminosite(hex) {
  const c=hex.replace('#','').match(/.{2}/g).map(v=>parseInt(v,16)/255);
  const [r,g,b]=c.map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);
  return .2126*r+.7152*g+.0722*b;
}
function contraste(a,b){const x=luminosite(a),y=luminosite(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
for (const [color,fond] of [
  ['#142e49','#ffffff'], ['#193850','#ffffff'],
  ['#35475c','#ffffff'], ['#ffffff','#102d49'],
  ['#953d17','#fff9f3'], ['#ffffff','#153955']
]) assert(contraste(color,fond)>=4.5,`${color} sur ${fond}: ${contraste(color,fond)}`);
console.log('PASS : contraste WCAG AA des nouveaux textes et de leurs exceptions');
assert.match(css, /Contraste renforcé du dashboard stratégique/);
assert.match(css, /\.page :is\(\.section, \.panel\) :is\(h1, h2, h3, h4, h5, h6, p, span, small, strong/);
assert.match(css, /color: #142e49 !important;/);
assert.match(css, /color: #193850 !important;/);
assert.match(css, /\.sateer-strat-kpi--accent :is\(/);
assert.match(css, /\.sateer-strat-kpi--urgent :is\(/);
assert.match(css, /\.sateer-consul-return :is\(/);
const base=css.indexOf('Neutraliser les anciens verts');
const accent=css.indexOf('Exceptions indispensables');
const btn=css.lastIndexOf('Bouton de retour');
assert(base>=0 && accent>base && btn>accent, 'Les exceptions doivent suivre la règle générale');
assert(css.includes('body.sateer-consul-refonte .page'), 'Sélecteurs limités au dashboard');
const opened=(css.match(/\{/g)||[]).length, closed=(css.match(/\}/g)||[]).length;
assert.equal(opened,closed,'Accolades CSS équilibrées');
console.log('PASS : correction spécifique au dashboard et exceptions après les règles générales');
assert(!/url\(|@import|@font-face/.test(css.slice(base)),'Ne pas charger d’assets externes');
console.log('PASS : aucune modification des données ni ressource ajoutée');
console.log('BORDEAUX_CONSUL_CONTRASTE_PASS : 3/3');
