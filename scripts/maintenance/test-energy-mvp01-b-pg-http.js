"use strict";
/**
 * SUNU Courant MVP01-B : integration HTTP / PostgreSQL with ROLLBACK.
 * No test account, persistent tenant or table is created.
 * NOTE: header X-Recette-Session is a fixture-only substitute; this does NOT
 * establish real Core login/session integration. Never mount this in server.js.
 */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const { Client } = require(path.join(ROOT, 'node_modules/pg'));
const express = require(path.join(ROOT, 'node_modules/express'));
const { creerEnergyCaseRouter } = require(path.join(ROOT, 'energy/energy-case-http'));
const { creerEnergyCaseStore } = require(path.join(ROOT, 'energy/energy-case-store'));
const EXPECTED_DB='sateer_test';
const EXPECTED_CLUSTER='7699611241381229531';
const T='ENERGY_MVP01B_RECETTE';
const OWNER_A=916701;
const OWNER_B=916702;
const OWNER_NO_MEMBERSHIP=916703;
const tokenA=crypto.randomUUID(), tokenB=crypto.randomUUID(), tokenC=crypto.randomUUID();
const baseInput={tenantCode:T,profil:'PARTICULIER',typeSite:'LOGEMENT',nomSite:'Logement de recette fictif',pays:'SN',alimentation:'SANS_ALIMENTATION',compteur:'NON',besoins:['CONFORT','EFFICACITE'],description:'Fixture technique, aucune donnée réelle',consentement:true};
let testCount=0;
function ok(name){testCount++; console.log('PASS '+String(testCount).padStart(2,'0')+' '+name);}
async function main(){
 const client=new Client({host:'::1',port:5432,database:EXPECTED_DB,connectionTimeoutMillis:5000,statement_timeout:10000,query_timeout:12000,application_name:'sateer_energy_mvp01b_rollback'});
 let server=null,transaction=false;
 try {
  await client.connect();
  const {rows:pin}=await client.query('SELECT current_database() AS db, (SELECT system_identifier::text FROM pg_control_system()) AS cluster');
  assert.equal(pin.length,1);
  assert.equal(pin[0].db,EXPECTED_DB);
  assert.equal(String(pin[0].cluster),EXPECTED_CLUSTER);
  ok('Instance PostgreSQL de recette epinglee');
  const {rows:before}=await client.query("SELECT to_regclass('public.energy_cases')::text AS cases, to_regclass('public.energy_case_events')::text AS events");
  await client.query('BEGIN'); transaction=true;
  await client.query('SET LOCAL search_path TO pg_temp, public');
  // Temporary shadows of Core identity tables, so no Core fixture is mutated.
  await client.query('CREATE TEMP TABLE tenants (id INTEGER PRIMARY KEY, code VARCHAR(50) UNIQUE NOT NULL, actif BOOLEAN NOT NULL) ON COMMIT DROP');
  await client.query('CREATE TEMP TABLE personnes (id INTEGER PRIMARY KEY) ON COMMIT DROP');
  await client.query('CREATE TEMP TABLE test_energy_membership (personne_id INTEGER NOT NULL, tenant_code VARCHAR(50) NOT NULL, PRIMARY KEY(personne_id,tenant_code)) ON COMMIT DROP');
  await client.query('INSERT INTO tenants(id,code,actif) VALUES(9167,$1,TRUE)',[T]);
  await client.query('INSERT INTO personnes(id) VALUES ($1),($2),($3)',[OWNER_A,OWNER_B,OWNER_NO_MEMBERSHIP]);
  await client.query('INSERT INTO test_energy_membership(personne_id,tenant_code) VALUES($1,$3),($2,$3)',[OWNER_A,OWNER_B,T]);
  // Apply the EXACT domain migration to temporary tables, not public.
  const source=fs.readFileSync(path.join(ROOT,'database/050_energy_cases.sql'),'utf8');
  assert.match(source,/CREATE TABLE IF NOT EXISTS energy_cases/);
  assert.match(source,/CREATE TABLE IF NOT EXISTS energy_case_events/);
  const temporaryMigration=source.replace(/^\s*(?:BEGIN|COMMIT);\s*$/gmi,'').replace(/CREATE TABLE IF NOT EXISTS/gi,'CREATE TEMP TABLE IF NOT EXISTS');
  assert.doesNotMatch(temporaryMigration,/\b(?:BEGIN|COMMIT);/i);
  await client.query(temporaryMigration);
  const {rows:location}=await client.query("SELECT n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relname='energy_cases' ORDER BY CASE WHEN n.nspname LIKE 'pg_temp_%' THEN 0 ELSE 1 END LIMIT 1");
  assert.match(location[0]?.nspname||'',/^pg_temp_/);
  ok('Migration 050 verifiee sur tables temporaires uniquement');
  let savepoint=false;
  function testClient(){return {
    async query(sql,params){
      if(sql==='BEGIN') { assert.equal(savepoint,false); await client.query('SAVEPOINT energy_mvp01_store');savepoint=true;return {rows:[]}; }
      if(sql==='COMMIT') { assert.equal(savepoint,true);await client.query('RELEASE SAVEPOINT energy_mvp01_store');savepoint=false;return {rows:[]}; }
      if(sql==='ROLLBACK') { assert.equal(savepoint,true);await client.query('ROLLBACK TO SAVEPOINT energy_mvp01_store');await client.query('RELEASE SAVEPOINT energy_mvp01_store');savepoint=false;return {rows:[]}; }
      return client.query(sql,params);
    },
    release(){/* The outer transaction owns the only PostgreSQL connection. */}
  };}
  const store=creerEnergyCaseStore({obtenirClient:async()=>testClient()});
  const listerOrganisations=async (personneId,tenant)=>{
    const r=await client.query('SELECT tenant_code FROM test_energy_membership WHERE personne_id=$1 AND tenant_code=$2',[personneId,tenant]);
    return r.rows;
  };
  // Use a fixed logical test origin; no outside requests are made.
  const TEST_ORIGIN='http://localhost:37991';
  const app2=express();app2.disable('x-powered-by');app2.use(express.json({limit:'50kb'}));
  app2.use((req,_res,next)=>{const token=req.get('X-Recette-Session');const owner=token===tokenA?OWNER_A:token===tokenB?OWNER_B:token===tokenC?OWNER_NO_MEMBERSHIP:null;if(owner)req.auth={personneId:owner};next();});
  app2.use('/api/energy',creerEnergyCaseRouter({router:express.Router(),listerOrganisations,store,origineAutorisee:TEST_ORIGIN,tenantAutorise:T}));
  server=await new Promise((resolve,reject)=>{const s=app2.listen(0,'127.0.0.1',()=>resolve(s));s.once('error',reject);});
  const base='http://127.0.0.1:'+server.address().port;
  async function send(method,subpath,{body,key,token,origin=TEST_ORIGIN}={}){
    const headers={'Accept':'application/json'};
    if(body){headers['Content-Type']='application/json';}
    if(key)headers['Idempotency-Key']=key;
    if(token)headers['X-Recette-Session']=token;
    if(origin)headers.Origin=origin;
    const resp=await fetch(base+'/api/energy'+subpath,{method,headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(7000)});
    const data=await resp.json();return {status:resp.status,data,headers:resp.headers};
  }
  const s='?tenant='+encodeURIComponent(T);
  const anonymous=await send('GET','/cases'+s);assert.equal(anonymous.status,401);ok('Anonyme refuse (fixture HTTP)');
  const wrongTenant=await send('GET','/cases?tenant=AMBVIS_96C7FBBEA383DD',{token:tokenA});assert.equal(wrongTenant.status,403);ok('Tenant Ambassade refuse');
  const noMembership=await send('GET','/cases'+s,{token:tokenC});assert.equal(noMembership.status,403);ok('Utilisateur hors tenant refuse');
  const wrongOrigin=await send('POST','/cases'+s,{body:baseInput,token:tokenA,key:crypto.randomUUID(),origin:'https://evil.example'});assert.equal(wrongOrigin.status,403);ok('Origine incorrecte refusee');
  const noKey=await send('POST','/cases'+s,{body:baseInput,token:tokenA});assert.equal(noKey.status,400);ok('Cle idempotence obligatoire');
  const badBody=await send('POST','/cases'+s,{body:{...baseInput,personneId:OWNER_B},token:tokenA,key:crypto.randomUUID()});assert.equal(badBody.status,400);ok('Injection identite client refusee');
  const key=crypto.randomUUID();const created=await send('POST','/cases'+s,{body:baseInput,token:tokenA,key});assert.equal(created.status,201);assert.equal(created.data.nouveau,true);assert.match(created.data.id,/^[0-9a-f-]{36}$/i);ok('Creation SQL reelle d un dossier brouillon');
  const replay=await send('POST','/cases'+s,{body:baseInput,token:tokenA,key});assert.equal(replay.status,200);assert.equal(replay.data.id,created.data.id);ok('Retry idempotent : meme dossier');
  const conflict=await send('POST','/cases'+s,{body:{...baseInput,nomSite:'Autre site fictif'},token:tokenA,key});assert.equal(conflict.status,409);ok('Cle reutilisee avec contenu different refusee');
  const listA=await send('GET','/cases'+s,{token:tokenA});assert.equal(listA.status,200);assert.equal(listA.data.cases.length,1);ok('Liste du proprietaire A');
  const listB=await send('GET','/cases'+s,{token:tokenB});assert.equal(listB.status,200);assert.equal(listB.data.cases.length,0);ok('Liste privee du proprietaire B');
  const id=created.data.id;
  const detailA=await send('GET','/cases/'+id+s,{token:tokenA});assert.equal(detailA.status,200);assert.equal(detailA.data.energyCase.id,id);ok('Detail accessible a son proprietaire');
  const detailB=await send('GET','/cases/'+id+s,{token:tokenB});assert.equal(detailB.status,404);ok('Detail refuse a autre proprietaire');
  const badId=await send('GET','/cases/not-a-uuid'+s,{token:tokenA});assert.equal(badId.status,400);ok('Identifiant dossier invalide refuse');
  const {rows:counts}=await client.query('SELECT (SELECT COUNT(*)::int FROM energy_cases) AS cases,(SELECT COUNT(*)::int FROM energy_case_events) AS events');
  assert.equal(counts[0].cases,1);assert.equal(counts[0].events,1);ok('Un dossier et un evenement atomiques');
  await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));server=null;
  await client.query('ROLLBACK');transaction=false;
  const {rows:after}=await client.query("SELECT to_regclass('public.energy_cases')::text AS cases, to_regclass('public.energy_case_events')::text AS events");
  assert.deepEqual(after,before);ok('ROLLBACK : aucune table permanente creee ni modifiee');
  console.log('ENERGY_MVP01_B_PG_HTTP_ROLLBACK_PASS='+testCount);
  console.log('LIMITE=authentification simulee dans le harnais; aucune session Core reelle testee');
 } finally {
  if(server)await new Promise(resolve=>server.close(()=>resolve())).catch(()=>{});
  if(transaction)await client.query('ROLLBACK').catch(()=>{});
  await client.end().catch(()=>{});
 }
}
main().catch(err=>{console.error('ENERGY_MVP01_B_ECHEC='+String(err&&err.message||err));process.exitCode=1;});
