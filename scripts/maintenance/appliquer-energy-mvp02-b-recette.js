'use strict';
/** Migration 051 uniquement dans la fixture Energy locale, après confirmation humaine du shell. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {Client}=require('../../node_modules/pg');
const ROOT=path.resolve(__dirname,'../..');
const TENANT='ENERGY_MVP01D_RECETTE';
const BASE=path.join(os.homedir(),'.sateer-recette','energy-mvp01d');
const RECEIPT=path.join(BASE,'MVP02B_MIGRATION_MANIFESTE.json');
const CLUSTER='7699611241381229531';
async function main(){
 assert.equal(process.env.PGDATABASE,'sateer_test');
 assert.equal(process.env.PGHOST,'::1');
 assert.equal(process.env.PGPORT,'5432');
 assert.equal(process.env.NODE_ENV,'development');
 assert.equal(process.env.SATEER_ENERGY_MVP02B_APPROVAL,'AUTORISER_MIGRATION_MVP02');
 const cred=JSON.parse(fs.readFileSync(path.join(BASE,'IDENTIFIANTS_PRIVES.json'),'utf8'));
 const fixture=JSON.parse(fs.readFileSync(path.join(BASE,'MANIFESTE.json'),'utf8'));
 assert.equal(cred.tenant,TENANT);assert.equal(fixture.tenant,TENANT);assert.equal(fixture.database,'sateer_test');
 assert.equal(cred.accounts.length,2);assert.equal(fixture.accounts.length,2);
 const c=new Client({host:'::1',port:5432,database:'sateer_test',user:process.env.PGUSER||process.env.USER,
  ...(process.env.PGPASSWORD?{password:process.env.PGPASSWORD}:{}),application_name:'sateer_energy_mvp02b_migration',
  connectionTimeoutMillis:5000,statement_timeout:20000,query_timeout:22000});
 let tx=false;
 try{
  await c.connect();
  const pin=(await c.query('SELECT current_database() AS db,(SELECT system_identifier::text FROM pg_control_system()) AS cluster')).rows[0];
  assert.equal(pin.db,'sateer_test');assert.equal(String(pin.cluster),CLUSTER);
  const tenant=(await c.query('SELECT id FROM tenants WHERE code=$1 AND actif=TRUE',[TENANT])).rows;
  assert.equal(tenant.length,1);assert.equal(Number(tenant[0].id),Number(fixture.tenantId));
  const org=(await c.query('SELECT id FROM organisations WHERE id=$1 AND tenant_id=$2',[fixture.organisationId,fixture.tenantId])).rows;
  assert.equal(org.length,1);
  for(const id of fixture.accounts.map(a=>a.personneId)){
   const check=(await c.query(`SELECT a.id FROM auth_accounts a JOIN relations_personne_organisation rel
    ON rel.personne_id=a.personne_id AND rel.organisation_id=$2
    WHERE a.personne_id=$1 AND a.actif=TRUE`,[id,fixture.organisationId])).rows;
   assert.equal(check.length,1);
  }
  const names=['energy_inventory_sites','energy_inventory_zones','energy_inventory_equipements','energy_inventory_events'];
  const result=(await c.query(`SELECT ${names.map((name,i)=>`to_regclass('public.${name}')::text AS t${i}`).join(',')}`)).rows[0];
  const exists=names.map((_,i)=>Boolean(result['t'+i]));
  assert.ok(exists.every(Boolean)||exists.every(v=>!v),'TABLES_INVENTAIRE_PARTIELLES_STOP');
  const wasApplied=exists.every(Boolean);
  if(wasApplied){
   assert.ok(fs.existsSync(RECEIPT),'TABLES_EXISTANTES_SANS_MANIFESTE_MVP02_STOP');
   const receipt=JSON.parse(fs.readFileSync(RECEIPT,'utf8'));
   assert.equal(receipt.cluster,CLUSTER);assert.equal(receipt.tenant,TENANT);
   assert.equal(receipt.tenantId,Number(fixture.tenantId));assert.equal(receipt.migration,'051_energy_inventory.sql');
   console.log('MVP02_MIGRATION_EXISTANTE_VERIFIEE=PASS');return;
  }
  assert.equal(fs.existsSync(RECEIPT),false,'MANIFESTE_SANS_TABLES_STOP');
  const sql=fs.readFileSync(path.join(ROOT,'database/051_energy_inventory.sql'),'utf8');
  const begins=sql.match(/^BEGIN;\s*$/gm)||[],commits=sql.match(/^COMMIT;\s*$/gm)||[];
  assert.equal(begins.length,1);assert.equal(commits.length,1);
  assert.ok(sql.includes('ENERGY_INVENTORY_REFUSE_HORS_SATEER_TEST'));
  const body=sql.replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'');
  await c.query('BEGIN');tx=true;
  await c.query("SET LOCAL lock_timeout='5s'");
  await c.query(body);
  const check=(await c.query(`SELECT ${names.map((name,i)=>`to_regclass('public.${name}')::text AS t${i}`).join(',')}`)).rows[0];
  assert.ok(names.every((_,i)=>Boolean(check['t'+i])));
  await c.query('COMMIT');tx=false;
  fs.writeFileSync(RECEIPT,JSON.stringify({tenant:TENANT,tenantId:Number(fixture.tenantId),migration:'051_energy_inventory.sql',
   cluster:CLUSTER,synthetic:true,createdAt:new Date().toISOString()},null,2)+'\n',{flag:'wx',mode:0o600});
  fs.chmodSync(RECEIPT,0o600);
  console.log('MVP02_MIGRATION_051_APPLIQUEE=PASS');
  console.log('PERIMETRE=sateer_test / tenant ENERGY_MVP01D_RECETTE');
 }finally{if(tx)await c.query('ROLLBACK').catch(()=>{});await c.end().catch(()=>{});}
}
main().catch(err=>{console.error('MVP02_MIGRATION_ECHEC='+String(err.message||err));process.exitCode=1;});
