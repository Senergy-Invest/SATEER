"use strict";
/** Test SQL de fanout en tables TEMP, transaction rollback : aucune donnee du pilote modifiee. */
const assert=require('node:assert/strict');
const {Client}=require('pg');
const {notifierAbonnesDiaspora}=require('../diaspora-optin-notifications');
async function run(){
 assert.equal(process.env.PGDATABASE,'sateer_test');assert.equal(process.env.PGHOST,'::1');assert.equal(process.env.PGPORT,'5432');
 const c=new Client({host:'::1',port:5432,database:'sateer_test',user:process.env.PGUSER||process.env.USER,
 ...(process.env.PGPASSWORD?{password:process.env.PGPASSWORD}:{})});
 await c.connect();let tx=false;
 try{
  const id=await c.query('SELECT current_database() AS db,(SELECT system_identifier::text FROM pg_control_system()) AS sys');
  assert.equal(id.rows[0].db,'sateer_test');assert.equal(id.rows[0].sys,'7699611241381229531');
  await c.query('BEGIN');tx=true;await c.query('SET LOCAL search_path TO pg_temp,pg_catalog');
  const defs=[
   `CREATE TEMP TABLE tenants(id integer,actif boolean) ON COMMIT DROP`,
   `CREATE TEMP TABLE organisations(id integer,tenant_id integer,type text) ON COMMIT DROP`,
   `CREATE TEMP TABLE personnes(id integer) ON COMMIT DROP`,
   `CREATE TEMP TABLE relations_personne_organisation(personne_id integer,organisation_id integer) ON COMMIT DROP`,
   `CREATE TEMP TABLE publications(id integer,tenant_id integer,organisation_id integer,statut text,
     statut_diffusion_diaspora text,audience_type text,categorie text,titre text) ON COMMIT DROP`,
   `CREATE TEMP TABLE diaspora_subscriptions(tenant_id integer,personne_id integer,association_id integer,
     theme_code text,actif boolean) ON COMMIT DROP`,
   `CREATE TEMP TABLE diaspora_association_directory(tenant_id integer,organisation_id integer,statut text) ON COMMIT DROP`,
   `CREATE TEMP TABLE notifications(id bigserial,tenant_id integer,personne_id integer,organisation_id integer,
     type text,titre text,message text,reference_type text,reference_id integer,canal text,
     metadata jsonb,date_creation timestamptz DEFAULT NOW()) ON COMMIT DROP`,
   `CREATE UNIQUE INDEX ux_test_diaspora_once ON notifications(tenant_id,personne_id,reference_id)
     WHERE type='DIASPORA_ABONNEMENT' AND reference_type='PUBLICATION'`
  ];for(const x of defs)await c.query(x);
  await c.query(`INSERT INTO tenants VALUES(9,TRUE),(10,TRUE)`);
  await c.query(`INSERT INTO organisations VALUES(22,9,'ASSOCIATION'),(23,9,'ASSOCIATION'),(24,9,'ASSOCIATION'),(44,10,'ASSOCIATION')`);
  await c.query(`INSERT INTO personnes VALUES(101),(102),(103),(104)`);
  await c.query(`INSERT INTO relations_personne_organisation VALUES(101,22),(102,23),(103,44),(104,24)`);
  await c.query(`INSERT INTO diaspora_association_directory VALUES(9,22,'VERIFIEE'),(9,23,'SUSPENDUE'),(10,44,'VERIFIEE')`);
  await c.query(`INSERT INTO diaspora_subscriptions VALUES(9,101,22,NULL,TRUE),(9,101,NULL,'EVENEMENT',TRUE),
    (9,102,NULL,'EMPLOI',TRUE),(10,103,NULL,'EVENEMENT',TRUE),(9,104,22,NULL,TRUE)`);
  await c.query(`INSERT INTO publications VALUES(201,9,22,'PUBLIEE','DIFFUSEE','TOUS','EVENEMENT','Fictif 1'),
    (202,9,22,'PUBLIEE','SOUMISE','TOUS','EVENEMENT','Fictif 2'),
    (203,9,23,'PUBLIEE','DIFFUSEE','TOUS','EMPLOI','Fictif suspendu'),
    (204,10,44,'PUBLIEE','DIFFUSEE','TOUS','EVENEMENT','Autre tenant'),
    (205,9,22,'PUBLIEE','DIFFUSEE','TOUS','EVENEMENT','Fictif 5')`);
  assert.equal(await notifierAbonnesDiaspora(c,201),2,'101 : theme et association dedup ; 104 : suivi sans appartenance directe');
  assert.equal(await notifierAbonnesDiaspora(c,201),0,'Rejeu ne notifie pas deux fois');
  assert.equal(await notifierAbonnesDiaspora(c,202),0,'SOUMISE n est pas diffusable');
  assert.equal(await notifierAbonnesDiaspora(c,203),0,'Association suspendue ne notifie personne');
  assert.equal(await notifierAbonnesDiaspora(c,204),1,'Isolation tenant et abonne correct');
  await c.query(`UPDATE diaspora_subscriptions SET actif=FALSE WHERE tenant_id=9 AND personne_id=101`);
  // 101 se désabonne ; 104 reste abonné à l'association 22. L'alerte
  // destinée à 104 est donc légitime. Le test doit isoler chaque personne.
  assert.equal(await notifierAbonnesDiaspora(c,205),1,'Desabonnement 101 : autre abonne 104 conserve son alerte');
  const ciblage=await c.query(`SELECT personne_id FROM notifications
    WHERE type='DIASPORA_ABONNEMENT' AND reference_id=205 ORDER BY personne_id`);
  assert.deepEqual(ciblage.rows.map(x=>x.personne_id),[104],
    '101 desabonne non notifie; 104 toujours abonne notifie');
  await c.query(`UPDATE diaspora_subscriptions SET actif=TRUE WHERE tenant_id=9 AND personne_id=101`);
  await c.query(`INSERT INTO notifications(tenant_id,personne_id,organisation_id,type,titre,message,reference_type,reference_id,canal,metadata)
    VALUES (9,101,22,'DIASPORA_ABONNEMENT','Fictif cap 1','x','PUBLICATION',301,'DIASPORA','{}'),
           (9,101,22,'DIASPORA_ABONNEMENT','Fictif cap 2','x','PUBLICATION',302,'DIASPORA','{}')`);
  assert.equal(await notifierAbonnesDiaspora(c,205),0,'Plafond 3 notifications sur 24 heures');
  const n=await c.query(`SELECT personne_id,reference_id FROM notifications WHERE type='DIASPORA_ABONNEMENT' ORDER BY id`);
  assert.deepEqual(n.rows.map(x=>[x.personne_id,x.reference_id]),[[101,201],[104,201],[103,204],[104,205],[101,301],[101,302]]);
  await c.query('ROLLBACK');tx=false;
  console.log('D2B_PGTEMP_PASS : dedup, tenant, abonnement, suspension, plafond, soumission; rollback OK');
 }finally{if(tx)await c.query('ROLLBACK').catch(()=>{});await c.end();}
}
run().catch(e=>{console.error('D2B_PGTEMP_FAIL',e.stack||e.message);process.exitCode=1;});
