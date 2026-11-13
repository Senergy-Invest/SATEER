"use strict";
/** Audit du schéma sans lire de dossier, patient ou personne. */
const assert=require('node:assert/strict');
if(process.env.PGDATABASE!=='sateer_test'){console.error('REFUS_BASE');process.exit(40)}
const {obtenirClientDatabase,fermerDatabase}=require('../database');
(async()=>{
 const c=await obtenirClientDatabase();let tx=false;
 try{
  const r=await c.query('SELECT current_database() AS db,(SELECT system_identifier::text FROM pg_control_system()) AS system_identifier');
  assert.equal(r.rows?.[0]?.db,'sateer_test');assert.equal(r.rows?.[0]?.system_identifier,'7699611241381229531');
  await c.query('BEGIN READ ONLY');tx=true;
  const needed={demandes:['organisation_id','tenant_id','statut','priorite','destination_unit_id'],
   publications:['organisation_id','tenant_id','statut'],
   organisations:['id','tenant_id','type'],tenants:['id','code','actif'],
   organisation_units:['id','organisation_id','actif','nom','code']};
  const q=await c.query('SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=ANY($2::text[])',['public',Object.keys(needed)]);
  const seen=new Set(q.rows.map(x=>x.table_name+'.'+x.column_name));
  for(const [tab,cols] of Object.entries(needed))for(const name of cols)assert.ok(seen.has(tab+'.'+name),'Colonne manquante '+tab+'.'+name);
  const p=await c.query("SELECT COUNT(*)::int AS total FROM organisations o JOIN tenants t ON t.id=o.tenant_id WHERE o.type='AMBASSADE' AND t.actif=TRUE");
  console.log('A5_AMBASSADES_RECETTE='+p.rows[0].total);console.log('A5_SCHEMA_READ_ONLY_PASS');
  await c.query('ROLLBACK');tx=false;
 }finally{if(tx)await c.query('ROLLBACK').catch(()=>{});c.release();await fermerDatabase();}
})().catch(e=>{console.error('A5_AUDIT_BLOQUE',e.message);process.exitCode=1});
