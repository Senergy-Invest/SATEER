'use strict';
// Recette du relais associatif Bordeaux: tests sans modification métier.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const mode=process.argv[2]||'static';
const TENANT='P6V_3B5AC5AB9DB04657';
const ROUTE='association-communication-router.js';
const UI='public/publication-institutionnelle.js';
const route=fs.readFileSync(ROUTE,'utf8');
const ui=fs.readFileSync(UI,'utf8');
const marker='router.get("/:organisationId/publications/:publicationId/association-relay-authorizations"';
const start=route.indexOf(marker),end=route.indexOf('\nrouter.put(',start);
assert.ok(start>=0 && end>start,'Route GET association introuvable');
const block=route.slice(start,end);
assert.match(block,/\.\.\.exigerPermission\("TARGET_COMMUNICATION", "ORGANISATION"\), scope/,'Permission requise préservée');
assert.match(block,/LEFT JOIN communication_publication_relay_authorizations relay_auth/,'Alias SQL sûr attendu');
assert.doesNotMatch(block,/\bauthorization\./,'Mot réservé PostgreSQL dans la requête');
assert.match(block,/res\.status\(500\)\.json\(\{ statut: "ERREUR_AUTORISATIONS_RELAIS" \}\)/,'Erreurs serveur au format JSON');
assert.match(block,/Cache-Control/, 'Réponse privée non cachée');
assert.match(ui,/const permissionData = await lireJsonRelais\(permissionResponse\)/);
assert.match(ui,/await lireJsonRelais\(update\)/);
console.log('RELAIS_ROUTE_STATIQUE_PASS : permission intacte, alias SQL sûr et réponses JSON.');
const getSQL=()=>{
 const m=block.match(/const result = await executerRequete\(`([\s\S]*?)`, \[organisationId, req\.params\.publicationId, tenantCode\]\);/);
 assert.ok(m,'SQL de la route non reconnu');
 return m[1];
};
const helperSource=ui.match(/async function lireJsonRelais\(response\) \{[\s\S]*?\n\}\n\nasync function chargerPublications/);
assert.ok(helperSource,'Helper UI non trouvé');
const ctx=vm.createContext({});
vm.runInContext(helperSource[0].replace(/\n\nasync function chargerPublications$/,''),ctx);
const helper=ctx.lireJsonRelais;
async function staticCases() {
 const response=(status,type,data,ok=status>=200&&status<300)=>({
   status,ok,headers:{get:()=>type},json:async()=>data
 });
 const valid=await helper(response(200,'application/json; charset=utf-8',{associations:[{association_id:132}]}));
 assert.equal(valid.associations[0].association_id,132);
 await assert.rejects(helper(response(500,'text/html','<html/>',false)),/non JSON \(HTTP 500\)/);
 await assert.rejects(helper(response(403,'application/json',{statut:'ACCES_REFUSE'},false)),/permission TARGET_COMMUNICATION/);
 await assert.rejects(helper(response(500,'application/json',{statut:'ERREUR_AUTORISATIONS_RELAIS'},false)),/ERREUR_AUTORISATIONS_RELAIS/);
 await assert.rejects(helper({status:200,ok:true,headers:{get:()=> 'application/json'},json:async()=>{throw Error('bad JSON')}}),/JSON invalide/);
 console.log('RELAIS_UI_CAS_PASS : 5/5 (JSON valide, HTML 500, 403, JSON 500, JSON cassé).');
}
async function databaseCase(){
 const {Pool}=require('pg');
 const pool=new Pool({database:'sateer_test',host:'::1',port:5432,user:process.env.PGUSER||process.env.USER,
  ...(process.env.PGPASSWORD?{password:process.env.PGPASSWORD}:{})});
 let client;
 try {
   client=await pool.connect();
   const guard=await client.query('SELECT current_database() AS db,(SELECT system_identifier::text FROM pg_control_system()) AS sys');
   assert.equal(guard.rows[0]?.db,'sateer_test','Refus: mauvaise base');
   assert.equal(guard.rows[0]?.sys,'7699611241381229531','Refus: mauvaise instance PostgreSQL');
   await client.query('BEGIN TRANSACTION READ ONLY');
   const org=await client.query(`SELECT t.type,t.code FROM organisations o JOIN tenants t ON t.id=o.tenant_id WHERE o.id=$1`,[70]);
   assert.equal(org.rowCount,1,'Consulat recette absent');
   assert.equal(org.rows[0].code,TENANT,'Tenant différent');
   assert.equal(org.rows[0].type,'TEST_SYNTHETIQUE','Refus : ce tenant n’est pas synthétique');
   const rows=await client.query(getSQL(),[70,57,TENANT]);
   assert.ok(rows.rows.some(x=>Number(x.association_id)===132),'Association 132 non renvoyée pour publication 57');
   assert.equal(typeof rows.rows.find(x=>Number(x.association_id)===132).relay_authorized,'boolean');
   console.log('RELAIS_SQL_READONLY_PASS : publication #57, association #132, état autorisation obtenu; 0 écriture.');
   await client.query('ROLLBACK');
 } finally {
   if (client) {try {await client.query('ROLLBACK')}catch(_){} client.release()}
   await pool.end();
 }
}
async function httpCase(){
 const origin='http://127.0.0.1:3200';
 const r=await fetch(`${origin}/api/organisations/70/publications/57/association-relay-authorizations?tenant=${encodeURIComponent(TENANT)}`, {redirect:'manual'});
 const type=r.headers.get('content-type')||'';
 assert.equal(r.status,401,'L’API doit refuser une requête non authentifiée');
 assert.match(type,/application\/json/,'La route doit répondre en JSON');
 const obj=await r.json(); assert.ok(obj.statut,'Erreur d’API structurée attendue');
 console.log('RELAIS_HTTP_PUBLIC_PASS : 401/json anonyme (route présente, accès préservé).');
}
(async()=>{
 if(mode==='static') await staticCases();
 else if(mode==='database') await databaseCase();
 else if(mode==='http') await httpCase();
 else throw new Error('Mode inconnu '+mode);
})().catch(err=>{console.error('STOP_RELAIS_TEST :',err.message);process.exitCode=1});
