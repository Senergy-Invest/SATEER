"use strict";
/** D2B-B : requêtes SQL réelles sur tables temporaires et ROLLBACK total.
 * Aucun schéma permanent ni donnée métier touché par ce test préalable.
 */
const assert=require('node:assert/strict'),{Client}=require('pg');
const {creerServiceGeoDiaspora}=require('../diaspora-geo-service');
const {creerServiceOptinDiaspora}=require('../diaspora-optin-service');
const {creerServiceBureauDiaspora}=require('../diaspora-bureau-service');
const {notifierAbonnesDiaspora}=require('../diaspora-optin-notifications');
async function main(){
 assert.equal(process.env.PGDATABASE,'sateer_test');assert.equal(process.env.PGHOST,'::1');assert.equal(process.env.PGPORT,'5432');
 const c=new Client({host:'::1',port:5432,database:'sateer_test',user:process.env.PGUSER||process.env.USER,
   ...(process.env.PGPASSWORD?{password:process.env.PGPASSWORD}:{})});
 await c.connect();let open=false;
 try{
  const db=await c.query('SELECT current_database() db,(SELECT system_identifier::text FROM pg_control_system()) sys');
  assert.equal(db.rows[0].db,'sateer_test');assert.equal(db.rows[0].sys,'7699611241381229531');
  await c.query('BEGIN');open=true;await c.query('SET LOCAL search_path TO pg_temp,pg_catalog');
  const definitions=[
   `CREATE TEMP TABLE tenants(id integer PRIMARY KEY,code text,actif boolean) ON COMMIT DROP`,
   `CREATE TEMP TABLE countries(id integer PRIMARY KEY,code_iso2 text,actif boolean) ON COMMIT DROP`,
   `CREATE TEMP TABLE territories(id integer PRIMARY KEY,nom text,type text,country_id integer,actif boolean) ON COMMIT DROP`,
   `CREATE TEMP TABLE organisations(id integer PRIMARY KEY,tenant_id integer,type text,nom text) ON COMMIT DROP`,
   `CREATE TEMP TABLE personnes(id integer PRIMARY KEY) ON COMMIT DROP`,
   `CREATE TEMP TABLE relations_personne_organisation(personne_id integer,organisation_id integer) ON COMMIT DROP`,
   `CREATE TEMP TABLE publications(id integer PRIMARY KEY,tenant_id integer,organisation_id integer,
      statut text,statut_diffusion_diaspora text,audience_type text,categorie text,titre text,
      medias jsonb,priorite text,contenu text,date_diffusion_diaspora timestamptz,
      date_publication timestamptz DEFAULT NOW(),date_soumission_diaspora timestamptz) ON COMMIT DROP`,
   `CREATE TEMP TABLE diaspora_association_directory(tenant_id integer,organisation_id integer,statut text) ON COMMIT DROP`,
   `CREATE TEMP TABLE diaspora_subscriptions(tenant_id integer,personne_id integer,association_id integer,theme_code text,actif boolean) ON COMMIT DROP`,
   `CREATE TEMP TABLE diaspora_geo_preferences(tenant_id integer,personne_id integer,territory_id integer,
      actif boolean,date_modification timestamptz DEFAULT NOW(),PRIMARY KEY(tenant_id,personne_id,territory_id)) ON COMMIT DROP`,
   `CREATE TEMP TABLE diaspora_publication_geo_targets(publication_id integer PRIMARY KEY,tenant_id integer,
      organisation_id integer,territory_id integer,defini_par integer,date_modification timestamptz DEFAULT NOW()) ON COMMIT DROP`,
   `CREATE TEMP TABLE audit_trail(tenant_id integer,organisation_id integer,personne_id integer,
      action text,entity_type text,entity_id text,details jsonb) ON COMMIT DROP`,
   `CREATE TEMP TABLE notifications(id bigserial PRIMARY KEY,tenant_id integer,personne_id integer,organisation_id integer,
      type text,titre text,message text,reference_type text,reference_id integer,canal text,metadata jsonb,
      date_creation timestamptz DEFAULT NOW()) ON COMMIT DROP`,
   `CREATE UNIQUE INDEX ux_temp_diaspora_notification ON notifications(tenant_id,personne_id,reference_id)
      WHERE type='DIASPORA_ABONNEMENT' AND reference_type='PUBLICATION'`
  ];for(const sql of definitions)await c.query(sql);
  await c.query(`INSERT INTO tenants VALUES(9,'TEST_GEO',TRUE),(10,'AUTRE',TRUE)`);
  await c.query(`INSERT INTO countries VALUES(1,'FR',TRUE),(2,'SN',TRUE)`);
  await c.query(`INSERT INTO territories VALUES(3,'Bordeaux','VILLE',1,TRUE),(2,'Gironde','DEPARTEMENT',1,TRUE),(4,'Sénégal','PAYS',2,TRUE)`);
  await c.query(`INSERT INTO organisations VALUES(22,9,'ASSOCIATION','Assoc fictive'),(24,9,'ASSOCIATION','Org membre'),(44,10,'ASSOCIATION','Hors tenant')`);
  await c.query(`INSERT INTO personnes VALUES(101),(102)`);
  await c.query(`INSERT INTO relations_personne_organisation VALUES(101,24),(102,24)`);
  await c.query(`INSERT INTO diaspora_association_directory VALUES(9,22,'VERIFIEE')`);
  await c.query(`INSERT INTO diaspora_subscriptions VALUES(9,101,NULL,'EVENEMENT',TRUE),(9,101,22,NULL,TRUE),(9,102,NULL,'EVENEMENT',TRUE)`);
  await c.query(`INSERT INTO diaspora_geo_preferences(tenant_id,personne_id,territory_id,actif) VALUES(9,101,3,TRUE),(9,102,2,TRUE)`);
  await c.query(`INSERT INTO publications(id,tenant_id,organisation_id,statut,statut_diffusion_diaspora,audience_type,categorie,titre,medias,priorite,contenu,date_diffusion_diaspora)
    VALUES(201,9,22,'PUBLIEE','DIFFUSEE','TOUS','EVENEMENT','Bordeaux','[]','NORMALE','Fictif',NOW()),
    (202,9,22,'PUBLIEE','DIFFUSEE','TOUS','EVENEMENT','Gironde','[]','NORMALE','Fictif',NOW()),
    (203,9,22,'PUBLIEE','NON_DEMANDEE','TOUS','EVENEMENT','Editable','[]','NORMALE','Fictif',NULL),
    (204,9,22,'PUBLIEE','SOUMISE','TOUS','EVENEMENT','Soumise','[]','NORMALE','Fictif',NULL),
    (205,9,22,'PUBLIEE','DIFFUSEE','TOUS','EVENEMENT','Sans zone','[]','NORMALE','Fictif',NOW()),
    (206,9,22,'PUBLIEE','DIFFUSEE','TOUS','EVENEMENT','Bordeaux bis','[]','NORMALE','Fictif',NOW())`);
  await c.query(`INSERT INTO diaspora_publication_geo_targets(publication_id,tenant_id,organisation_id,territory_id,defini_par)
      VALUES(201,9,22,3,101),(202,9,22,2,101),(206,9,22,3,101)`);
  const dbQueries={executerRequete:(sql,args)=>c.query(sql,args),obtenirClientDatabase:async()=>({query:(sql,args)=>c.query(sql,args),release(){}})};
  // Les transactions de service ne sont pas testées sur cette connexion déjà en transaction :
  // seules les requêtes de lecture/mise à jour d'abonnement et le fanout le sont ici.
  const geo=creerServiceGeoDiaspora(dbQueries),opt=creerServiceOptinDiaspora(dbQueries);
  const bureau=creerServiceBureauDiaspora(dbQueries);
  const sourced=await bureau.listSource(22,'TEST_GEO');
  assert.ok(sourced.find(x=>x.id===201&&x.geo_territory_nom==='Bordeaux'));
  const queue=await bureau.listQueue('TEST_GEO');assert.ok(queue.some(x=>x.id===204));
  const txClient={query:async(sql,args)=>{
    if(sql==='BEGIN')return c.query('SAVEPOINT geo_nested');
    if(sql==='COMMIT')return c.query('RELEASE SAVEPOINT geo_nested');
    if(sql==='ROLLBACK')return c.query('ROLLBACK TO SAVEPOINT geo_nested');
    return c.query(sql,args);
  },release(){}};
  const geoTx=creerServiceGeoDiaspora({executerRequete:(sql,args)=>c.query(sql,args),obtenirClientDatabase:async()=>txClient});
  const set=await geoTx.definirCible({organisationId:22,publicationId:203,territoryId:3,acteurId:101,tenant:'TEST_GEO'});
  assert.equal(set.ok,true,'SET TARGET SQL transactionnel fonctionne');
  const audit=await c.query("SELECT COUNT(*)::int n FROM audit_trail WHERE action='DIASPORA_GEO_TARGET' AND entity_id='203'");
  assert.equal(audit.rows[0].n,1,'AUDIT cible dans transaction');
  const frozen=await geoTx.definirCible({organisationId:22,publicationId:204,territoryId:2,acteurId:101,tenant:'TEST_GEO'});
  assert.equal(frozen.code,'CIBLAGE_NON_MODIFIABLE','Verrou après soumission');
  const followUp=await bureau.listSource(22,'TEST_GEO');
  assert.equal(followUp.find(x=>x.id===203).geo_territory_id,3);

  const choices=await geo.chercherTerritoires('Bordeaux');assert.deepEqual(choices.map(x=>x.id),[3]);
  assert.equal((await geo.chercherTerritoires('Sénégal')).length,0,'PAYS non autorisé');
  assert.equal((await geo.listerPreferences(101,'TEST_GEO')).length,1);
  assert.equal(await notifierAbonnesDiaspora(c,201),1,'Seulement 101 suit Bordeaux, aucune alerte à 102');
  assert.equal(await notifierAbonnesDiaspora(c,201),0,'Aucun doublon sur rejouement');
  assert.equal(await notifierAbonnesDiaspora(c,202),1,'Seulement 102 suit Gironde');
  const recipients=await c.query(`SELECT reference_id,personne_id FROM notifications ORDER BY reference_id,personne_id`);
  assert.deepEqual(recipients.rows.map(x=>[x.reference_id,x.personne_id]),[[201,101],[202,102]]);
  assert.equal(await notifierAbonnesDiaspora(c,205),2,'Sans cible la notification volontaire existante reste intacte');
  let followed=await opt.listerSuivies(101,'TEST_GEO');
  assert.ok(followed.some(x=>x.id===201));assert.ok(!followed.some(x=>x.id===202));
  assert.ok(followed.some(x=>x.id===205));
  assert.equal((await geo.modifierPreference(101,'TEST_GEO',3,false)).actif,false);
  assert.equal(await notifierAbonnesDiaspora(c,206),0,'Après retrait Bordeaux aucune alerte nouvelle');
  followed=await opt.listerSuivies(101,'TEST_GEO');assert.ok(!followed.some(x=>x.id===201));
  const up=await geo.modifierPreference(101,'TEST_GEO',3,true);assert.equal(up.ok,true);
  assert.equal((await geo.modifierPreference(101,'TEST_GEO',4,true)).ok,false,'Pays non sélectionnable');
  assert.equal(await notifierAbonnesDiaspora(c,206),1,'Avec retour opt-in, nouvelle publication notifiée');
  await c.query('ROLLBACK');open=false;
  console.log('D2BB_PGTEMP_PASS : appariement exact, deux citoyens, choix valide, rollback, dedup, suivi, désabonnement');
 }finally{if(open)await c.query('ROLLBACK').catch(()=>{});await c.end();}
}
main().catch(e=>{console.error('D2BB_PGTEMP_FAIL',e.stack||e.message);process.exitCode=1;});
