'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {installerLien} = require('../public/sateer-vice-email-entry.js');
const T='P6V_3B5AC5AB9DB04657';
class Node {
 constructor(name){this.name=name;this.id='';this.className='';this.children=[];this.parentNode=null;this.attrs={};this.textContent='';}
 append(...nodes){for(const n of nodes)this.insertBefore(n,null);}
 insertBefore(node,next){if(node.parentNode){node.parentNode.children.splice(node.parentNode.children.indexOf(node),1)} node.parentNode=this; const i=next?this.children.indexOf(next):-1;this.children.splice(i<0?this.children.length:i,0,node);return node;}
 getAttribute(k){return this.attrs[k]??null;}
 setAttribute(k,v){this.attrs[k]=String(v);}
 removeAttribute(k){delete this.attrs[k];}
 querySelector(s){if(s==='.sx-p2-actions')return this.actions||null;if(s==='#sx-p2-refresh')return this.children.find(x=>x.id==='sx-p2-refresh')||null;return null;}
 closest(){return null;}
 insertAdjacentElement(pos,node){assert.ok(['afterend','afterbegin'].includes(pos));if(pos==='afterend' && this.parentNode)this.parentNode.insertBefore(node,this.parentNode.children[this.parentNode.children.indexOf(this)+1]||null);else this.insertBefore(node,this.children[0]||null);}
}
function makeDoc({compact=true,p2Script=true}={}) {
 const main=new Node('main'),root=new Node('section'),toolbar=new Node('nav'),reload=new Node('button');reload.id='sx-p2-refresh';
 root.id='sx-p2-root';root.actions=toolbar;toolbar.append(reload);main.append(root);
 const old=new Node('a');old.attrs.href='/publication-institutionnelle.html?organisation=70';const oldParent=new Node('section');oldParent.append(old);main.append(oldParent);
 const doc={root,toolbar,main,old,
  createElement:(t)=>new Node(t),
  getElementById:(id)=>id==='sx-p2-root'&&compact?root:id==='sateer-vice-email-entry'?toolbar.children.find(x=>x.id===id)||null:null,
  querySelector:(q)=>q==='script[src*="sateer-p2.js"]'&&p2Script?{}:q==='main'?main:null,
  querySelectorAll:()=>[old],body:main
 };
 return doc;
}
let d=makeDoc();
assert.equal(installerLien(d,{search:`?organisation=70&tenant=${T}`}), 'INSTALLE_DANS_P2_VISIBLE');
let a=d.toolbar.children.find(x=>x.id==='sateer-vice-email-entry');
assert.ok(a,'bouton présent dans la barre P2 et NON dans l’ancienne section');
assert.ok(d.toolbar.children.indexOf(a)<d.toolbar.children.findIndex(x=>x.id==='sx-p2-refresh'));
assert.equal(a.href,`/email-secretariat-demo.html?organisation=70&tenant=${T}`);
console.log('PASS : lien placé dans #sx-p2-root .sx-p2-actions, avant Actualiser');
assert.equal(installerLien(d,{search:`?organisation=70&tenant=${T}`}), 'INSTALLE_DANS_P2_VISIBLE');
assert.equal(d.toolbar.children.filter(x=>x.id==='sateer-vice-email-entry').length,1);
console.log('PASS : aucune duplication au second chargement');
d=makeDoc();
assert.equal(installerLien(d,{search:'?organisation=70&tenant=incorrect !'}),'CONTEXTE_MANQUANT');
a=d.toolbar.children.find(x=>x.id==='sateer-vice-email-entry');
assert.equal(a.href,undefined);assert.equal(a.attrs['aria-disabled'],'true');
console.log('PASS : contexte incorrect, aucune navigation forcée');
d=makeDoc({compact:false,p2Script:true});
assert.equal(installerLien(d,{search:`?organisation=70&tenant=${T}`}), 'ATTENTE_P2');
assert.equal(d.old.parentNode.children.includes(d.old),true);
assert.equal(d.main.children.length,2);
console.log('PASS : aucun lien injecté dans les anciens blocs masqués en attendant P2');
d=makeDoc({compact:false,p2Script:false});
assert.equal(installerLien(d,{search:`?organisation=70&tenant=${T}`}), 'INSTALLE_ANCIEN_DASHBOARD');
console.log('PASS : compatibilité avec les pages sans P2');
const css=fs.readFileSync('public/sateer-vice-email-entry.css','utf8');
const p2=fs.readFileSync('public/sateer-p2.js','utf8');
assert.match(css,/SATEER_VICE_EMAIL_P2_CONTRASTE_V1/);
assert.match(css,/#sx-p2-root \.sx-p2-actions a\.sateer-vice-email-entry/);
assert.match(p2,/SATEER_VICE_P2_REFERENCES_VISIBLES_V1/);
assert.match(p2, /fillList\('sx-p2-latest', recent, 'Aucune demande récente\.', x => \[refDossier\(x\)/);
assert.match(p2, /fillList\('sx-p2-attention', alerts, 'Aucun dossier signalé\.', x => \[refDossier\(x\)/);
assert.match(p2,/À prendre en charge/);
console.log('PASS : numéros n°136/n°137 et style P2 couverts dans le VRAI composant affiché');
const html=fs.readFileSync('public/dashboard-vice-consul.html','utf8');
assert.match(html,/sateer-vice-email-entry\.js/);
assert.match(html,/sateer-p2\.js/);
console.log('PASS : HTML charge bien le lien et le dashboard compact');
console.log('BORDEAUX_COURRIERS_VISIBLES_P2_PASS : 7/7');
