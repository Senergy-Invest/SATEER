'use strict';
/** 062 : dryrun = DDL rollback ; apply = DDL commit seulement apres autorisation ; verify = rollback. */
const assert=require('node:assert/strict');
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {Client}=require('pg');
const MODE=process.argv[2];if(!['dryrun','apply','verify'].includes(MODE))throw Error('MODE_INVALIDE');
const PIN='7699611241381229531',uuid=()=>crypto.randomUUID();
async function main(){
 assert.equal(process.env.PGDATABASE,'sateer_test');assert.equal(process.env.PGHOST,'::1');assert.equal(process.env.PGPORT,'5432');
 const c=new Client();await c.connect();let transaction=false;
 const q=(sql,args)=>c.query(sql,args);
 try{
  const db=(await q('SELECT current_database() AS db,(SELECT system_identifier::text FROM pg_control_system()) AS pin')).rows[0];
  assert.equal(db.db,'sateer_test');assert.equal(db.pin,PIN);console.log('EMETER1B1_DB_PIN=PASS');
  const before=(await q("SELECT to_regclass('public.energy_billing_declarations') IS NOT NULL AS yes")).rows[0].yes;
  if(MODE==='apply'&&before)throw Error('MIGRATION_062_DEJA_PRESENTE');
  if(MODE==='verify'&&!before)throw Error('MIGRATION_062_ABSENTE');
  await q('BEGIN');transaction=true;
  if(MODE!=='verify')await q(fs.readFileSync(path.join(__dirname,'../../database/062_energy_billing_manual.sql'),'utf8'));
  for(const n of ['energy_billing_declarations','energy_billing_events'])assert.ok((await q('SELECT to_regclass($1) AS t',['public.'+n])).rows[0].t,n);
  console.log('EMETER1B1_TABLES=2/2_PASS');
  const f=(await q('SELECT id,tenant_id,owner_personne_id FROM energy_inventory_sites ORDER BY id LIMIT 1')).rows[0];
  assert.ok(f,'FIXTURE_SITE_REQUISE');
  await q('SAVEPOINT fixture_billing');
  const base=[f.id,f.tenant_id,f.owner_personne_id];
  const point=uuid(),meter=uuid(),key=uuid(),id=uuid();
  await q(`INSERT INTO energy_meter_points(id,site_id,tenant_id,owner_personne_id,nom,energie,type_point,request_key,content_hash)
   VALUES($1,$2,$3,$4,'Point fictif test 1B1','ELECTRICITE','GENERAL',$5,$6)`,[point,...base,uuid(),'a'.repeat(64)]);
  await q(`INSERT INTO energy_meter_devices(id,point_id,site_id,tenant_id,owner_personne_id,nom,technologie,mode_commercial,request_key,content_hash)
   VALUES($1,$2,$3,$4,$5,'Compteur fictif 1B1','MECANIQUE','PREPAYE',$6,$7)`,[meter,point,...base,uuid(),'b'.repeat(64)]);
  await q('SAVEPOINT energie_incompatible');let rejectEnergy=false;
  try{await q(`INSERT INTO energy_billing_declarations(id,site_id,tenant_id,owner_personne_id,point_id,
    nature,energie,date_document,periode_debut,periode_fin,devise,montant,auteur_personne_id,request_key,content_hash)
    VALUES($1,$2,$3,$4,$5,'FACTURE','EAU','2026-10-15','2026-09-01','2026-09-30','XOF',12,$6,$7,$8)`,
    [uuid(),...base,point,f.owner_personne_id,uuid(),'f'.repeat(64)]);}
  catch(e){rejectEnergy=e.message.includes('E_BILLING_POINT_ENERGIE_INCOMPATIBLE');}
  await q('ROLLBACK TO SAVEPOINT energie_incompatible');assert.ok(rejectEnergy);
  console.log('EMETER1B1_INTEGRITE_ENERGIE_POINT=PASS');
  await q(`INSERT INTO energy_billing_declarations(id,site_id,tenant_id,owner_personne_id,point_id,meter_id,
    nature,energie,date_document,periode_debut,periode_fin,devise,montant,auteur_personne_id,request_key,content_hash)
    VALUES($1,$2,$3,$4,$5,$6,'FACTURE','ELECTRICITE','2026-10-15','2026-09-01','2026-09-30','XOF',$7,$8,$9,$10)`,
    [id,...base,point,meter,'12500.25',f.owner_personne_id,key,'c'.repeat(64)]);
  const found=(await q('SELECT montant::text AS montant,qualification,provenance FROM energy_billing_declarations WHERE id=$1',[id])).rows[0];
  assert.equal(found.montant,'12500.25');assert.equal(found.qualification,'DECLARE_A_VERIFIER');
  assert.equal(found.provenance,'SAISIE_MANUELLE');console.log('EMETER1B1_MONTANT_EXACT_ET_DECLARATIF=PASS');
  await q('SAVEPOINT forbidden_update');let blocked=false;
  try{await q('UPDATE energy_billing_declarations SET montant=7 WHERE id=$1',[id]);}catch(e){blocked=e.message.includes('E_BILLING_HISTORIQUE_IMMUABLE');}
  await q('ROLLBACK TO SAVEPOINT forbidden_update');assert.ok(blocked);console.log('EMETER1B1_APPEND_ONLY=PASS');
  await q('SAVEPOINT scope_faux');let fk=false;
  try{await q(`INSERT INTO energy_billing_declarations(id,site_id,tenant_id,owner_personne_id,point_id,
    nature,energie,date_document,periode_debut,periode_fin,devise,montant,auteur_personne_id,request_key,content_hash)
    VALUES($1,$2,$3,$4,$5,'FACTURE','ELECTRICITE','2026-10-15','2026-09-01','2026-09-30','XOF',100,$6,$7,$8)`,
    [uuid(),...base,uuid(),f.owner_personne_id,uuid(),'d'.repeat(64)]);}catch(e){
   // BEFORE INSERT 062 verifie energie et perimetre AVANT la FK composite.
   // Une reference de point absent peut donc etre rejetee par le garde metier
   // ou par la FK PostgreSQL. Les deux issues attestent le meme refus.
   fk=e.code==='23503' || (typeof e.message==='string' &&
      e.message.includes('E_BILLING_POINT_ENERGIE_INCOMPATIBLE'));
   if(!fk)throw e;
  }
  await q('ROLLBACK TO SAVEPOINT scope_faux');assert.ok(fk);console.log('EMETER1B1_POINT_ETRANGER_REJETE=PASS');
  await q('SAVEPOINT recharge_site_seul');const recharge=uuid();
  await q(`INSERT INTO energy_billing_declarations(id,site_id,tenant_id,owner_personne_id,
    nature,energie,date_document,devise,montant,auteur_personne_id,request_key,content_hash)
    VALUES($1,$2,$3,$4,'RECHARGE','ELECTRICITE','2026-10-15','XOF',5000,$5,$6,$7)`,
    [recharge,...base,f.owner_personne_id,uuid(),'e'.repeat(64)]);
  assert.equal(Number((await q('SELECT COUNT(*) AS n FROM energy_billing_declarations WHERE id=$1',[recharge])).rows[0].n),1);
  console.log('EMETER1B1_RECHARGE_SITE_SANS_COMPTEUR=PASS');
  await q('ROLLBACK TO SAVEPOINT recharge_site_seul');
  await q('ROLLBACK TO SAVEPOINT fixture_billing');
  assert.equal(Number((await q('SELECT COUNT(*) AS n FROM energy_billing_declarations WHERE id=$1',[id])).rows[0].n),0);
  console.log('EMETER1B1_FIXTURE_ROLLBACK=PASS');
  if(MODE==='apply'){await q('COMMIT');transaction=false;console.log('EMETER1B1_MIGRATION_062_APPLIQUEE_SANS_FIXTURE=PASS');}
  else{await q('ROLLBACK');transaction=false;console.log(MODE==='dryrun'?'EMETER1B1_DRYRUN_ROLLBACK_PASS':'EMETER1B1_VERIFY_ROLLBACK_PASS');}
 }finally{if(transaction)await q('ROLLBACK').catch(()=>{});await c.end();}
}
main().catch(e=>{console.error('EMETER1B1_PG_ECHEC',e.code||e.message);process.exitCode=1;});
