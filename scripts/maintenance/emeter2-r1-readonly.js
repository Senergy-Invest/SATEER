'use strict';
/** Capture sans aucune écriture du périmètre E-METER, EP1 et événements. */
const crypto=require('node:crypto');
const {obtenirClientDatabase}=require('../../database');
(async()=>{
 if(process.env.PGDATABASE!=='sateer_test'||!['::1','localhost','127.0.0.1'].includes(process.env.PGHOST))throw Error('BASE_TEST_LOCALE_REQUISE');
 const c=await obtenirClientDatabase();let tx=false;
 try{
  await c.query('BEGIN READ ONLY');tx=true;
  const control=await c.query("SELECT current_database() AS database,(SELECT system_identifier::text FROM pg_control_system()) AS cluster");
  if(control.rows[0]?.database!=='sateer_test'||control.rows[0]?.cluster!=='7699611241381229531')throw Error('CLUSTER_NON_AUTORISE');
  const tables=['energy_meter_readings','energy_meter_events','energy_meter_participation_missions','energy_meter_participation_events'];
  for(const table of tables){
   const r=await c.query('SELECT * FROM '+table+' ORDER BY id');
   const hash=crypto.createHash('sha256').update(JSON.stringify(r.rows)).digest('hex');
   console.log('TABLE | '+table+' | COUNT='+r.rows.length+' | SHA256='+hash);
   if(table==='energy_meter_readings'&&r.rows.length!==9)throw Error('RELEVES_ATTENDUS_9');
   if(table==='energy_meter_events'&&r.rows.length!==15)throw Error('EVENEMENTS_ATTENDUS_15');
   if(table==='energy_meter_participation_missions'&&r.rows.length!==1)throw Error('MISSIONS_ATTENDUES_1');
   if(table==='energy_meter_participation_events'&&r.rows.length!==4)throw Error('EVENEMENTS_EP1_ATTENDUS_4');
  }
  console.log('PASS | READ ONLY site et registre existant, aucun INSERT');
 }finally{if(tx)await c.query('ROLLBACK').catch(()=>{});c.release();}
})().catch(e=>{console.error('STOP | EMETER2_R1_PG : '+(e.code||e.message));process.exitCode=1;});
