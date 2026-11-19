'use strict';
/** Test SQL 058 sous rollback intégral, aucune migration permanente implicite. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Client}=require('pg');const uuid=()=>crypto.randomUUID(),hash=()=>crypto.randomBytes(32).toString('hex');
let n=0;const ok=s=>console.log('PASS '+(++n)+' '+s);
async function main(){
 assert.equal(process.env.PGDATABASE,'sateer_test');assert.equal(process.env.PGHOST,'::1');assert.equal(process.env.PGPORT,'5432');
 const c=new Client();await c.connect();let active=false;
 try{
  const pin=await c.query('SELECT current_database() AS db,(SELECT system_identifier::text FROM pg_control_system()) AS pin');
  assert.equal(pin.rows[0].db,'sateer_test');assert.equal(pin.rows[0].pin,'7699611241381229531');ok('Cluster et base de recette épinglés');
  const before=await c.query("SELECT to_regclass('public.energy_catalog_collab_proposals') IS NOT NULL p,to_regclass('public.energy_catalog_collab_events') IS NOT NULL e");
  assert.equal(before.rows[0].p,before.rows[0].e);ok('Absence de schéma partiel 058');
  await c.query('BEGIN');active=true;
  let ddl=fs.readFileSync(path.join(__dirname,'../../database/058_energy_catalogue_collaboration.sql'),'utf8');
  ddl=ddl.replace(/^([\s\S]*?)\bBEGIN;\s*/,'').replace(/\s*COMMIT;\s*$/,'');
  await c.query(ddl);ok('Migration 058 exécutable dans transaction ROLLBACK');
  const tables=await c.query("SELECT to_regclass('public.energy_catalog_collab_proposals') IS NOT NULL p,to_regclass('public.energy_catalog_collab_events') IS NOT NULL e");
  assert.deepEqual(tables.rows[0],{p:true,e:true});ok('Tables de propositions et historique présentes');
  const sq=await c.query(`SELECT s.id,s.tenant_id,s.owner_personne_id,s.public_id,g.id AS root_grant,g.node_id AS root_node,
   (SELECT id FROM energy_inventory_zones z WHERE z.site_id=s.id ORDER BY id LIMIT 1) AS zone_id
   FROM energy_inventory_sites s JOIN tenants t ON t.id=s.tenant_id AND t.code='ENERGY_MVP01D_RECETTE'
   JOIN energy_scope_grants g ON g.site_id=s.id AND g.role_scope='COORDINATEUR' AND g.statut='ACTIF' LIMIT 1`);
  assert.equal(sq.rows.length,1);const s=sq.rows[0];assert.ok(s.zone_id);ok('Site C1/C2 canonique existant');
  const b=await c.query(`SELECT p.auteur_personne_id AS id FROM energy_scope_proposals p WHERE p.site_id=$1
    AND p.auteur_personne_id<>$2 LIMIT 1`,[s.id,s.owner_personne_id]);assert.equal(b.rows.length,1);
  const person=b.rows[0].id;ok('Compte B fictif déjà existant, aucun compte créé');
  const node=uuid(),grant=uuid(),eqPub=uuid(),c2=uuid(),c3b=uuid(),ref=uuid();
  await c.query(`INSERT INTO energy_scope_nodes
   (id,site_id,tenant_id,owner_personne_id,parent_id,type_noeud,nom,request_key,content_hash,created_by)
   VALUES($1,$2,$3,$4,$5::uuid,'BUREAU',$6,$7::uuid,$8,$9)`,
   [node,s.id,s.tenant_id,s.owner_personne_id,s.root_node,'RECETTE_C3B_'+node.slice(0,8),uuid(),hash(),s.owner_personne_id]);
  await c.query(`INSERT INTO energy_scope_grants
   (id,site_id,tenant_id,owner_personne_id,node_id,personne_id,parent_grant_id,role_scope)
   VALUES($1,$2,$3,$4,$5::uuid,$6,$7::uuid,'OCCUPANT')`,
   [grant,s.id,s.tenant_id,s.owner_personne_id,node,person,s.root_grant]);ok('Délégation A→B dans la transaction isolée');
  const eq=await c.query(`INSERT INTO energy_inventory_equipements(public_id,site_id,zone_id,tenant_id,owner_personne_id,request_key,content_hash,nom,famille,quantite)
   VALUES($1,$2,$3,$4,$5,$6::uuid,$7,'Compresseur fictif PG C3B','FROID',1) RETURNING id`,
   [eqPub,s.id,s.zone_id,s.tenant_id,s.owner_personne_id,uuid(),hash()]);
  await c.query(`INSERT INTO energy_scope_proposals
   (id,site_id,tenant_id,owner_personne_id,source_grant_id,scope_node_id,auteur_personne_id,reviewer_grant_id,
    request_key,content_hash,nom,famille,quantite,statut,equipment_id,date_cloture)
   VALUES($1,$2,$3,$4,$5::uuid,$6::uuid,$7,NULL,$8::uuid,$9,'Compresseur fictif PG C3B','FROID',1,'INTEGREE',$10,NOW())`,
   [c2,s.id,s.tenant_id,s.owner_personne_id,grant,node,person,uuid(),hash(),eq.rows[0].id]);
  ok('Source C2 intégrée et reliée à un inventaire canonique');
  await c.query(`INSERT INTO energy_catalog_collab_proposals
   (id,site_id,tenant_id,owner_personne_id,source_grant_id,scope_node_id,c2_proposal_id,auteur_personne_id,
    reviewer_grant_id,request_key,content_hash,famille,sous_famille,designation,marque,modele)
   VALUES($1,$2,$3,$4,$5::uuid,$6::uuid,$7::uuid,$8,$9::uuid,$10::uuid,$11,'FROID','Compresseur','Compresseur froid','TEST_C3B','MAQUETTE_1')`,
   [c3b,s.id,s.tenant_id,s.owner_personne_id,grant,node,c2,person,s.root_grant,uuid(),hash()]);
  ok('Proposition technique C3B dans le seul site et le seul bureau');
  await c.query('SAVEPOINT bad_fk');let denied=false;
  try{await c.query(`INSERT INTO energy_catalog_collab_proposals
    (id,site_id,tenant_id,owner_personne_id,source_grant_id,scope_node_id,c2_proposal_id,auteur_personne_id,
     reviewer_grant_id,request_key,content_hash,famille,sous_famille,designation)
    VALUES($1,$2,$3,$4,$5::uuid,$6::uuid,$7::uuid,$8,$9::uuid,$10::uuid,$11,'FROID','Compresseur','Invalide')`,
    [uuid(),s.id,s.tenant_id,s.owner_personne_id,grant,node,uuid(),person,s.root_grant,uuid(),hash()]);}
  catch(e){denied=e.code==='23503';}await c.query('ROLLBACK TO SAVEPOINT bad_fk');assert.ok(denied);ok('FK interdit une source C2 inventée');
  await c.query(`INSERT INTO energy_catalog_collab_events
   (proposal_id,site_id,tenant_id,acteur_personne_id,acteur_grant_id,version,action,details)
   VALUES($1::uuid,$2,$3,$4,$5::uuid,1,'SOUMISE','{}'::jsonb)`,[c3b,s.id,s.tenant_id,person,grant]);ok('Historique append-only créé');
  await c.query('SAVEPOINT immutable_event');let immutable=false;
  try{await c.query('DELETE FROM energy_catalog_collab_events WHERE proposal_id=$1::uuid',[c3b]);}catch(e){immutable=String(e.message).includes('ENERGY_C3B_AUDIT_IMMUABLE');}
  await c.query('ROLLBACK TO SAVEPOINT immutable_event');assert.ok(immutable);ok('Historique immuable et non supprimable');
  const typed=await c.query("SELECT CASE WHEN $1::varchar='REFUSEE' THEN NOW() ELSE NULL END IS NOT NULL AS ok",['REFUSEE']);
  assert.equal(typed.rows[0].ok,true);ok('Typage SQL explicite, anti-régression 42P08');
  await c.query(`UPDATE energy_catalog_collab_proposals SET statut='A_CORRIGER',reviewer_grant_id=NULL WHERE id=$1::uuid`,[c3b]);
  await c.query(`UPDATE energy_catalog_collab_proposals SET statut='EN_REVUE',reviewer_grant_id=$2::uuid,version=2 WHERE id=$1::uuid`,[c3b,s.root_grant]);
  ok('Correction et retour en revue admis par les contraintes');
  await c.query(`INSERT INTO energy_catalog_references(id,site_id,tenant_id,owner_personne_id,request_key,content_hash,
    famille,sous_famille,designation,marque,modele)
    VALUES($1,$2,$3,$4,$5::uuid,$6,'FROID','Compresseur','Compresseur froid','TEST_C3B','MAQUETTE_1')`,
    [ref,s.id,s.tenant_id,s.owner_personne_id,c3b,hash()]);
  await c.query(`UPDATE energy_catalog_collab_proposals SET statut='EN_CATALOGUE',reviewer_grant_id=NULL,
    catalogue_reference_id=$2::uuid,date_cloture=NOW() WHERE id=$1::uuid`,[c3b,ref]);
  ok('Transfert vers une candidate privée C3A, pas de référencement certifié');
  await c.query('SAVEPOINT illegal_state');let invalid=false;
  try{await c.query(`UPDATE energy_catalog_collab_proposals SET statut='EN_REVUE' WHERE id=$1::uuid`,[c3b]);}catch(e){invalid=e.code==='23514';}
  await c.query('ROLLBACK TO SAVEPOINT illegal_state');assert.ok(invalid);ok('Statuts incohérents refusés par PostgreSQL');
  await c.query('ROLLBACK');active=false;ok('Rollback TOTAL : toutes les données fictives supprimées');
  const after=await c.query("SELECT to_regclass('public.energy_catalog_collab_proposals') IS NOT NULL p,to_regclass('public.energy_catalog_collab_events') IS NOT NULL e");
  assert.deepEqual(after.rows[0],before.rows[0]);ok('État du schéma inchangé après test');
  console.log('C3B_POSTGRES_ROLLBACK_PASS='+n);
 }finally{if(active)await c.query('ROLLBACK').catch(()=>{});await c.end();}
}
main().catch(e=>{console.error('C3B_POSTGRES_ECHEC',e.code||e.message);process.exitCode=1;});
