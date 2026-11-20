'use strict';
/** C4C3 PostgreSQL réel : uniquement lecture, BEGIN READ ONLY + ROLLBACK. */
const assert=require('node:assert/strict'),{Client}=require('pg');
const {creerEnergyDashboardStore}=require('../../energy/energy-dashboard-store');
const TENANT='ENERGY_MVP01D_RECETTE',PIN='7699611241381229531';
let n=0;const ok=x=>console.log('C4C3_PG_PASS_'+(++n)+' '+x);
async function main(){
 assert.equal(process.env.PGDATABASE,'sateer_test');assert.equal(process.env.PGHOST,'::1');assert.equal(process.env.PGPORT,'5432');
 const db=new Client();await db.connect();let tx=false;
 try{
  const meta=(await db.query('SELECT current_database() AS db,(SELECT system_identifier::text FROM pg_control_system()) AS pin')).rows[0];
  assert.equal(meta.db,'sateer_test');assert.equal(meta.pin,PIN);ok('Base et cluster connus');
  await db.query('BEGIN READ ONLY');tx=true;
  const columns=await db.query(`SELECT column_name FROM information_schema.columns
   WHERE table_schema='public' AND table_name='energy_scope_proposals'
    AND column_name IN ('id','reviewer_grant_id','statut','date_modification','scope_node_id')`);
  assert.equal(columns.rows.length,5);ok('Contrat canonique C2 connu');
  const q=await db.query(`SELECT s.public_id,s.id,s.owner_personne_id FROM energy_inventory_sites s
    JOIN tenants t ON t.id=s.tenant_id AND t.actif=TRUE
    JOIN energy_scope_nodes n ON n.site_id=s.id AND n.parent_id IS NULL
    WHERE t.code=$1 ORDER BY s.id LIMIT 1`,[TENANT]);
  assert.equal(q.rows.length,1,'SITE_FIXTURE_ABSENT');const site=q.rows[0];ok('Site de recette C1 vérifié');
  const facade={query:(...args)=>db.query(...args),release(){}};
  const store=creerEnergyDashboardStore({obtenirClient:async()=>facade}),owner=Number(site.owner_personne_id);
  const all=await store.actions({tenant:TENANT,actor:owner,siteId:site.public_id});
  assert.ok(all&&all.acces.complet);assert.equal(all.statutStructure,'DISPONIBLE');
  assert.ok(all.actions.every(a=>['RELECTEUR_ACTIF','SANS_RELECTEUR_ACTIF','NON_APPLICABLE'].includes(a.suiviRelecture)));
  ok('File C4C2 conservée et diagnostic C4C3 présent');
  const orphan=await store.actions({tenant:TENANT,actor:owner,siteId:site.public_id,suivi:'SANS_RELECTEUR_ACTIF'});
  assert.ok(orphan);assert.ok(orphan.actions.every(a=>a.statut==='EN_REVUE'&&a.suiviRelecture==='SANS_RELECTEUR_ACTIF'));
  ok('Filtre propriétaire en revue sans relecteur actif');
  assert.ok(!/"reviewer_grant_id"|"auteur_personne_id"|"personneId"|"email"|"kwh"|"puissance"/i.test(JSON.stringify(orphan)));
  ok('Aucune identité, permission technique ou énergie exposée');
  const foreign=await store.actions({tenant:TENANT,actor:-50,siteId:site.public_id,suivi:'SANS_RELECTEUR_ACTIF'});
  assert.equal(foreign,null);ok('Diagnostic interdit au compte étranger');
  const gr=await db.query(`SELECT g.id,g.personne_id FROM energy_scope_grants g
    WHERE g.site_id=$1 AND g.personne_id<>$2 AND g.statut='ACTIF' ORDER BY g.date_creation LIMIT 1`,[site.id,owner]);
  if(gr.rows.length){const g=gr.rows[0],denied=await store.actions({tenant:TENANT,actor:Number(g.personne_id),siteId:site.public_id,grantId:g.id,suivi:'SANS_RELECTEUR_ACTIF'});
   assert.equal(denied,null);ok('Filtre propriétaire interdit au collaborateur C1');}
  else ok('Aucun collaborateur actif, permission supplémentaire non créée');
  const normal=await store.actions({tenant:TENANT,actor:owner,siteId:site.public_id,statut:'EN_REVUE'});
  assert.ok(normal&&normal.actions.every(a=>a.statut==='EN_REVUE'));ok('Ancien filtre C4C2 inchangé');
  await db.query('ROLLBACK');tx=false;ok('Transaction READ ONLY terminée sans mutation');
  console.log('C4C3_PG_TOTAL='+n);
 }finally{if(tx)await db.query('ROLLBACK').catch(()=>{});await db.end();}
}
main().catch(e=>{console.error('C4C3_PG_ECHEC',e.code||e.message);process.exitCode=1;});
