"use strict";
/** Contrats de l'accueil Energy MVP01-F, sans écriture base ni serveur. */
const {test}=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const base=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(base,'public/index.html'),'utf8');
const js=fs.readFileSync(path.join(base,'public/app.js'),'utf8');
const start=js.indexOf('async function chargerTenantsEnergyAutorises(');
const end=js.indexOf('async function chargerMonSateer() {',start);
assert.ok(start>0&&end>start,'fonctions d’intégration présentes');
const source=js.slice(start,end);
function compiler(fetch,document={getElementById:()=>null}) {
 const ctx={fetch,document,URLSearchParams,encodeURIComponent,console:{warn(){}},Set,element:(tag,cls,text)=>({tag,className:cls,textContent:text})};
 vm.createContext(ctx);
 vm.runInContext(source+'\nthis.services={chargerTenantsEnergyAutorises,afficherExperienceEnergyActive};',ctx);
 return ctx.services;
}
const energie=[{id:31,tenant_code:'ENERGY_MVP01D_RECETTE',type:'SATEER'}];
test('carte initiale inactive, aucun lien statique créé sans contrôle serveur',()=>{
 const zone=html.slice(html.indexOf('sx-group-future'),html.indexOf('id="professionnelsSection"'));
 assert.match(zone,/id="energyExperienceCard"/);
 assert.match(zone,/En préparation · Sans accès actif/);
 assert.doesNotMatch(zone,/<a\s/);
});
test('HTTP 200 avec réponse métier attendue active Energy',async()=>{
 const a=compiler(async (url,opt)=>{assert.match(url,/^\/api\/energy\/cases\?tenant=ENERGY_MVP01D_RECETTE$/);assert.equal(opt.credentials,'same-origin');return {status:200,json:async()=>({statut:'ENERGY_CASES_PERSONNELS'})};});
 const result=await a.chargerTenantsEnergyAutorises(energie,{});
 assert.equal(result.has('ENERGY_MVP01D_RECETTE'),true);
});
test('403, 404 et erreurs réseau ne créent aucun droit',async()=>{
 for (const fetcher of [async()=>({status:403}),async()=>({status:404}),async()=>{throw Error('down')}]){
  const a=compiler(fetcher);const result=await a.chargerTenantsEnergyAutorises(energie,{});assert.equal(result.size,0);
 }
});
test('200 non métier ne doit pas activer Energy',async()=>{
 const a=compiler(async()=>({status:200,json:async()=>({statut:'PAGE_LOGIN'})}));
 assert.equal((await a.chargerTenantsEnergyAutorises(energie,{})).size,0);
});
test('aucun tenant fabriqué : seul le contexte issu du Core est candidat',async()=>{
 let appels=0;const a=compiler(async()=>{appels++;return {status:200,json:async()=>({statut:'ENERGY_CASES_PERSONNELS'})}});
 const result=await a.chargerTenantsEnergyAutorises([{id:1,tenant_code:'../../secret'},{tenant_code:'ENERGY_MVP01D_RECETTE'}],{});
 assert.equal(result.size,0);assert.equal(appels,0);
});
test('carte accessible après confirmation serveur, sans dupliquer le lien',()=>{
 const nodes=new Map();const card={links:[],setAttribute(k,v){this[k]=v},append(x){this.links.push(x);nodes.set(x.id,x)}};
 nodes.set('energyExperienceCard',card);
 for(const id of ['energyExperienceStatus','energyExperienceDescription','groupFutureTitle'])nodes.set(id,{textContent:''});
 const doc={getElementById:(id)=>nodes.get(id)||null};
 const a=compiler(async()=>{},doc);a.afficherExperienceEnergyActive('ENERGY_MVP01D_RECETTE');a.afficherExperienceEnergyActive('ENERGY_MVP01D_RECETTE');
 assert.equal(card.links.length,1);assert.match(card.links[0].href,/sunu-courant\.html\?tenant=ENERGY_MVP01D_RECETTE/);
 assert.match(nodes.get('energyExperienceStatus').textContent,/Accessible/);
 assert.equal(nodes.get('groupFutureTitle').textContent,'Services spécialisés');
});
test('carte Diaspora exclut le tenant Energy mais préserve les autres',()=>{
 assert.match(js,/!energyTenantsAutorises\.has\(code\)/);
 assert.match(js,/const diasporaTenants = \[\.\.\.new Set/);
});
