"use strict";
/**
 * A3d : vraie session HTTP + RBAC + requêtes SQL du graphe, en transaction isolée.
 * La fixture est entièrement fictive. ROLLBACK obligatoire ; aucun serveur SATEER lancé.
 * Ne doit jamais être utilisé avec des données/permissions institutionnelles réelles.
 */
const assert = require('node:assert/strict');
const { randomBytes, createHash } = require('node:crypto');
const { once } = require('node:events');
const express = require('express');

const EXPECTED_DB = 'sateer_test';
const EXPECTED_CLUSTER = '7699611241381229531';
if (process.env.PGDATABASE !== EXPECTED_DB) {
  console.error('A3D_BASE_REFUSEE: PGDATABASE doit etre sateer_test');
  process.exit(40);
}
const database = require('../database');

let server;
let client;
let transactionActive = false;
let testTenantCode;
let count = 0;
function check(condition, label) { assert.ok(condition, label); count += 1; }

async function main() {
  // La transaction réelle se fait exclusivement sur UNE connexion.
  client = await database.obtenirClientDatabase();
  const target = await client.query(`SELECT current_database() AS db,
    (SELECT system_identifier::text FROM pg_control_system()) AS system_identifier`);
  assert.equal(target.rows[0]?.db, EXPECTED_DB, 'Nom de base inattendu');
  assert.equal(target.rows[0]?.system_identifier, EXPECTED_CLUSTER, 'Cluster non autorise');
  console.log('A3D_BASE_CLUSTER_RECETTE_VERIFIES');
  const required = ['tenants','organisations','personnes','organisation_relationships',
    'relations_personne_organisation','permissions','organisation_roles','role_permissions',
    'relations_personne_organisation_roles','auth_accounts','auth_sessions',
    'organisation_dashboard_access_delegations','relations_personne_organisation_unit'];
  const tables = await client.query(`SELECT nom, to_regclass('public.' || nom) IS NOT NULL AS present
    FROM unnest($1::text[]) AS nom`, [required]);
  assert.deepEqual(tables.rows.filter(r => !r.present).map(r => r.nom), [], 'Tables manquantes');
  const runId = randomBytes(7).toString('hex');
  testTenantCode = `A3D_${runId.toUpperCase()}`;
  await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
  transactionActive = true;
  await client.query("SET LOCAL statement_timeout = '12000ms'");
  await client.query("SET LOCAL lock_timeout = '3000ms'");

  // Importer l'authentification et le RBAC APRES injection du client transactionnel.
  // Toute requête capturée par ces services passe par le même client PostgreSQL.
  database.executerRequete = (sql, args = []) => {
    if (!transactionActive) throw new Error('REQUETE_HORS_TRANSACTION_A3D');
    return client.query(sql, args);
  };
  const { exigerSession } = require('../auth-http');
  const { verifierPermissionPersonneDatabase } = require('../auth-authorization');
  const { creerServiceReseauInstitutionnel } = require('../institution-network-database');
  const { creerRouteLectureReseau } = require('../institution-network-read-http');

  async function createTenant(code) {
    const r = await client.query(
      'INSERT INTO tenants(code,nom,type) VALUES($1,$2,$3) RETURNING id',
      [code, `Tenant synthétique ${runId}`, 'TEST_ISOLE']);
    return Number(r.rows[0].id);
  }
  const tenantId = await createTenant(testTenantCode);
  const otherTenantCode = `A3E_${runId.toUpperCase()}`;
  const otherTenantId = await createTenant(otherTenantCode);
  async function createOrg(tenant, type, name) {
    const r = await client.query('INSERT INTO organisations(nom,type,tenant_id) VALUES($1,$2,$3) RETURNING id',
      [`${name} ${runId}`, type, tenant]);
    return Number(r.rows[0].id);
  }
  const ministry = await createOrg(tenantId,'MINISTERE','Ministère fictif');
  const france = await createOrg(tenantId,'AMBASSADE','Ambassade France fictive');
  const bordeaux = await createOrg(tenantId,'CONSULAT','Consulat Bordeaux fictif');
  const italy = await createOrg(tenantId,'AMBASSADE','Ambassade Italie fictive');
  const milan = await createOrg(tenantId,'CONSULAT','Consulat Milan fictif');
  const obsolete = await createOrg(tenantId,'CONSULAT','Consulat révoqué fictif');
  const foreign = await createOrg(otherTenantId,'AMBASSADE','Ambassade autre tenant fictive');

  async function relation(parent, child, type, statut='ACTIVE', actif=true) {
    await client.query(`INSERT INTO organisation_relationships
      (tenant_id,source_organisation_id,target_organisation_id,type,statut,actif)
      VALUES ($1,$2,$3,$4,$5,$6)`, [tenantId,parent,child,type,statut,actif]);
  }
  await relation(ministry,france,'SUPERVISION');
  await relation(france,bordeaux,'ADMINISTRATIVE_TUTELLE');
  await relation(ministry,italy,'SUPERVISION');
  await relation(italy,milan,'ADMINISTRATIVE_TUTELLE');
  await relation(france,obsolete,'ADMINISTRATIVE_TUTELLE','REVOKED',false);

  // Le code de permission est ajouté DANS LA TRANSACTION uniquement s'il est absent.
  // Il n'est attribué qu'à deux comptes fictifs. Aucun rôle réel modifié.
  let permission = await client.query(`SELECT id, actif FROM permissions
    WHERE code='VIEW_INSTITUTION_NETWORK'`);
  if (permission.rowCount && permission.rows[0].actif !== true) {
    throw new Error('A3D_PERMISSION_EXISTANTE_INACTIVE: aucune modification de catalogue autorisee');
  }
  if (!permission.rowCount) {
    permission = await client.query(`INSERT INTO permissions(code,nom,description,actif)
      VALUES('VIEW_INSTITUTION_NETWORK','Lecture réseau synthétique A3d',
      'Permission de test, rollback obligatoire',TRUE) RETURNING id`);
  }
  const permissionId = Number(permission.rows[0].id);
  async function createIdentity(org, allowPermission) {
    const p = await client.query(`INSERT INTO personnes(prenom,nom,profil)
      VALUES ('Personne','A3D_SYNTHETIQUE_' || $1,'TEST_ISOLE') RETURNING id`,[runId]);
    const personId = Number(p.rows[0].id);
    await client.query(`INSERT INTO relations_personne_organisation(personne_id,organisation_id,type)
      VALUES($1,$2,'MEMBRE_TEST')`,[personId,org]);
    if(allowPermission) {
      const role = await client.query(`INSERT INTO organisation_roles(organisation_id,code,nom,scope)
        VALUES($1,$2,'Visualiseur A3d synthétique','ORGANISATION') RETURNING id`,
        [org,`A3D_${randomBytes(5).toString('hex')}`]);
      const roleId = Number(role.rows[0].id);
      await client.query('INSERT INTO role_permissions(role_id,permission_id) VALUES($1,$2)',[roleId,permissionId]);
      await client.query(`INSERT INTO relations_personne_organisation_roles(personne_id,organisation_id,role_id)
        VALUES($1,$2,$3)`,[personId,org,roleId]);
    }
    // Jeton de session aléatoire, empreinte SHA-256 comme en production ; aucun login réel.
    const token=randomBytes(32).toString('base64url');
    const digest=createHash('sha256').update(token).digest('hex');
    const a=await client.query(`INSERT INTO auth_accounts(personne_id,identifiant,mot_de_passe_hash,actif)
      VALUES ($1,$2,$3,TRUE) RETURNING id`,
      [personId,`a3d_${randomBytes(8).toString('hex')}@sateer.invalid`, 'PAS_DE_CONNEXION_POSSIBLE']);
    await client.query(`INSERT INTO auth_sessions(compte_id,empreinte_jeton,date_expiration)
      VALUES($1,$2,CURRENT_TIMESTAMP + INTERVAL '1 hour')`,[a.rows[0].id,digest]);
    return {personId,token};
  }
  const ministerialViewer=await createIdentity(ministry,true);
  const embassyViewer=await createIdentity(france,true);
  const outsider=await createIdentity(italy,false);
  const foreignViewer=await createIdentity(foreign,false);

  const service=creerServiceReseauInstitutionnel({
    requete:(sql,args)=>client.query(sql,args),
    autoriser:async({acteur,tenantId:requestedTenant,organisationId,action})=>{
      if (action!=='VIEW_INSTITUTION_NETWORK') return false;
      const result=await verifierPermissionPersonneDatabase({
        personneId:acteur.personneId, organisationId, tenantCode:acteur.tenantCode,
        permissionCode:action, uniteId:null
      });
      return result.succes===true && result.autorise===true &&
        result.portee==='ORGANISATION' && requestedTenant===tenantId;
    }
  });
  const app=express();
  app.use('/api/institution-network',exigerSession,creerRouteLectureReseau({
    router:express.Router(),
    resoudreTenantId:async code=>{
      const r=await client.query('SELECT id FROM tenants WHERE code=$1 AND actif=TRUE',[code]);
      return r.rowCount===1?Number(r.rows[0].id):null;
    },
    lireSousReseau:service.lireSousReseau
  }));
  server=app.listen(0,'127.0.0.1');
  await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  async function get(org,tenant,identity,method='GET') {
    const url=`${base}/api/institution-network/${org}?tenant=${encodeURIComponent(tenant)}`;
    const headers=identity ? {Cookie:`sateer_session=${identity.token}`} : {};
    const response=await fetch(url,{method,headers,redirect:'manual'});
    const data=(response.headers.get('content-type')||'').includes('application/json')
      ?await response.json():null;
    return {status:response.status,data,headers:response.headers};
  }
  let x=await get(ministry,testTenantCode,null);
  check(x.status===401,'Pas de session = 401');
  x=await get(ministry,testTenantCode,{token:'invalid'});
  check(x.status===401,'Jeton de session invalide = 401');
  x=await get(ministry,testTenantCode,ministerialViewer);
  check(x.status===200&&x.data.statut==='RESEAU_INSTITUTIONNEL','Ministère autorisé = 200');
  const ids=new Set(x.data.descendants.map(o=>o.id));
  check([france,bordeaux,italy,milan].every(id=>ids.has(id)),'Deux ambassades et deux consulats visibles');
  check(ids.size===4,'Aucune organisation étrangère au sous-réseau');
  check(!ids.has(obsolete)&&!ids.has(foreign),'Relations révoquées et tenant étranger exclus');
  check(x.data.relations.length===4,'Quatre liens de structure uniquement');
  check(!/personneId|token|mot_de_passe|permission|metadata/.test(JSON.stringify(x.data)),'Projection sans données personnelles');
  check(/no-store/.test(x.headers.get('cache-control')),'Aucun cache HTTP');
  x=await get(france,testTenantCode,embassyViewer);
  check(x.status===200&&x.data.descendants.length===1&&x.data.descendants[0].id===bordeaux,
    'Ambassade France : uniquement Bordeaux');
  x=await get(ministry,testTenantCode,embassyViewer);
  check(x.status===403,'Ambassade sans droit ministériel = 403');
  x=await get(italy,testTenantCode,outsider);
  check(x.status===403,'Simple appartenance sans permission = 403');
  x=await get(ministry,otherTenantCode,ministerialViewer);
  check(x.status===403,'Tenant étranger pour org ministérielle = 403');
  x=await get(ministry,testTenantCode,foreignViewer);
  check(x.status===403,'Acteur autre tenant = 403');
  x=await get(france,testTenantCode,ministerialViewer);
  check(x.status===403,'La supervision ne donne pas automatiquement droit sur enfant');
  x=await get(ministry,testTenantCode,ministerialViewer,'POST');
  check(x.status===404,'Aucun POST exposé');
  console.log(`A3D_HTTP_REEL_SESSION_RBAC_PG_PASS=${count}`);
  await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  server=null;
  await client.query('ROLLBACK');
  transactionActive=false;
  // Nouvelle connexion pour vérifier l'absence de résidu après rollback.
  const sanity=await client.query(`SELECT COUNT(*)::int AS n FROM tenants WHERE code=ANY($1::text[])`,
    [[testTenantCode,otherTenantCode]]);
  assert.equal(sanity.rows[0].n,0,'Résidu synthétique après rollback');
  console.log('A3D_ROLLBACK_CONFIRME_AUCUN_RESIDU');
}

(async()=>{
  try{await main();}
  catch(err){console.error('A3D_RECETTE_BLOQUEE:',err.stack || err);process.exitCode=1;}
  finally{
    if(server){await new Promise(resolve=>server.close(()=>resolve())).catch(()=>{});server=null;}
    if(client){
      if(transactionActive){await client.query('ROLLBACK').catch(()=>{});transactionActive=false;}
      if(testTenantCode){
        const r=await client.query('SELECT COUNT(*)::int AS n FROM tenants WHERE code=$1',[testTenantCode]).catch(()=>null);
        if(!r || r.rows?.[0]?.n!==0){
          console.error('A3D_RESIDU_OU_VERIFICATION_INDISPONIBLE');process.exitCode=1;
        }
      }
      client.release();
    }
    await database.fermerDatabase().catch(()=>{});
  }
})();
