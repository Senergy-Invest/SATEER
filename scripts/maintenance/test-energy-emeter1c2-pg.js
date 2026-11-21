'use strict';
/** Recette réelle sur le cluster sateer_test, GET en transactions READ ONLY, zéro écriture. */
const assert=require('node:assert/strict');
const {Client}=require('pg');
const {creerEnergyMeterQualityStore}=require('../../energy/energy-meter-quality-store');
const TENANT='ENERGY_MVP01D_RECETTE',CLUSTER='7699611241381229531';
let total=0;const pass=s=>console.log('EMETER1C2_PG_PASS_'+(++total)+' '+s);
async function main(){
 assert.equal(process.env.PGDATABASE,'sateer_test');
 assert.equal(process.env.PGHOST,'::1');assert.equal(process.env.PGPORT,'5432');
 const c=new Client();await c.connect();
 try{
  const a=(await c.query('SELECT current_database() AS db,(SELECT system_identifier::text FROM pg_control_system()) AS cluster')).rows[0];
  assert.equal(a.db,'sateer_test');assert.equal(a.cluster,CLUSTER);pass('Base et cluster certifies');
  const tables=(await c.query(`SELECT to_regclass('public.energy_meter_readings') IS NOT NULL AS releves,
   to_regclass('public.energy_billing_declarations') IS NOT NULL AS factures,
   to_regclass('public.energy_billing_attachments') IS NOT NULL AS justificatifs,
   to_regclass('public.energy_billing_rectifications') IS NOT NULL AS rectifications`)).rows[0];
  assert.deepEqual(tables,{releves:true,factures:true,justificatifs:true,rectifications:true});pass('Schémas 061-064 presents');
  const site=(await c.query(`SELECT s.public_id,s.owner_personne_id FROM energy_inventory_sites s
     JOIN tenants t ON t.id=s.tenant_id AND t.actif=TRUE WHERE t.code=$1 ORDER BY s.id LIMIT 1`,[TENANT])).rows[0];
  assert.ok(site,'SITE_RECETTE_ABSENT');pass('Site de recette present');
  const proxy={query:(...args)=>c.query(...args),release(){}};
  const store=creerEnergyMeterQualityStore({obtenirClient:async()=>proxy});
  const s={tenant:TENANT,actor:Number(site.owner_personne_id),siteId:site.public_id};
  const list=await store.sites(s);assert.ok(list.sites.some(x=>x.id===String(site.public_id)));pass('Proprietaire voit site');
  const readings=await store.releves(s);assert.ok(readings&&Array.isArray(readings.items));
  assert.equal(readings.aucunCalculConsommation,true);assert.ok(readings.items.length<=50);
  assert.ok(readings.items.every(x=>x.signaux.every(y=>['INDEX_EN_BAISSE','INDEX_INCHANGE'].includes(y.code))));pass('Releves READ ONLY, signaux limites, 50 maxi');
  const docs=await store.documents(s);assert.ok(docs&&Array.isArray(docs.items));
  assert.equal(docs.aucunCalculConsommation,true);assert.ok(docs.items.length<=50);
  assert.ok(docs.items.every(x=>x.signaux.every(y=>['REFERENCE_REPETEE','PIECE_NON_ASSOCIEE'].includes(y.code))));
  assert.equal(new Set(docs.items.map(x=>x.id)).size,docs.items.length);pass('Documents courants sans doublons racines');
  assert.equal(await store.releves({...s,actor:-5}),null);pass('Identite etrangere refusee relevés');
  assert.equal(await store.documents({...s,actor:-5}),null);pass('Identite etrangere refusee documents');
  assert.equal(await store.releves({...s,tenant:'AUTRE_TENANT'}),null);pass('Tenant etranger refuse');
  assert.equal(await store.documents({...s,siteId:'00000000-0000-4000-8000-000000000000'}),null);pass('Site absent refuse');
  const page2=await store.releves({...s,offset:50});assert.ok(page2.items.length<=50);pass('Pagination lecture seule');
  console.log('EMETER1C2_PG_READ_ONLY_TOTAL='+total);
 }finally{await c.end();}
}
main().catch(e=>{console.error('EMETER1C2_PG_ECHEC',e.code||e.message);process.exitCode=1;});
