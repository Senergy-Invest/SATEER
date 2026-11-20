'use strict';
/** Recette C4C, vraie base PostgreSQL, transaction explicitement READ ONLY. */
const assert=require('node:assert/strict');
const {Client}=require('pg');
const {creerEnergyDashboardStore}=require('../../energy/energy-dashboard-store');
const TENANT='ENERGY_MVP01D_RECETTE';
const PIN='7699611241381229531';
let count=0;
const pass=x=>console.log(`PASS ${++count} ${x}`);
async function main(){
 assert.equal(process.env.PGDATABASE,'sateer_test');
 assert.equal(process.env.PGHOST,'::1');assert.equal(process.env.PGPORT,'5432');
 const c=new Client();await c.connect();let begun=false;
 try {
  const db=(await c.query('SELECT current_database() AS db,(SELECT system_identifier::text FROM pg_control_system()) AS pin')).rows[0];
  assert.equal(db.db,'sateer_test');assert.equal(db.pin,PIN);pass('Base et cluster de recette certifiés');
  await c.query('BEGIN READ ONLY');begun=true;
  const tables=await c.query(`SELECT to_regclass('public.energy_scope_nodes') IS NOT NULL AS c1,
    to_regclass('public.energy_scope_proposals') IS NOT NULL AS c2,
    to_regclass('public.energy_topology_assets') IS NOT NULL AS c4a,
    to_regclass('public.energy_sketch_positions') IS NOT NULL AS c4b`);
  assert.deepEqual(tables.rows[0],{c1:true,c2:true,c4a:true,c4b:true});pass('Sources canoniques 055,056,059,060 présentes');
  const fixture=await c.query(`SELECT s.public_id,s.id,s.owner_personne_id FROM energy_inventory_sites s
    JOIN tenants t ON t.id=s.tenant_id AND t.actif=TRUE
    JOIN energy_scope_nodes n ON n.site_id=s.id AND n.parent_id IS NULL
    WHERE t.code=$1 ORDER BY s.id LIMIT 1`,[TENANT]);
  assert.equal(fixture.rows.length,1,'Recette C1 non préparée');const s=fixture.rows[0];
  const facade={query:(...args)=>c.query(...args),release(){}};
  const store=creerEnergyDashboardStore({obtenirClient:async()=>facade});
  const view=await store.synthese({tenant:TENANT,actor:Number(s.owner_personne_id),siteId:s.public_id});
  assert.equal(view.statutStructure,'DISPONIBLE');assert.equal(view.acces.complet,true);
  assert.ok(view.indicateurs.unites>=1);assert.equal(view.mesuresDisponibles,false);
  pass('Projection propriétaire lue sous transaction READ ONLY');
  const foreign=await store.synthese({tenant:TENANT,actor:-8,siteId:s.public_id});
  assert.equal(foreign,null);pass('Autre identité ne voit pas la synthèse du propriétaire');
  const random='00000000-0000-4000-8000-000000000000';
  const missing=await store.synthese({tenant:TENANT,actor:Number(s.owner_personne_id),siteId:random});
  assert.equal(missing,null);pass('Site inexistant non révélé');
  const sites=await store.sites({tenant:TENANT,actor:Number(s.owner_personne_id),offset:0});
  assert.ok(sites.sites.some(x=>x.id===String(s.public_id)));pass('Liste des sites réellement autorisés');
  assert.ok(!JSON.stringify(view).match(/photo|qr_token|secret|patient|\"kwh\"/i));
  pass('Aucune donnée confidentielle ou kWh synthétique dans la projection');
  await c.query('ROLLBACK');begun=false;pass('Fin du test sans aucune écriture persistante');
  console.log('C4C_PG_READ_ONLY_PASS='+count);
 } finally {if(begun)await c.query('ROLLBACK').catch(()=>{});await c.end();}
}
main().catch(e=>{console.error('C4C_PG_ECHEC',e.code||e.message);process.exitCode=1;});
