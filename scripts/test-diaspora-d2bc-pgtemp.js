"use strict";
/** SQL réel D2B-C1 : tables temporaires, recherche via pg_temp, ROLLBACK garanti.
 * Aucune écriture dans les tables métier, aucun changement de schéma permanent.
 */
const assert=require('node:assert/strict'),{Client}=require('pg');
const {creerServiceSponsorDiaspora}=require('../diaspora-sponsored-service');
const {creerServiceOptinDiaspora}=require('../diaspora-optin-service');
const {notifierAbonnesDiaspora}=require('../diaspora-optin-notifications');
async function main(){
 assert.equal(process.env.PGDATABASE,'sateer_test');assert.equal(process.env.PGHOST,'::1');assert.equal(process.env.PGPORT,'5432');
 const c=new Client({host:'::1',port:5432,database:'sateer_test',user:process.env.PGUSER||process.env.USER,
   ...(process.env.PGPASSWORD?{password:process.env.PGPASSWORD}:{})});let started=false;
 await c.connect();try{
  const sys=await c.query(`SELECT current_database() AS db,(SELECT system_identifier::text FROM pg_control_system()) sys`);
  assert.equal(sys.rows[0].db,'sateer_test');assert.equal(sys.rows[0].sys,'7699611241381229531');
  await c.query('BEGIN');started=true;await c.query('SET LOCAL search_path TO pg_temp,pg_catalog');
  const tables=[
   `CREATE TEMP TABLE tenants(id integer PRIMARY KEY,code text,actif boolean) ON COMMIT DROP`,
   `CREATE TEMP TABLE organisations(id integer PRIMARY KEY,tenant_id integer,type text,nom text) ON COMMIT DROP`,
   `CREATE TEMP TABLE personnes(id integer PRIMARY KEY) ON COMMIT DROP`,
   `CREATE TEMP TABLE relations_personne_organisation(personne_id integer,organisation_id integer) ON COMMIT DROP`,
   `CREATE TEMP TABLE diaspora_association_directory(tenant_id integer,organisation_id integer,statut text) ON COMMIT DROP`,
   `CREATE TEMP TABLE diaspora_subscriptions(tenant_id integer,personne_id integer,association_id integer,theme_code text,actif boolean) ON COMMIT DROP`,
   `CREATE TEMP TABLE territories(id integer PRIMARY KEY,nom text,actif boolean) ON COMMIT DROP`,
   `CREATE TEMP TABLE diaspora_geo_preferences(tenant_id integer,personne_id integer,territory_id integer,actif boolean) ON COMMIT DROP`,
   `CREATE TEMP TABLE diaspora_publication_geo_targets(publication_id integer,tenant_id integer,organisation_id integer,territory_id integer) ON COMMIT DROP`,
   `CREATE TEMP TABLE publications(id integer PRIMARY KEY,tenant_id integer,organisation_id integer,titre text,contenu text,
    categorie text,priorite text,statut text,statut_diffusion_diaspora text,audience_type text,medias jsonb,
    date_diffusion_diaspora timestamptz,date_publication timestamptz DEFAULT NOW()) ON COMMIT DROP`,
   `CREATE TEMP TABLE diaspora_sponsor_optins(tenant_id integer,personne_id integer,actif boolean,
    consent_version varchar(24),date_consentement timestamptz,date_retrait timestamptz,
    date_modification timestamptz,PRIMARY KEY(tenant_id,personne_id)) ON COMMIT DROP`,
   `CREATE TEMP TABLE diaspora_sponsored_publications(publication_id integer PRIMARY KEY,
     tenant_id integer,organisation_id integer,sponsor_organisation_id integer,defini_par integer,date_declaration timestamptz DEFAULT NOW()) ON COMMIT DROP`,
   `CREATE TEMP TABLE audit_trail(tenant_id integer,organisation_id integer,personne_id integer,
     action text,entity_type text,entity_id text,details jsonb) ON COMMIT DROP`,
   `CREATE TEMP TABLE notifications(id bigserial PRIMARY KEY,tenant_id integer,personne_id integer,organisation_id integer,
     type text,titre text,message text,reference_type text,reference_id integer,canal text,metadata jsonb,
     date_creation timestamptz DEFAULT NOW()) ON COMMIT DROP`,
   `CREATE UNIQUE INDEX ux_sponsor_temp_dedup ON notifications(tenant_id,personne_id,reference_id)
     WHERE type='DIASPORA_ABONNEMENT' AND reference_type='PUBLICATION'`
  ];for(const sql of tables)await c.query(sql);
  await c.query(`INSERT INTO tenants VALUES(9,'TEST_SPONSOR',TRUE)`);
  await c.query(`INSERT INTO organisations VALUES(22,9,'ASSOCIATION','Association fictive'),(24,9,'ASSOCIATION','Org membre')`);
  await c.query(`INSERT INTO personnes VALUES(101),(102)`);
  await c.query(`INSERT INTO relations_personne_organisation VALUES(101,24),(102,24)`);
  await c.query(`INSERT INTO diaspora_association_directory VALUES(9,22,'VERIFIEE')`);
  await c.query(`INSERT INTO diaspora_subscriptions VALUES(9,101,22,NULL,TRUE),(9,102,NULL,'EVENEMENT',TRUE)`);
  for(const id of [301,302,303,304,305,306])await c.query(`INSERT INTO publications
   (id,tenant_id,organisation_id,titre,contenu,categorie,priorite,statut,statut_diffusion_diaspora,audience_type,medias,date_diffusion_diaspora)
   VALUES($1,9,22,$2,'FICTIF','EVENEMENT','NORMALE','PUBLIEE',$3,'TOUS','[]'::jsonb,NOW())`,
   [id,'FICTIF '+id,id===305?'NON_DEMANDEE':id===306?'SOUMISE':'DIFFUSEE']);
  await c.query(`INSERT INTO diaspora_sponsored_publications(publication_id,tenant_id,organisation_id,sponsor_organisation_id,defini_par)
    VALUES(301,9,22,22,101),(302,9,22,22,101),(304,9,22,22,101)`);
  const txClient={query:async(sql,args)=>{
    if(sql==='BEGIN')return c.query('SAVEPOINT sponsor_nested');
    if(sql==='COMMIT')return c.query('RELEASE SAVEPOINT sponsor_nested');
    if(sql==='ROLLBACK')return c.query('ROLLBACK TO SAVEPOINT sponsor_nested');
    return c.query(sql,args);
  },release(){}};
  const db={executerRequete:(sql,args)=>c.query(sql,args),obtenirClientDatabase:async()=>txClient};
  const sponsor=creerServiceSponsorDiaspora(db),opt=creerServiceOptinDiaspora(db);
  assert.equal((await sponsor.lireConsentement(101,'TEST_SPONSOR')).actif,false,'Aucune acceptation implicite');
  assert.equal(await notifierAbonnesDiaspora(c,301),0,'Une publication sponsorisée ne notifie pas sans accord');
  assert.equal((await sponsor.modifierConsentement(101,'TEST_SPONSOR',true)).ok,true);
  assert.equal((await sponsor.lireConsentement(101,'TEST_SPONSOR')).actif,true);
  assert.equal(await notifierAbonnesDiaspora(c,301),1,'Le seul citoyen consentant reçoit une notification');
  assert.equal(await notifierAbonnesDiaspora(c,301),0,'Aucun doublon après rejeu');
  const notice=await c.query(`SELECT metadata,message FROM notifications WHERE reference_id=301`);
  assert.equal(notice.rows[0].metadata.sponsorise,true);assert.match(notice.rows[0].message,/sponsorisée/i);
  assert.equal(await notifierAbonnesDiaspora(c,302),0,'Quota sponsorisé un pour 24 heures');
  assert.equal((await sponsor.modifierConsentement(101,'TEST_SPONSOR',false)).ok,true);
  assert.equal(await notifierAbonnesDiaspora(c,304),0,'Retrait de l’accord effectif');
  assert.equal(await notifierAbonnesDiaspora(c,303),2,'Les communications ordinaires restent actives');
  const listed=await opt.listerSuivies(101,'TEST_SPONSOR');
  assert.ok(listed.some(x=>x.id===303));assert.ok(!listed.some(x=>x.id===301));
  const mark=await sponsor.definirSponsorisation({organisationId:22,publicationId:305,acteurId:101,tenant:'TEST_SPONSOR',sponsorise:true});
  assert.equal(mark.ok,true);
  const still=await c.query('SELECT * FROM diaspora_sponsored_publications WHERE publication_id=305');assert.equal(still.rowCount,1);
  const frozen=await sponsor.definirSponsorisation({organisationId:22,publicationId:306,acteurId:101,tenant:'TEST_SPONSOR',sponsorise:true});
  assert.equal(frozen.code,'MARQUAGE_NON_MODIFIABLE');
  const audits=await c.query(`SELECT COUNT(*)::integer AS n FROM audit_trail WHERE action IN ('DIASPORA_SPONSOR_CONSENT','DIASPORA_SPONSOR_MARK')`);
  assert.equal(audits.rows[0].n,3);
  await c.query('ROLLBACK');started=false;
  console.log('D2BC_PGTEMP_PASS : opt-in séparé, quota, non rétroactivité, marquage verrouillé, audit et ROLLBACK');
 }finally{if(started)await c.query('ROLLBACK').catch(()=>{});await c.end();}
}
main().catch(e=>{console.error('D2BC_PGTEMP_FAIL',e.stack||e.message);process.exitCode=1;});
