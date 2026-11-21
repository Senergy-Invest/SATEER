'use strict';
/** E-METER-1C1 PG sur sateer_test seulement : dryrun ROLLBACK, apply apres accord, verify ROLLBACK. */
const assert=require('node:assert/strict');const crypto=require('node:crypto');const fs=require('node:fs');const path=require('node:path');
const {Client}=require('pg'),PIN='7699611241381229531',MODE=process.argv[2];
if(!['dryrun','apply','verify'].includes(MODE))throw Error('MODE_064_INVALIDE');
const uuid=()=>crypto.randomUUID();
async function main(){
 assert.equal(process.env.PGDATABASE,'sateer_test');assert.equal(process.env.PGHOST,'::1');assert.equal(process.env.PGPORT,'5432');
 const c=new Client();await c.connect();let started=false;const q=(...p)=>c.query(...p);
 try{
  const db=(await q('SELECT current_database() AS db,(SELECT system_identifier::text FROM pg_control_system()) AS pin')).rows[0];
  assert.equal(db.db,'sateer_test');assert.equal(db.pin,PIN);console.log('E_BILLING_REVISION_CLUSTER=PASS');
  const exists=(await q("SELECT to_regclass('public.energy_billing_rectifications') IS NOT NULL AS present")).rows[0].present;
  if(MODE==='apply'&&exists)throw Error('SCHEMA_064_DEJA_PRESENT');
  if(MODE==='verify'&&!exists)throw Error('SCHEMA_064_ABSENT');
  await q('BEGIN');started=true;
  if(MODE!=='verify')await q(fs.readFileSync(path.join(__dirname,'../../database/064_energy_billing_rectifications.sql'),'utf8'));
  const present=(await q("SELECT to_regclass('public.energy_billing_rectifications') IS NOT NULL AS present")).rows[0].present;
  assert.ok(present);console.log('E_BILLING_REVISION_SCHEMA=PASS');
  const trigger=(await q(`SELECT count(*)::int AS n FROM pg_trigger
    WHERE tgrelid='public.energy_billing_rectifications'::regclass AND NOT tgisinternal
    AND tgname IN ('tr_billing_revision_root','tr_billing_revision_immutable')`)).rows[0].n;
  assert.equal(trigger,2);console.log('E_BILLING_REVISION_TRIGGERS=2/2_PASS');
  const s=(await q('SELECT id,tenant_id,owner_personne_id FROM energy_inventory_sites ORDER BY id LIMIT 1')).rows[0];
  assert.ok(s,'FIXTURE_SITE_ABSENT');const sc=[s.id,s.tenant_id,s.owner_personne_id],old=uuid(),next=uuid(),rev=uuid(),key=uuid();
  await q('SAVEPOINT fixture_064');
  const ins=`INSERT INTO energy_billing_declarations
    (id,site_id,tenant_id,owner_personne_id,nature,energie,date_document,periode_debut,periode_fin,
     devise,montant,auteur_personne_id,request_key,content_hash)
    VALUES($1::uuid,$2,$3,$4,'FACTURE','ELECTRICITE','2026-10-20','2026-09-01','2026-09-30',
     'XOF',$5::numeric,$6,$7::uuid,$8)`;
  await q(ins,[old,...sc,'100.00',s.owner_personne_id,uuid(),'a'.repeat(64)]);
  await q(ins,[next,...sc,'120.50',s.owner_personne_id,key,'b'.repeat(64)]);
  await q(`INSERT INTO energy_billing_rectifications
    (id,site_id,tenant_id,owner_personne_id,original_declaration_id,corrected_declaration_id,revision,
     motif,acteur_personne_id,request_key,content_hash)
    VALUES($1::uuid,$2,$3,$4,$5::uuid,$6::uuid,1,$7,$8,$9::uuid,$10)`,
    [rev,...sc,old,next,'Montant fictif corrige en recette',s.owner_personne_id,key,'c'.repeat(64)]);
  const amount=(await q(`SELECT d.montant::text AS original,c.montant::text AS corrige
    FROM energy_billing_rectifications r JOIN energy_billing_declarations d ON d.id=r.original_declaration_id
    JOIN energy_billing_declarations c ON c.id=r.corrected_declaration_id WHERE r.id=$1::uuid`,[rev])).rows[0];
  assert.deepEqual(amount,{original:'100.00',corrige:'120.50'});console.log('E_BILLING_REVISION_ORIGINAL_PRESERVE=PASS');
  await q('SAVEPOINT modification_bloquee');let blocked=false;
  try{await q('DELETE FROM energy_billing_rectifications WHERE id=$1::uuid',[rev]);}
  catch(e){blocked=e.message.includes('E_BILLING_HISTORIQUE_IMMUABLE');}
  await q('ROLLBACK TO SAVEPOINT modification_bloquee');assert.ok(blocked);console.log('E_BILLING_REVISION_APPEND_ONLY=PASS');
  await q('SAVEPOINT collision_bloquee');let collision=false;
  try{await q(`INSERT INTO energy_billing_rectifications
    (id,site_id,tenant_id,owner_personne_id,original_declaration_id,corrected_declaration_id,
     revision,motif,acteur_personne_id,request_key,content_hash)
     VALUES($1::uuid,$2,$3,$4,$5::uuid,$6::uuid,2,'Source non originale et sans suite',$7,$8::uuid,$9)`,
     [uuid(),...sc,next,old,s.owner_personne_id,uuid(),'d'.repeat(64)]);}
  catch(e){collision=e.message.includes('E_BILLING_REVISION_ORIGINE_NON_CANONIQUE');}
  await q('ROLLBACK TO SAVEPOINT collision_bloquee');assert.ok(collision);console.log('E_BILLING_REVISION_ROOT_REFUSE=PASS');
  await q('SAVEPOINT scope_bloquee');let foreign=false;
  try{await q(`INSERT INTO energy_billing_rectifications
   (id,site_id,tenant_id,owner_personne_id,original_declaration_id,corrected_declaration_id,revision,
    motif,acteur_personne_id,request_key,content_hash)
   VALUES($1::uuid,$2,$3,$4,$5::uuid,$6::uuid,1,'Point hors du site refuse ici',$7,$8::uuid,$9)`,
   [uuid(),...sc,uuid(),uuid(),s.owner_personne_id,uuid(),'e'.repeat(64)]);}
  catch(e){foreign=e.code==='23503'||e.message.includes('E_BILLING_REVISION_CIBLE_NON_CONFORME');}
  await q('ROLLBACK TO SAVEPOINT scope_bloquee');assert.ok(foreign);console.log('E_BILLING_REVISION_FK_SCOPE_REFUSE=PASS');
  await q('ROLLBACK TO SAVEPOINT fixture_064');
  const count=(await q('SELECT count(*)::int AS n FROM energy_billing_rectifications WHERE id=$1::uuid',[rev])).rows[0].n;
  assert.equal(count,0);console.log('E_BILLING_REVISION_FIXTURE_ROLLBACK=PASS');
  if(MODE==='apply'){await q('COMMIT');started=false;console.log('E_BILLING_REVISION_MIGRATION_064_APPLIQUEE=PASS');}
  else{await q('ROLLBACK');started=false;console.log(MODE==='dryrun'?'E_BILLING_REVISION_DRYRUN_ROLLBACK_PASS':'E_BILLING_REVISION_VERIFY_ROLLBACK_PASS');}
 }finally{if(started)await q('ROLLBACK').catch(()=>{});await c.end();}
}
main().catch(e=>{console.error('E_BILLING_REVISION_PG_ECHEC',e.code||e.message);process.exitCode=1;});
