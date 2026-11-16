"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {validerSaisie}=require('../energy/energy-case-domain');
const {creerEnergyCaseRouter}=require('../energy/energy-case-http');
const TENANT='ENERGYREC_TEST';
const raw={tenantCode:TENANT,profil:'PARTICULIER',typeSite:'LOGEMENT',nomSite:'Maison',pays:'SN',alimentation:'SANS_ALIMENTATION',compteur:'NON',besoins:['POMPAGE'],description:'Sans réseau',consentement:true};
const UUID='c98ba094-bb01-4e9a-9422-3eecb68dc351';
function fixture({auth={personneId:123},membership=true,scope=TENANT}={}){
 const handlers={};const router={post:(p,h)=>handlers['POST '+p]=h,get:(p,h)=>handlers['GET '+p]=h};
 let count=0;const store={creer:async args=>{count++;return {code:'OK',nouveau:true,publicId:UUID,dateCreation:'2026-11-16T16:00:00Z'};},lister:async()=>({cases:[],autresDisponibles:false}),obtenir:async()=>null};
 let lookups=0;
 creerEnergyCaseRouter({router,listerOrganisations:async(person,tenant)=>{lookups++;assert.equal(person,123);assert.equal(tenant,scope);return membership?[{tenant_code:scope}]:[]},store,origineAutorisee:'http://localhost:3450',tenantAutorise:TENANT});
 async function call(method,url,body=raw,{origin='http://localhost:3450',idempotencyKey=UUID,authOverride=auth,tenant=scope}={}){
  const [base,part]=url.split('/:id');
  const h=handlers[method+' '+url];assert.ok(h,'route manquante '+url);
  const req={auth:authOverride,body,query:{tenant},params:{id:UUID},get:(key)=>key==='Origin'?origin:key==='Idempotency-Key'?idempotencyKey:undefined};
  const res={code:200,body:null,headers:{},status(n){this.code=n;return this;},json(x){this.body=x;return this;},set(k,v){this.headers[k]=v;return this;}};
  await h(req,res);return res;
 }
 return {call,store,get count(){return count},get lookups(){return lookups}};
}
test('domaine accepte site sans compteur et profil personnel',()=>{const d=validerSaisie(raw,TENANT);assert.equal(d.compteur,'NON');assert.equal(d.profil,'PARTICULIER');});
test('domaine accepte organisations déclarées sans leur attribuer un mandat',()=>{const d=validerSaisie({...raw,profil:'ORGANISATION',typeSite:'BATIMENT_PUBLIC'},TENANT);assert.equal(d.profil,'ORGANISATION');});
test('domaine refuse manque de consentement et identité ajoutée par client',()=>{assert.equal(validerSaisie({...raw,consentement:false},TENANT),null);assert.equal(validerSaisie({...raw,personneId:1},TENANT),null);});
test('domaine refuse données hors catalogue, doublons et tenant différent',()=>{assert.equal(validerSaisie({...raw,besoins:['POMPAGE','POMPAGE']},TENANT),null);assert.equal(validerSaisie({...raw,alimentation:'WOOF'},TENANT),null);assert.equal(validerSaisie(raw,'AUTRE'),null);});
test('POST doit venir d une session authentifiée',async()=>{const f=fixture();const r=await f.call('POST','/cases',raw,{authOverride:null});assert.equal(r.code,401);assert.equal(f.count,0);assert.equal(f.lookups,0);});
test('tenant Energy distinct obligatoire : autre tenant bloqué avant lecture',async()=>{const f=fixture({scope:'AMBVIS_96C7FBBEA383DD'});const r=await f.call('POST','/cases',raw,{tenant:'AMBVIS_96C7FBBEA383DD'});assert.equal(r.code,403);assert.equal(f.lookups,0);});
test('tenant Energy sans appartenance refusé',async()=>{const f=fixture({membership:false});const r=await f.call('POST','/cases');assert.equal(r.code,403);assert.equal(f.count,0);});
test('origine incorrecte et clé idempotence absente refusées',async()=>{const f=fixture();assert.equal((await f.call('POST','/cases',raw,{origin:'https://evil.example'})).code,403);assert.equal((await f.call('POST','/cases',raw,{idempotencyKey:null})).code,400);assert.equal(f.count,0);});
test('POST valide crée un brouillon uniquement',async()=>{const f=fixture();const r=await f.call('POST','/cases');assert.equal(r.code,201);assert.equal(r.body.id,UUID);assert.equal(r.body.statut,'ENERGY_CASE_BROUILLON');assert.equal(f.count,1);assert.equal(r.headers['Cache-Control'],'private, no-store');});
test('GET liste privée et détail inconnu',async()=>{const f=fixture();assert.equal((await f.call('GET','/cases')).code,200);assert.equal((await f.call('GET','/cases/:id')).code,404);});
test('aucun endpoint de modification/traitement/partage institutionnel',()=>{const a=[];const r={post:(p,h)=>a.push('POST '+p),get:(p,h)=>a.push('GET '+p)};creerEnergyCaseRouter({router:r,listerOrganisations:async()=>[],store:{creer:async()=>{},lister:async()=>{},obtenir:async()=>{}},origineAutorisee:'x',tenantAutorise:TENANT});assert.deepEqual(a,['POST /cases','GET /cases','GET /cases/:id']);});
test('migration conserve isolation par propriétaire et audit événementiel',()=>{const s=fs.readFileSync(path.join(__dirname,'../database/050_energy_cases.sql'),'utf8');assert.match(s,/UNIQUE \(tenant_id,owner_personne_id,request_key\)/);assert.match(s,/EnergyCaseCreated\.v1/);assert.match(s,/REFERENCES personnes\(id\)/);});
test('interface ne présente ni transfert vers Invest ni diagnostic déjà effectué',()=>{const html=fs.readFileSync(path.join(__dirname,'../public/sunu-courant.html'),'utf8');assert.match(html,/sans calcul, diagnostic ou promesse/i);assert.match(html,/auth-client\.js/);});

test('store : transaction commit unique avec évènement et paramètres SQL',async()=>{
 const {creerEnergyCaseStore}=require('../energy/energy-case-store');
 const seen=[];let released=false;
 const client={async query(sql,params){seen.push({sql,params});
  if(sql.startsWith('SELECT id FROM tenants'))return {rows:[{id:28}]};
  if(sql.startsWith('INSERT INTO energy_cases'))return {rows:[{id:10,public_id:UUID,date_creation:'2026-11-16'}]};
  return {rows:[]};},release(){released=true}};
 const store=creerEnergyCaseStore({obtenirClient:async()=>client});
 const v=await store.creer({tenant:TENANT,owner:22,requestKey:UUID,saisie:validerSaisie(raw,TENANT)});
 assert.equal(v.code,'OK');assert.equal(v.nouveau,true);assert.equal(seen[0].sql,'BEGIN');assert.equal(seen.at(-1).sql,'COMMIT');assert.equal(released,true);
 assert.equal(seen.filter(x=>x.sql.includes('INSERT INTO energy_case_events')).length,1);
 assert.equal(seen.find(x=>x.sql.startsWith('INSERT INTO energy_cases')).params[2],22);
});
test('store : idempotence ne crée pas deux évènements',async()=>{
 const {creerEnergyCaseStore}=require('../energy/energy-case-store');
 const crypto=require('node:crypto');const data=validerSaisie(raw,TENANT);
 const hash=crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');const seen=[];
 const client={async query(sql){seen.push(sql);
  if(sql.startsWith('SELECT id FROM tenants'))return {rows:[{id:10}]};
  if(sql.startsWith('INSERT INTO energy_cases'))return {rows:[]};
  if(sql.startsWith('SELECT id,public_id'))return {rows:[{id:2,public_id:UUID,date_creation:'2026-11-16',content_hash:hash}]};
  return {rows:[]};},release(){}};
 const v=await creerEnergyCaseStore({obtenirClient:async()=>client}).creer({tenant:TENANT,owner:22,requestKey:UUID,saisie:data});
 assert.equal(v.nouveau,false);assert.equal(v.code,'OK');assert.equal(seen.some(x=>x.includes('INSERT INTO energy_case_events')),false);
});
test('store : erreur SQL => rollback et release',async()=>{
 const {creerEnergyCaseStore}=require('../energy/energy-case-store');let released=false,rollback=false;
 const client={async query(sql){if(sql==='ROLLBACK'){rollback=true;return {rows:[]}}if(sql==='BEGIN')return {rows:[]};throw new Error('SQL_INDISPONIBLE');},release(){released=true}};
 await assert.rejects(()=>creerEnergyCaseStore({obtenirClient:async()=>client}).creer({tenant:TENANT,owner:22,requestKey:UUID,saisie:validerSaisie(raw,TENANT)}));
 assert.equal(rollback,true);assert.equal(released,true);
});
