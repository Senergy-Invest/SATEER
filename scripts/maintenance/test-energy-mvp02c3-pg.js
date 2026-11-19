'use strict';
/** PostgreSQL réel avec rollback TOTAL, cluster test épinglé, aucun compte créé. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Client}=require('pg');let n=0;const ok=x=>console.log('PASS '+(++n)+' '+x),uid=()=>crypto.randomUUID();
async function main(){
 assert.equal(process.env.PGDATABASE,'sateer_test');assert.equal(process.env.PGHOST,'::1');assert.equal(process.env.PGPORT,'5432');
 const c=new Client();await c.connect();let active=false;
 try{
  const pin=await c.query('SELECT current_database() AS db,(SELECT system_identifier::text FROM pg_control_system()) AS pin');
  assert.equal(pin.rows[0].db,'sateer_test');assert.equal(pin.rows[0].pin,'7699611241381229531');ok('Postgres reel epingle');
  const before=await c.query("SELECT to_regclass('public.energy_catalog_references') IS NOT NULL AS r,to_regclass('public.energy_catalog_passport_links') IS NOT NULL AS l,to_regclass('public.energy_catalog_events') IS NOT NULL AS e");
  assert.ok((before.rows[0].r&&before.rows[0].l&&before.rows[0].e)||(!before.rows[0].r&&!before.rows[0].l&&!before.rows[0].e),'SCHEMA_C3_PARTIEL');
  await c.query('BEGIN');active=true;
  let ddl=fs.readFileSync(path.join(__dirname,'../../database/057_energy_catalogue_private.sql'),'utf8');
  ddl=ddl.replace(/^([\s\S]*?)\bBEGIN;\s*/,'').replace(/\s*COMMIT;\s*$/,'');
  await c.query(ddl);ok('Migration 057 applicable en transaction isolee');
  const r=await c.query("SELECT to_regclass('public.energy_catalog_references') IS NOT NULL AS r,to_regclass('public.energy_catalog_passport_links') IS NOT NULL AS l,to_regclass('public.energy_catalog_events') IS NOT NULL AS e");
  assert.deepEqual(r.rows[0],{r:true,l:true,e:true});ok('Tables references, appareils et journal');
  const s=await c.query(`SELECT s.id,s.tenant_id,s.owner_personne_id,p.id AS passport_id,p.public_id AS passport_public_id
    FROM energy_inventory_sites s JOIN tenants t ON t.id=s.tenant_id AND t.code='ENERGY_MVP01D_RECETTE'
    JOIN energy_equipment_passports p ON p.site_id=s.id AND p.tenant_id=s.tenant_id AND p.owner_personne_id=s.owner_personne_id
    ORDER BY s.id,p.id LIMIT 1`);
  assert.equal(s.rows.length,1,'PASSEPORT_FICTIF_A_REQUIS');const site=s.rows[0];ok('Passeport individuel existant A reutilise');
  const fam=await c.query('SELECT famille FROM energy_inventory_equipements WHERE id=(SELECT inventaire_equipement_id FROM energy_equipment_passports WHERE id=$1)',[site.passport_id]);
  const family=fam.rows[0].famille;
  const model='RECETTE_'+uid().slice(0,8),hash=crypto.createHash('sha256').update(model).digest('hex');const id=uid();
  await c.query(`INSERT INTO energy_catalog_references(id,site_id,tenant_id,owner_personne_id,source_passport_id,request_key,content_hash,
   famille,sous_famille,designation,marque,modele,empreinte) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
   [id,site.id,site.tenant_id,site.owner_personne_id,site.passport_id,uid(),hash,family,'Compresseur test','Appareil fictif','TESTFAB',model,hash]);
  ok('Candidate privee et passeport source existant');
  const q=await c.query("SELECT statut,date_decision IS NULL AS undecided FROM energy_catalog_references WHERE id=$1",[id]);assert.equal(q.rows[0].statut,'CANDIDATE');assert.equal(q.rows[0].undecided,true);ok('Candidate non certifiee');
  await c.query(`UPDATE energy_catalog_references SET statut='REFERENCE_INTERNE',date_decision=NOW() WHERE id=$1`,[id]);ok('Revue interne appliquee');
  const dup=uid();await c.query(`INSERT INTO energy_catalog_references(id,site_id,tenant_id,owner_personne_id,request_key,content_hash,
   famille,sous_famille,designation,marque,modele,empreinte) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
   [dup,site.id,site.tenant_id,site.owner_personne_id,uid(),hash,family,'Compresseur test','Doublon fictif','TESTFAB',model,hash]);
  await c.query('SAVEPOINT c3_duplicate');
  let conflict=false;try{await c.query(`UPDATE energy_catalog_references SET statut='REFERENCE_INTERNE',date_decision=NOW() WHERE id=$1`,[dup]);}
  catch(e){conflict=e.code==='23505';}await c.query('ROLLBACK TO SAVEPOINT c3_duplicate');assert.equal(conflict,true);ok('Deux modeles identiques non referencables');
  // Passeport synthétique dans la transaction ROLLBACK : jamais de collision avec une liaison utilisateur existante.
  const z=await c.query(`SELECT e.zone_id FROM energy_equipment_passports p JOIN energy_inventory_equipements e ON e.id=p.inventaire_equipement_id WHERE p.id=$1`,[site.passport_id]);
  const eq=await c.query(`INSERT INTO energy_inventory_equipements(public_id,site_id,zone_id,tenant_id,owner_personne_id,request_key,content_hash,nom,famille,quantite)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,1) RETURNING id`,[uid(),site.id,z.rows[0].zone_id,site.tenant_id,site.owner_personne_id,uid(),hash,'Appareil fictif rollback C3',family]);
  const ptest=await c.query(`INSERT INTO energy_equipment_passports(public_id,site_id,inventaire_equipement_id,tenant_id,owner_personne_id,numero_individuel,scan_token)
   VALUES($1,$2,$3,$4,$5,1,$6) RETURNING id`,[uid(),site.id,eq.rows[0].id,site.tenant_id,site.owner_personne_id,crypto.randomBytes(20).toString('base64url')]);
  const isolatedPassport=ptest.rows[0].id;
  await c.query(`INSERT INTO energy_catalog_passport_links(passport_id,reference_id,site_id,tenant_id,owner_personne_id) VALUES($1,$2,$3,$4,$5)`,
   [isolatedPassport,id,site.id,site.tenant_id,site.owner_personne_id]);ok('Association physique sous rollback sans collision');
  await c.query(`INSERT INTO energy_catalog_events(site_id,tenant_id,owner_personne_id,actor_personne_id,action,reference_id,details)
    VALUES($1,$2,$3,$4,'CataloguePassportLinked.v1',$5,'{}'::jsonb)`,[site.id,site.tenant_id,site.owner_personne_id,site.owner_personne_id,id]);
  const stat=await c.query('SELECT COUNT(*)::int AS n FROM energy_catalog_events WHERE reference_id=$1',[id]);assert.equal(stat.rows[0].n,1);ok('Audit insertion valide');
  await c.query('SAVEPOINT c3_audit');let immutable=false;try{await c.query("UPDATE energy_catalog_events SET details='{}'::jsonb WHERE reference_id=$1",[id]);}catch(e){immutable=e.message.includes('ENERGY_C3_AUDIT_IMMUABLE');}
  await c.query('ROLLBACK TO SAVEPOINT c3_audit');assert.equal(immutable,true);ok('Audit append-only non modifiable');
  const linked=await c.query('SELECT reference_id FROM energy_catalog_passport_links WHERE passport_id=$1',[isolatedPassport]);assert.equal(linked.rows.length,1);ok('Un appareil physique lie a un seul modele');
  await c.query('ROLLBACK');active=false;ok('Rollback TOTAL de toutes les donnees fictives');
  const after=await c.query("SELECT to_regclass('public.energy_catalog_references') IS NOT NULL AS r,to_regclass('public.energy_catalog_passport_links') IS NOT NULL AS l,to_regclass('public.energy_catalog_events') IS NOT NULL AS e");
  assert.deepEqual(after.rows[0],before.rows[0]);ok('Etat du schema identique avant/apres test');
 }finally{if(active)await c.query('ROLLBACK').catch(()=>{});await c.end();}
}
main().catch(e=>{console.error('C3_PG_ECHEC',e.code||e.message);process.exitCode=1;});
