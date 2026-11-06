// Tests de regression de l'en-tete du dashboard strategique SATEER Bordeaux.
'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const css=fs.readFileSync('public/sateer-consul-theme.css','utf8');
const script=fs.readFileSync('public/sateer-consul-theme.js','utf8');
assert(css.includes('sateer-consul-entete-visible'));
assert(css.includes('background: #ffffff !important'));
assert(css.includes('color: #142e49 !important'));
assert(script.includes('rendreEnteteLisible();'));
console.log('PASS : fond blanc et texte bleu nuit, dans le seul en-tete');
const important = new Map();
const style = {setProperty(name, value, priority) {assert.equal(priority,'important');important.set(name,value);}};
const classes = new Set();
const cls = {add(value) {classes.add(value);},contains(v){return classes.has(v);}};
const descendants = ['h1','p','span'].map(() => ({style:{setProperty(n,v,p){assert.equal(p,'important'); assert.equal(n,'color'); assert.equal(v,'#142e49');}}}));
const head = {style,classList:cls,querySelectorAll(selector){assert(selector.includes('#organisationNom'));return descendants;},id:'',contains(){return true;}};
const title = {textContent:'Dashboard stratégique',closest(){return head;},parentElement:head};
const doc = {
  body:{classList:{add(){}}}, readyState:'complete',
  getElementById(id){return id === 'dashboardContenu'? {} : null;},
  querySelector(sel){assert.equal(sel,'h1');return title;},
  querySelectorAll(sel){assert.equal(sel,'a[href]');return [];}
};
vm.runInNewContext(script,{document:doc,window:{location:{search:''}},URLSearchParams});
assert(classes.has('sateer-consul-entete-visible'));
assert.equal(important.get('background'),'#ffffff');
assert.equal(important.get('color'),'#142e49');
console.log('PASS : en-tete reel marque et contraste force malgre les anciens styles');
const untouched = new Set();
const wrongDoc={...doc,querySelector(){return {textContent:'Une autre page',closest(){return head;}};}};
vm.runInNewContext(script,{document:wrongDoc,window:{location:{search:''}},URLSearchParams});
assert.equal(untouched.size,0);
const h=(x)=>{const c=x.replace('#','').match(/.{2}/g).map(v=>parseInt(v,16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
const l1=h('#142e49'),l2=h('#ffffff');const ratio=(Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);
assert(ratio>4.5);
console.log(`PASS : contraste WCAG AA pour le texte principal (${ratio.toFixed(1)}:1)`);
console.log('CONSUL_ENTETE_TEST_PASS : 3/3');
