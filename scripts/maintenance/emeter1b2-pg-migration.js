'use strict';
/** Migration 063 : dryrun sans persistance, apply sur autorisation, verify via rollback. */
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {Client}=require('pg');const MODE=process.argv[2],PIN='7699611241381229531';
if(!['dryrun','apply','verify'].includes(MODE))throw Error('MODE_063_INVALIDE');
const id=()=>crypto.randomUUID();
async function main(){
 assert.equal(process.env.PGDATABASE,'sateer_test');assert.equal(process.env.PGHOST,'::1');assert.equal(process.env.PGPORT,'5432');
 const c=new Client();await c.connect();let transaction=false;const q=(...args)=>c.query(...args);
 try{
  const db=(await q('SELECT current_database() AS db,(SELECT system_identifier::text FROM pg_control_system()) AS pin')).rows[0];
  assert.equal(db.db,'sateer_test');assert.equal(db.pin,PIN);console.log('E_BILLING_EVIDENCE_CLUSTER=PASS');
  const before=(await q("SELECT to_regclass('public.energy_billing_attachments') IS NOT NULL AS exists")).rows[0].exists;
  if(MODE==='apply'&&before)throw Error('SCHEMA_063_DEJA_PRESENT');
  if(MODE==='verify'&&!before)throw Error('SCHEMA_063_ABSENT');
  await q('BEGIN');transaction=true;
  if(MODE!=='verify')await q(fs.readFileSync(path.join(__dirname,'../../database/063_energy_billing_evidence.sql'),'utf8'));
  for(const t of ['energy_billing_attachments','energy_billing_attachment_events']){
   assert.ok((await q('SELECT to_regclass($1) AS rel',['public.'+t])).rows[0].rel,t);
  }
  console.log('E_BILLING_EVIDENCE_TABLES=2/2_PASS');
  const fixture=(await q('SELECT id,tenant_id,owner_personne_id FROM energy_inventory_sites ORDER BY id LIMIT 1')).rows[0];
  assert.ok(fixture,'RECETTE_SITE_ABSENT');const scope=[fixture.id,fixture.tenant_id,fixture.owner_personne_id];
  await q('SAVEPOINT evidence_fixture');const billing=id(),file=id();
  await q(`INSERT INTO energy_billing_declarations
   (id,site_id,tenant_id,owner_personne_id,nature,energie,date_document,periode_debut,periode_fin,devise,montant,auteur_personne_id,request_key,content_hash)
   VALUES($1::uuid,$2,$3,$4,'FACTURE','ELECTRICITE','2026-10-15','2026-09-01','2026-09-30','XOF',100,$5,$6::uuid,$7)`,
   [billing,...scope,fixture.owner_personne_id,id(),'a'.repeat(64)]);
  await q(`INSERT INTO energy_billing_attachments
   (id,site_id,tenant_id,owner_personne_id,declaration_id,nom_original,mime_type,taille_octets,sha256,auteur_personne_id,request_key)
   VALUES($1::uuid,$2,$3,$4,$5::uuid,'fixture.pdf','application/pdf',120,$6,$7,$8::uuid)`,
   [file,...scope,billing,'b'.repeat(64),fixture.owner_personne_id,id()]);
  await q(`INSERT INTO energy_billing_attachment_events(attachment_id,site_id,tenant_id,owner_personne_id,acteur_personne_id,action)
   VALUES($1::uuid,$2,$3,$4,$5,'BillingAttachmentStored.v1')`,[file,...scope,fixture.owner_personne_id]);
  console.log('E_BILLING_EVIDENCE_FK_ASSOCIATION=PASS');
  await q('SAVEPOINT immutabilite');let blocked=false;
  try{await q('UPDATE energy_billing_attachments SET nom_original=$1 WHERE id=$2',['oops.pdf',file]);}
  catch(e){blocked=e.message.includes('E_BILLING_HISTORIQUE_IMMUABLE');}
  await q('ROLLBACK TO SAVEPOINT immutabilite');assert.ok(blocked);console.log('E_BILLING_EVIDENCE_APPEND_ONLY=PASS');
  await q('SAVEPOINT autre_declaration');let foreign=false;
  try{await q(`INSERT INTO energy_billing_attachments(id,site_id,tenant_id,owner_personne_id,declaration_id,
    nom_original,mime_type,taille_octets,sha256,auteur_personne_id,request_key)
    VALUES($1::uuid,$2,$3,$4,$5::uuid,'fixture.pdf','application/pdf',120,$6,$7,$8::uuid)`,
    [id(),...scope,id(),'c'.repeat(64),fixture.owner_personne_id,id()]);}
  catch(e){foreign=e.code==='23503';}
  await q('ROLLBACK TO SAVEPOINT autre_declaration');assert.ok(foreign);console.log('E_BILLING_EVIDENCE_HORS_DECLARATION_REFUSE=PASS');
  await q('ROLLBACK TO SAVEPOINT evidence_fixture');
  assert.equal(Number((await q('SELECT COUNT(*) AS n FROM energy_billing_attachments WHERE id=$1',[file])).rows[0].n),0);
  console.log('E_BILLING_EVIDENCE_FIXTURE_ROLLBACK=PASS');
  if(MODE==='apply'){await q('COMMIT');transaction=false;console.log('E_BILLING_EVIDENCE_MIGRATION_063_APPLIQUEE=PASS');}
  else {await q('ROLLBACK');transaction=false;console.log(MODE==='dryrun'?'E_BILLING_EVIDENCE_DRYRUN_ROLLBACK_PASS':'E_BILLING_EVIDENCE_VERIFY_ROLLBACK_PASS');}
 }finally{if(transaction)await q('ROLLBACK').catch(()=>{});await c.end();}
}
main().catch(e=>{console.error('E_BILLING_EVIDENCE_PG_ECHEC',e.code||e.message);process.exitCode=1;});
