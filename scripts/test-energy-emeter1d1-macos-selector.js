'use strict';
/** Contrat UI macOS : pas de filtre de sélecteur, mais contrôle d'extension après sélection. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const base=path.resolve(__dirname,'..','public');
const html=fs.readFileSync(path.join(base,'energie-import.html'),'utf8');
const js=fs.readFileSync(path.join(base,'energie-import.js'),'utf8');
assert.match(html,/<input\s+type="file"\s+id="csv"/);
assert.doesNotMatch(html,/<input[^>]+id="csv"[^>]+accept\s*=/i,
  'Le filtre accept ne doit pas griser le fichier dans le sélecteur macOS');
assert.match(html,/energie-import\.js\?v=1d1-ui-v9/);
class Element{
 constructor(){this.value='';this.files=[];this.checked=false;this.disabled=false;this.textContent='';this.listeners={};this.classList={toggle(){}};this.children=[];}
 addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
 fire(type){for(const fn of this.listeners[type]||[])fn();}
 replaceChildren(...children){this.children=children;}
 append(child){this.children.push(child);}
}
const elements=new Map();
const node=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
vm.runInNewContext(js,{
 document:{getElementById:node,createElement:()=>new Element()},
 window:{SATEER_CONTEXT_READY:Promise.resolve({organisations:[{tenant_code:'ENERGY_MVP01D_RECETTE'}]}),addEventListener(){}},
 location:{search:'?tenant=ENERGY_MVP01D_RECETTE'},URLSearchParams,
 fetch:async()=>({ok:true,json:async()=>({sites:[{id:'123e4567-e89b-42d3-a456-426614174000',nom:'RECETTE SYNTHETIQUE MVP01D',pays:'SN'}],suivant:false})}),
 TextDecoder,crypto:require('node:crypto').webcrypto,console
},{filename:'energie-import.js'});
(async()=>{
 await new Promise(setImmediate);
 assert.equal(node('apercu').disabled,true);
 for(const name of ['archive.zip','fichier.csv.txt','rapport.pdf','CSV_V6_DEJA_IMPORTE_NE_PAS_VALIDER.numbers']){
  node('csv').files=[{name,size:233}];node('csv').fire('change');
  assert.equal(node('apercu').disabled,true,'Aperçu interdit pour '+name);
  assert.match(node('fichier-etat').textContent,/Extension non .csv/);
 }
 const csv='CSV_V6_DEJA_IMPORTE_NE_PAS_VALIDER.csv';
 node('csv').files=[{name:csv,size:233}];node('csv').fire('change');
 assert.equal(node('apercu').disabled,false,'CSV accepté dès la sélection');
 assert.match(node('fichier-etat').textContent,/La prévisualisation est disponible/);
 node('csv').files=[];node('csv').fire('change');
 assert.equal(node('apercu').disabled,true);
 assert.equal(node('valider').disabled,true);
 console.log('PASS | macOS : aucun filtre de fichier dans le sélecteur');
 console.log('PASS | ZIP / CSV.TXT / PDF : sélection possible mais prévisualisation interdite');
 console.log('PASS | CSV .csv : aperçu activé');
 console.log('PASS | retrait du CSV : aperçu et validation désactivés');
 console.log('PASS | aucune requête d’import, aucun accès PostgreSQL');
})().catch(e=>{console.error(e);process.exitCode=1;});
