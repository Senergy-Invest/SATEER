'use strict';
/* PostgreSQL réel : la migration 055 est simulée dans une transaction ROLLBACK.
 * Le test utilise le site fictif Energy existant sans supprimer de données ni créer de compte.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Client}=require('pg');
async function run(){
 assert.equal(process.env.PGDATABASE,'sateer_test');assert.equal(process.env.PGHOST,'::1');assert.equal(process.env.PGPORT,'5432');
 const c=new Client();await c.connect();let total=0;const ok=m=>console.log('PASS '+(++total)+' '+m);
 try{
  const pin=await c.query('SELECT current_database() db,(SELECT system_identifier::text FROM pg_control_system()) pin');
  assert.equal(pin.rows[0].db,'sateer_test');assert.equal(pin.rows[0].pin,'7699611241381229531');ok('Base et cluster reel epingles');
  await c.query('BEGIN');
  let ddl=fs.readFileSync(path.join(__dirname,'../../database/055_energy_scope_delegation.sql'),'utf8');
  ddl=ddl.replace(/^([\s\S]*?)\bBEGIN;\s*/,'').replace(/\s*COMMIT;\s*$/,'');
  await c.query(ddl);ok('Schema 055 applicable en transaction isolee');
  const x=await c.query(`SELECT s.id,s.tenant_id,s.owner_personne_id,s.nom FROM energy_inventory_sites s
   JOIN tenants t ON t.id=s.tenant_id WHERE t.code='ENERGY_MVP01D_RECETTE' LIMIT 1`);
  assert.equal(x.rows.length,1);const s=x.rows[0];
  const priorRoot=await c.query('SELECT id FROM energy_scope_nodes WHERE site_id=$1 AND parent_id IS NULL LIMIT 1',[s.id]);
  let root=priorRoot.rows[0]?.id;
  if(!root){root=crypto.randomUUID();await c.query(`INSERT INTO energy_scope_nodes
    (id,site_id,tenant_id,owner_personne_id,parent_id,type_noeud,nom,request_key,content_hash,created_by)
    VALUES($1,$2,$3,$4,NULL,'SITE','SITE FICTIF',$5,$6,$4)`,[root,s.id,s.tenant_id,s.owner_personne_id,crypto.randomUUID(),'a'.repeat(64)]);}
  ok('Racine propre au site, existante ou creee dans la transaction');
  let parent=root;for(let i=1;i<=7;i++){
   const id=crypto.randomUUID();await c.query(`INSERT INTO energy_scope_nodes
    (id,site_id,tenant_id,owner_personne_id,parent_id,type_noeud,nom,request_key,content_hash,created_by)
    VALUES($1,$2,$3,$4,$5,'ZONE',$6,$7,$8,$4)`,[id,s.id,s.tenant_id,s.owner_personne_id,parent,'NIVEAU_FICTIF_'+i,crypto.randomUUID(),String(i).repeat(64)]);parent=id;
  }ok('Sept niveaux de lieux sans profondeur metier codee');
  const priorGrant=await c.query(`SELECT id FROM energy_scope_grants WHERE site_id=$1 AND role_scope='COORDINATEUR' LIMIT 1`,[s.id]);
  if(!priorGrant.rows.length){await c.query(`INSERT INTO energy_scope_grants(id,site_id,tenant_id,owner_personne_id,node_id,personne_id,parent_grant_id,role_scope)
   VALUES($1,$2,$3,$4,$5,$4,NULL,'COORDINATEUR')`,[crypto.randomUUID(),s.id,s.tenant_id,s.owner_personne_id,root]);}
  ok('Grant root sous controle Core, sans duplication');
  const lookup=await c.query(`WITH RECURSIVE ancestors(id,parent_id) AS (
   SELECT id,parent_id FROM energy_scope_nodes WHERE id=$1 UNION ALL SELECT p.id,p.parent_id FROM energy_scope_nodes p JOIN ancestors a ON p.id=a.parent_id
   ) SELECT count(*)::int AS n FROM ancestors`,[parent]);assert.equal(lookup.rows[0].n,8);ok('Ascendance de sept niveaux consultable');
  await c.query('SAVEPOINT reparent');
  let rejected=false;try{await c.query('UPDATE energy_scope_nodes SET parent_id=$1 WHERE id=$2',[parent,root]);}catch(e){rejected=true;assert.match(e.message,/ENERGY_SCOPE_IMMUTABLE_PARENT/);}
  await c.query('ROLLBACK TO SAVEPOINT reparent');assert.ok(rejected);ok('Reparentage/cycle interdits meme au niveau SQL');
  const ev=await c.query(`SELECT 1 FROM information_schema.tables WHERE table_name='energy_scope_events'`);assert.equal(ev.rows.length,1);ok('Journal de delegations present');
  console.log('ENERGY_SCOPE_PG_ROLLBACK_PASS='+total);
 }finally{await c.query('ROLLBACK').catch(()=>{});await c.end();}
}
run().catch(e=>{console.error('ENERGY_SCOPE_PG_ECHEC='+String(e.message||e));process.exitCode=1;});
