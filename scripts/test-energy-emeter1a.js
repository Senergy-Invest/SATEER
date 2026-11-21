'use strict';
/** E-METER-1A : validation métier / refus HTTP / documentation, sans PostgreSQL. */
const {test}=require('node:test');const assert=require('node:assert/strict');
const crypto=require('node:crypto');const fs=require('node:fs');const path=require('node:path');
const d=require('../energy/energy-meter-domain');
const {creerEnergyMeterRouter}=require('../energy/energy-meter-http');
const {creerEnergyMeterStore}=require('../energy/energy-meter-store');
const id=()=>crypto.randomUUID(),TENANT='ENERGY_MVP01D_RECETTE',SITE=id(),POINT=id(),METER=id(),REGISTER=id();
const point=()=>({nom:'Compteur principal',energie:'ELECTRICITE',typePoint:'GENERAL'});
const meter=()=>({nom:'Compteur réseau',technologie:'ELECTRONIQUE',modeCommercial:'PREPAYE',registreCode:'INDEX_TOTAL',registreUnite:'KWH'});
const reading=()=>({valeur:'00012.500',releveLe:'2026-11-20T09:45:00+01:00',observation:'Vu sur écran'});
function serve({actor=5,tenant=TENANT,orgs=[{tenant_code:TENANT}],db={},origin='http://localhost:3488'}={}){
 const routes={GET:{},POST:{}},calls=[];
 const router={use(){},get(x,f){routes.GET[x]=f;},post(x,f){routes.POST[x]=f;}};
 const store={sites:async()=>({sites:[],suivant:false}),lister:async()=>({points:[],suivant:false}),
  creerPoint:async x=>{calls.push(['creerPoint',x]);return {code:'OK',id:POINT,nouveau:true};},
  creerCompteur:async x=>{calls.push(['creerCompteur',x]);return {code:'OK',id:METER,nouveau:true};},
  creerRegistre:async x=>{calls.push(['creerRegistre',x]);return {code:'OK',id:REGISTER,nouveau:true};},
  creerReleve:async x=>{calls.push(['creerReleve',x]);return {code:'OK',id:id(),nouveau:true};},
  historique:async()=>({releves:[],suivant:false}),...db};
 creerEnergyMeterRouter({router,listerOrganisations:async()=>orgs,store,origineAutorisee:origin,tenantAutorise:TENANT});
 async function hit(method,route,body,over={}){
  const headers={Origin:origin,'Idempotency-Key':id(),...over.headers};
  const req={method,auth:{personneId:actor},query:{tenant,...over.query},params:{siteId:SITE,pointId:POINT,meterId:METER,registerId:REGISTER,...over.params},body,
   get:k=>headers[k]};
  const res={statusCode:200,payload:null,status(n){this.statusCode=n;return this;},json(x){this.payload=x;return this;},set(){return this;}};
  await routes[method][route](req,res);return res;
 }
 return {hit,calls,routes};
}
const POINT_ROUTE='/sites/:siteId/points';
const METER_ROUTE='/sites/:siteId/points/:pointId/compteurs';
const REGISTER_ROUTE='/sites/:siteId/compteurs/:meterId/registres';
const READ_ROUTE='/sites/:siteId/registres/:registerId/releves';

test('types de points couvrent général, secondaire et autre',()=>assert.deepEqual([...d.POINTS],['GENERAL','SECONDAIRE','AUTRE']));
test('points : électricité, gaz, eau et chaleur distincts',()=>assert.ok(d.ENERGIES.includes('EAU')&&d.ENERGIES.includes('CHALEUR')));
test('un site sans compteur demeure possible',()=>assert.equal(d.point(point()).energie,'ELECTRICITE'));
test('point refuse nom vide',()=>assert.equal(d.point({...point(),nom:' '}),null));
test('point refuse champ propriétaire injecté',()=>assert.equal(d.point({...point(),ownerId:1}),null));
test('point refuse énergie arbitraire',()=>assert.equal(d.point({...point(),energie:'NUCLEAIRE'}),null));
test('compteur prépayé distinct de technologie',()=>assert.equal(d.appareil(meter()).modeCommercial,'PREPAYE'));
test('compteur postpayé possible',()=>assert.equal(d.appareil({...meter(),modeCommercial:'POSTPAYE'}).modeCommercial,'POSTPAYE'));
test('compteur série facultatif',()=>assert.equal(d.appareil(meter()).numeroSerie,null));
test('compteur série contrôlée',()=>assert.equal(d.appareil({...meter(),numeroSerie:'A\nB'}),null));
test('compteur refuse faux rôle injecté',()=>assert.equal(d.appareil({...meter(),role:'ADMIN'}),null));
test('registre accepte KWH et KVARH séparément',()=>assert.ok(d.registre({code:'HP',unite:'KWH'})&&d.registre({code:'REACTIF',unite:'KVARH'})));
test('registre refuse expression comme code',()=>assert.equal(d.registre({code:'X;DROP',unite:'KWH'}),null));
test('registre refuse unité non cataloguée',()=>assert.equal(d.registre({code:'TOTAL',unite:'JOULES'}),null));
test('index décimal reste chaîne exacte',()=>assert.equal(d.indexManuel(reading(),Date.UTC(2030,1,1)).valeur,'12.5'));
test('index zéro est permis',()=>assert.equal(d.indexManuel({...reading(),valeur:'0'},Date.UTC(2030,1,1)).valeur,'0'));
test('index refuse nombre JS imprécis',()=>assert.equal(d.indexManuel({...reading(),valeur:12.5},Date.UTC(2030,1,1)),null));
test('index refuse valeur négative',()=>assert.equal(d.indexManuel({...reading(),valeur:'-12'},Date.UTC(2030,1,1)),null));
test('index refuse exponentielle et NaN',()=>assert.equal(d.indexManuel({...reading(),valeur:'1e5'},Date.UTC(2030,1,1)),null));
test('index refuse précision excessive',()=>assert.equal(d.indexManuel({...reading(),valeur:'1.1234567'},Date.UTC(2030,1,1)),null));
test('index refuse date sans fuseau',()=>assert.equal(d.indexManuel({...reading(),releveLe:'2026-11-20T09:45:00'},Date.UTC(2030,1,1)),null));
test('index refuse date impossible',()=>assert.equal(d.indexManuel({...reading(),releveLe:'2026-02-30T09:45:00Z'},Date.UTC(2030,1,1)),null));
test('index refuse futur lointain',()=>assert.equal(d.indexManuel({...reading(),releveLe:'2031-01-01T00:00:00Z'},Date.UTC(2030,1,1)),null));
test('index refuse observation contenant saut de ligne',()=>assert.equal(d.indexManuel({...reading(),observation:'x\n'},Date.UTC(2030,1,1)),null));
test('index refuse identifiants étrangers',()=>assert.equal(d.indexManuel({...reading(),tenant:'FAUX'},Date.UTC(2030,1,1)),null));
test('index marqué manuel, sans certification',()=>assert.equal(d.indexManuel(reading(),Date.UTC(2030,1,1)).source,'SAISIE_MANUELLE'));
test('UUID est contrôlé strictement',()=>assert.equal(d.UUID.test('../../etc/passwd'),false));
test('HTTP refuse une session sans personne',async()=>{const s=serve({actor:0});const r=await s.hit('GET','/sites');assert.equal(r.statusCode,401);});
test('HTTP refuse tenant externe',async()=>{const s=serve();const r=await s.hit('GET','/sites',null,{query:{tenant:'OTHER_TENANT'}});assert.equal(r.statusCode,403);});
test('HTTP refuse une organisation non autorisée',async()=>{const s=serve({orgs:[]});const r=await s.hit('GET','/sites');assert.equal(r.statusCode,403);});
test('HTTP refuse origine croisée sur POST',async()=>{const s=serve();const r=await s.hit('POST',POINT_ROUTE,point(),{headers:{Origin:'https://evil.test'}});assert.equal(r.statusCode,403);assert.equal(s.calls.length,0);});
test('HTTP exige une clé idempotente',async()=>{const s=serve();const r=await s.hit('POST',POINT_ROUTE,point(),{headers:{'Idempotency-Key':'non-uuid'}});assert.equal(r.statusCode,400);});
test('HTTP crée point pour propriétaire',async()=>{const s=serve();const r=await s.hit('POST',POINT_ROUTE,point());assert.equal(r.statusCode,201);assert.equal(s.calls[0][1].actor,5);});
test('HTTP refuse siteId arbitraire',async()=>{const s=serve();const r=await s.hit('POST',POINT_ROUTE,point(),{params:{siteId:'other'}});assert.equal(r.statusCode,400);});
test('HTTP déclare compteur et registre initial',async()=>{const s=serve();const r=await s.hit('POST',METER_ROUTE,meter());assert.equal(r.statusCode,201);assert.equal(s.calls[0][1].pointId,POINT);});
test('HTTP refuse compteur inconnu',async()=>{const s=serve();const r=await s.hit('POST',METER_ROUTE,{...meter(),technologie:'AUTO_CERTIFIE'});assert.equal(r.statusCode,400);});
test('HTTP autorise registre supplémentaire',async()=>{const s=serve();const r=await s.hit('POST',REGISTER_ROUTE,{code:'HEURES_CREUSES',unite:'KWH'});assert.equal(r.statusCode,201);});
test('HTTP refuse index sans valeur',async()=>{const s=serve();const r=await s.hit('POST',READ_ROUTE,{releveLe:reading().releveLe});assert.equal(r.statusCode,400);});
test('HTTP accepte index manuel non calculé',async()=>{const s=serve();const r=await s.hit('POST',READ_ROUTE,reading());assert.equal(r.statusCode,201);assert.equal(s.calls[0][1].data.source,'SAISIE_MANUELLE');});
test('HTTP refuse lecture d’un autre site (masque existence)',async()=>{const s=serve({db:{lister:async()=>null}});const r=await s.hit('GET',POINT_ROUTE);assert.equal(r.statusCode,404);});
test('HTTP refuse historique d’un autre site',async()=>{const s=serve({db:{historique:async()=>null}});const r=await s.hit('GET',READ_ROUTE);assert.equal(r.statusCode,404);});
test('HTTP refuse offset invalide',async()=>{const s=serve();const r=await s.hit('GET',READ_ROUTE,null,{query:{offset:'-2'}});assert.equal(r.statusCode,400);});
test('HTTP API aucun endpoint de suppression',()=>{const s=serve();assert.equal(Object.keys(s.routes).join(','),'GET,POST');});
test('Stockage nécessite PostgreSQL injecté',()=>assert.throws(()=>creerEnergyMeterStore({}),/POSTGRES_CLIENT_REQUIS/));
test('Stockage protège chaque site par tenant et propriétaire',()=>{const x=fs.readFileSync(path.join(__dirname,'../energy/energy-meter-store.js'),'utf8');assert.match(x,/s\.owner_personne_id=\$3/);assert.match(x,/t\.code=\$1/);});
test('Stockage requiert transaction et journal pour les écritures',()=>{const x=fs.readFileSync(path.join(__dirname,'../energy/energy-meter-store.js'),'utf8');assert.match(x,/BEGIN/);assert.match(x,/ROLLBACK/);assert.match(x,/MeterReadingDeclared\.v1/);});
test('SQL : FK composites points, compteurs, registres, relevés',()=>{const x=fs.readFileSync(path.join(__dirname,'../database/061_energy_meter_manual.sql'),'utf8');for(const t of ['fk_meter_point_site','fk_meter_device_point','fk_meter_register_device','fk_meter_reading_register'])assert.ok(x.includes(t));});
test('SQL : événements et index immuables',()=>{const x=fs.readFileSync(path.join(__dirname,'../database/061_energy_meter_manual.sql'),'utf8');assert.match(x,/BEFORE UPDATE OR DELETE ON energy_meter_readings/);assert.match(x,/BEFORE UPDATE OR DELETE ON energy_meter_events/);});
test('SQL : protection cluster sateer_test',()=>{const x=fs.readFileSync(path.join(__dirname,'../database/061_energy_meter_manual.sql'),'utf8');assert.match(x,/pg_control_system/);assert.match(x,/sateer_test/);});
test('UI : pas d’affirmation de kWh calculés',()=>{const x=fs.readFileSync(path.join(__dirname,'../public/energie-releves.html'),'utf8');assert.match(x,/Aucune différence de kWh/);assert.match(x,/sous tension/);});
test('UI : texte injecté via textContent',()=>{const x=fs.readFileSync(path.join(__dirname,'../public/energie-releves.js'),'utf8');assert.doesNotMatch(x,/innerHTML/);assert.match(x,/textContent/);});

test('Store : propriétaire étranger ne peut créer de point',async()=>{
 const queries=[];let released=false;
 const store=creerEnergyMeterStore({obtenirClient:async()=>({query:async(sql,args)=>{
  queries.push({sql,args});if(sql.includes('FROM energy_inventory_sites s'))return {rows:[]};return {rows:[]};
 },release(){released=true;}})});
 const r=await store.creerPoint({tenant:TENANT,actor:17,siteId:SITE,requestKey:id(),data:point()});
 assert.equal(r.code,'SITE_NON_AUTORISE');assert.equal(released,true);
 assert.equal(queries.some(x=>x.sql.includes('INSERT INTO energy_meter_points')),false);
});

test('Store : création de point est transactionnelle et auditée',async()=>{
 const queries=[];let released=false;
 const store=creerEnergyMeterStore({obtenirClient:async()=>({query:async(sql,args)=>{
  queries.push({sql,args});
  if(sql.includes('FROM energy_inventory_sites s'))return {rows:[{id:2,public_id:SITE,tenant_id:3,owner_personne_id:5}]};
  if(sql.includes('INSERT INTO energy_meter_points'))return {rows:[{id:POINT}]};
  return {rows:[]};
 },release(){released=true;}})});
 const r=await store.creerPoint({tenant:TENANT,actor:5,siteId:SITE,requestKey:id(),data:point()});
 assert.equal(r.code,'OK');assert.equal(r.nouveau,true);assert.match(r.id,d.UUID);assert.equal(released,true);
 assert.ok(queries.some(x=>x.sql==='BEGIN')&&queries.some(x=>x.sql==='COMMIT'));
 assert.ok(queries.some(x=>x.sql.includes('INSERT INTO energy_meter_events')));
});

test('Store : une clé de point rejouée avec contenu identique ne duplique pas',async()=>{
 const input=point(),key=id(),hash=crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
 let count=0;const store=creerEnergyMeterStore({obtenirClient:async()=>({query:async(sql)=>{
  if(sql.includes('FROM energy_inventory_sites s'))return {rows:[{id:2,tenant_id:3,owner_personne_id:5}]};
  if(sql.includes('INSERT INTO energy_meter_points')){count++;return {rows:[]};}
  if(sql.includes('SELECT id,content_hash FROM energy_meter_points'))return {rows:[{id:POINT,content_hash:hash}]};
  return {rows:[]};
 },release(){}})});
 const r=await store.creerPoint({tenant:TENANT,actor:5,siteId:SITE,requestKey:key,data:input});
 assert.equal(r.code,'OK');assert.equal(r.nouveau,false);assert.equal(count,1);
});

test('Store : index transmis à SQL en chaîne décimale, pas en float',async()=>{
 const queries=[];const input=d.indexManuel({...reading(),valeur:'0000001234.123456'},Date.UTC(2030,1,1));
 const store=creerEnergyMeterStore({obtenirClient:async()=>({query:async(sql,args)=>{
  queries.push({sql,args});
  if(sql.includes('FROM energy_inventory_sites s'))return {rows:[{id:2,tenant_id:3,owner_personne_id:5}]};
  if(sql.includes('FROM energy_meter_registers r'))return {rows:[{id:REGISTER,point_id:POINT,meter_id:METER,unite:'KWH',actif:true}]};
  if(sql.includes('INSERT INTO energy_meter_readings'))return {rows:[{id:id()}]};
  return {rows:[]};
 },release(){}})});
 const result=await store.creerReleve({tenant:TENANT,actor:5,siteId:SITE,registerId:REGISTER,requestKey:id(),data:input});
 assert.equal(result.code,'OK');assert.equal(result.qualification,'DECLARE_A_VERIFIER');
 const insert=queries.find(x=>x.sql.includes('INSERT INTO energy_meter_readings'));
 assert.equal(insert.args[7],'1234.123456');assert.equal(typeof insert.args[7],'string');
});
