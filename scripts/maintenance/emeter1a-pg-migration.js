'use strict';
/** Exécute 061 sous transaction. dryrun = rollback intégral, apply = uniquement après accord Mac. */
const assert=require('node:assert/strict');const crypto=require('node:crypto');
const fs=require('node:fs');const path=require('node:path');const {Client}=require('pg');
const MODE=process.argv[2];if(!['dryrun','apply','verify'].includes(MODE))throw Error('MODE_DRYRUN_APPLY_VERIFY');
const PIN='7699611241381229531';const uuid=()=>crypto.randomUUID();
async function run(){
 assert.equal(process.env.PGDATABASE,'sateer_test');assert.equal(process.env.PGHOST,'::1');assert.equal(process.env.PGPORT,'5432');
 const c=new Client();await c.connect();let tx=false;
 const execute=async(sql,params)=>c.query(sql,params);
 try{
  const db=(await execute('SELECT current_database() AS db,(SELECT system_identifier::text FROM pg_control_system()) AS pin')).rows[0];
  assert.equal(db.db,'sateer_test');assert.equal(db.pin,PIN);console.log('E_METER_DB_IDENTITE=PASS');
  const present=(await execute("SELECT to_regclass('public.energy_meter_points') IS NOT NULL AS ok")).rows[0].ok;
  if(MODE==='apply'&&present)throw Error('E_METER_061_DEJA_INSTALLE');
  if(MODE==='verify'&&!present)throw Error('E_METER_061_NON_INSTALLE');
  await execute('BEGIN');tx=true;
  if(MODE!=='verify'){
   const sql=fs.readFileSync(path.join(__dirname,'../../database/061_energy_meter_manual.sql'),'utf8');
   await execute(sql);
  }
  const required=['energy_meter_points','energy_meter_devices','energy_meter_registers','energy_meter_readings','energy_meter_events'];
  for(const t of required){const exists=(await execute('SELECT to_regclass($1) AS t',['public.'+t])).rows[0].t;assert.ok(exists,'TABLE_MANQUANTE '+t);}
  console.log('E_METER_061_TABLES=5/5_PASS');
  const f=(await execute('SELECT id,tenant_id,owner_personne_id FROM energy_inventory_sites ORDER BY id LIMIT 1')).rows[0];
  assert.ok(f,'SITE_DE_RECETTE_ABSENT');await execute('SAVEPOINT e_meter_fixture');
  const point=uuid(),meter=uuid(),reg=uuid(),reading=uuid(),key=uuid();
  await execute(`INSERT INTO energy_meter_points(id,site_id,tenant_id,owner_personne_id,nom,energie,type_point,request_key,content_hash)
    VALUES($1,$2,$3,$4,'Point fictif de test','ELECTRICITE','GENERAL',$5,$6)`,[point,f.id,f.tenant_id,f.owner_personne_id,key,'a'.repeat(64)]);
  await execute(`INSERT INTO energy_meter_devices(id,point_id,site_id,tenant_id,owner_personne_id,nom,technologie,mode_commercial,request_key,content_hash)
    VALUES($1,$2,$3,$4,$5,'Compteur fictif de test','ELECTRONIQUE','PREPAYE',$6,$7)`,[meter,point,f.id,f.tenant_id,f.owner_personne_id,uuid(),'b'.repeat(64)]);
  await execute(`INSERT INTO energy_meter_registers(id,meter_id,point_id,site_id,tenant_id,owner_personne_id,code,unite,request_key,content_hash)
    VALUES($1,$2,$3,$4,$5,$6,'INDEX_TOTAL','KWH',$7,$8)`,[reg,meter,point,f.id,f.tenant_id,f.owner_personne_id,uuid(),'c'.repeat(64)]);
  await execute(`INSERT INTO energy_meter_readings(id,register_id,meter_id,point_id,site_id,tenant_id,owner_personne_id,valeur_index,unite_snapshot,releve_le,auteur_personne_id,request_key,content_hash)
    VALUES($1,$2,$3,$4,$5,$6,$7,12345.125,'KWH',now(),$8,$9,$10)`,[reading,reg,meter,point,f.id,f.tenant_id,f.owner_personne_id,f.owner_personne_id,uuid(),'d'.repeat(64)]);
  const r=(await execute('SELECT valeur_index::text AS value,qualification FROM energy_meter_readings WHERE id=$1',[reading])).rows[0];
  assert.equal(Number(r.value),12345.125);assert.equal(r.qualification,'DECLARE_A_VERIFIER');
  console.log('E_METER_CHAINE_FK=POINT_COMPTEUR_REGISTRE_RELEVE_PASS');
  await execute('SAVEPOINT e_meter_forbidden_update');let refused=false;
  try{await execute('UPDATE energy_meter_readings SET valeur_index=1 WHERE id=$1',[reading]);}
  catch(e){refused=e.message.includes('E_METER_HISTORIQUE_IMMUABLE');}
  await execute('ROLLBACK TO SAVEPOINT e_meter_forbidden_update');assert.equal(refused,true);console.log('E_METER_INDEX_APPEND_ONLY=PASS');
  await execute('SAVEPOINT e_meter_cross_scope');let cross=false;
  try{await execute(`INSERT INTO energy_meter_registers(id,meter_id,point_id,site_id,tenant_id,owner_personne_id,code,unite,request_key,content_hash)
    VALUES($1,$2,$3,$4,$5,$6,'FORBIDDEN','KWH',$7,$8)`,[uuid(),meter,point,Number(f.id)+1000000,f.tenant_id,f.owner_personne_id,uuid(),'e'.repeat(64)]);}
  catch(e){cross=e.code==='23503';}
  await execute('ROLLBACK TO SAVEPOINT e_meter_cross_scope');assert.equal(cross,true);console.log('E_METER_CROSS_SCOPE_FK_REJET=PASS');
  await execute('ROLLBACK TO SAVEPOINT e_meter_fixture');
  const verify=(await execute('SELECT count(*) AS n FROM energy_meter_points WHERE id=$1',[point])).rows[0];assert.equal(Number(verify.n),0);console.log('E_METER_FIXTURE_ROLLBACK=PASS');
  if(MODE==='dryrun'||MODE==='verify'){await execute('ROLLBACK');tx=false;console.log(MODE==='dryrun'?'E_METER_MIGRATION_DRYRUN_ROLLBACK_PASS':'E_METER_MIGRATION_VERIFY_READ_ROLLBACK_PASS');}
  else{await execute('COMMIT');tx=false;console.log('E_METER_MIGRATION_APPLIED_WITHOUT_FIXTURE=PASS');}
 }finally{if(tx)await execute('ROLLBACK').catch(()=>{});await c.end();}
}
run().catch(e=>{console.error('E_METER_PG_ECHEC',e.code||e.message);process.exitCode=1;});
