'use strict';
/** Test de migration : toujours ROLLBACK. Refuse toute autre DB ou cluster. */
const fs=require('node:fs');
const assert=require('node:assert/strict');
const path=require('node:path');
const PG=require(require.resolve('pg',{paths:[process.cwd()]}));
const SQL=path.resolve(process.cwd(),'database/065_energy_meter_replacement.sql');
const EXPECTED='7699611241381229531';
async function main(){
 assert.equal(process.env.PGDATABASE,'sateer_test');assert.equal(process.env.PGHOST,'::1');assert.equal(process.env.PGPORT,'5432');
 const c=new PG.Client({host:'::1',port:5432,database:'sateer_test',user:process.env.PGUSER||process.env.USER,
  ...(process.env.PGPASSWORD?{password:process.env.PGPASSWORD}:{}),application_name:'sateer_emeter1e1_dryrun',connectionTimeoutMillis:6000,statement_timeout:12000});
 let opened=false;
 try{
  await c.connect();await c.query('BEGIN');opened=true;
  const origin=(await c.query("SELECT current_database() db, (SELECT system_identifier::text FROM pg_control_system()) cluster")).rows[0];
  assert.equal(origin.db,'sateer_test');assert.equal(origin.cluster,EXPECTED);
  const baseline=(await c.query(`SELECT (SELECT count(*)::int FROM energy_meter_readings) readings,
   (SELECT count(*)::int FROM energy_meter_events) events`)).rows[0];
  const existing=(await c.query(`SELECT pg_get_constraintdef(oid) definition FROM pg_constraint
   WHERE conrelid='energy_meter_events'::regclass AND conname='energy_meter_events_action_check'`)).rows[0];
  assert.ok(existing?.definition);assert.ok(!existing.definition.includes('MeterDeviceReplaced.v1'));
  await c.query(fs.readFileSync(SQL,'utf8'));
  const after=(await c.query(`SELECT pg_get_constraintdef(oid) definition FROM pg_constraint
   WHERE conrelid='energy_meter_events'::regclass AND conname='energy_meter_events_action_check'`)).rows[0];
  assert.ok(after?.definition.includes('MeterDeviceReplaced.v1'));
  const counts=(await c.query(`SELECT (SELECT count(*)::int FROM energy_meter_readings) readings,
   (SELECT count(*)::int FROM energy_meter_events) events`)).rows[0];
  assert.deepEqual(counts,baseline);console.log('PASS | Migration 065 appliquee dans une transaction temporaire; aucun releve ni evenement modifie');
  await c.query('ROLLBACK');opened=false;
  const verified=(await c.query(`SELECT pg_get_constraintdef(oid) definition FROM pg_constraint
   WHERE conrelid='energy_meter_events'::regclass AND conname='energy_meter_events_action_check'`)).rows[0];
  assert.equal(verified.definition,existing.definition);
  console.log('PASS | ROLLBACK confirme, CHECK original conserve, PostgreSQL non modifie');
 }finally{if(opened)await c.query('ROLLBACK').catch(()=>{});await c.end().catch(()=>{});}
}
main().catch(e=>{console.error('STOP | Migration 065 dryrun: '+(e.code||e.message));process.exitCode=1;});
