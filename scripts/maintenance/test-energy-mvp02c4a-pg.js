'use strict';
/** 059 rollback strict ; aucune création Core, aucune migration durable pendant le test. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Client}=require('pg'),uuid=()=>crypto.randomUUID(),h=()=>crypto.randomBytes(32).toString('hex');
let count=0;const ok=x=>console.log('PASS '+(++count)+' '+x);
async function main(){
 assert.equal(process.env.PGDATABASE,'sateer_test');assert.equal(process.env.PGHOST,'::1');assert.equal(process.env.PGPORT,'5432');
 const c=new Client();await c.connect();let inTx=false;
 try{
  const pin=await c.query("SELECT current_database() AS db,(SELECT system_identifier::text FROM pg_control_system()) AS pin");
  assert.equal(pin.rows[0].db,'sateer_test');assert.equal(pin.rows[0].pin,'7699611241381229531');ok('Cluster PostgreSQL et base de recette épinglés');
  const state=async()=>{const r=await c.query(`SELECT to_regclass('public.energy_topology_assets') IS NOT NULL a,
    to_regclass('public.energy_topology_links') IS NOT NULL l,to_regclass('public.energy_topology_usages') IS NOT NULL u,
    to_regclass('public.energy_topology_events') IS NOT NULL e`);return r.rows[0];};
  const before=await state();assert.equal(new Set(Object.values(before)).size,1);ok('Schéma 059 absent ou complet, jamais partiel');
  await c.query('BEGIN');inTx=true;
  let ddl=fs.readFileSync(path.join(__dirname,'../../database/059_energy_site_topology.sql'),'utf8');
  ddl=ddl.replace(/^[\s\S]*?\bBEGIN;\s*/,'').replace(/\s*COMMIT;\s*$/,'');
  await c.query(ddl);ok('Migration 059 applicable en transaction rollback');
  assert.deepEqual(await state(),{a:true,l:true,u:true,e:true});ok('Quatre tables, contraintes et triggers créés');
  const q=await c.query(`SELECT s.id,s.tenant_id,s.owner_personne_id,g.node_id AS root
   FROM energy_inventory_sites s JOIN tenants t ON t.id=s.tenant_id AND t.code='ENERGY_MVP01D_RECETTE'
   JOIN energy_scope_grants g ON g.site_id=s.id AND g.statut='ACTIF' AND g.role_scope='COORDINATEUR' LIMIT 1`);
  assert.equal(q.rows.length,1);const s=q.rows[0];ok('Site réel canonique C1 retrouvé sans création de compte');
  const eq=await c.query('SELECT id FROM energy_inventory_equipements WHERE site_id=$1 AND tenant_id=$2 AND owner_personne_id=$3 ORDER BY id LIMIT 1',[s.id,s.tenant_id,s.owner_personne_id]);
  assert.equal(eq.rows.length,1);ok('Équipement canonique 051/C2 déjà existant');
  async function addAsset(type,name,scope){const a=uuid();await c.query(`INSERT INTO energy_topology_assets
   (id,site_id,tenant_id,owner_personne_id,type_noeud,nom,scope_node_id,request_key,content_hash,auteur_personne_id)
   VALUES($1::uuid,$2,$3,$4,$5,$6,$7::uuid,$8::uuid,$9,$10)`,
   [a,s.id,s.tenant_id,s.owner_personne_id,type,name,scope,uuid(),h(),s.owner_personne_id]);return a;}
  async function addLink(source,type,destAsset,destScope,destEq){const a=uuid();await c.query(`INSERT INTO energy_topology_links
    (id,site_id,tenant_id,owner_personne_id,source_asset_id,target_asset_id,target_scope_node_id,target_equipment_id,
     type_lien,request_key,content_hash,auteur_personne_id)
     VALUES($1::uuid,$2,$3,$4,$5::uuid,$6::uuid,$7::uuid,$8,$9,$10::uuid,$11,$12)`,
    [a,s.id,s.tenant_id,s.owner_personne_id,source,destAsset,destScope,destEq,type,uuid(),h(),s.owner_personne_id]);return a;}
  const origin=await addAsset('SOURCE','Arrivée générale de recette',null),meter=await addAsset('COMPTEUR','Compteur secondaire de recette',s.root),
    tab=await addAsset('TABLEAU','TGBT de recette',s.root),tab2=await addAsset('TABLEAU','Tableau secondaire recette',null);
  ok('Quatre actifs électriques sans duplicata d’équipement canonique');
  const locations=[];
  for(const name of ['BATIMENT_A','BATIMENT_B']){const n=uuid();await c.query(`INSERT INTO energy_scope_nodes
   (id,site_id,tenant_id,owner_personne_id,parent_id,type_noeud,nom,request_key,content_hash,created_by)
   VALUES($1::uuid,$2,$3,$4,$5::uuid,'BATIMENT',$6,$7::uuid,$8,$9)`,[n,s.id,s.tenant_id,s.owner_personne_id,s.root,'RECETTE_C4A_'+name+'_'+n.slice(0,8),uuid(),h(),s.owner_personne_id]);locations.push(n);}
  ok('Deux bâtiments C1 réels, créés seulement dans le rollback');
  const lm1=await addLink(meter,'MESURE',null,locations[0],null),lm2=await addLink(meter,'MESURE',null,locations[1],null);
  assert.notEqual(lm1,lm2);ok('Un même compteur mesure deux bâtiments distincts');
  await addLink(origin,'ALIMENTE',meter,null,null);await addLink(meter,'ALIMENTE',tab,null,null);
  const toTab2=await addLink(tab,'ALIMENTE',tab2,null,null);ok('Chaîne électrique Source → Compteur → TGBT → secondaire');
  await addLink(tab2,'DESSERT',null,locations[0],null);await addLink(tab2,'DESSERT',null,locations[1],null);
  ok('Un tableau secondaire dessert plusieurs bâtiments sans fusionner les lieux');
  await addLink(tab2,'ALIMENTE',null,null,eq.rows[0].id);ok('Lien vers équipement canonique 051 sans nouvel appareil');
  async function shouldReject(name,fn,matcher){await c.query('SAVEPOINT c4a_reject');let err=null;try{await fn();}catch(e){err=e;}await c.query('ROLLBACK TO SAVEPOINT c4a_reject');assert.ok(err,name);assert.ok(matcher(err),name+': '+err.message);ok(name);}
  await shouldReject('Boucle électrique T2 → TGBT refusée par SQL',()=>addLink(tab2,'ALIMENTE',tab,null,null),e=>String(e.message).includes('ENERGY_C4A_BOUCLE_ALIMENTATION'));
  await shouldReject('MESURE depuis un tableau refusée',()=>addLink(tab,'MESURE',null,locations[0],null),e=>String(e.message).includes('ENERGY_C4A_MESURE_COMPTEUR_REQUIS'));
  await shouldReject('DESSERT depuis compteur refusé',()=>addLink(meter,'DESSERT',null,locations[0],null),e=>String(e.message).includes('ENERGY_C4A_DESSERT_TABLEAU_REQUIS'));
  await shouldReject('Cible d’un autre périmètre ou inconnue interdite par FK',()=>addLink(meter,'MESURE',null,uuid(),null),e=>e.code==='23503');
  await shouldReject('Deux cibles simultanées refusées',()=>addLink(tab,'ALIMENTE',tab2,locations[0],null),e=>e.code==='23514');
  await shouldReject('Relation identique active non dupliquée',()=>addLink(meter,'MESURE',null,locations[0],null),e=>e.code==='23505');
  const u=uuid();await c.query(`INSERT INTO energy_topology_usages
   (id,site_id,tenant_id,owner_personne_id,equipment_id,usage,commentaire,request_key,content_hash,auteur_personne_id)
   VALUES($1::uuid,$2,$3,$4,$5,'FROID','Recette uniquement',$6::uuid,$7,$8)`,[u,s.id,s.tenant_id,s.owner_personne_id,eq.rows[0].id,uuid(),h(),s.owner_personne_id]);
  ok('Fonction FROID liée à l’équipement 051, sans duplication de passeport');
  await shouldReject('Usage identique refusé sur même équipement',async()=>{await c.query(`INSERT INTO energy_topology_usages
   (id,site_id,tenant_id,owner_personne_id,equipment_id,usage,request_key,content_hash,auteur_personne_id)
   VALUES($1::uuid,$2,$3,$4,$5,'FROID',$6::uuid,$7,$8)`,[uuid(),s.id,s.tenant_id,s.owner_personne_id,eq.rows[0].id,uuid(),h(),s.owner_personne_id]);},e=>e.code==='23505');
  await c.query(`UPDATE energy_topology_links SET actif=FALSE,date_retrait=NOW(),retire_par=$2 WHERE id=$1::uuid`,[toTab2,s.owner_personne_id]);
  ok('Retrait d’un lien sans effacer sa cible ni son origine');
  await shouldReject('Réactivation silencieuse refusée',()=>c.query(`UPDATE energy_topology_links SET actif=TRUE,date_retrait=NULL,retire_par=NULL WHERE id=$1::uuid`,[toTab2]),e=>String(e.message).includes('ENERGY_C4A_REACTIVATION_REFUSEE'));
  await c.query(`INSERT INTO energy_topology_events(site_id,tenant_id,owner_personne_id,acteur_personne_id,action,entity_id,details)
   VALUES($1,$2,$3,$4,'TopologyLinkDeclared.v1',$5::uuid,'{}'::jsonb)`,[s.id,s.tenant_id,s.owner_personne_id,s.owner_personne_id,lm1]);
  await shouldReject('Historique impossible à supprimer',()=>c.query('DELETE FROM energy_topology_events WHERE entity_id=$1::uuid',[lm1]),e=>String(e.message).includes('ENERGY_C4A_IMMUABLE'));
  await c.query('ROLLBACK');inTx=false;ok('ROLLBACK intégral sans donnée fictive conservée');
  assert.deepEqual(await state(),before);ok('Schéma identique à l’état avant test');
  console.log('C4A_POSTGRES_PASS='+count);
 }finally{if(inTx)await c.query('ROLLBACK').catch(()=>{});await c.end();}
}
main().catch(e=>{console.error('ENERGY_TOPOLOGY_PG_ECHEC',e.code||e.message);process.exitCode=1;});
