'use strict';
/** PostgreSQL réel: uniquement SELECT et transactions READ ONLY. */
const assert=require('node:assert/strict');const {Client}=require('pg');
const {creerEnergyMeterProximityStore}=require('../../energy/energy-meter-proximity-store');
const TENANT='ENERGY_MVP01D_RECETTE',CLUSTER='7699611241381229531';let count=0;
const ok=t=>console.log('EMETER1C3_PG_PASS_'+(++count)+' '+t);
async function main(){
 assert.equal(process.env.PGDATABASE,'sateer_test');assert.equal(process.env.PGHOST,'::1');assert.equal(process.env.PGPORT,'5432');
 const c=new Client();await c.connect();try{
  const x=(await c.query('SELECT current_database() db,(SELECT system_identifier::text FROM pg_control_system()) cluster')).rows[0];
  assert.deepEqual(x,{db:'sateer_test',cluster:CLUSTER});ok('Base et cluster verrouilles');
  const u=(await c.query(`SELECT 1 FROM pg_indexes WHERE tablename='energy_meter_readings' AND indexname='uq_meter_reading_instant'`)).rows;
  assert.equal(u.length,1);ok('Unicite du registre et instant conservee');
  const idx=(await c.query(`SELECT 1 FROM pg_indexes WHERE tablename='energy_meter_readings' AND indexname='ix_meter_readings_history'`)).rows;
  assert.equal(idx.length,1);ok('Index historique present');
  const a=(await c.query(`SELECT s.public_id,s.owner_personne_id FROM energy_inventory_sites s JOIN tenants t ON t.id=s.tenant_id AND t.actif=true
    WHERE t.code=$1 AND s.nom='RECETTE SYNTHETIQUE MVP01D' ORDER BY s.id LIMIT 1`,[TENANT])).rows[0];
  assert.ok(a);ok('Site de recette synthetique confirme');
  const proxy={query:(...args)=>c.query(...args),release(){}};
  const store=creerEnergyMeterProximityStore({obtenirClient:async()=>proxy});
  const scope={tenant:TENANT,actor:Number(a.owner_personne_id),siteId:a.public_id};
  const sites=await store.sites(scope);assert.ok(sites.sites.some(s=>s.id===String(a.public_id)));ok('Site possede uniquement');
  const data=await store.releves(scope);assert.ok(data&&data.items.length<=50&&data.aucunCalculConsommation);ok('Projection page maximum 50');
  assert.ok(data.items.every(it=>it.signaux.every(s=>['RELEVES_RAPPROCHES_DIFFERENTS','RELEVES_RAPPROCHES_IDENTIQUES'].includes(s.code))));
  ok('Codes fermes des signaux');
  assert.equal(await store.releves({...scope,actor:-17}),null);ok('Proprietaire absent refuse');
  assert.equal(await store.releves({...scope,siteId:'00000000-0000-4000-8000-000000000000'}),null);ok('Site inexistant refuse');
  assert.equal(await store.releves({...scope,tenant:'AUTRE_TENANT'}),null);ok('Tenant etranger refuse');
  const other=await store.releves({...scope,offset:50});assert.ok(other.items.length<=50);ok('Pagination borne');
  console.log('EMETER1C3_PG_READ_ONLY_TOTAL='+count);
 }finally{await c.end();}}
main().catch(e=>{console.error('EMETER1C3_PG_ECHEC',e.code||e.message);process.exitCode=1;});
