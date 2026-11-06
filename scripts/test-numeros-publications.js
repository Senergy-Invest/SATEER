'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const path = 'public/publication-institutionnelle.js';
const source = fs.readFileSync(path, 'utf8');
assert.match(source, /Publication n°\$\{publicationId\}/);
assert.match(source, /reference\.textContent = `Publication n°/);
assert.doesNotMatch(source, /reference\.innerHTML/);
assert.match(source, /lireJsonRelais\(permissionResponse\)/);

class Element {
    constructor(tag='div') { this.tagName=tag; this.children=[]; this.style={}; this.textContent=''; this.value=''; this.hidden=false; this.listeners={};this.options=[]; }
    append(...children) { this.children.push(...children); }
    appendChild(child) { this.children.push(child); }
    replaceChildren(...children) { this.children=[...children]; }
    addEventListener(name, fn) { this.listeners[name]=fn; }
    dispatchEvent() {}
    closest() { return null; }
}
const elements = Object.fromEntries(['#formPublication','#audienceType','#ciblageLabel','#publicationResultat','#communicationChannelId','#publicationHistoryStatus','#publicationHistoryList','#audienceValeur'].map(x=>[x,new Element()]));
elements['#audienceType'].value='TOUS';
const documents = [
 {id:58,titre:'espace unique',categorie:'INFORMATION',audience_type:'TOUS',statut:'PUBLIEE'},
 {id:57,titre:'Information officielle association',categorie:'INFORMATION',audience_type:'ASSOCIATION',audience_valeur:'132',statut:'PUBLIEE'},
 {id:41,titre:'DEMO P3.1',categorie:'INFORMATION',audience_type:'PROFIL',audience_valeur:'CITOYEN_DEMO_P3_1',statut:'PUBLIEE'},
 {id:40,titre:'DEMO P3.1',categorie:'INFORMATION',audience_type:'PROFIL',audience_valeur:'CITOYEN_DEMO_P3_1',statut:'PUBLIEE'},
 {id:'<img src=x onerror=alert(1)>',titre:'Entrée invalide',categorie:'INFORMATION',audience_type:'TOUS',statut:'PUBLIEE'}
];
const response = data => ({ok:true,status:200,headers:{get(){return 'application/json';}},async json(){return data;}});
let relayCalls=0;
const calls=[];
const sandbox = {
 document:{querySelector(sel){return elements[sel] || new Element();},createElement(tag){return new Element(tag);}},
 URLSearchParams, location:{search:'?organisation=70&tenant=P6V_3B5AC5AB9DB04657'},
 Event:class Event {},
 fetch:async url => {
   calls.push(url);
   if(url.includes('/association-relay-authorizations')) {relayCalls++;return response({associations:[{association_id:132,association_nom:'Association test',relay_authorized:true,relay_id:1}]});}
   if(url.includes('/publications?')) return response({publications:documents});
   if(url.includes('/channels?')) return response({canaux:[]});
   throw Error('unexpected fetch: '+url);
 },
 console
};
vm.createContext(sandbox);
// Lancer un seul rendu a la fois : neutralise le chargement automatique dans le banc de test.
const isolatedSource = source.replace(/^chargerPublications\(\);$/m, '/* rendu declenche explicitement par le test */');
assert.notEqual(isolatedSource, source);
vm.runInContext(isolatedSource,sandbox,{filename:path});
(async()=>{
 await vm.runInContext('chargerPublications()', sandbox);
 const rows=elements['#publicationHistoryList'].children;
 assert.equal(rows.length,5);
 for(const [idx,id] of [58,57,41,40].entries()) {
   assert.equal(rows[idx].children[0].textContent,`Publication n°${id}`);
   assert.equal(rows[idx].children[0].className,'com-pill');
   assert.equal(rows[idx].children[1].textContent,documents[idx].titre);
 }
 console.log('PASS : publications 58, 57, 41 et 40 identifiables, sans toucher aux titres.');
 assert.equal(rows[4].children[0].tagName,'h3');
 assert.equal(rows[4].children[0].textContent,'Entrée invalide');
 console.log('PASS : identifiant invalide non affiche, aucun HTML execute.');
 assert.equal(relayCalls>0,true);
 assert.equal(rows[1].children.at(-1).className,'com-relay-permissions');
 assert.equal(rows[1].children.at(-1).children[2].children[0].textContent.includes('Relais autorisé'),true);
 console.log('PASS : controle du relais associatif conserve.');
 assert.equal(elements['#publicationHistoryStatus'].textContent,'5 publication(s) enregistrée(s).');
 assert(calls.some(url=>url.includes('/publications?tenant=')));
 console.log('PASS : nombre et chargement API inchanges.');
 console.log('BORDEAUX_NUMEROS_PUBLICATIONS_PASS : 4/4, sans ecriture en base.');
})().catch(err=>{console.error(err);process.exitCode=1;});
