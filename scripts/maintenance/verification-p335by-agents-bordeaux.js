#!/usr/bin/env node
'use strict';
// Vérification PostgreSQL authentique, dans une transaction READ ONLY. Aucune modification.
const fs=require('node:fs'),path=require('node:path');
const ROOT=process.env.SATEER_PROJECT_ROOT||path.join(process.env.HOME||'', 'SATEER');
if(process.env.PGDATABASE!=='sateer_test'||process.env.PGHOST!=='::1'||process.env.PGPORT!=='5432'||process.env.DATABASE_URL||process.env.PGOPTIONS){
 console.error('BLOCAGE_ENVIRONNEMENT_POSTGRES');process.exit(1);
}
const {obtenirClientDatabase,fermerDatabase}=require(path.join(ROOT,'database.js'));
const {obtenirPermissionsEffectivesDatabase}=require(path.join(ROOT,'services-database.js'));
const {candidates}=require(path.join(ROOT,'pilot-case-dispatch-http.js'));
const SYSTEM_ID='7699611241381229531',TENANT='P6V_3B5AC5AB9DB04657';
(async()=>{
 let c,started=false;
 try {
  c=await obtenirClientDatabase();await c.query('BEGIN READ ONLY');started=true;
  await c.query("SET LOCAL statement_timeout='12s'");
  const ctx=(await c.query(`SELECT current_database() AS db, inet_server_addr()::text AS host,
    inet_server_port() AS port,current_setting('transaction_read_only') AS ro,
    (SELECT system_identifier::text FROM pg_control_system()) AS sid`)).rows[0];
  if(ctx.db!=='sateer_test'||!['::1','::1/128'].includes(ctx.host)||ctx.port!==5432||ctx.ro!=='on'||ctx.sid!==SYSTEM_ID)throw Error('INSTANCE_RECETTE_INVALIDE');
  const org=(await c.query(`SELECT t.code FROM organisations o JOIN tenants t ON t.id=o.tenant_id WHERE o.id=70`)).rows[0];
  if(org?.code!==TENANT)throw Error('ORGANISATION_TENANT_INATTENDU');
  const items=await candidates((sql,args)=>c.query(sql,args),obtenirPermissionsEffectivesDatabase,115);
  const ids=items.map(a=>Number(a.personneId));
  console.log('P335BY_ELIGIBILITE_READ_ONLY BUREAU=115 AGENTS_IDS='+ids.join(','));
  if(!ids.includes(327))throw Error('AGENT_327_NON_ELIGIBLE_APRES_CORRECTION');
  if(ids.includes(328))throw Error('AGENT_328_HORS_BUREAU_INCLUS');
  console.log('P335BY_ELIGIBILITE_REELLE_PASS 327=ELIGIBLE 328=EXCLU');
 }catch(e){console.error('P335BY_ELIGIBILITE_REELLE_BLOQUE '+String(e.message||e).slice(0,240));process.exitCode=1;}
 finally{if(c){if(started)await c.query('ROLLBACK').catch(()=>{});c.release();}await fermerDatabase().catch(()=>{});}
})().catch(e=>{console.error('ERREUR_FATALE '+String(e.message||e));process.exitCode=1;});
