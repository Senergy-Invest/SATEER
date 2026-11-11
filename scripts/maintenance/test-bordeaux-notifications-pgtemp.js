'use strict';
/**
 * Bordeaux P335BM : exécution SQL réelle de notifierAbonnesPublication,
 * UNIQUEMENT sur tables temporaires et transaction annulée.
 * Aucune requête d'écriture ne vise les données institutionnelles.
 * Usage: PGDATABASE=sateer_test PGHOST=::1 PGPORT=5432 SATEER_PROJECT_ROOT=$HOME/SATEER node <this file>
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ROOT = path.resolve(process.env.SATEER_PROJECT_ROOT || path.join(__dirname, '..', '..'));
const EXPECTED_BLOB = '5d2f89c55220b9b3eb3d5e84034979a0e277b6cf';
const SYSTEM_ID = '7699611241381229531';
const database = 'sateer_test';

async function run() {
  assert.equal(process.env.PGDATABASE, database, 'Refus: PGDATABASE=sateer_test exigé');
  assert.equal(process.env.PGHOST, '::1', 'Refus: PGHOST=::1 exigé');
  assert.equal(Number(process.env.PGPORT), 5432, 'Refus: PGPORT=5432 exigé');
  const blob = execFileSync('git', ['hash-object', 'communication-notifications.js'], { cwd: ROOT, encoding: 'utf8' }).trim();
  assert.equal(blob, EXPECTED_BLOB, 'La fonction métier a changé: revue requise avant test.');
  const { Client } = require(path.join(ROOT, 'node_modules', 'pg'));
  const { notifierAbonnesPublication } = require(path.join(ROOT, 'communication-notifications.js'));
  const client = new Client({ host:'::1', port:5432, database, user: process.env.PGUSER || process.env.USER,
    password: process.env.PGPASSWORD });
  let inTransaction = false;
  try {
    await client.connect();
    const identity = await client.query('SELECT current_database() AS db, (SELECT system_identifier::text FROM pg_control_system()) AS system_id');
    assert.equal(identity.rows[0].db, database);
    assert.equal(identity.rows[0].system_id, SYSTEM_ID, 'Instance PostgreSQL non autorisée');
    await client.query('BEGIN'); inTransaction = true;
    await client.query('SET LOCAL search_path = pg_temp, pg_catalog');
    const tables = [
      `CREATE TEMP TABLE publications (id bigint, tenant_id integer, organisation_id integer,
        communication_channel_id bigint, titre text, statut text, audience_type text, audience_valeur text) ON COMMIT DROP`,
      `CREATE TEMP TABLE communication_channels (id bigint, tenant_id integer, organisation_id integer,
        code text, nom text, actif boolean, visibility text) ON COMMIT DROP`,
      `CREATE TEMP TABLE communication_channel_subscriptions (channel_id bigint, tenant_id integer,
        organisation_id integer, personne_id integer, actif boolean) ON COMMIT DROP`,
      `CREATE TEMP TABLE personnes (id integer, residence_territory_id integer, departement text, profil text) ON COMMIT DROP`,
      `CREATE TEMP TABLE territories (id integer, nom text) ON COMMIT DROP`,
      `CREATE TEMP TABLE organisations (id integer, tenant_id integer) ON COMMIT DROP`,
      `CREATE TEMP TABLE relations_personne_organisation (personne_id integer, organisation_id integer) ON COMMIT DROP`,
      `CREATE TEMP TABLE organisation_relationships (source_organisation_id integer, target_organisation_id integer,
        tenant_id integer, actif boolean, statut text, date_fin timestamptz) ON COMMIT DROP`,
      `CREATE TEMP TABLE communication_publication_targets (publication_id bigint, tenant_id integer,
        organisation_id integer, target_organisation_id integer) ON COMMIT DROP`,
      `CREATE TEMP TABLE notifications (id bigint GENERATED ALWAYS AS IDENTITY, tenant_id integer,
        personne_id integer, organisation_id integer, type text, titre text, message text,
        reference_type text, reference_id bigint, canal text, metadata jsonb) ON COMMIT DROP`
    ];
    for (const sql of tables) await client.query(sql);
    const verified = await client.query(`SELECT to_regclass('pg_temp.publications') IS NOT NULL AS publications_temp,
      to_regclass('pg_temp.notifications') IS NOT NULL AS notifications_temp,
      current_setting('search_path') AS search_path`);
    assert.equal(verified.rows[0].publications_temp, true);
    assert.equal(verified.rows[0].notifications_temp, true);
    assert.equal(verified.rows[0].search_path, 'pg_temp, pg_catalog');
    // All objects below are exclusively fake rows in temporary tables.
    const T = 991001, O = 991070, A = 991080, B = 991081, C = 991050;
    await client.query(`INSERT INTO communication_channels(id,tenant_id,organisation_id,code,nom,actif,visibility)
      VALUES ($1,$2,$3,'RECETTE_P335BM','Canal fictif',true,'PUBLIC')`, [C,T,O]);
    await client.query(`INSERT INTO organisations(id,tenant_id) VALUES ($1,$3),($2,$3)`, [A,B,T]);
    await client.query(`INSERT INTO personnes(id,residence_territory_id,departement,profil) VALUES
      (991101,991201,'DAKAR','ETUDIANT'),(991102,NULL,'BORDEAUX','SALARIE'),
      (991103,NULL,'DAKAR','SALARIE'),(991104,NULL,'BORDEAUX','ETUDIANT'),
      (991105,NULL,'DAKAR','ETUDIANT'),(991106,NULL,'DAKAR','SALARIE')`);
    await client.query("INSERT INTO territories(id,nom) VALUES (991201,'DAKAR')");
    await client.query(`INSERT INTO communication_channel_subscriptions(channel_id,tenant_id,organisation_id,personne_id,actif)
      VALUES ($1,$2,$3,991101,true),($1,$2,$3,991102,true),($1,$2,$3,991103,true),
      ($1,$2,$3,991104,true),($1,$2,$3,991105,false),($1,991999,$3,991106,true)`, [C,T,O]);
    await client.query(`INSERT INTO relations_personne_organisation(personne_id,organisation_id)
      VALUES (991101,$1),(991102,$1),(991103,$2)`, [A,B]);
    await client.query(`INSERT INTO organisation_relationships(source_organisation_id,target_organisation_id,tenant_id,actif,statut,date_fin)
      VALUES ($1,$3,$4,true,'ACTIVE',NULL),($2,$3,$4,false,'INACTIVE',NULL)`,[A,B,O,T]);
    const expectedPeople = async (id, people) => {
      const result = await client.query(`SELECT personne_id FROM notifications WHERE reference_id=$1 ORDER BY personne_id`,[id]);
      assert.deepEqual(result.rows.map(x=>x.personne_id), people, `Audience incorrecte pour publication fictive ${id}`);
    };
    const publish = async (id, audienceType, audienceValue = null, statut = 'PUBLIEE', channelId = C, tenantId = T) => {
      await client.query(`INSERT INTO publications(id,tenant_id,organisation_id,communication_channel_id,titre,statut,audience_type,audience_valeur)
        VALUES ($1,$2,$3,$4,'Publication fictive', $5,$6,$7)`, [id,tenantId,O,channelId,statut,audienceType,audienceValue]);
      return notifierAbonnesPublication(client,id);
    };
    const check = async (label, id, count, people) => {
      assert.equal(count,people.length,label);
      await expectedPeople(id,people);
      console.log('PASS',label,':',count,'notification(s) fictive(s)');
    };
    await check('TOUS abonnés actifs du tenant',992001,await publish(992001,'TOUS'),[991101,991102,991103,991104]);
    assert.equal(await notifierAbonnesPublication(client,992001),0,'Anti-doublon : second appel doit être nul');
    await expectedPeople(992001,[991101,991102,991103,991104]);
    console.log('PASS anti-doublon et rejeu idempotent');
    await check('DEPARTEMENT ciblé',992002,await publish(992002,'DEPARTEMENT','DAKAR'),[991101,991103]);
    await check('PROFIL ciblé',992003,await publish(992003,'PROFIL','ETUDIANT'),[991101,991104]);
    await check('ASSOCIATION connectée',992004,await publish(992004,'ASSOCIATION',String(A)),[991101,991102]);
    await client.query(`INSERT INTO communication_publication_targets(publication_id,tenant_id,organisation_id,target_organisation_id)
      VALUES ($1,$2,$3,$4)`,[992005,T,O,A]);
    await check('ORGANISATIONS ciblées et reliées',992005,await publish(992005,'ORGANISATIONS'),[991101,991102]);
    await check('Brouillon non publié : zéro notification',992006,await publish(992006,'TOUS',null,'BROUILLON'),[]);
    await client.query(`UPDATE communication_channel_subscriptions SET actif=false WHERE personne_id=991102`);
    await check('Désabonnement respecté',992007,await publish(992007,'TOUS'),[991101,991103,991104]);
    await client.query(`UPDATE organisation_relationships SET actif=false,statut='INACTIVE' WHERE source_organisation_id=$1`,[A]);
    await check('Relation association révoquée',992008,await publish(992008,'ASSOCIATION',String(A)),[]);
    await client.query(`UPDATE communication_channels SET actif=false WHERE id=$1`,[C]);
    await check('Canal désactivé',992009,await publish(992009,'TOUS'),[]);
    await check('Isolation tenant publication',992010,await publish(992010,'TOUS',null,'PUBLIEE',C,991999),[]);
    const total=await client.query('SELECT count(*)::int AS n FROM notifications');
    assert.equal(total.rows[0].n,15,'Compte fictif total incohérent');
    console.log('P335BM_NOTIFICATIONS_SQL_PASS: tests sur tables temporaires uniquement; 0 écriture persistante.');
  } finally {
    if (inTransaction) {
      try { await client.query('ROLLBACK'); console.log('P335BM_ROLLBACK_CONFIRMÉ'); }
      catch (e) { console.error('P335BM_ROLLBACK_ERREUR:',e.message); process.exitCode=1; }
    }
    await client.end().catch(()=>{});
  }
}
run().catch(error => {console.error('P335BM_ECHEC:',error.stack||error.message);process.exitCode=1;});
