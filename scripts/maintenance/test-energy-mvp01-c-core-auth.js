"use strict";
/**
 * SUNU Courant MVP01-C: genuine SATEER Core HTTP login + HttpOnly cookie,
 * session lookup, and Energy SQL queries, all on ONE PostgreSQL connection in
 * ONE rollback transaction using temporary shadow tables.
 * No real user credentials, real account mutation, or persistent migration.
 * The monkey-patch of the database adapter is test-harness-only. NEVER mount
 * this file in server.js or allow it in production execution.
 */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const {Client} = require(path.join(ROOT, 'node_modules/pg'));
const express = require(path.join(ROOT, 'node_modules/express'));
const EXPECTED_DB = 'sateer_test';
const EXPECTED_CLUSTER = '7699611241381229531';
const TENANT = 'ENERGY_MVP01C_RECETTE';
const TEST_ORIGIN = 'http://localhost:37992';
const ownerIds = [917801, 917802, 917803];
const body = {tenantCode:TENANT, profil:'PARTICULIER', typeSite:'LOGEMENT', nomSite:'Logement fictif C', pays:'SN', alimentation:'SANS_ALIMENTATION', compteur:'NON', besoins:['CONFORT','EFFICACITE'], description:'Donnees fictives de recette', consentement:true};
let count = 0;
const pass = name => console.log('PASS '+String(++count).padStart(2,'0')+' '+name);

async function main() {
  assert.notEqual(process.env.NODE_ENV, 'production', 'RECETTE_INTERDITE_EN_PRODUCTION');
  assert.equal(process.env.PGDATABASE, EXPECTED_DB, 'PGDATABASE_RECETTE_OBLIGATOIRE');
  assert.equal(process.env.SATEER_PUBLIC_ORIGIN, TEST_ORIGIN, 'ORIGINE_RECETTE_OBLIGATOIRE');
  let server=null, inTransaction=false;
  const client = new Client({host:'::1',port:5432,database:EXPECTED_DB,connectionTimeoutMillis:5000,statement_timeout:12000,query_timeout:15000,application_name:'sateer_energy_mvp01c_core_rollback'});
  const after0 = async()=> (await client.query("SELECT to_regclass('public.energy_cases')::text AS cases,to_regclass('public.energy_case_events')::text AS events")).rows[0];
  try {
    await client.connect();
    const pin=(await client.query('SELECT current_database() AS db,(SELECT system_identifier::text FROM pg_control_system()) AS cluster')).rows[0];
    assert.equal(pin.db,EXPECTED_DB);assert.equal(String(pin.cluster),EXPECTED_CLUSTER);
    pass('Base de recette et identifiant cluster verifiés');
    const baseline = await after0();
    await client.query('BEGIN');inTransaction=true;
    await client.query('SET LOCAL search_path TO pg_temp,public');
    await client.query('CREATE TEMP TABLE tenants(id INTEGER PRIMARY KEY,code VARCHAR(50) UNIQUE NOT NULL,actif BOOLEAN NOT NULL) ON COMMIT DROP');
    await client.query('CREATE TEMP TABLE personnes(id INTEGER PRIMARY KEY,prenom TEXT NOT NULL,nom TEXT NOT NULL) ON COMMIT DROP');
    await client.query('CREATE TEMP TABLE organisations(id INTEGER PRIMARY KEY,nom TEXT NOT NULL,type TEXT NOT NULL,tenant_id INTEGER NOT NULL) ON COMMIT DROP');
    await client.query('CREATE TEMP TABLE relations_personne_organisation(personne_id INTEGER NOT NULL,organisation_id INTEGER NOT NULL) ON COMMIT DROP');
    await client.query('CREATE TEMP TABLE auth_accounts(id BIGSERIAL PRIMARY KEY,personne_id INTEGER NOT NULL,identifiant TEXT NOT NULL,mot_de_passe_hash TEXT NOT NULL,actif BOOLEAN NOT NULL DEFAULT TRUE,tentatives_echouees INTEGER NOT NULL DEFAULT 0,verrouille_jusqua TIMESTAMPTZ,derniere_connexion TIMESTAMPTZ,date_modification TIMESTAMPTZ DEFAULT NOW()) ON COMMIT DROP');
    await client.query('CREATE TEMP TABLE auth_sessions(id BIGSERIAL PRIMARY KEY,compte_id BIGINT NOT NULL,empreinte_jeton TEXT NOT NULL,date_expiration TIMESTAMPTZ NOT NULL,date_revocation TIMESTAMPTZ,date_derniere_utilisation TIMESTAMPTZ) ON COMMIT DROP');
    await client.query('INSERT INTO tenants(id,code,actif) VALUES(9178,$1,TRUE)',[TENANT]);
    await client.query('INSERT INTO personnes(id,prenom,nom) VALUES($1,\'Recette\',\'A\'),($2,\'Recette\',\'B\'),($3,\'Recette\',\'C\')',ownerIds);
    await client.query("INSERT INTO organisations(id,nom,type,tenant_id) VALUES(9178,'SATEER Energie fictive','SATEER',9178)");
    await client.query('INSERT INTO relations_personne_organisation(personne_id,organisation_id) VALUES($1,9178),($2,9178)',ownerIds.slice(0,2));
    const migration = fs.readFileSync(path.join(ROOT,'database/050_energy_cases.sql'),'utf8');
    assert.match(migration,/CREATE TABLE IF NOT EXISTS energy_cases/);
    const tempMigration=migration.replace(/^\s*(?:BEGIN|COMMIT);\s*$/gmi,'').replace(/CREATE TABLE IF NOT EXISTS/gi,'CREATE TEMP TABLE IF NOT EXISTS');
    assert.doesNotMatch(tempMigration,/\b(?:BEGIN|COMMIT);/i);
    await client.query(tempMigration);
    pass('Tables et identites fictives temporaires, migration 050 temporaire');

    // Real Core password service and real auth HTTP/database logic.
    // All database operations in this process use the pinned temp transaction.
    const db=require(path.join(ROOT,'database.js'));
    db.executerRequete=(sql,params=[])=>client.query(sql,params);
    const {hacherMotDePasse} = require(path.join(ROOT,'auth-passwords.js'));
    const {authRouter,exigerSession} = require(path.join(ROOT,'auth-http.js'));
    const {listerOrganisationsPersonneDatabase} = require(path.join(ROOT,'services-database.js'));
    const {creerEnergyCaseRouter} = require(path.join(ROOT,'energy/energy-case-http.js'));
    const {creerEnergyCaseStore} = require(path.join(ROOT,'energy/energy-case-store.js'));
    const credentials=[];
    for (let i=0;i<3;i++) {
      const identifiant='mvp01c.'+crypto.randomBytes(8).toString('hex')+'.'+i+'@sateer.test';
      const motDePasse=crypto.randomBytes(24).toString('base64url');
      const hash=await hacherMotDePasse(motDePasse);
      await client.query('INSERT INTO auth_accounts(personne_id,identifiant,mot_de_passe_hash) VALUES($1,$2,$3)',[ownerIds[i],identifiant,hash]);
      credentials.push({identifiant,motDePasse});
    }
    pass('Comptes fictifs temporaires avec hash scrypt Core');

    // The Energy store uses savepoints only for the duration of its own writes.
    let savepoint=false;
    const boundClient={
      async query(sql,params){
        if(sql==='BEGIN'){assert.equal(savepoint,false);await client.query('SAVEPOINT energy_mvp01c_store');savepoint=true;return {rows:[]};}
        if(sql==='COMMIT'){assert.equal(savepoint,true);await client.query('RELEASE SAVEPOINT energy_mvp01c_store');savepoint=false;return {rows:[]};}
        if(sql==='ROLLBACK'){assert.equal(savepoint,true);await client.query('ROLLBACK TO SAVEPOINT energy_mvp01c_store');await client.query('RELEASE SAVEPOINT energy_mvp01c_store');savepoint=false;return {rows:[]};}
        return client.query(sql,params);
      },release(){}
    };
    const store=creerEnergyCaseStore({obtenirClient:async()=>boundClient});
    const app=express();app.disable('x-powered-by');app.use(express.json({limit:'50kb'}));
    app.use('/api/auth',authRouter);
    app.use('/api/energy',exigerSession,creerEnergyCaseRouter({router:express.Router(),listerOrganisations:listerOrganisationsPersonneDatabase,store,origineAutorisee:TEST_ORIGIN,tenantAutorise:TENANT}));
    server=await new Promise((resolve,reject)=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));s.once('error',reject);});
    const base='http://127.0.0.1:'+server.address().port;
    async function send(method,url,{cookie,json,key,origin=TEST_ORIGIN}={}) {
      const headers={Accept:'application/json'};
      if(cookie)headers.Cookie=cookie;
      if(json!==undefined)headers['Content-Type']='application/json';
      if(key)headers['Idempotency-Key']=key;
      if(origin)headers.Origin=origin;
      const response=await fetch(base+url,{method,headers,body:json===undefined?undefined:JSON.stringify(json),signal:AbortSignal.timeout(8000)});
      return {code:response.status,data:await response.json(),headers:response.headers};
    }
    const scope='?tenant='+TENANT;
    const anonymous=await send('GET','/api/energy/cases'+scope);
    assert.equal(anonymous.code,401);pass('Sans session Core : 401');
    const badOriginLogin=await send('POST','/api/auth/login',{json:credentials[0],origin:'https://untrusted.example'});
    assert.equal(badOriginLogin.code,403);pass('Login avec Origin incorrecte : 403');
    const cookies=[];
    for(let i=0;i<3;i++) {
      const login=await send('POST','/api/auth/login',{json:credentials[i]});
      assert.equal(login.code,200,'login '+i);
      const setCookie=login.headers.get('set-cookie')||'';
      assert.match(setCookie,/^sateer_session=[^;]+;/);
      assert.match(setCookie,/httponly/i);assert.match(setCookie,/samesite=strict/i);
      assert.match(setCookie,/path=\/api/i);
      const cookie=setCookie.split(';')[0];cookies.push(cookie);
      const me=await send('GET','/api/auth/me',{cookie});
      assert.equal(me.code,200);assert.equal(Number(me.data.personne.id),ownerIds[i]);
    }
    pass('Trois vrais logins Core, cookies HttpOnly et /api/auth/me');
    const spoof=await send('GET','/api/energy/cases'+scope,{cookie:'sateer_session=forged'});
    assert.equal(spoof.code,401);pass('Jeton de session forge refuse');
    const listA=await send('GET','/api/energy/cases'+scope,{cookie:cookies[0]});
    assert.equal(listA.code,200);assert.equal(listA.data.cases.length,0);
    pass('Utilisateur A rattache peut lister ses dossiers');
    const listC=await send('GET','/api/energy/cases'+scope,{cookie:cookies[2]});
    assert.equal(listC.code,403);pass('Utilisateur C sans rattachement interdit');
    const wrongTenant=await send('GET','/api/energy/cases?tenant=AMBVIS_96C7FBBEA383DD',{cookie:cookies[0]});
    assert.equal(wrongTenant.code,403);pass('Tenant institutionnel interdit');
    const wrongOrigin=await send('POST','/api/energy/cases'+scope,{cookie:cookies[0],json:body,key:crypto.randomUUID(),origin:'https://untrusted.example'});
    assert.equal(wrongOrigin.code,403);pass('Creation avec Origin non valide refusee');
    const injection=await send('POST','/api/energy/cases'+scope,{cookie:cookies[0],json:{...body,personneId:ownerIds[1]},key:crypto.randomUUID()});
    assert.equal(injection.code,400);pass('Usurpation identite dans body refusee');
    const key=crypto.randomUUID();
    const created=await send('POST','/api/energy/cases'+scope,{cookie:cookies[0],json:body,key});
    assert.equal(created.code,201);assert.match(created.data.id,/^[0-9a-f-]{36}$/i);
    pass('Vrai cookie Core + creation EnergyCase SQL');
    const retry=await send('POST','/api/energy/cases'+scope,{cookie:cookies[0],json:body,key});
    assert.equal(retry.code,200);assert.equal(retry.data.id,created.data.id);
    pass('Rejeu idempotent avec vrai login');
    const conflict=await send('POST','/api/energy/cases'+scope,{cookie:cookies[0],json:{...body,nomSite:'Autre site fictif'},key});
    assert.equal(conflict.code,409);pass('Cle de creation rejouee avec donnees differentes refusee');
    const detailA=await send('GET','/api/energy/cases/'+created.data.id+scope,{cookie:cookies[0]});
    assert.equal(detailA.code,200);assert.equal(detailA.data.energyCase.id,created.data.id);
    const detailB=await send('GET','/api/energy/cases/'+created.data.id+scope,{cookie:cookies[1]});
    assert.equal(detailB.code,404);pass('Detail prive A visible A, invisible B');
    const listB=await send('GET','/api/energy/cases'+scope,{cookie:cookies[1]});
    assert.equal(listB.code,200);assert.equal(listB.data.cases.length,0);
    pass('Liste privee B ne contient pas dossier A');
    const counts=(await client.query('SELECT (SELECT COUNT(*)::int FROM energy_cases) AS cases,(SELECT COUNT(*)::int FROM energy_case_events) AS events')).rows[0];
    assert.deepEqual(counts,{cases:1,events:1});pass('Dossier et evenement creats une seule fois');
    const out=await send('POST','/api/auth/logout',{cookie:cookies[0]});
    assert.equal(out.code,200);
    const revoked=await send('GET','/api/energy/cases'+scope,{cookie:cookies[0]});
    assert.equal(revoked.code,401);pass('Deconnexion Core invalide le cookie');
    await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));server=null;
    await client.query('ROLLBACK');inTransaction=false;
    assert.deepEqual(await after0(),baseline);pass('Rollback et schema public inchanges');
    console.log('ENERGY_MVP01_C_CORE_AUTH_ROLLBACK_PASS='+count);
    console.log('AUTH_CORE_REELLE=OUI_DANS_HARNAIS_TEMPORAIRE');
    console.log('AUTH_PRODUCTION_OU_SESSION_PERSISTANTE=NON_TESTEE');
    console.log('MIGRATION_PERMANENTE=NON');
  } finally {
    if(server)await new Promise(r=>server.close(()=>r())).catch(()=>{});
    if(inTransaction)await client.query('ROLLBACK').catch(()=>{});
    await client.end().catch(()=>{});
  }
}
main().catch(err=>{console.error('ENERGY_MVP01_C_ECHEC='+String(err&&err.message||err));process.exitCode=1;});
