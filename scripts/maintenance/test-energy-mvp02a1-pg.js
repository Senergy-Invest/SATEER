'use strict';
/** Vraie base, vrais FKs, transaction TOUJOURS rollback. Ne crée aucun fichier photo. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {Client}=require('pg');
const ROOT=path.join(__dirname,'..','..');
const cluster='7699611241381229531',tenant='ENERGY_MVP01D_RECETTE';
async function main(){
 assert.equal(process.env.PGDATABASE,'sateer_test');assert.equal(process.env.PGHOST,'::1');assert.equal(process.env.PGPORT,'5432');
 const c=new Client({host:'::1',port:5432,database:'sateer_test',user:process.env.PGUSER||process.env.USER,
  ...(process.env.PGPASSWORD?{password:process.env.PGPASSWORD}:{}),application_name:'sateer_energy_mvp02a1_pg_rollback',connectionTimeoutMillis:5000,statement_timeout:15000});
 let tx=false,n=0;const ok=s=>console.log('PASS '+(++n)+' '+s);
 try{await c.connect();const pin=(await c.query('SELECT current_database() AS db,(SELECT system_identifier::text FROM pg_control_system()) AS cluster')).rows[0];
  assert.equal(pin.db,'sateer_test');assert.equal(String(pin.cluster),cluster);ok('DB locale et cluster épinglés');
  await c.query('BEGIN');tx=true;await c.query("SET LOCAL lock_timeout='4s'");
  const sql=fs.readFileSync(path.join(ROOT,'database/052_energy_equipment_passports.sql'),'utf8');
  const migration=sql.replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'');
  await c.query(migration);ok('DDL passeport/photos en transaction');
  const eq=(await c.query(`SELECT e.id AS equipment_id,e.site_id,e.tenant_id,e.owner_personne_id,e.zone_id
   FROM energy_inventory_equipements e JOIN tenants t ON t.id=e.tenant_id WHERE t.code=$1 LIMIT 1`,[tenant])).rows[0];
  assert.ok(eq,'EQUIPEMENT_FICTIF_RECETTE_REQUIS');ok('Source de données fictive Energy uniquement');
  const temp=await c.query(`INSERT INTO energy_inventory_equipements(public_id,site_id,zone_id,tenant_id,owner_personne_id,request_key,content_hash,nom,famille,quantite)
   VALUES ($1,$2,$3,$4,$5,$6,$7,'Photo fictive MVP02A1','FROID',3) RETURNING id`,
   [crypto.randomUUID(),eq.site_id,eq.zone_id,eq.tenant_id,eq.owner_personne_id,crypto.randomUUID(),crypto.randomBytes(32).toString('hex')]);
  const sourceId=temp.rows[0].id;
  const tok=crypto.randomBytes(20).toString('base64url'),uuid=crypto.randomUUID();
  const ins=await c.query(`INSERT INTO energy_equipment_passports(public_id,site_id,inventaire_equipement_id,tenant_id,owner_personne_id,numero_individuel,scan_token)
   VALUES($1,$2,$3,$4,$5,1,$6) RETURNING id`,[uuid,eq.site_id,sourceId,eq.tenant_id,eq.owner_personne_id,tok]);
  const passportId=ins.rows[0].id;ok('Passeport individuel 1 créé');
  await c.query('SAVEPOINT unique_passport');
  try{await c.query(`INSERT INTO energy_equipment_passports(public_id,site_id,inventaire_equipement_id,tenant_id,owner_personne_id,numero_individuel,scan_token)
   VALUES($1,$2,$3,$4,$5,1,$6)`,[crypto.randomUUID(),eq.site_id,sourceId,eq.tenant_id,eq.owner_personne_id,crypto.randomBytes(20).toString('base64url')]);
   throw Error('DOUBLON_NON_REFUSE');}
  catch(e){assert.equal(e.code,'23505');await c.query('ROLLBACK TO SAVEPOINT unique_passport');}ok('Doublon d individualisation refusé');
  await c.query('SAVEPOINT scope_passport');
  try{await c.query(`INSERT INTO energy_equipment_passports(public_id,site_id,inventaire_equipement_id,tenant_id,owner_personne_id,numero_individuel,scan_token)
   VALUES($1,$2,$3,$4,$5,2,$6)`,[crypto.randomUUID(),eq.site_id,sourceId,eq.tenant_id,-111,crypto.randomBytes(20).toString('base64url')]);
   throw Error('PROPRIETAIRE_FK_NON_REFUSE');}
  catch(e){assert.equal(e.code,'23503');await c.query('ROLLBACK TO SAVEPOINT scope_passport');}ok('FK propriétaire contraint');
  const photoId=crypto.randomUUID();await c.query(`INSERT INTO energy_equipment_photos(id,passeport_id,tenant_id,owner_personne_id,type_photo,mime_type,taille_octets)
   VALUES($1,$2,$3,$4,'APPAREIL','image/png',400)`,[photoId,passportId,eq.tenant_id,eq.owner_personne_id]);ok('Métadonnée photo liée au propriétaire');
  await c.query('SAVEPOINT scope_photo');
  try{await c.query(`INSERT INTO energy_equipment_photos(id,passeport_id,tenant_id,owner_personne_id,type_photo,mime_type,taille_octets)
   VALUES($1,$2,$3,-111,'APPAREIL','image/png',400)`,[crypto.randomUUID(),passportId,eq.tenant_id]);throw Error('PHOTO_FK_NON_REFUSE');}
  catch(e){assert.equal(e.code,'23503');await c.query('ROLLBACK TO SAVEPOINT scope_photo');}ok('FK photo inter-propriétaire refusé');
  await c.query(`INSERT INTO energy_equipment_passport_events(passeport_id,tenant_id,acteur_personne_id,event_type,payload)
   VALUES($1,$2,$3,'EquipmentPassportCreated.v1','{}'::jsonb)`,[passportId,eq.tenant_id,eq.owner_personne_id]);ok('Événement passeport append-only');
  await c.query('ROLLBACK');tx=false;ok('ROLLBACK intégral, sans migration permanente');
  console.log('ENERGY_MVP02A1_PG_ROLLBACK_PASS='+n);
 }finally{if(tx)await c.query('ROLLBACK').catch(()=>{});await c.end().catch(()=>{});}
}
main().catch(e=>{console.error('MVP02A1_PG_TEST_ECHEC='+String(e.message||e));process.exitCode=1;});
