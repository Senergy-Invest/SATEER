'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const nav=require('../public/energie-retour-c4c3');
const tenant='ENERGY_MVP01D_RECETTE',site=crypto.randomUUID(),grant=crypto.randomUUID();
const ctx={id:site,grantId:grant};
test('C4C3 R2 : retour construit sans ouvrir une origine externe',()=>{
 const r=nav.retour(tenant,ctx,'EN_REVUE','TOUS',50);
 assert.ok(r.startsWith('/energie-actions.html?'));assert.ok(!r.includes('https://'));
 assert.equal(nav.lireEtat(new URL(r,'https://local.invalid').search,tenant).offset,50);
});
test('C4C3 R2 : C2 porte un contexte de retour et le fragment de suivi',()=>{
 const u=nav.vers('/energie-collecte.html',tenant,ctx,'A_CORRIGER','TOUS',100,'#mesPropositions');
 assert.ok(u.endsWith('#mesPropositions'));assert.equal(nav.retourDepuis(new URL(u,'https://local.invalid').search,tenant),nav.retour(tenant,ctx,'A_CORRIGER','TOUS',100));
});
test('C4C3 R2 : C1 retrouve son chemin depuis le diagnostic propriétaire',()=>{
 const u=nav.vers('/energie-responsabilites.html',tenant,{id:site},'EN_REVUE','SANS_RELECTEUR_ACTIF',0);
 assert.ok(nav.retourDepuis(new URL(u,'https://local.invalid').search,tenant).includes('SANS_RELECTEUR_ACTIF'));
});
test('C4C3 R2 : impossible de rediriger vers un site externe',()=>{
 const q=new URLSearchParams({tenant,from:'c4c3',retourC4C3:'https://malveillant.example/energie-actions.html?tenant='+tenant});
 assert.equal(nav.retourDepuis('?'+q,tenant),null);
});
test('C4C3 R2 : refuse un retour vers un autre tenant',()=>{
 const q=new URLSearchParams({tenant,from:'c4c3',retourC4C3:'/energie-actions.html?tenant=AUTRE'});
 assert.equal(nav.retourDepuis('?'+q,tenant),null);
});
test('C4C3 R2 : refuse marqueur absent et chemin différent',()=>{
 assert.equal(nav.retourDepuis('?tenant='+tenant,tenant),null);
 const q=new URLSearchParams({tenant,from:'c4c3',retourC4C3:'/api/auth/logout?tenant='+tenant});
 assert.equal(nav.retourDepuis('?'+q,tenant),null);
});
test('C4C3 R2 : les paramètres de filtre falsifiés sont neutralisés',()=>{
 const r=nav.lireEtat('?tenant='+tenant+'&site=INVALID&statut=SUPPRIMER&suivi=TOUT&offset=-50',tenant);
 assert.deepEqual(r,{site:null,grantId:null,statut:'TOUTES',suivi:'TOUS',offset:0});
});
test('C4C3 R2 : sélection grant et pagination explicites',()=>{
 const r=nav.lireEtat(new URL(nav.retour(tenant,ctx,'EN_REVUE','TOUS',100),'https://local.invalid').search,tenant);
 assert.equal(r.site,site);assert.equal(r.grantId,grant);assert.equal(r.offset,100);
});
test('C4C3 R2 : les autres pages et liens sont refusés',()=>{
 assert.equal(nav.vers('/api/energy/collecte/v1',tenant,ctx,'TOUTES','TOUS',0),null);
 assert.equal(nav.retour('tenant invalide',ctx),null);
});
test('C4C3 R2 : garde-fou intégration C1 C2 sans réécrire leurs permissions',()=>{
 const js=fs.readFileSync(path.join(__dirname,'../public/energie-actions.js'),'utf8');
 assert.ok(js.includes('nav.vers('));
 const html=fs.readFileSync(path.join(__dirname,'../public/energie-actions.html'),'utf8');
 assert.ok(html.includes('energie-retour-c4c3.js'));
});
