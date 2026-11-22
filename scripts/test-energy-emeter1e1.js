'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {analyserRemplacement}=require('../energy/energy-meter-replacement-domain');
const {creerEnergyMeterReplacementStore}=require('../energy/energy-meter-replacement-store');
const {creerEnergyMeterReplacementRouter}=require('../energy/energy-meter-replacement-http');
const SITE='9c349328-4dc0-4d72-8907-4d4b92a5a3e7',POINT='ed5571a8-f1c1-40d6-87b4-99882ccb0f88';
const OLD='080b9257-6936-488d-b511-c59491dd1b76', KEY='35b7028c-d9cf-4e95-a1b1-27b51d641ce2';
const input=()=>({confirmation:'CONFIRMER_REMPLACEMENT',motif:'Compteur remplace par un professionnel habilite.',nouveauCompteur:{nom:'Nouveau compteur fictif',technologie:'ELECTRONIQUE',modeCommercial:'PREPAYE',numeroSerie:null,registreCode:'INDEX_TOTAL',registreUnite:'KWH'}});
const parameters=()=>({tenant:'ENERGY_MVP01D_RECETTE',actor:123,siteId:SITE,pointId:POINT,meterId:OLD,requestKey:KEY,data:analyserRemplacement(input())});
for(const field of ['confirmation','motif','nouveauCompteur'])test('contrat exige '+field,()=>{const d=input();delete d[field];assert.equal(analyserRemplacement(d),null);});
test('contrat positif normalise motif et garde le registre',()=>{const v=analyserRemplacement(input());assert.equal(v.nouveauCompteur.registreCode,'INDEX_TOTAL');assert.equal(v.nouveauCompteur.registreUnite,'KWH');assert.equal(v.motif,input().motif);});
test('contrat refuse champ d\'identite non autorise',()=>{const d=input();d.ownerPersonneId=123;assert.equal(analyserRemplacement(d),null);});
test('contrat refuse confirmation inexacte',()=>{const d=input();d.confirmation='OUI';assert.equal(analyserRemplacement(d),null);});
test('contrat refuse motif trop court',()=>{const d=input();d.motif='Panne';assert.equal(analyserRemplacement(d),null);});
test('contrat refuse motif non textuel',()=>{const d=input();d.motif=42;assert.equal(analyserRemplacement(d),null);});
test('contrat refuse code de registre invalide',()=>{const d=input();d.nouveauCompteur.registreCode='kWh';assert.equal(analyserRemplacement(d),null);});
test('contrat refuse unite inconnue',()=>{const d=input();d.nouveauCompteur.registreUnite='WATTS';assert.equal(analyserRemplacement(d),null);});
test('contrat refuse technologie inconnue',()=>{const d=input();d.nouveauCompteur.technologie='MAGIQUE';assert.equal(analyserRemplacement(d),null);});
test('contrat refuse champ supplementaire sur appareil',()=>{const d=input();d.nouveauCompteur.ancienIndex=400;assert.equal(analyserRemplacement(d),null);});
test('contrat refuse objet en tableau',()=>assert.equal(analyserRemplacement([]),null));
function fixture(state={}){
 const queries=[],st={...state},oldTime='2026-10-01T12:00:00Z',instant='2026-11-22T14:00:00Z';
 const run=async(sql,args=[])=>{
  queries.push({sql,args});
  if(st.failOn&&sql.includes(st.failOn))throw Error('PANNE_INJECTEE');
  if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK')return {rows:[]};
  if(sql.includes('SELECT s.id,s.tenant_id'))return {rows:st.noSite?[]:[{id:70,tenant_id:88,owner_personne_id:123}]};
  if(sql.includes('FROM energy_meter_points'))return {rows:st.noPoint?[]:[{id:POINT}]};
  if(sql.includes('SELECT id,content_hash FROM energy_meter_devices'))return {rows:st.replay||[]};
  if(sql.includes('SELECT id,point_id,actif,date_installation,date_retrait FROM energy_meter_devices'))return {rows:st.noOld?[]:[{id:OLD,point_id:POINT,actif:st.inactive?false:true,date_installation:oldTime,date_retrait:st.inactive?instant:null}]};
  if(sql.includes('SELECT id FROM energy_meter_devices WHERE point_id'))return {rows:st.activeList||[{id:OLD}]};
  if(sql.includes('SELECT clock_timestamp() AS instant'))return {rows:[{instant:st.stamp||instant}]};
  if(sql.includes('FROM energy_meter_readings'))return {rows:st.future?[{one:1}]:[]};
  if(sql.includes('UPDATE energy_meter_devices SET actif=FALSE'))return {rows:[{id:OLD}]};
  if(sql.includes('SELECT id FROM energy_meter_registers'))return {rows:st.registers||[{id:'34c66590-8223-44aa-917c-f676fb92d828'}]};
  return {rows:[]};
 };
 return {queries,store:creerEnergyMeterReplacementStore({obtenirClient:async()=>({query:run,release(){}})})};
}
test('transaction valide old false, nouveau, registre et 3 evenements',async()=>{
 const f=fixture(),r=await f.store.remplacer(parameters());assert.equal(r.code,'OK');assert.equal(r.nouveau,true);
 const texts=f.queries.map(x=>x.sql).join('\n');assert.match(texts,/FOR UPDATE OF s/);
 assert.match(texts,/UPDATE energy_meter_devices SET actif=FALSE/);assert.match(texts,/INSERT INTO energy_meter_devices/);
 assert.match(texts,/INSERT INTO energy_meter_registers/);assert.equal(f.queries.filter(q=>q.sql.includes('INSERT INTO energy_meter_events')).length,3);
 assert.equal(f.queries.at(-1).sql,'COMMIT');assert.equal(f.queries.filter(x=>x.sql==='ROLLBACK').length,0);
});
test('ne migre aucun ancien releve lors du remplacement',async()=>{
 const f=fixture();await f.store.remplacer(parameters());assert.equal(f.queries.filter(q=>/\bUPDATE\s+energy_meter_readings|\bDELETE\s+FROM\s+energy_meter_readings/i.test(q.sql)).length,0);
});
test('refuse site etranger',async()=>{const f=fixture({noSite:true});assert.equal((await f.store.remplacer(parameters())).code,'SITE_NON_AUTORISE');assert.ok(!f.queries.some(q=>q.sql.includes('UPDATE energy_meter_devices')));});
test('refuse point etranger',async()=>{const f=fixture({noPoint:true});assert.equal((await f.store.remplacer(parameters())).code,'POINT_NON_AUTORISE');});
test('refuse compteur absent',async()=>{const f=fixture({noOld:true});assert.equal((await f.store.remplacer(parameters())).code,'COMPTEUR_NON_AUTORISE');});
test('refuse compteur deja retire',async()=>{const f=fixture({inactive:true});assert.equal((await f.store.remplacer(parameters())).code,'COMPTEUR_DEJA_RETIRE');});
test('refuse plusieurs appareils actifs incoherents',async()=>{const f=fixture({activeList:[{id:OLD},{id:crypto.randomUUID()}]});assert.equal((await f.store.remplacer(parameters())).code,'COMPTEUR_ACTIF_INCOHERENT');});
test('refuse un index horodate apres la transition',async()=>{const f=fixture({future:true});assert.equal((await f.store.remplacer(parameters())).code,'RELEVE_POSTERIEUR_A_TRANSITION');});
test('refuse changement avec horloge anterieure a la date d installation',async()=>{const f=fixture({stamp:'2026-01-01T00:00:00Z'});assert.equal((await f.store.remplacer(parameters())).code,'DATE_TRANSITION_INCOHERENTE');});
test('erreur apres retrait provoque rollback et jamais commit',async()=>{const f=fixture({failOn:'INSERT INTO energy_meter_registers'});await assert.rejects(()=>f.store.remplacer(parameters()),/PANNE_INJECTEE/);
 assert.ok(f.queries.some(q=>q.sql==='ROLLBACK'));assert.ok(!f.queries.some(q=>q.sql==='COMMIT'));
});
test('erreur au moment de l audit provoque rollback',async()=>{const f=fixture({failOn:'INSERT INTO energy_meter_events'});await assert.rejects(()=>f.store.remplacer(parameters()),/PANNE_INJECTEE/);assert.equal(f.queries.at(-1).sql,'ROLLBACK');});
test('cle idempotente differente retourne conflit sans ecriture',async()=>{const f=fixture({replay:[{id:crypto.randomUUID(),content_hash:'0'.repeat(64)}]});assert.equal((await f.store.remplacer(parameters())).code,'CLE_REUTILISEE');assert.ok(!f.queries.some(q=>q.sql.includes('UPDATE energy_meter_devices')));});
test('rejeu identique renvoie meme compteur sans ecriture',async()=>{
 const p=parameters(),digest=crypto.createHash('sha256').update(JSON.stringify({pointId:p.pointId,meterId:p.meterId,motif:p.data.motif,nouveauCompteur:p.data.nouveauCompteur})).digest('hex');
 const newId=crypto.randomUUID(),f=fixture({replay:[{id:newId,content_hash:digest}]});const r=await f.store.remplacer(p);
 assert.equal(r.code,'OK');assert.equal(r.nouveau,false);assert.equal(r.id,newId);assert.ok(!f.queries.some(q=>q.sql.includes('UPDATE energy_meter_devices')));
});
function route(){let handler,middleware;const router={use(fn){middleware=fn;},get(){},post(_path,fn){handler=fn;}};
 const responses=[];const res={set(){return this;},status(n){this.http=n;return this;},json(body){responses.push({http:this.http||200,body});return this;}};
 const store={sites:async()=>({sites:[]}),remplacer:async()=>({code:'OK',nouveau:true,id:crypto.randomUUID()})};
 creerEnergyMeterReplacementRouter({router,listerOrganisations:async()=>[{tenant_code:'ENERGY_MVP01D_RECETTE'}],store,
  origineAutorisee:'http://localhost:3497',tenantAutorise:'ENERGY_MVP01D_RECETTE'});
 const request=(o={})=>({auth:{personneId:123},query:{tenant:'ENERGY_MVP01D_RECETTE'},params:{siteId:SITE,pointId:POINT,meterId:OLD},body:input(),
  get(name){return {'Origin':'http://localhost:3497','Idempotency-Key':KEY}[name];},...o});
 return {handler,request,res,responses,middleware};
}
test('HTTP 201 sur remplacement confirme',async()=>{const v=route();await v.handler(v.request(),v.res);assert.equal(v.responses.at(-1).http,201);});
test('HTTP 401 sans Core',async()=>{const v=route();await v.handler(v.request({auth:null}),v.res);assert.equal(v.responses.at(-1).http,401);});
test('HTTP 403 si tenant interdit',async()=>{const v=route();await v.handler(v.request({query:{tenant:'AUTRE_TENANT'}}),v.res);assert.equal(v.responses.at(-1).http,403);});
test('HTTP 403 sans origine autorisee',async()=>{const v=route();await v.handler(v.request({get:()=>null}),v.res);assert.equal(v.responses.at(-1).http,403);});
test('HTTP 400 si id invalide',async()=>{const v=route();await v.handler(v.request({params:{siteId:'non',pointId:POINT,meterId:OLD}}),v.res);assert.equal(v.responses.at(-1).http,400);});
test('HTTP 400 sans confirmation',async()=>{const v=route();const body=input();body.confirmation='NON';await v.handler(v.request({body}),v.res);assert.equal(v.responses.at(-1).http,400);});
test('HTTP 503 en panne de SQL sans fuite SQL',async()=>{
 let handler;const router={use(){},get(){},post(_path,cb){handler=cb;}};
 creerEnergyMeterReplacementRouter({router,listerOrganisations:async()=>[{tenant_code:'ENERGY_MVP01D_RECETTE'}],
  store:{sites:async()=>({sites:[]}),remplacer:async()=>{throw Error('SECRET_DB');}},origineAutorisee:'http://localhost:3497',tenantAutorise:'ENERGY_MVP01D_RECETTE'});
 const v=route();await handler(v.request(),v.res);assert.equal(v.responses.at(-1).http,503);assert.ok(!JSON.stringify(v.responses).includes('SECRET_DB'));
});
