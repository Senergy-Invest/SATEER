'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {installerLien} = require('../public/sateer-vice-email-entry.js');
class Node {
  constructor(name, attrs = {}) {this.name = name; this.attrs = attrs; this.appended=[]; this.after=[]; this.inside=[];this.textContent='';this.className='';this.id='';}
  getAttribute(key){return this.attrs[key]||null;}
  setAttribute(key,val){this.attrs[key]=val;}
  removeAttribute(key){delete this.attrs[key];}
  append(...items){this.appended.push(...items);}
  insertAdjacentElement(position,node){if(position==='afterend')this.after.push(node);else this.inside.push(node);}
}
function doc(withPublication=true) {
  const anchor = new Node('a',{href:'/publication-institutionnelle.html?organisation=70'});
  const main=new Node('main');
  let added=null;
  return { main,anchor,
    createElement:t=>new Node(t),
    getElementById:id => added?.id===id?added:null,
    querySelectorAll:()=>withPublication?[anchor]:[],
    querySelector:s=>s==='main'?main:null,
    get body(){return main;},
    setAdded(){added=anchor.after[0]||main.inside[0];},
  };
}
const t='P6V_3B5AC5AB9DB04657';
{
 const d=doc();assert.equal(installerLien(d,{search:'?organisation=70&tenant='+t}),'INSTALLE');d.setAdded();
 assert.equal(d.anchor.after.length,1);assert.equal(d.anchor.after[0].href,'/email-secretariat-demo.html?organisation=70&tenant='+t);
 assert.match(d.anchor.after[0].append[0]?.textContent || d.anchor.after[0].appended[0].textContent,/Courriers entrants/);
 assert.equal(installerLien(d,{search:'?organisation=70&tenant='+t}),'DEJA_PRESENT');console.log('PASS : lien visible à côté de Publier une information, URL conserve org/tenant, sans doublon');
}
{
 const d=doc(false);assert.equal(installerLien(d,{search:'?organisation=70&tenant='+t}),'INSTALLE');
 assert.equal(d.main.inside.length,1);console.log('PASS : repli près du début du dashboard si toolbar absente');
}
{
 const d=doc();assert.equal(installerLien(d,{search:'?organisation=70&tenant=AUTRE !'}),'CONTEXTE_MANQUANT');
 assert.equal(d.anchor.after[0].href,undefined);assert.equal(d.anchor.after[0].attrs['aria-disabled'],'true');
 console.log('PASS : pas de contexte inventé ni de destination forcée');
}
{
 const d=doc();assert.equal(installerLien(d,{search:'?organisationId=70&tenant='+t}),'INSTALLE');
 assert.match(d.anchor.after[0].href,/organisation=70/);console.log('PASS : variante organisationId supportée');
}
const html=fs.readFileSync('public/dashboard-vice-consul.html','utf8');
assert.equal((html.match(/SATEER_EMAIL_VICE_ENTRY_V1/g)||[]).length,1);
assert.match(html,/sateer-vice-email-entry\.css/);assert.match(html,/sateer-vice-email-entry\.js/);
const css=fs.readFileSync('public/sateer-vice-email-entry.css','utf8');assert.match(css,/color:\s*#fff\s*!important/);
console.log('PASS : HTML charge le lien et contraste blanc sur bleu nuit');
console.log('BORDEAUX_VICE_EMAIL_ENTRY_PASS : 5/5');
