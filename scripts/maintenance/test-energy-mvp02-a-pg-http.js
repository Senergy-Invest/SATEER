'use strict';
/** MVP02-A : HTTP avec identités de harnais + vrai PostgreSQL TEMP TABLES et ROLLBACK.
 * Ne prouve PAS une nouvelle authentification Core; MVP01-C l'avait testée.
 * Ne modifie aucune table persistante, ne crée aucun compte permanent. */
const assert=require('node:assert/strict');const crypto=require('node:crypto');const fs=require('node:fs');const path=require('node:path');
const ROOT=path.resolve(__dirname,'../..');
const {Client}=require(path.join(ROOT,'node_modules/pg'));
const express=require(path.join(ROOT,'node_modules/express'));
const {creerEnergyInventoryStore}=require(path.join(ROOT,'energy/energy-inventory-store'));
const {creerEnergyInventoryRouter}=require(path.join(ROOT,'energy/energy-inventory-http'));
const DB='sateer_test',CLUSTER='7699611241381229531',TENANT='ENERGY_MVP02A_ROLLBACK',A=917701,B=917702;
const CASE_A=crypto.randomUUID(),CASE_A2=crypto.randomUUID(),CASE_B=crypto.randomUUID();
const SECRET_A=crypto.randomUUID(),SECRET_B=crypto.randomUUID();
let tests=0;const ok=txt=>{tests++;console.log('PASS '+String(tests).padStart(2,'0')+' '+txt);};
async function main(){
 if(process.env.PGDATABASE!==DB||process.env.PGHOST!=='::1'||process.env.PGPORT!=='5432'||process.env.NODE_ENV!=='development')
  throw Error('PG_ENV_RECETTE_EXPLICITE_REQUISE');
 const client=new Client({host:'::1',port:5432,database:DB,user:process.env.PGUSER||process.env.USER,
  ...(process.env.PGPASSWORD?{password:process.env.PGPASSWORD}:{}),application_name:'sateer_energy_mvp02a_rollback',connectionTimeoutMillis:5000,statement_timeout:15000,query_timeout:20000});
 let trx=false,server=null;try{
  await client.connect();
  const pin=(await client.query('SELECT current_database() AS db,(SELECT system_identifier::text FROM pg_control_system()) AS cluster')).rows[0];
  assert.equal(pin.db,DB);assert.equal(String(pin.cluster),CLUSTER);ok('Base sateer_test et cluster PostgreSQL exacts');
  const before=(await client.query("SELECT to_regclass('public.energy_inventory_sites')::text AS s,to_regclass('public.energy_inventory_zones')::text AS z,to_regclass('public.energy_inventory_equipements')::text AS e,to_regclass('public.energy_inventory_events')::text AS h")).rows[0];
  await client.query('BEGIN');trx=true;await client.query('SET LOCAL search_path TO pg_temp,public');
  await client.query('CREATE TEMP TABLE tenants(id INTEGER PRIMARY KEY,code VARCHAR(50) UNIQUE,actif BOOLEAN) ON COMMIT DROP');
  await client.query('CREATE TEMP TABLE personnes(id INTEGER PRIMARY KEY) ON COMMIT DROP');
  await client.query(`CREATE TEMP TABLE energy_cases(id BIGSERIAL PRIMARY KEY,public_id UUID UNIQUE NOT NULL,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),owner_personne_id INTEGER NOT NULL REFERENCES personnes(id),
    nom_site VARCHAR(120) NOT NULL,pays CHAR(2) NOT NULL,type_site VARCHAR(30) NOT NULL) ON COMMIT DROP`);
  await client.query('CREATE TEMP TABLE mvp02_membership(personne_id INTEGER,tenant_code VARCHAR(50),PRIMARY KEY(personne_id,tenant_code)) ON COMMIT DROP');
  await client.query('INSERT INTO tenants VALUES (9177,$1,TRUE)',[TENANT]);await client.query('INSERT INTO personnes VALUES($1),($2)',[A,B]);
  await client.query('INSERT INTO mvp02_membership VALUES($1,$3),($2,$3)',[A,B,TENANT]);
  await client.query("INSERT INTO energy_cases(public_id,tenant_id,owner_personne_id,nom_site,pays,type_site) VALUES ($1,9177,$4,'Maison A','SN','LOGEMENT'),($2,9177,$4,'Atelier A','SN','INDUSTRIE'),($3,9177,$5,'Maison B','SN','LOGEMENT')",[CASE_A,CASE_A2,CASE_B,A,B]);
  const source=fs.readFileSync(path.join(ROOT,'database/051_energy_inventory.sql'),'utf8');
  const temporary=source.replace(/^\s*(?:BEGIN|COMMIT);\s*$/gmi,'').replace(/CREATE TABLE IF NOT EXISTS/gi,'CREATE TEMP TABLE IF NOT EXISTS');
  assert.doesNotMatch(temporary,/\b(?:BEGIN|COMMIT);/i);
  await client.query(temporary);
  const location=(await client.query("SELECT n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relname='energy_inventory_sites' ORDER BY CASE WHEN n.nspname LIKE 'pg_temp_%' THEN 0 ELSE 1 END LIMIT 1")).rows[0];
  assert.match(location.nspname,/^pg_temp_/);ok('Migration 051 appliquée exclusivement aux tables temporaires');
  let savepoint=false;
  function testClient(){return {async query(sql,params){
    if(sql==='BEGIN'){assert.equal(savepoint,false);await client.query('SAVEPOINT inventory_savepoint');savepoint=true;return {rows:[]};}
    if(sql==='COMMIT'){assert.equal(savepoint,true);await client.query('RELEASE SAVEPOINT inventory_savepoint');savepoint=false;return {rows:[]};}
    if(sql==='ROLLBACK'){assert.equal(savepoint,true);await client.query('ROLLBACK TO SAVEPOINT inventory_savepoint');await client.query('RELEASE SAVEPOINT inventory_savepoint');savepoint=false;return {rows:[]};}
    return client.query(sql,params);
   },release(){}};}
  const store=creerEnergyInventoryStore({obtenirClient:async()=>testClient()});
  const origin='http://localhost:3472';const app=express();app.use(express.json());
  app.use((req,_res,next)=>{const token=req.get('X-Recette-Session');if(token===SECRET_A)req.auth={personneId:A};if(token===SECRET_B)req.auth={personneId:B};next();});
  app.use('/api/energy/inventory',creerEnergyInventoryRouter({router:express.Router(),store,
   listerOrganisations:async(person,tenant)=>(await client.query('SELECT tenant_code FROM mvp02_membership WHERE personne_id=$1 AND tenant_code=$2',[person,tenant])).rows,
   origineAutorisee:origin,tenantAutorise:TENANT}));
  server=await new Promise((resolve,reject)=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));s.once('error',reject);});
  const base='http://127.0.0.1:'+server.address().port;
  async function send(method,part,{as='A',body,key=crypto.randomUUID(),tenant=TENANT,requestOrigin=origin}={}){
   const headers={Accept:'application/json',Origin:requestOrigin};
   if(as==='A')headers['X-Recette-Session']=SECRET_A;if(as==='B')headers['X-Recette-Session']=SECRET_B;
   if(body)headers['Content-Type']='application/json';if(key)headers['Idempotency-Key']=key;
   const response=await fetch(base+'/api/energy/inventory'+part+(part.includes('?')?'&':'?')+'tenant='+encodeURIComponent(tenant),{
    method,headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});
   const data=await response.json();return {status:response.status,data};
  }
  const anon=await send('GET','/sites',{as:'none'});assert.equal(anon.status,401);ok('Requête anonyme refusée');
  const other=await send('GET','/sites',{tenant:'AMBVIS_96C7FBBEA383DD'});assert.equal(other.status,403);ok('Tenant institutionnel refusé');
  const foreign=await send('POST','/sites',{body:{energyCaseId:CASE_B}});assert.equal(foreign.status,404);ok('Dossier B interdit au propriétaire A');
  const created=await send('POST','/sites',{body:{energyCaseId:CASE_A}});assert.equal(created.status,201);const SITE=created.data.site.id;ok('Création du site A depuis son dossier EnergyCase');
  const retry=await send('POST','/sites',{body:{energyCaseId:CASE_A}});assert.equal(retry.status,200);assert.equal(retry.data.site.id,SITE);ok('Recréation du site idempotente');
  const site2=await send('POST','/sites',{body:{energyCaseId:CASE_A2}});assert.equal(site2.status,201);const SITE2=site2.data.site.id;ok('Deuxième dossier A : site distinct');
  const badLook=await send('GET','/sites/'+SITE,{as:'B'});assert.equal(badLook.status,404);ok('Le compte B ne peut pas ouvrir le site A');
  const key=crypto.randomUUID(),bat={typeZone:'BATIMENT',nom:'Bâtiment test',parentId:null};
  const building=await send('POST','/sites/'+SITE+'/zones',{body:bat,key});assert.equal(building.status,201);const BAT=building.data.id;ok('Création bâtiment déclaratif');
  const same=await send('POST','/sites/'+SITE+'/zones',{body:bat,key});assert.equal(same.status,200);assert.equal(same.data.id,BAT);ok('Retry zone idempotent');
  const conflict=await send('POST','/sites/'+SITE+'/zones',{body:{...bat,nom:'Autre'},key});assert.equal(conflict.status,409);ok('Réutilisation de clé pour autre contenu refusée');
  const floor=await send('POST','/sites/'+SITE+'/zones',{body:{typeZone:'ETAGE',nom:'Étage 1',parentId:BAT}});assert.equal(floor.status,201);ok('Étage rattaché à son bâtiment');
  const invalid=await send('POST','/sites/'+SITE2+'/zones',{body:{typeZone:'PIECE',nom:'Pièce étrangère',parentId:BAT}});assert.equal(invalid.status,409);ok('Référence parent provenant d’un autre site refusée');
  const wrongType=await send('POST','/sites/'+SITE+'/zones',{body:{typeZone:'ETAGE',nom:'Étage sous étage',parentId:floor.data.id}});assert.equal(wrongType.status,409);ok('Hiérarchie incohérente refusée');
  const item={zoneId:BAT,nom:'Pompe',famille:'POMPAGE',quantite:2,puissanceUnitaireW:450};const eqKey=crypto.randomUUID();
  const eq=await send('POST','/sites/'+SITE+'/equipements',{body:item,key:eqKey});assert.equal(eq.status,201);ok('Équipement déclaré avec quantité et puissance');
  const eqAgain=await send('POST','/sites/'+SITE+'/equipements',{body:item,key:eqKey});assert.equal(eqAgain.status,200);assert.equal(eqAgain.data.id,eq.data.id);ok('Retry équipement idempotent');
  const wrongZone=await send('POST','/sites/'+SITE2+'/equipements',{body:item});assert.equal(wrongZone.status,409);ok('Équipement lié à une zone d’un autre site refusé');
  const listB=await send('GET','/sites',{as:'B'});assert.equal(listB.status,200);assert.equal(listB.data.sites.length,0);ok('Liste B vide : isolation propriétaire');
  const detail=await send('GET','/sites/'+SITE);assert.equal(detail.status,200);
  assert.equal(detail.data.zones.length,2);assert.equal(detail.data.equipements.length,1);assert.equal(detail.data.equipements[0].provenance,'DECLAREE');ok('Inventaire A chargé, mesures explicitement déclarées');
  const counts=(await client.query('SELECT (SELECT count(*)::int FROM energy_inventory_sites) AS sites,(SELECT count(*)::int FROM energy_inventory_zones) AS zones,(SELECT count(*)::int FROM energy_inventory_equipements) AS e,(SELECT count(*)::int FROM energy_inventory_events) AS events')).rows[0];
  assert.deepEqual(counts,{sites:2,zones:2,e:1,events:5});ok('Un seul événement par création et historique transactionnel');
  await new Promise(resolve=>server.close(()=>resolve()));server=null;
  await client.query('ROLLBACK');trx=false;
  const after=(await client.query("SELECT to_regclass('public.energy_inventory_sites')::text AS s,to_regclass('public.energy_inventory_zones')::text AS z,to_regclass('public.energy_inventory_equipements')::text AS e,to_regclass('public.energy_inventory_events')::text AS h")).rows[0];
  assert.deepEqual(after,before);ok('ROLLBACK sans modification des tables publiques');
  console.log('ENERGY_MVP02_A_PG_HTTP_ROLLBACK_PASS='+tests);
  console.log('LIMITATION=identités HTTP simulées dans ce harnais; aucune migration permanente appliquée');
 }finally{
  if(server)await new Promise(resolve=>server.close(()=>resolve())).catch(()=>{});
  if(trx)await client.query('ROLLBACK').catch(()=>{});
  await client.end().catch(()=>{});
 }
}
main().catch(e=>{console.error('ENERGY_MVP02_A_INTEGRATION_FAIL='+String(e.message||e));process.exitCode=1;});
