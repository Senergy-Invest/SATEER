'use strict';
/** Test PostgreSQL réel, DDL + données strictement transitoires dans un ROLLBACK final. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Client}=require('pg');
const TENANT='ENERGY_MVP01D_RECETTE',CLUSTER='7699611241381229531';
async function main(){
 assert.equal(process.env.PGDATABASE,'sateer_test');assert.equal(process.env.PGHOST,'::1');assert.equal(process.env.PGPORT,'5432');
 const c=new Client({host:'::1',port:5432,database:'sateer_test',user:process.env.PGUSER||process.env.USER,
  ...(process.env.PGPASSWORD?{password:process.env.PGPASSWORD}:{}),application_name:'sateer_energy_mvp02a2_pg_rollback',connectionTimeoutMillis:5000,statement_timeout:15000});
 let begun=false,n=0;const ok=what=>console.log('PASS '+(++n)+' '+what);
 try{await c.connect();const pin=(await c.query('SELECT current_database() AS db,(SELECT system_identifier::text FROM pg_control_system()) AS cluster')).rows[0];
  assert.equal(pin.db,'sateer_test');assert.equal(String(pin.cluster),CLUSTER);ok('Base et cluster épinglés');
  await c.query('BEGIN');begun=true;await c.query("SET LOCAL lock_timeout='4s'");
  const sql=fs.readFileSync(path.join(__dirname,'../../database/053_energy_equipment_labels.sql'),'utf8').replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'');
  await c.query(sql);ok('Migration 053 dans transaction de rollback');
  const eq=(await c.query(`SELECT e.id,e.site_id,e.tenant_id,e.owner_personne_id FROM energy_inventory_equipements e
    JOIN tenants t ON t.id=e.tenant_id WHERE t.code=$1 LIMIT 1`,[TENANT])).rows[0];assert.ok(eq);ok('Equipement fictif Energy existant');
  // Une nouvelle déclaration fictive évite toute collision avec la recette persistante.
  const zone=(await c.query('SELECT zone_id FROM energy_inventory_equipements WHERE id=$1',[eq.id])).rows[0];
  const r=await c.query(`INSERT INTO energy_inventory_equipements(public_id,site_id,zone_id,tenant_id,owner_personne_id,request_key,content_hash,nom,famille,quantite)
   VALUES($1,$2,$3,$4,$5,$6,$7,'Test etiquette synthetique','FROID',1) RETURNING id`,
   [crypto.randomUUID(),eq.site_id,zone.zone_id,eq.tenant_id,eq.owner_personne_id,crypto.randomUUID(),crypto.randomBytes(32).toString('hex')]);
  const id=crypto.randomUUID(),token=crypto.randomBytes(20).toString('base64url');
  const p=await c.query(`INSERT INTO energy_equipment_passports(public_id,site_id,inventaire_equipement_id,tenant_id,owner_personne_id,numero_individuel,scan_token)
    VALUES($1,$2,$3,$4,$5,1,$6) RETURNING id`,[id,eq.site_id,r.rows[0].id,eq.tenant_id,eq.owner_personne_id,token]);
  const passport=p.rows[0].id;ok('Passeport synthétique lié à un inventaire Energy');
  const photo=crypto.randomUUID();await c.query(`INSERT INTO energy_equipment_photos(id,passeport_id,tenant_id,owner_personne_id,type_photo,mime_type,taille_octets)
   VALUES($1,$2,$3,$4,'ETIQUETTE','image/png',512)`,[photo,passport,eq.tenant_id,eq.owner_personne_id]);ok('Photo label privée liée');
  const ana=crypto.randomUUID();await c.query(`INSERT INTO energy_equipment_label_proposals(id,passeport_id,tenant_id,owner_personne_id,photo_id,moteur,propositions)
   VALUES($1,$2,$3,$4,$5,'MACOS_VISION_LOCAL_V1',$6::jsonb)`,[ana,passport,eq.tenant_id,eq.owner_personne_id,photo,JSON.stringify({PUISSANCE_W:'120'})]);
  ok('Candidats OCR privés et horodatés');
  await c.query(`INSERT INTO energy_equipment_label_versions(passeport_id,tenant_id,owner_personne_id,photo_id,champ,revision,valeur,provenance)
   VALUES($1,$2,$3,$4,'PUISSANCE_W',1,'120','OCR_CONFIRME_PAR_UTILISATEUR')`,[passport,eq.tenant_id,eq.owner_personne_id,photo]);ok('Valeur confirmée, version 1');
  await c.query(`INSERT INTO energy_equipment_label_versions(passeport_id,tenant_id,owner_personne_id,photo_id,champ,revision,valeur,provenance)
   VALUES($1,$2,$3,$4,'PUISSANCE_W',2,'125','OCR_CORRIGE_PAR_UTILISATEUR')`,[passport,eq.tenant_id,eq.owner_personne_id,photo]);ok('Correction append-only version 2');
  const latest=(await c.query(`SELECT valeur FROM energy_equipment_label_versions WHERE passeport_id=$1 AND champ='PUISSANCE_W' ORDER BY revision DESC LIMIT 1`,[passport])).rows[0];
  assert.equal(latest.valeur,'125');ok('Relecture dernière version déterministe');
  await c.query('SAVEPOINT wrong_owner');
  try{await c.query(`INSERT INTO energy_equipment_label_versions(passeport_id,tenant_id,owner_personne_id,champ,revision,valeur,provenance)
   VALUES($1,$2,-111,'MARQUE',1,'FAUX','SAISIE_MANUELLE')`,[passport,eq.tenant_id]);throw Error('FK_PROPRIETAIRE_NON_PROTEGEE');}
  catch(e){assert.equal(e.code,'23503');await c.query('ROLLBACK TO SAVEPOINT wrong_owner');}ok('Insertion inter-propriétaire bloquée par FK');
  await c.query('SAVEPOINT duplicate');
  try{await c.query(`INSERT INTO energy_equipment_label_versions(passeport_id,tenant_id,owner_personne_id,champ,revision,valeur,provenance)
   VALUES($1,$2,$3,'PUISSANCE_W',2,'999','SAISIE_MANUELLE')`,[passport,eq.tenant_id,eq.owner_personne_id]);throw Error('REVISION_NON_PROTEGEE');}
  catch(e){assert.equal(e.code,'23505');await c.query('ROLLBACK TO SAVEPOINT duplicate');}ok('Révision en doublon refusée');
  await c.query(`INSERT INTO energy_equipment_passport_events(passeport_id,tenant_id,acteur_personne_id,event_type,payload)
    VALUES($1,$2,$3,'EquipmentLabelFieldConfirmed.v1',$4::jsonb)`,[passport,eq.tenant_id,eq.owner_personne_id,JSON.stringify({champ:'PUISSANCE_W',revision:2})]);ok('Événement enregistré sans valeur ni photo brute');
  await c.query('ROLLBACK');begun=false;ok('Rollback intégral');
  console.log('ENERGY_MVP02A2_PG_ROLLBACK_PASS='+n);
 }finally{if(begun)await c.query('ROLLBACK').catch(()=>{});await c.end().catch(()=>{});}
}
main().catch(e=>{console.error('ENERGY_MVP02A2_PG_ECHEC='+String(e.message||e));process.exitCode=1;});
