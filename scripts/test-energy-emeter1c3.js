'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {SEUIL_SECONDES,pagination,signauxProximite,statut}=require('../energy/energy-meter-proximity-domain');
const {creerEnergyMeterProximityStore}=require('../energy/energy-meter-proximity-store');
const {creerEnergyMeterProximityRouter}=require('../energy/energy-meter-proximity-http');
const ROOT=path.join(__dirname,'..'),load=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const context={tenant:'ENERGY_MVP01D_RECETTE',actor:10,siteId:'123e4567-e89b-42d3-a456-426614174000'};
for(const [v,expected] of [[undefined,0],['0',0],['50',50],['10000',10000]])test('pagination valide '+v,()=>assert.equal(pagination(v),expected));
for(const v of ['01','-1','10001','NaN',' 0 ',null,3,'','+0','0\n'])test('pagination refuse '+v,()=>assert.equal(pagination(v),null));
for(const [v,p,s,expected] of [['235','230',30,'RELEVES_RAPPROCHES_DIFFERENTS'],['235','235.000000',30,'RELEVES_RAPPROCHES_IDENTIQUES'],
 ['230','235',60,'RELEVES_RAPPROCHES_DIFFERENTS'],['230','235',60.1,null],['230','235',0,null],
 ['230','235',null,null],['230',null,30,null],['235','230',61,null],['235','230',-1,null]])
 test('signal '+v+'/'+p+'/'+s,()=>{const a=signauxProximite({valeur:v,precedente:p,secondes:s});assert.equal(a[0]?.code||null,expected);
  assert.equal(statut(a),expected==='RELEVES_RAPPROCHES_DIFFERENTS'?'A_VERIFIER':'AUCUNE_ALERTE_DETECTEE');});
test('registre sans unite identique ne compare pas',()=>assert.deepEqual(signauxProximite({valeur:'1',precedente:'2',secondes:5,memeUnite:false}),[]));
test('precision numérique exacte jusqu à 6 décimales',()=>assert.equal(signauxProximite({valeur:'10000000000000.000001',precedente:'10000000000000.000000',secondes:15})[0].code,'RELEVES_RAPPROCHES_DIFFERENTS'));
test('pas de difference kWh dans le domaine',()=>{const x=load('energy/energy-meter-proximity-domain.js');assert.doesNotMatch(x,/parseFloat|valeur\s*-\s*precedente/);assert.equal(SEUIL_SECONDES,60);});
test('requête SQL sans écriture et strictement chronologique même registre',()=>{const x=load('energy/energy-meter-proximity-store.js');
 assert.match(x,/BEGIN READ ONLY/);assert.match(x,/ant\.register_id=r\.register_id/);assert.match(x,/ant\.releve_le<r\.releve_le/);
 assert.match(x,/r\.owner_personne_id=\$3/);assert.match(x,/LIMIT 51 OFFSET \$4/);
 assert.doesNotMatch(x,/\b(?:INSERT INTO|UPDATE\s+energy|DELETE FROM|CREATE TABLE|ALTER TABLE)\b/i);
});
test('API sans POST PUT PATCH DELETE, session et tenant',()=>{const x=load('energy/energy-meter-proximity-http.js');assert.match(x,/SESSION_REQUISE/);assert.match(x,/SITE_NON_AUTORISE/);
 assert.match(x,/TENANT_NON_AUTORISE/);assert.doesNotMatch(x,/router\.(?:post|put|patch|delete)\(/);});
test('interface échappe le contenu serveur via textContent',()=>{const x=load('public/energie-rapproches.js');assert.match(x,/textContent=/);
 assert.doesNotMatch(x,/innerHTML|eval\(/);assert.match(load('public/energie-controles.html'),/versRapproches/);});
function fakeDb(){const queries=[];const c={query:async(sql)=>{queries.push(sql);
 if(sql==='BEGIN READ ONLY'||sql==='COMMIT'||sql==='ROLLBACK')return {rows:[]};
 if(sql.includes('SELECT s.public_id,s.nom FROM energy_inventory_sites'))return {rows:[{public_id:context.siteId,nom:'RECETTE'}]};
 if(sql.includes('FROM energy_inventory_sites s JOIN tenants'))return {rows:[{id:99,public_id:context.siteId,nom:'RECETTE',tenant_id:7,owner_personne_id:10}]};
 if(sql.includes('FROM energy_meter_readings r'))return {rows:[
 {id:'a',register_id:'r1',valeur:'235.000000',releve_le:'2026-11-21T16:00:30Z',registre:'INDEX',unite:'KWH',compteur:'DEMO',point:'POINT',precedente:'230.000000',unite_precedente:'KWH',secondes:'30.000000'},
 {id:'b',register_id:'r1',valeur:'230.000000',releve_le:'2026-11-21T16:00:00Z',registre:'INDEX',unite:'KWH',compteur:'DEMO',point:'POINT',precedente:null,unite_precedente:null,secondes:null}
 ]};throw Error('SQL_INATTENDU '+sql.slice(0,80));},release(){}};
 return {queries,obtenirClient:async()=>c};}
test('store projette deux lectures exactes et valide la distance temporelle',async()=>{const db=fakeDb();const s=creerEnergyMeterProximityStore(db);
 const result=await s.releves({...context,offset:0});assert.equal(result.items.length,2);assert.equal(result.items[0].signaux[0].code,'RELEVES_RAPPROCHES_DIFFERENTS');
 assert.equal(result.items[0].intervalleSecondes,30);assert.equal(result.aucunCalculConsommation,true);assert.deepEqual(result.items[1].signaux,[]);
 assert.ok(db.queries.filter(q=>q==='BEGIN READ ONLY').length===1);assert.ok(db.queries.includes('COMMIT'));});
test('store refuse les sites hors droits',async()=>{const db=fakeDb(),orig=db.obtenirClient;
 db.obtenirClient=async()=>{const c=await orig(),f=c.query;c.query=async(q,...a)=>q.includes('FROM energy_inventory_sites s JOIN tenants')?{rows:[]}:f(q,...a);return c;};
 const result=await creerEnergyMeterProximityStore(db).releves({...context});assert.equal(result,null);});
test('store liste les sites privés',async()=>{const s=creerEnergyMeterProximityStore(fakeDb());const d=await s.sites(context);assert.equal(d.sites[0].id,context.siteId);});
function router(){const paths={};return {paths,use(){},get(p,fn){paths[p]=fn}};}
function response(){const r={statusCode:200,data:null,headers:{},status(v){this.statusCode=v;return this},set(k,v){this.headers[k]=v;return this},json(v){this.data=v;return this}};return r;}
const route='/sites/:siteId/signaux';
test('HTTP rejette le client anonyme',async()=>{const r=router();creerEnergyMeterProximityRouter({router:r,listerOrganisations:async()=>[],store:{sites:async()=>({sites:[]}),releves:async()=>null},tenantAutorise:context.tenant});
 const res=response();await r.paths[route]({query:{tenant:context.tenant},params:{siteId:context.siteId}},res);assert.equal(res.statusCode,401);});
test('HTTP refuse tenant étranger',async()=>{const r=router();creerEnergyMeterProximityRouter({router:r,listerOrganisations:async()=>[],store:{sites:async()=>({sites:[]}),releves:async()=>null},tenantAutorise:context.tenant});
 const res=response();await r.paths[route]({auth:{personneId:10},query:{tenant:'AUTRE_TENANT'},params:{siteId:context.siteId}},res);assert.equal(res.statusCode,403);});
test('HTTP refuse site étranger (404)',async()=>{const r=router();creerEnergyMeterProximityRouter({router:r,listerOrganisations:async()=>[{tenant_code:context.tenant}],store:{sites:async()=>({sites:[]}),releves:async()=>null},tenantAutorise:context.tenant});
 const res=response();await r.paths[route]({auth:{personneId:10},query:{tenant:context.tenant},params:{siteId:context.siteId}},res);assert.equal(res.statusCode,404);});
test('HTTP refuse offset illégal',async()=>{const r=router();creerEnergyMeterProximityRouter({router:r,listerOrganisations:async()=>[{tenant_code:context.tenant}],store:{sites:async()=>({sites:[]}),releves:async()=>({})},tenantAutorise:context.tenant});
 const res=response();await r.paths[route]({auth:{personneId:10},query:{tenant:context.tenant,offset:'-1'},params:{siteId:context.siteId}},res);assert.equal(res.statusCode,400);});
test('raccordement 1C3 dans server.js protege et reserve a la recette',()=>{
 const server=load('server.js');
 const start='// E-METER-1C3 — releves rapproches READ ONLY, recette sateer_test uniquement.';
 const next='// SUNU Courant MVP02-C4C — synthese participative READ ONLY.';
 assert.equal(server.split(start).length-1,1,'UNIQUE_BLOC_1C3_REQUIS');
 const from=server.indexOf(start),to=server.indexOf(next,from);
 assert.ok(from>=0&&to>from,'RACCORDEMENT_1C3_NON_BORNE');
 const block=server.slice(from,to);
 for(const guard of [
  /process\.env\.PGDATABASE === 'sateer_test'/,
  /process\.env\.SATEER_ENABLE_ENERGY_MVP01 === '1'/,
  /process\.env\.SATEER_ENABLE_ENERGY_MVP02 === '1'/,
  /process\.env\.SATEER_ENABLE_ENERGY_METER_1A === '1'/,
  /process\.env\.SATEER_ENABLE_ENERGY_METER_1C2 === '1'/,
  /process\.env\.SATEER_ENABLE_ENERGY_METER_1C3 === '1'/,
  /app\.use\('\/api\/energy\/proximite\/v1',exigerSession,creerEnergyMeterProximityRouter\(/,
  /tenantAutorise:process\.env\.SATEER_ENERGY_TENANT_CODE/
 ])assert.match(block,guard);
});

test('syntaxe Node des interfaces et modules 1C3',()=>{for(const rel of ['public/energie-rapproches.js','public/energie-controles.js','energy/energy-meter-proximity-domain.js','energy/energy-meter-proximity-store.js','energy/energy-meter-proximity-http.js'])cp.execFileSync(process.execPath,['--check',path.join(ROOT,rel)]);});
