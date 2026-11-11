'use strict';
// P335BR — contrat Express avec réponses synthétiques, sans connexion réseau/SQL.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const root = process.env.SATEER_PROJECT_ROOT || path.resolve(__dirname, '../..');
const routeHandlers = {get:[],use:[],all:[]};
const orig = Module._load;
const router=()=>({use:f=>routeHandlers.use.push(f),get:(p,f)=>routeHandlers.get.push({p,f}),all:(p,f)=>routeHandlers.all.push({p,f})});
try {
  Module._load=function(id,parent,isMain){
    if(id==='express')return {Router:router};
    if(id==='./database')return {executerRequete:()=>{throw Error('DB_INTERDITE')}};
    if(id==='./services-database')return {obtenirPermissionsEffectivesDatabase:()=>{throw Error('DB_INTERDITE')}};
    return orig.apply(this,arguments);
  };
  require(path.join(root,'bordeaux-email-demo-http.js')).createEmailDemoRouter({
    isTest:()=>true,
    rights:async person=>({succes:true, permissionsOrganisation:person===1?['VIEW_CONSULAR_MAIL_DEMO']:person===2?['VIEW_OPERATIONAL_DASHBOARD']:person===3?['VIEW_STRATEGIC_DASHBOARD']:[]}),
    query:async sql=>sql.startsWith('SELECT current_database')
      ?{rows:[{db:'sateer_test',sid:'7699611241381229531'}],rowCount:1}
      :{rows:[{id:1,objet:'DEMO',texte:'Corps fictif'}],rowCount:1}
  });
}finally {Module._load=orig;}
const valid={organisationId:'70',tenant:'P6V_3B5AC5AB9DB04657'};
function res(){return {code:200,body:null,set(){return this},status(n){this.code=n;return this},json(x){this.body=x;return this}}}
async function run(person,route='/access',query=valid){
  const req={auth:person?{personneId:person}:null,query,params:{id:'1'}};
  const out=res();
  for(const fn of routeHandlers.use){let proceed=false;await fn(req,out,()=>{proceed=true});if(!proceed)return out;}
  const handler=routeHandlers.get.find(x=>x.p===route)?.f;
  assert(handler,'ROUTE_MANQUANTE: '+route);await handler(req,out);return out;
}
test('secrétariat autorisé et compte Vice-Consul conservé',async()=>{
  for(const person of [1,2]){
    const a=await run(person); assert.equal(a.code,200);
    assert.equal(a.body.statut,'ACCES_COURRIERS_DEMO_AUTORISE');
    assert.equal(a.body.lectureSeule,true);
    assert.equal((await run(person,'/messages')).code,200);
  }
});
test('consul, compte sans droit et anonyme ne lisent pas les courriers',async()=>{
  for(const person of [3,4])assert.equal((await run(person)).code,403);
  assert.equal((await run(0)).code,401);
});
test('tenant incorrect refusé au secrétariat',async()=>{
  assert.equal((await run(1,'/access',{...valid,tenant:'FAUX_TENANT'})).code,400);
  assert.equal((await run(1,'/access',{...valid,organisationId:'71'})).code,400);
});
test('seulement courrier synthétique et aucune route mutatrice ajoutée',()=>{
  const s=fs.readFileSync(path.join(root,'bordeaux-email-demo-http.js'),'utf8');
  assert.match(s,/VIEW_CONSULAR_MAIL_DEMO/);
  assert.match(s,/DEMO_SYNTHETIQUE/);
  assert.doesNotMatch(s,/\bINSERT\s+INTO\b|\bUPDATE\s+\w+\s+SET\b|\bDELETE\s+FROM\b/i);
  assert.equal(routeHandlers.get.some(x=>x.p==='/access'),true);
  assert.equal(routeHandlers.get.some(x=>x.p==='/messages'),true);
});
test('accueil propre et entrée Mon SATEER conditionnés à la réponse backend',()=>{
  const home=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
  const entry=fs.readFileSync(path.join(root,'public/sateer-secretariat-entry.js'),'utf8');
  const page=fs.readFileSync(path.join(root,'public/secretariat-bordeaux.html'),'utf8');
  assert.match(home,/id="secretariatBordeauxSection"[^>]*hidden/);
  assert.match(entry,/response|\br\.ok/);
  assert.match(entry,/ACCES_COURRIERS_DEMO_AUTORISE/);
  assert.match(page,/Secrétariat consulaire/);
  assert.doesNotMatch(page,/motDePasse|password|smtp|imap/i);
});
test('catalogue dans le tableau de bord après contrôle serveur',()=>{
  const p2=fs.readFileSync(path.join(root,'public/sateer-p2.js'),'utf8');
  assert.match(p2,/sx-p2-catalogue/);
  assert.match(p2,/pilot-procedures\/administration/);
  assert.match(p2,/catalogue-demarches\.html/);
});
