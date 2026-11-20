'use strict';
/** C4C2 : vérification PostgreSQL réelle, BEGIN READ ONLY et ROLLBACK. */
const assert=require('node:assert/strict'),{Client}=require('pg');
const {creerEnergyDashboardStore}=require('../../energy/energy-dashboard-store');
const TENANT='ENERGY_MVP01D_RECETTE',PIN='7699611241381229531';
let n=0;const ok=x=>console.log('PASS '+(++n)+' '+x);
async function main(){
 assert.equal(process.env.PGDATABASE,'sateer_test');assert.equal(process.env.PGHOST,'::1');assert.equal(process.env.PGPORT,'5432');
 const c=new Client();await c.connect();let tx=false;
 try{
  const meta=(await c.query('SELECT current_database() AS db,(SELECT system_identifier::text FROM pg_control_system()) AS pin')).rows[0];
  assert.equal(meta.db,'sateer_test');assert.equal(meta.pin,PIN);ok('Base et cluster PG épinglés');
  await c.query('BEGIN READ ONLY');tx=true;
  const r=await c.query("SELECT to_regclass('public.energy_scope_proposals') IS NOT NULL AS c2,to_regclass('public.energy_scope_grants') IS NOT NULL AS c1");
  assert.deepEqual(r.rows[0],{c2:true,c1:true});ok('Sources canoniques C1/C2 installées');
  const fixtures=await c.query(`SELECT s.public_id,s.id,s.owner_personne_id FROM energy_inventory_sites s
   JOIN tenants t ON t.id=s.tenant_id AND t.actif=TRUE JOIN energy_scope_nodes n ON n.site_id=s.id AND n.parent_id IS NULL
   WHERE t.code=$1 ORDER BY s.id LIMIT 1`,[TENANT]);
  assert.equal(fixtures.rows.length,1,'SITE_RECETTE_C1_ABSENT');const site=fixtures.rows[0];
  const facade={query:(...args)=>c.query(...args),release(){}};
  const store=creerEnergyDashboardStore({obtenirClient:async()=>facade});
  const owner=Number(site.owner_personne_id);
  const actions=await store.actions({tenant:TENANT,actor:owner,siteId:site.public_id});
  assert.equal(actions.acces.complet,true);assert.equal(actions.statutStructure,'DISPONIBLE');
  assert.ok(Array.isArray(actions.actions));assert.equal(actions.limite,50);ok('File réelle propriétaire en lecture seule');
  assert.ok(actions.actions.every(a=>['EN_REVUE','A_CORRIGER'].includes(a.statut)&&Number.isSafeInteger(a.joursDepuisModification)&&a.joursDepuisModification>=0));
  assert.ok(!JSON.stringify(actions).match(/"kwh"|"economies"|"auteurPersonneId"|motDePasse|qr_token/i));ok('Statuts réels et aucune donnée énergétique ou personnelle interdite');
  const filtered=await store.actions({tenant:TENANT,actor:owner,siteId:site.public_id,statut:'EN_REVUE'});
  assert.ok(filtered.actions.every(a=>a.statut==='EN_REVUE'));ok('Filtre C2 EN_REVUE réel');
  const foreign=await store.actions({tenant:TENANT,actor:-8,siteId:site.public_id});assert.equal(foreign,null);ok('Acteur étranger refusé avant proposition');
  const fake=await store.actions({tenant:TENANT,actor:owner,siteId:'00000000-0000-4000-8000-000000000000'});
  assert.equal(fake,null);ok('Aucun oracle de site inexistant');
  const gr=await c.query(`SELECT g.id,g.personne_id FROM energy_scope_grants g WHERE g.site_id=$1
   AND g.personne_id<>$2 AND g.statut='ACTIF' ORDER BY g.date_creation LIMIT 1`,[site.id,owner]);
  if(gr.rows.length){const g=gr.rows[0],v=await store.actions({tenant:TENANT,actor:Number(g.personne_id),siteId:site.public_id,grantId:g.id});
   assert.ok(v&&!v.acces.complet);assert.ok(v.actions.every(a=>a.pourMoi));ok('Collaborateur restreint à ses propositions actionnables');}
  else ok('Pas de collaborateur actif : aucun droit ajouté pour ce test');
  await c.query('ROLLBACK');tx=false;ok('Transaction terminée sans écriture');
  console.log('C4C2_PG_PASS='+n);
 } finally{if(tx)await c.query('ROLLBACK').catch(()=>{});await c.end();}
}
main().catch(e=>{console.error('C4C2_PG_ECHEC',e.code||e.message);process.exitCode=1;});
