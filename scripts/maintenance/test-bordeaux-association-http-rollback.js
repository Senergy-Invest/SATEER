'use strict';
// SATEER Bordeaux P335BN — end-to-end HTTP réel sur serveur éphémère,
// données fictives dans une seule transaction PostgreSQL, ROLLBACK obligatoire.
// AUCUNE connexion au serveur 3200 et AUCUNE écriture persistante.
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = process.env.SATEER_BORDEAUX_ROOT || path.resolve(__dirname, '..', '..');
const { Pool } = require(path.join(ROOT, 'node_modules', 'pg'));
const express = require(path.join(ROOT, 'node_modules', 'express'));
const DB = 'sateer_test';
const SYSTEM_ID = '7699611241381229531';
const RUN = crypto.randomBytes(9).toString('hex').toUpperCase();
const TENANT = `BN_${RUN.slice(0,10)}`;
const PASS = `BN!${crypto.randomBytes(24).toString('base64url')}`;
if (process.env.PGHOST !== '::1' || process.env.PGPORT !== '5432' || (process.env.PGDATABASE && process.env.PGDATABASE !== DB)) {
  throw Error('PG_ENV_REFUSE : PGHOST=::1 PGPORT=5432 PGDATABASE=sateer_test attendus');
}
process.env.PGDATABASE = DB;
process.env.PGUSER ||= process.env.USER;
process.env.PORT = '0';
process.env.SATEER_LISTEN_HOST = '127.0.0.1';
process.env.NODE_ENV = 'test';
// La recette éphémère ne doit pas réutiliser l'origine du serveur principal.
delete process.env.SATEER_PUBLIC_ORIGIN;

const database = require(path.join(ROOT, 'database'));
const original = { query: database.executerRequete, connect: database.obtenirClientDatabase, end: database.fermerDatabase };
const verifierPool = new Pool({database:DB,host:'::1',port:5432,user:process.env.PGUSER,password:process.env.PGPASSWORD});
let client, server, backendPid;
let savepoints = [];
let sqlCount = 0;
let transactionStarted = false;
let rollbackConfirmed = false;
let fixtureTenantId = null;
const identifier = x => Number(x);

async function isolatedQuery(sql, values) {
  const statement = String(typeof sql === 'string' ? sql : sql.text || '').trim().replace(/;$/, '').toUpperCase();
  if (statement === 'BEGIN' || statement.startsWith('BEGIN ')) {
    const name = `bn_sp_${savepoints.length + 1}`;
    await client.query(`SAVEPOINT ${name}`);
    savepoints.push(name);
    return { rowCount: 0, rows: [] };
  }
  if (statement === 'COMMIT' || statement === 'ROLLBACK') {
    const name = savepoints.pop();
    if (!name) throw Error(`TRANSACTION_INTERDITE : ${statement} sans savepoint`);
    if (statement === 'ROLLBACK') await client.query(`ROLLBACK TO SAVEPOINT ${name}`);
    return client.query(`RELEASE SAVEPOINT ${name}`);
  }
  sqlCount++;
  return client.query(sql,values);
}
const sharedClient = {
  get processID(){return client.processID;},
  query:isolatedQuery,
  release(){}
};
database.executerRequete = isolatedQuery;
database.obtenirClientDatabase = async () => sharedClient;
database.fermerDatabase = async () => {};

async function checkInstance(db) {
  const r=await db.query('SELECT current_database() AS db,(SELECT system_identifier::text FROM pg_control_system()) AS system_id, pg_backend_pid() AS pid');
  assert.equal(r.rows[0]?.db,DB,'Base PostgreSQL non autorisée');
  assert.equal(r.rows[0]?.system_id,SYSTEM_ID,'Instance PostgreSQL non autorisée');
  return r.rows[0].pid;
}
async function api(base,route,opts={}) {
  const headers={accept:'application/json'};
  if (opts.body !== undefined) headers['content-type']='application/json';
  if (opts.cookie) headers.cookie=opts.cookie;
  if (opts.method && opts.method!=='GET') headers.origin=base;
  const r=await fetch(base+route,{method:opts.method||'GET',headers,body:opts.body===undefined?undefined:JSON.stringify(opts.body),redirect:'manual'});
  const body=await r.json().catch(()=>null);
  return {status:r.status,body};
}
function expect(r,status,description) {
  assert.equal(r.status,status,`${description} : reçu HTTP ${r.status}, attendu ${status}; ${JSON.stringify(r.body)?.slice(0,1200)}`);
  console.log(`PASS ${description}: HTTP ${status}`);
  return r.body;
}
async function makeUser(orgId,role,permissionCodes=[]) {
  const p=await client.query('INSERT INTO personnes(prenom,nom,profil) VALUES($1,$2,$3) RETURNING id',['BN',`${role}_${RUN}`,'TEST_SYNTHETIQUE']);
  const personId=identifier(p.rows[0].id);
  await client.query('INSERT INTO relations_personne_organisation(personne_id,organisation_id,type) VALUES($1,$2,$3)',[personId,orgId,'TEST_SYNTHETIQUE']);
  if(permissionCodes.length){
    const row=await client.query(`INSERT INTO organisation_roles(organisation_id,code,nom,description,scope,metadata)
      VALUES($1,$2,$3,'Test HTTP isolé P335BN','ORGANISATION',$4::jsonb) RETURNING id`,
      [orgId,`BN_${role}_${RUN}`,role,JSON.stringify({fixture:'P335BN',run:RUN})]);
    const roleId=identifier(row.rows[0].id);
    await client.query('INSERT INTO relations_personne_organisation_roles(personne_id,organisation_id,role_id,actif) VALUES($1,$2,$3,TRUE)',[personId,orgId,roleId]);
    const got=await client.query(`INSERT INTO role_permissions(role_id,permission_id,actif)
      SELECT $1,id,TRUE FROM permissions WHERE actif=TRUE AND code=ANY($2::text[]) RETURNING id`,[roleId,permissionCodes]);
    assert.equal(got.rowCount,permissionCodes.length,'Permissions de test non disponibles');
  }
  const auth=require(path.join(ROOT,'auth-database'));
  const name=`bn.${RUN.toLowerCase()}.${role.toLowerCase()}@sateer.test`;
  const created=await auth.creerCompteAuthentificationDatabase(personId,name,PASS);
  assert.equal(created.succes,true,`Création compte fictif ${role} impossible`);
  return {personId,name};
}
async function login(base,user){
  const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({identifiant:user.name,motDePasse:PASS})});
  assert.equal(r.status,200,`Login ${user.name} : HTTP ${r.status}`);
  const cookies=typeof r.headers.getSetCookie==='function'?r.headers.getSetCookie():[r.headers.get('set-cookie')||''];
  const cookie=cookies.map(x=>x.split(';')[0]).find(x=>x.startsWith('sateer_session='));
  assert.ok(cookie,'Cookie session synthétique manquant');
  return cookie;
}
async function main(){
  client=await original.connect();
  backendPid=await checkInstance(client);
  const mandatory=['MANAGE_ORGANISATION_RELATIONSHIPS','RELAY_ASSOCIATION_COMMUNICATION','TARGET_COMMUNICATION'];
  const available=await client.query('SELECT code FROM permissions WHERE actif=TRUE AND code=ANY($1::text[])',[mandatory]);
  assert.deepEqual(new Set(available.rows.map(x=>x.code)),new Set(mandatory),'Catalogue de permissions incomplet');
  await client.query('BEGIN'); transactionStarted=true;
  const ten=await client.query("INSERT INTO tenants(code,nom,type) VALUES($1,$2,'TEST_SYNTHETIQUE') RETURNING id",[TENANT,`BN isolation ${RUN}`]);
  const tenantId=identifier(ten.rows[0].id); fixtureTenantId=tenantId;
  const issuer=await client.query("INSERT INTO organisations(nom,type,tenant_id) VALUES($1,'CONSULAT',$2) RETURNING id",[`BN Consulat ${RUN}`,tenantId]);
  const association=await client.query("INSERT INTO organisations(nom,type,tenant_id) VALUES($1,'ASSOCIATION',$2) RETURNING id",[`BN Association ${RUN}`,tenantId]);
  const issuerId=identifier(issuer.rows[0].id),associationId=identifier(association.rows[0].id);
  const vice=await makeUser(issuerId,'VICE',['MANAGE_ORGANISATION_RELATIONSHIPS','TARGET_COMMUNICATION']);
  const manager=await makeUser(associationId,'ASSO',['MANAGE_ORGANISATION_RELATIONSHIPS','RELAY_ASSOCIATION_COMMUNICATION']);
  const member=await makeUser(associationId,'MEMBRE');
  // Lancer les vraies routes depuis le serveur, avec toute la BD app épinglée au client transactionnel.
  const originalListen=express.application.listen;
  let captured;
  try {
    express.application.listen=function(){
      const args=Array.from(arguments);
      const cb=typeof args[args.length-1]==='function'?args[args.length-1]:undefined;
      captured=originalListen.call(this,0,'127.0.0.1',cb);return captured;
    };
    require(path.join(ROOT,'server'));
  } finally { express.application.listen=originalListen; }
  server=captured;
  assert.ok(server,'Démarrage du serveur HTTP de recette non détecté');
  if(!server.listening) await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject)});
  assert.equal(server.address().address,'127.0.0.1');
  const base=`http://127.0.0.1:${server.address().port}`;
  const anon=await api(base,`/api/organisations/${issuerId}/association-partners?tenant=${TENANT}`);
  expect(anon,401,'Accès association anonyme refusé');
  const cVice=await login(base,vice),cManager=await login(base,manager),cMember=await login(base,member);
  const common={tenantCode:TENANT},q=`?tenant=${TENANT}`;
  const issuerPath=`/api/organisations/${issuerId}`,assocPath=`/api/organisations/${associationId}`;
  const inv=expect(await api(base,issuerPath+'/association-partners/invitations',{method:'POST',cookie:cVice,body:{...common,associationOrganizationId:associationId}}),201,'Invitation association');
  const invitationId=identifier(inv.invitation.id);
  const pending=expect(await api(base,assocPath+'/communication-invitations'+q,{cookie:cManager}),200,'Invitation reçue');
  assert(pending.invitations.find(x=>identifier(x.id)===invitationId && x.statut==='EN_ATTENTE'));
  expect(await api(base,`${assocPath}/communication-invitations/${invitationId}/decision`,{method:'POST',cookie:cManager,body:{...common,decision:'ACCEPTER'}}),200,'Invitation acceptée');
  const partners=expect(await api(base,issuerPath+'/association-partners'+q,{cookie:cVice}),200,'Association visible au Vice');
  const relation=partners.associations.find(x=>identifier(x.id)===associationId && x.relation_active);
  assert(relation,'Association connectée introuvable');
  const chan=expect(await api(base,issuerPath+'/channels',{method:'POST',cookie:cVice,body:{...common,code:`BN_${RUN}`,nom:'Canal test isolé',description:'Aucun destinataire réel'}}),201,'Création du canal');
  const channelId=identifier(chan.canal.id);
  for(const [title,cookie] of [['responsable',cManager],['membre',cMember]]) {
    expect(await api(base,`${assocPath}/association-channels/${channelId}/subscribe${q}`,{method:'POST',cookie}),200,`Abonnement ${title}`);
  }
  const pub=expect(await api(base,issuerPath+'/publications',{method:'POST',cookie:cVice,body:{...common,titre:`Publication synthétique ${RUN}`,contenu:`Texte entièrement fictif ${RUN}.`,categorie:'INFORMATION',priorite:'NORMALE',audienceType:'ASSOCIATION',audienceValeur:String(associationId),communicationChannelId:channelId}}),201,'Publication ciblée fictive');
  const publicationId=identifier(pub.publication.id);
  const notification=await client.query(`SELECT personne_id, count(*)::int n FROM notifications WHERE tenant_id=$1 AND organisation_id=$2 AND reference_type='PUBLICATION' AND reference_id=$3 AND type='PUBLICATION_CANAL' GROUP BY personne_id`,[tenantId,issuerId,publicationId]);
  assert.equal(notification.rowCount,2,'Deux abonnés fictifs doivent être notifiés');
  assert(notification.rows.every(x=>x.n===1),'Un abonné ne reçoit pas de doublon');
  console.log('PASS fanout HTTP de publication : deux abonnés fictifs, aucun doublon');
  const feed=expect(await api(base,assocPath+'/association-communications'+q,{cookie:cManager}),200,'Lecture publication associative');
  const visible=feed.publications.find(x=>identifier(x.id)===publicationId);
  assert(visible,'Publication absente du fil associatif');
  assert.equal(visible.relay_allowed,false,'Relais interdit par défaut');
  expect(await api(base,assocPath+'/association-relays',{method:'POST',cookie:cManager,body:{...common,publicationId}}),404,'Relais interdit sans autorisation');
  expect(await api(base,`${issuerPath}/publications/${publicationId}/association-relay-authorizations/${associationId}${q}`,{method:'PUT',cookie:cVice,body:{...common,enabled:true}}),200,'Autorisation explicite par le Vice');
  expect(await api(base,`${issuerPath}/publications/${publicationId}/association-relay-authorizations/${issuerId}${q}`,{method:'PUT',cookie:cVice,body:{...common,enabled:true}}),422,'Autorisation vers cible invalide refusée');
  expect(await api(base,assocPath+'/association-relays',{method:'POST',cookie:cMember,body:{...common,publicationId}}),403,'Membre sans droit de relais refusé');
  const relay=expect(await api(base,assocPath+'/association-relays',{method:'POST',cookie:cManager,body:{...common,publicationId,associationComment:'Commentaire synthétique distinct du texte officiel.'}}),201,'Relais autorisé');
  assert(identifier(relay.relais.id)>0);
  expect(await api(base,assocPath+'/association-relays',{method:'POST',cookie:cManager,body:{...common,publicationId}}),409,'Relais en doublon refusé');
  const memberFeed=expect(await api(base,assocPath+'/association-relays'+q,{cookie:cMember}),200,'Membre reçoit le relais');
  const item=memberFeed.relais.find(x=>identifier(x.publication_id)===publicationId);
  assert(item,'Relais introuvable pour membre');
  assert.equal(identifier(item.original_author_id),vice.personId,'Auteur initial préservé');
  assert.equal(item.contenu,pub.publication.contenu,'Contenu officiel intact');
  const wrongTenant=expect(await api(base,assocPath+'/association-relays?tenant=TENANT_INEXISTANT',{cookie:cMember}),200,'Tenant inconnu isolé');
  assert.equal(wrongTenant.relais.length,0);
  const cross=await api(base,assocPath+'/association-communications'+q,{cookie:cVice});expect(cross,403,'Vice étranger à association refusé');
  const after=await client.query(`SELECT count(*)::int n FROM notifications WHERE tenant_id=$1 AND organisation_id=$2 AND reference_type='PUBLICATION' AND reference_id=$3 AND type='PUBLICATION_CANAL'`,[tenantId,issuerId,publicationId]);
  assert.equal(after.rows[0].n,2,'Relais sans notifications supplémentaires');
  expect(await api(base,`${issuerPath}/association-partners/${relation.relation_id}${q}`,{method:'DELETE',cookie:cVice}),200,'Révocation de la relation');
  const hidden=expect(await api(base,assocPath+'/association-relays'+q,{cookie:cMember}),200,'Relais masqué après révocation');
  assert.equal(hidden.relais.length,0);
  expect(await api(base,assocPath+'/association-relays',{method:'POST',cookie:cManager,body:{...common,publicationId}}),404,'Relais impossible après révocation');
  const check=await client.query('SELECT pg_backend_pid() pid');
  assert.equal(check.rows[0].pid,backendPid,'Client PostgreSQL applicatif inattendu');
  assert(sqlCount>10,'Les routes HTTP ne semblent pas avoir utilisé la transaction partagée');
  console.log('P335BN_HTTP_RELAIS_PASS : invitation, abonnements, ciblage, relais, doublons, isolation et révocation');
}
async function finish(){
  if(server) await new Promise(resolve=>server.close(()=>resolve()));
  if(client){
    try {if(transactionStarted) {await client.query('ROLLBACK');rollbackConfirmed=true;}}
    finally {client.release();client=null;}
  }
  if(!rollbackConfirmed) throw Error('P335BN_ROLLBACK_ABSENT');
  const pid=await checkInstance(verifierPool);
  assert(pid!==backendPid,'La vérification doit utiliser une nouvelle connexion');
  const r=await verifierPool.query(`SELECT
    (SELECT count(*)::int FROM tenants WHERE code=$1) AS tenants,
    (SELECT count(*)::int FROM organisations WHERE nom LIKE $2) AS organisations,
    (SELECT count(*)::int FROM personnes WHERE nom LIKE $3) AS personnes,
    (SELECT count(*)::int FROM auth_accounts WHERE identifiant LIKE $4) AS comptes,
    (SELECT count(*)::int FROM auth_sessions s JOIN auth_accounts a ON a.id=s.compte_id WHERE a.identifiant LIKE $4) AS sessions,
    (SELECT count(*)::int FROM notifications WHERE tenant_id=$5) AS notifications,
    (SELECT count(*)::int FROM publications WHERE tenant_id=$5) AS publications,
    (SELECT count(*)::int FROM communication_channels WHERE tenant_id=$5) AS canaux,
    (SELECT count(*)::int FROM communication_channel_subscriptions WHERE tenant_id=$5) AS abonnements,
    (SELECT count(*)::int FROM organisation_relationships WHERE tenant_id=$5) AS relations,
    (SELECT count(*)::int FROM communication_publication_relays WHERE tenant_id=$5) AS relais,
    (SELECT count(*)::int FROM communication_publication_relay_authorizations WHERE tenant_id=$5) AS autorisations`,
    [TENANT,`%${RUN}%`,`%${RUN}%`,`bn.${RUN.toLowerCase()}.%`,fixtureTenantId]);
  assert(Object.values(r.rows[0]).every(v=>Number(v)===0),'Fixtures résiduelles après ROLLBACK');
  console.log('P335BN_ROLLBACK_PASS : zéro résidu fictif (identités, associations, publications, canaux, notifications, relais)');
}
(async()=>{
  let error;
  try {await main();}catch(e){error=e;console.error('P335BN_TEST_ECHEC :',e.stack||e);}
  try {await finish();}catch(e){error=error||e;console.error('P335BN_NETTOYAGE_ECHEC :',e.stack||e);}
  await verifierPool.end().catch(e=>{error=error||e;});
  database.executerRequete=original.query;
  database.obtenirClientDatabase=original.connect;
  database.fermerDatabase=original.end;
  if(error) process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
