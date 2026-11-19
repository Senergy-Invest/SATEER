'use strict';
/* PostgreSQL : applique DDL 056 dans transaction ROLLBACK sur cluster épinglé ;
 aucune mutation durable, aucune création de compte Core. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Client}=require('pg');const uuid=()=>crypto.randomUUID();let count=0;const ok=s=>console.log('PASS '+(++count)+' '+s);
async function run(){
 assert.equal(process.env.PGDATABASE,'sateer_test');assert.equal(process.env.PGHOST,'::1');assert.equal(process.env.PGPORT,'5432');
 const c=new Client();await c.connect();let tx=false;
 try{
  const pin=await c.query('SELECT current_database() db,(SELECT system_identifier::text FROM pg_control_system()) pin');
  assert.equal(pin.rows[0].db,'sateer_test');assert.equal(pin.rows[0].pin,'7699611241381229531');ok('Base et cluster de recette epingles');
  await c.query('BEGIN');tx=true;
  let ddl=fs.readFileSync(path.join(__dirname,'../../database/056_energy_scope_collection.sql'),'utf8');
  ddl=ddl.replace(/^([\s\S]*?)\bBEGIN;\s*/,'').replace(/\s*COMMIT;\s*$/,'');
  await c.query(ddl);ok('Migration 056 applicable en transaction rollback');
  const regs=await c.query(`SELECT to_regclass('public.energy_scope_proposals') IS NOT NULL AS p,
  to_regclass('public.energy_scope_proposal_events') IS NOT NULL AS e,
  to_regclass('public.energy_scope_equipment_locations') IS NOT NULL AS l`);
  assert.deepEqual(regs.rows[0],{p:true,e:true,l:true});ok('Tables de collecte, audit et localisation présentes');
  const sq=await c.query(`SELECT s.id,s.tenant_id,s.owner_personne_id,s.public_id,g.id AS grant_a,n.id AS node_a
   FROM energy_inventory_sites s JOIN tenants t ON t.id=s.tenant_id AND t.code='ENERGY_MVP01D_RECETTE'
   JOIN energy_scope_grants g ON g.site_id=s.id AND g.role_scope='COORDINATEUR' AND g.statut='ACTIF'
   JOIN energy_scope_nodes n ON n.id=g.node_id WHERE s.owner_personne_id=g.personne_id LIMIT 1`);
  assert.equal(sq.rows.length,1);const s=sq.rows[0];ok('Site Energy C1 et coordinateur existants');
  const person=await c.query(`SELECT i.target_personne_id AS id FROM energy_scope_invitations i
   WHERE i.site_id=$1 AND i.target_personne_id<>$2 ORDER BY i.date_creation DESC LIMIT 1`,[s.id,s.owner_personne_id]);
  assert.equal(person.rows.length,1,'AUCUN_DEUXIEME_COMPTE_C1_FICTIF');const b=Number(person.rows[0].id);ok('Deuxième personne de recette C1 retrouvée sans identifiants');
  const nodeId=uuid(),grantB=uuid(),propId=uuid(),reqKey=uuid();
  await c.query(`INSERT INTO energy_scope_nodes
  (id,site_id,tenant_id,owner_personne_id,parent_id,type_noeud,nom,request_key,content_hash,created_by)
  VALUES($1,$2,$3,$4,$5::uuid,'BUREAU',$6,$7::uuid,$8,$4)`,[nodeId,s.id,s.tenant_id,s.owner_personne_id,s.node_a,'Bureau fictif C2 '+nodeId.slice(0,6),uuid(),'f'.repeat(64)]);
  await c.query(`INSERT INTO energy_scope_grants
   (id,site_id,tenant_id,owner_personne_id,node_id,personne_id,parent_grant_id,role_scope)
   VALUES($1,$2,$3,$4,$5::uuid,$6,$7::uuid,'OCCUPANT')`,[grantB,s.id,s.tenant_id,s.owner_personne_id,nodeId,b,s.grant_a]);
  ok('Occupant temporaire affecté à un bureau, transaction non persistante');
  await c.query(`INSERT INTO energy_scope_proposals
   (id,site_id,tenant_id,owner_personne_id,source_grant_id,scope_node_id,auteur_personne_id,reviewer_grant_id,request_key,content_hash,nom,famille,quantite)
   VALUES($1,$2,$3,$4,$5::uuid,$6::uuid,$7,$8::uuid,$9::uuid,$10,'Compresseur fictif','MOTEUR',1)`,
   [propId,s.id,s.tenant_id,s.owner_personne_id,grantB,nodeId,b,s.grant_a,reqKey,'a'.repeat(64)]);
  ok('Proposition métier localisée et en attente du coordinateur');
  const duplicate=await c.query('SELECT count(*)::int AS n FROM energy_scope_proposals WHERE request_key=$1',[reqKey]);assert.equal(duplicate.rows[0].n,1);ok('Clé idempotente unique');
  await c.query(`INSERT INTO energy_scope_proposal_events
   (proposal_id,site_id,tenant_id,acteur_personne_id,acteur_grant_id,version,action,details)
   VALUES($1,$2,$3,$4,$5,1,'SOUMISE',$6::jsonb)`,[propId,s.id,s.tenant_id,b,grantB,JSON.stringify({provenance:'DECLAREE'})]);
  const events=await c.query('SELECT count(*)::int AS n FROM energy_scope_proposal_events WHERE proposal_id=$1',[propId]);assert.equal(events.rows[0].n,1);ok('Journal append-only créé');
  await c.query('SAVEPOINT audit_guard');let denied=false;
  try{await c.query(`UPDATE energy_scope_proposal_events SET details='{}'::jsonb WHERE proposal_id=$1`,[propId]);}catch(e){denied=true;assert.match(e.message,/ENERGY_C2_AUDIT_IMMUABLE/);}
  await c.query('ROLLBACK TO SAVEPOINT audit_guard');assert.ok(denied);ok('Modification de l audit refusée par PostgreSQL');
  await c.query('SAVEPOINT wrong_scope');denied=false;
  try{await c.query(`UPDATE energy_scope_proposals SET source_grant_id=$1::uuid WHERE id=$2::uuid`,[uuid(),propId]);}catch(e){denied=true;assert.equal(e.code,'23503');}
  await c.query('ROLLBACK TO SAVEPOINT wrong_scope');assert.ok(denied);ok('Grant inexistant / autre périmètre refusé par FK');
  await c.query('SAVEPOINT invalid_status');denied=false;
  try{await c.query(`UPDATE energy_scope_proposals SET statut='INTEGREE' WHERE id=$1::uuid`,[propId]);}catch(e){denied=true;assert.equal(e.code,'23514');}
  await c.query('ROLLBACK TO SAVEPOINT invalid_status');assert.ok(denied);ok('Intégration sans équipement canonique refusée');
  // Regression 42P08 : execute exactement la requete du moteur, pas une copie approximative.
  const {DECISION_NON_APPROUVEE_SQL}=require('../../energy/energy-collection-store');
  for(const state of ['REFUSEE','A_CORRIGER']){
   await c.query('SAVEPOINT c2_decision_regression');
   const decision=await c.query(DECISION_NON_APPROUVEE_SQL,[state,propId]);
   assert.equal(decision.rows.length,1);
   assert.equal(decision.rows[0].statut,state);
   assert.equal(decision.rows[0].date_cloture!==null,state==='REFUSEE');
   await c.query('ROLLBACK TO SAVEPOINT c2_decision_regression');
   ok('Parametrage PostgreSQL 42P08 absent pour '+state);
  }
  const count2=await c.query(`SELECT count(*)::int AS n FROM energy_scope_equipment_locations WHERE proposal_id=$1`,[propId]);
  assert.equal(count2.rows[0].n,0);ok('Aucune localisation canonique créée avant validation');
  console.log('ENERGY_C2_PG_ROLLBACK_PASS='+count);
 }finally{if(tx)await c.query('ROLLBACK').catch(()=>{});await c.end();}
}
run().catch(e=>{console.error('ENERGY_C2_PG_ECHEC='+String(e.message||e));process.exitCode=1;});
