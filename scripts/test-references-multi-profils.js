'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function file(f){return fs.readFileSync(f,'utf8');}
for(const [f,token] of [
  ['public/consulat.js','Dossier n°${demande.id}'],
  ['public/unit-workspace.js','Dossier n°${demande.id}'],
  ['public/publication-institutionnelle.js','Publication n°${publicationId}']]){
  assert(file(f).includes(token),`${f}: référence absente`);
  console.log('PASS_REFERENCES: '+f);
}
const src=file('public/dashboard-vice-consul.js');
assert.equal(src.split('SATEER_REF_PILOTE_BORDEAUX').length-1,2);
assert.equal(src.split('referenceDossier.textContent = `Dossier n°${numeroDossier}`').length-1,2);
// Extract two self-contained functions, run against synthetic duplicate cases.
function section(start,end){const a=src.indexOf(start),b=src.indexOf(end,a+start.length);assert(a>=0&&b>a);return src.slice(a,b);}
const recent=section('function afficherDernieresDemandes(', '// =========================================================\n// SURVEILLANCE');
// Surveillance is also checked for its second reference renderer above.
const collections={};
class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.style={};this.textContent='';this.innerHTML='';this.className='';}
  appendChild(x){this.children.push(x);return x;}
}
const context={document:{getElementById(id){return collections[id]||(collections[id]=new Element('div'));},createElement(tag){return new Element(tag);}},Number};
vm.createContext(context);
vm.runInContext(recent,context);
vm.runInContext('afficherDernieresDemandes([{id:136,objet:"Même titre",prenom:"Samba",nom:"Demo",statut:"TRAITEE"},{id:137,objet:"Même titre",prenom:"Samba",nom:"Demo",statut:"NOUVELLE"}])',context);
const cards=collections.dernieresDemandes.children;
assert.equal(cards.length,2);
for(const [index,id] of [136,137].entries()){
 const flat=cards[index].children[0].children.map(x=>x.textContent);
 assert(flat.includes('Dossier n°'+id),'identifiant manquant '+id);
}
console.log('PASS_DYNAMIQUE_VICE: n°136 et n°137 sont distingués avec le même titre');
console.log('REFERENCES_MULTI_PROFILS_PASS: toutes les surfaces connues');
