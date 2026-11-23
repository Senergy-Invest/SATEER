'use strict';
/** Tests isolés : vrais domaines 1C2/1C3 du dépôt, mock HTTP/PG, aucun réseau ni écriture. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {evaluerPrecontrole}=require('../energy/energy-meter-precheck-domain');
const {creerEnergyMeterPrecheckRouter}=require('../energy/energy-meter-precheck-http');
const {creerEnergyMeterPrecheckStore}=require('../energy/energy-meter-precheck-store');
const ID='e1aba323-8370-4638-b430-77fc1f6d7437';
const TENANT='ENERGY_MVP01D_RECETTE';
const older=(v,seconds=120)=>({valeur:v,secondes:seconds,date:'2026-11-22T10:00:00.000Z'});
const evaluate=(valeur,precedent=null,suivant=null,compteurActif=true)=>evaluerPrecontrole({valeur,precedent,suivant,compteurActif});
test('Sans référence : jamais une fausse validation',()=>{
 const e=evaluate('12345.67');assert.equal(e.statutQualite,'REFERENCE_ABSENTE');assert.equal(e.signaux.length,0);
 assert.equal(e.verificationMetrologique,false);
});
test('Index en baisse : signal 1C2 réutilisé',()=>{
 const e=evaluate('99.90',older('100.00'));assert.equal(e.statutQualite,'A_VERIFIER');
 assert.ok(e.signaux.some(s=>s.code==='INDEX_EN_BAISSE'));
});
test('Index inchangé : information 1C2',()=>{
 const e=evaluate('100.000000',older('100.0'));
 assert.ok(e.signaux.some(s=>s.code==='INDEX_INCHANGE'));
 assert.equal(e.statutQualite,'AUCUN_SIGNAL_DETECTE');
});
test('Valeur strictement supérieure et non rapprochée : pas de seuil de hausse',()=>{
 const e=evaluate('999999.01',older('1.01'));assert.deepEqual(e.signaux,[]);
 assert.equal(e.statutQualite,'AUCUN_SIGNAL_DETECTE');
});
test('Deux index identiques à 30 secondes : signal de proximité',()=>{
 const e=evaluate('120',older('120',30));assert.ok(e.signaux.some(s=>s.code==='RELEVES_RAPPROCHES_IDENTIQUES'));
});
test('Deux index différents à 30 secondes : proximité à vérifier',()=>{
 const e=evaluate('121',older('120',30));assert.ok(e.signaux.some(s=>s.code==='RELEVES_RAPPROCHES_DIFFERENTS'));
 assert.equal(e.statutQualite,'A_VERIFIER');
});
test('Au-delà de 60 secondes : aucun signal de proximité',()=>{
 const e=evaluate('121',older('120',61));assert.ok(!e.signaux.some(s=>s.code.startsWith('RELEVES_RAPPROCHES')));
});
test('Relevé canonique à date égale ou ultérieure : alerte',()=>{
 const e=evaluate('121',older('120'),{valeur:'130',date:'2026-11-23T10:00:00Z'});
 assert.ok(e.signaux.some(s=>s.code==='RELEVE_NON_STRICTEMENT_ANTERIEUR'));
});
test('Compteur inactif : signal de remplacement',()=>{
 const e=evaluate('121',older('120'),null,false);
 assert.ok(e.signaux.some(s=>s.code==='COMPTEUR_DEVENU_INACTIF'));
});
test('Paramètres malformés refusés',()=>{
 assert.throws(()=>evaluate('1',older('0',0)),/PRECEDENT_INVALIDE/);
 assert.throws(()=>evaluate('-5',older('2')),/INDEX_INVALIDE/);
 assert.throws(()=>evaluate('1',older('0'),{foo:'1'}),/SUIVANT_INVALIDE/);
});
test('Pas de calcul de kWh ou de certification dans les réponses',()=>{
 const e=evaluate('99',older('100'));
 assert.equal(e.aucuneConsommationCalculee,true);
 assert.equal(Object.hasOwn(e,'consommation'),false);
 assert.equal(e.verificationMetrologique,false);
});
function mockHttp({result={missionId:ID,statutMission:'A_REVOIR'}}={}){
 const routes=new Map(),router={use(){},get(p,cb){routes.set('GET '+p,cb);},post(){throw Error('INTERDICTION_DE_MUTATION');}};
 let calls=0;
 creerEnergyMeterPrecheckRouter({router,listerOrganisations:async()=>[{tenant_code:TENANT}],
  store:{apercu:async()=>{calls++;return result;}},tenantAutorise:TENANT});
 async function request({actor=100,tenant=TENANT,missionId=ID}={}){
  const h=routes.get('GET /missions/:missionId/apercu');assert.ok(h);
  const req={auth:actor?{personneId:actor}:null,query:{tenant},params:{missionId}};
  const res={statusCode:200,body:null,status(code){this.statusCode=code;return this;},
   json(x){this.body=x;return this;},set(){return this;}};
  await h(req,res);return {status:res.statusCode,body:res.body,calls};
 }
 return {request,routes};
}
test('HTTP sans session : 401 sans store',async()=>{const x=mockHttp();assert.equal((await x.request({actor:0})).status,401);});
test('HTTP tenant étranger : 403',async()=>{const x=mockHttp();assert.equal((await x.request({tenant:'AUTRE_TENANT'})).status,403);});
test('HTTP identifiant falsifié : 400',async()=>{const x=mockHttp();assert.equal((await x.request({missionId:'../../'})).status,400);});
test('HTTP GET session autorisée : aperçu en lecture seule',async()=>{
 const x=mockHttp();const r=await x.request();assert.equal(r.status,200);
 assert.equal(r.body.statut,'PRECONTROLE_INDICATIF');assert.equal(r.calls,1);
});
test('HTTP mission invisible ou non révisable : 404',async()=>{
 const x=mockHttp({result:null});const r=await x.request();assert.equal(r.status,404);
});
test('HTTP route unique, aucun POST mutatif',()=>{
 const x=mockHttp();assert.equal(x.routes.size,1);
 assert.deepEqual([...x.routes.keys()],['GET /missions/:missionId/apercu']);
});
function fakeDB({owner=true,previous=null,next=null,active=true}={}){
 const calls=[];
 const mission={id:ID,statut:'A_REVOIR',register_id:'11111111-1111-4111-8111-111111111111',
  meter_id:'22222222-2222-4222-8222-222222222222',site_id:10,tenant_id:10,owner_personne_id:100,
  valeur:'12345.67',releve_le:new Date('2026-11-23T10:00:00Z'),unite:'KWH',compteur_actif:active};
 const client={async query(sql,args){calls.push({sql,args});
   if(/BEGIN READ ONLY|ROLLBACK/.test(sql))return {rows:[]};
   if(sql.includes('FROM energy_meter_participation_missions m'))return {rows:owner?[mission]:[]};
   if(sql.includes('r.releve_le<$6::timestamptz'))return {rows:previous?[{valeur:previous.valeur,releve_le:new Date(previous.date)}]:[]};
   if(sql.includes('r.releve_le >= $6::timestamptz'))return {rows:next?[{valeur:next.valeur,releve_le:new Date(next.date)}]:[]};
   throw Error('REQUETE_NON_ATTENDUE '+sql.slice(0,80));},release(){calls.push({sql:'RELEASE'});}};
 return {client,calls};
}
test('Store mission propriétaire : historique même registre+compteur et rollback',async()=>{
 const db=fakeDB({previous:{valeur:'123.45',date:'2026-11-23T09:00:00Z'}});
 const store=creerEnergyMeterPrecheckStore({obtenirClient:async()=>db.client});
 const r=await store.apercu({tenant:TENANT,actor:100,missionId:ID});
 assert.equal(r.indexPropose,'12345.67');assert.equal(r.precedent.valeur,'123.45');
 assert.equal(r.statutQualite,'AUCUN_SIGNAL_DETECTE');
 assert.ok(db.calls.some(c=>c.sql==='BEGIN READ ONLY'));
 assert.ok(db.calls.some(c=>c.sql==='ROLLBACK'));
 for(const x of db.calls.filter(c=>c.sql.includes('FROM energy_meter_readings'))){
  assert.match(x.sql,/r\.register_id=\$1::uuid AND r\.meter_id=\$2::uuid/);
  assert.equal(x.args[1],'22222222-2222-4222-8222-222222222222');
 }
 assert.ok(!db.calls.some(c=>/\b(INSERT|UPDATE|DELETE|COMMIT)\b/.test(c.sql)));
});
test('Store mission étrangère/incompatible : aucune lecture du registre',async()=>{
 const db=fakeDB({owner:false});const store=creerEnergyMeterPrecheckStore({obtenirClient:async()=>db.client});
 assert.equal(await store.apercu({tenant:TENANT,actor:500,missionId:ID}),null);
 assert.ok(!db.calls.some(c=>c.sql.includes('FROM energy_meter_readings')));
});
test('Store signale un compteur remplacé sans écriture',async()=>{
 const db=fakeDB({active:false});const store=creerEnergyMeterPrecheckStore({obtenirClient:async()=>db.client});
 const r=await store.apercu({tenant:TENANT,actor:100,missionId:ID});
 assert.ok(r.signaux.some(s=>s.code==='COMPTEUR_DEVENU_INACTIF'));
});
test('Store signale un historique canonique postérieur',async()=>{
 const db=fakeDB({next:{valeur:'12350',date:'2026-11-23T10:20:00Z'}});
 const store=creerEnergyMeterPrecheckStore({obtenirClient:async()=>db.client});
 const r=await store.apercu({tenant:TENANT,actor:100,missionId:ID});
 assert.ok(r.signaux.some(s=>s.code==='RELEVE_NON_STRICTEMENT_ANTERIEUR'));
});
test('Store retourne les connexions même en cas erreur',async()=>{
 let released=false;const client={async query(sql){if(sql==='BEGIN READ ONLY')return {rows:[]};if(sql==='ROLLBACK')return {rows:[]};throw Error('PG_SIMULE');},release(){released=true;}};
 const store=creerEnergyMeterPrecheckStore({obtenirClient:async()=>client});
 await assert.rejects(store.apercu({tenant:TENANT,actor:100,missionId:ID}),/PG_SIMULE/);
 assert.equal(released,true);
});
test('Contrat monté avec flag, interface DOM sûre et avant décisions',()=>{
 const root=path.join(__dirname,'..');const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
 const ui=fs.readFileSync(path.join(root,'public','energie-missions-releves.js'),'utf8');
 assert.ok(server.includes("process.env.SATEER_ENABLE_ENERGY_EMETER3_R1 === '1'"));
 assert.ok(server.includes("app.use('/api/energy/precontrole/v1', exigerSession"));
 const p=ui.indexOf('await afficherPrecontrole(li,m)'),a=ui.indexOf("const actions=document.createElement('div')",p);
 assert.ok(p>=0&&a>p);assert.match(ui,/p\.textContent=txt/);
});
