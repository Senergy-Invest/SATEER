'use strict';
/** PostgreSQL transaction ROLLBACK : schéma 060, références C1/C4A, changements historisés. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{Client}=require('pg');
let n=0;const ok=s=>console.log('PASS '+(++n)+' '+s);const uuid=()=>crypto.randomUUID();
async function main(){assert.equal(process.env.PGDATABASE,'sateer_test');assert.equal(process.env.PGHOST,'::1');assert.equal(process.env.PGPORT,'5432');
 const c=new Client();await c.connect();let tx=false;try{
 const pin=await c.query('SELECT current_database() AS db,(SELECT system_identifier::text FROM pg_control_system()) AS pin');
 assert.equal(pin.rows[0].db,'sateer_test');assert.equal(pin.rows[0].pin,'7699611241381229531');ok('Base et cluster PostgreSQL réels épinglés');
 await c.query('BEGIN');tx=true;
 let sql=fs.readFileSync(path.join(__dirname,'../../database/060_energy_site_sketch.sql'),'utf8');sql=sql.replace(/^([\s\S]*?)\bBEGIN;\s*/,'').replace(/\s*COMMIT;\s*$/,'');await c.query(sql);ok('Migration 060 applicable en transaction isolée');
 const tables=await c.query(`SELECT to_regclass('public.energy_sketch_positions') IS NOT NULL AS p,to_regclass('public.energy_sketch_events') IS NOT NULL AS e`);assert.deepEqual(tables.rows[0],{p:true,e:true});ok('Deux tables de disposition et audit en place');
 const r=await c.query(`SELECT s.id,s.tenant_id,s.owner_personne_id,n.id AS node_id,a.id AS asset_id,e.id AS eq_id
  FROM energy_inventory_sites s JOIN tenants t ON t.id=s.tenant_id AND t.code='ENERGY_MVP01D_RECETTE'
  JOIN energy_scope_nodes n ON n.site_id=s.id AND n.parent_id IS NULL
  JOIN energy_topology_assets a ON a.site_id=s.id JOIN energy_inventory_equipements e ON e.site_id=s.id
  WHERE a.tenant_id=s.tenant_id AND e.tenant_id=s.tenant_id LIMIT 1`);
 assert.equal(r.rows.length,1);const s=r.rows[0];ok('Site C1, équipement C4A et machine canonique préexistants');
 async function add(view,field,target){const id=uuid();const cols={scope_node_id:null,asset_id:null,equipment_id:null};cols[field]=target;
  await c.query(`INSERT INTO energy_sketch_positions (id,site_id,tenant_id,owner_personne_id,vue,scope_node_id,asset_id,equipment_id,x,y,updated_by)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,20,30,$9)`,[id,s.id,s.tenant_id,s.owner_personne_id,view,cols.scope_node_id,cols.asset_id,cols.equipment_id,s.owner_personne_id]);return id;}
 const node=await add('PHYSIQUE','scope_node_id',s.node_id);ok('Position du bâtiment / racine C1');
 await add('ELECTRIQUE','asset_id',s.asset_id);ok('Position compteur ou tableau C4A');
 await add('FONCTIONNELLE','equipment_id',s.eq_id);ok('Position machine 051/C2');
 await c.query('SAVEPOINT duplicates');
 await assert.rejects(()=>add('PHYSIQUE','scope_node_id',s.node_id),e=>e.code==='23505');await c.query('ROLLBACK TO SAVEPOINT duplicates');ok('Unicité position vue + élément');
 await c.query('UPDATE energy_sketch_positions SET x=55,y=80,revision=2 WHERE id=$1',[node]);ok('Changement position versionné');
 await c.query('SAVEPOINT immutable');await assert.rejects(()=>c.query('UPDATE energy_sketch_positions SET vue=$1,revision=3 WHERE id=$2',['ELECTRIQUE',node]));await c.query('ROLLBACK TO SAVEPOINT immutable');ok('Changement de référence ou de vue interdit');
 const key=uuid();const eventId=(await c.query(`INSERT INTO energy_sketch_events
  (site_id,tenant_id,owner_personne_id,acteur_personne_id,position_id,vue,request_key,content_hash,revision,x,y)
  VALUES($1,$2,$3,$4,$5,'PHYSIQUE',$6,$7,2,55,80) RETURNING id`,[s.id,s.tenant_id,s.owner_personne_id,s.owner_personne_id,node,key,'a'.repeat(64)])).rows[0].id;
 ok('Événement de déplacement horodaté');
 await c.query('SAVEPOINT event');await assert.rejects(()=>c.query('DELETE FROM energy_sketch_events WHERE id=$1',[eventId]));await c.query('ROLLBACK TO SAVEPOINT event');ok('Audit non supprimable');
 await c.query('SAVEPOINT cross_site_guard');await assert.rejects(()=>c.query(`INSERT INTO energy_sketch_positions
 (id,site_id,tenant_id,owner_personne_id,vue,scope_node_id,x,y,updated_by)
 VALUES($1,$2,$3,$4,'PHYSIQUE',$5,10,20,$6)`,[uuid(),s.id,s.tenant_id,s.owner_personne_id,uuid(),s.owner_personne_id]),e=>e.code==='23503');await c.query('ROLLBACK TO SAVEPOINT cross_site_guard');ok('Référence inexistante / cross-site refusée');
 await c.query('ROLLBACK');tx=false;ok('Rollback complet : données de recette non persistées');console.log('C4B_PG_PASS='+n);
 }finally{if(tx)await c.query('ROLLBACK').catch(()=>{});await c.end();}}
main().catch(e=>{console.error('C4B_PG_ECHEC',e.code||e.message);process.exitCode=1;});
