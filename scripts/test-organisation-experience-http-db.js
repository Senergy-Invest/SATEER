"use strict";
/*
 * P3.3.3C — Recette HTTP + PostgreSQL réelle, fixtures synthétiques uniquement.
 * Toutes les opérations applicatives utilisent une unique connexion PostgreSQL
 * et une transaction externe ROLLBACK. Aucune permission des rôles existants
 * n'est modifiée. Les tests échouent fermement sur toute autre instance.
 */
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const { Pool } = require("pg");
const express = require("express");

const ALLOWED_CLUSTER = "7699611241381229531";
const DB_NAME = "sateer_test";
const ORIGIN = "http://localhost:3100"; // origine de test explicite (pas l'URL du serveur éphémère)

// Vérifier AVANT toute connexion, puis imposer un serveur de recette éphémère.
assert.equal(process.env.PGHOST, "::1", "Hôte PGHOST non autorisé");
assert.equal(process.env.PGPORT, "5432", "Port PGPORT non autorisé");
assert.equal(process.env.PGDATABASE, DB_NAME, "Base PGDATABASE non autorisée");
assert.notEqual(process.env.NODE_ENV, "production", "Refus du mode production");
process.env.NODE_ENV = "test";
process.env.PORT = "0";
process.env.SATEER_LISTEN_HOST = "127.0.0.1";
process.env.SATEER_ENABLE_ORG_EXP_API = "1";
process.env.SATEER_PUBLIC_ORIGIN = ORIGIN;

const ROOT_DATABASE = require("../database");
const ORIGINAL = {
  query: ROOT_DATABASE.executerRequete,
  connect: ROOT_DATABASE.obtenirClientDatabase,
  end: ROOT_DATABASE.fermerDatabase
};
const auditPool = new Pool({
  host: "::1", port: 5432, database: DB_NAME,
  user: process.env.PGUSER || process.env.USER,
  ...(process.env.PGPASSWORD ? {password: process.env.PGPASSWORD} : {}),
  connectionTimeoutMillis: 7000, max: 1
});

const RUN = randomBytes(7).toString("hex").toUpperCase();
const TENANT_A = `P333C_A_${RUN}`;
const TENANT_C = `P333C_C_${RUN}`;
const EXPERIENCE = `EXP_P333C_${RUN}`;
const TAG = `P333C_${RUN}`;
const PASSWORD = `P3C!${randomBytes(30).toString("base64url")}a1`;
let dbClient = null;
let httpServer = null;
let transactionOpen = false;
let queryCount = 0;
let savepointNumber = 0;
const savepoints = [];
const fixture = {tenantA: null,tenantC: null,orgA: null,orgB: null,orgC: null,experienceId: null, users: {}, cookies: {}};

function logOk(text) {console.log("PASS " + text);}
function num(row) {const n = Number(row); assert.ok(Number.isSafeInteger(n) && n > 0); return n;}
async function checkStatus(res, expected, text) {
  const responseBody = res.json;
  assert.equal(res.status, expected, `${text}: HTTP ${res.status}, attendu ${expected}, retour ${JSON.stringify(responseBody)}`);
  logOk(`${text} (HTTP ${expected})`);
}
function txQuery(sql, params) {
  if (!dbClient || !transactionOpen) throw Error("SQL applicatif en dehors de la transaction contrôlée");
  const normalized = String(typeof sql === "string" ? sql : sql.text || "").trim().toUpperCase();
  if (normalized === "BEGIN" || normalized.startsWith("BEGIN ")) {
    const name = `p333c_sp_${++savepointNumber}`;
    savepoints.push(name);
    return dbClient.query(`SAVEPOINT ${name}`);
  }
  if (normalized === "COMMIT") {
    assert.ok(savepoints.length, "COMMIT applicatif sans SAVEPOINT");
    return dbClient.query(`RELEASE SAVEPOINT ${savepoints.pop()}`);
  }
  if (normalized === "ROLLBACK") {
    assert.ok(savepoints.length, "ROLLBACK applicatif sans SAVEPOINT");
    const name = savepoints.pop();
    return dbClient.query(`ROLLBACK TO SAVEPOINT ${name}`).then(async () => dbClient.query(`RELEASE SAVEPOINT ${name}`));
  }
  if (/^\s*(?:PREPARE\s+TRANSACTION|COMMIT\s+PREPARED|ROLLBACK\s+PREPARED|CREATE\s+DATABASE|DROP\s+DATABASE)\b/i.test(normalized)) {
    throw Error("SQL interdit pendant la recette");
  }
  queryCount++;
  return dbClient.query(sql, params);
}
// Le patch s'applique avant le chargement de server.js ou des services métier.
ROOT_DATABASE.executerRequete = (sql, params) => txQuery(sql, params);
ROOT_DATABASE.obtenirClientDatabase = async () => ({
  get processID(){return dbClient.processID;},
  query: txQuery,
  release() {}
});
ROOT_DATABASE.fermerDatabase = async () => {};

async function http(base, resource, method = "GET", body, cookie, origin) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  if (origin !== undefined) headers.origin = origin;
  const response = await fetch(base + resource, {
    method, headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(12000)
  });
  const plain = await response.text();
  let json = null;
  try { json = plain ? JSON.parse(plain) : null; } catch { json = {raw: plain.slice(0, 160)}; }
  return {status: response.status, headers: response.headers, json};
}
function href(orgId, tenant, code) {
  return `/api/organisation-experiences/${orgId}${code ? `/${encodeURIComponent(code)}` : ""}?tenant=${encodeURIComponent(tenant)}`;
}
async function makePerson(label, orgId, tenant, permissionCodes) {
  const p = await dbClient.query(
    "INSERT INTO personnes(prenom,nom,profil) VALUES('Test', $1, 'TEST_P333C') RETURNING id",
    [`${TAG}_${label}`]
  );
  const personId = num(p.rows[0].id);
  await dbClient.query(
    "INSERT INTO relations_personne_organisation(personne_id,organisation_id,type) VALUES($1,$2,'TEST_SYNTHETIQUE')",
    [personId, orgId]
  );
  const role = await dbClient.query(
    "INSERT INTO organisation_roles(organisation_id,code,nom,scope,actif) VALUES($1,$2,$2,'ORGANISATION',TRUE) RETURNING id",
    [orgId, `${TAG}_${label}`]
  );
  const roleId = num(role.rows[0].id);
  const pids = await dbClient.query("SELECT id,code FROM permissions WHERE actif=TRUE AND code=ANY($1::text[])", [permissionCodes]);
  assert.deepEqual(pids.rows.map(x=>x.code).sort(), permissionCodes.slice().sort(), "Permissions attendues absentes du catalogue");
  for (const perm of pids.rows) {
    await dbClient.query("INSERT INTO role_permissions(role_id,permission_id,actif) VALUES($1,$2,TRUE)",[roleId,perm.id]);
  }
  await dbClient.query(
    "INSERT INTO relations_personne_organisation_roles(personne_id,organisation_id,role_id,actif) VALUES($1,$2,$3,TRUE)",
    [personId,orgId,roleId]
  );
  const email = `p333c.${RUN.toLowerCase()}.${label.toLowerCase()}@sateer.test`;
  const { creerCompteAuthentificationDatabase } = require("../auth-database");
  const made = await creerCompteAuthentificationDatabase(personId,email,PASSWORD);
  assert.equal(made.succes,true,`Création du compte synthétique ${label}`);
  fixture.users[label] = {id:personId,email,tenant,organisation:orgId};
}
async function seed() {
  const t = await dbClient.query(
    "INSERT INTO tenants(code,nom,type,actif) VALUES($1,$2,'TEST_SYNTHETIQUE',TRUE) RETURNING id",
    [TENANT_A,`Tenant A ${TAG}`]
  ); fixture.tenantA = num(t.rows[0].id);
  const t2 = await dbClient.query(
    "INSERT INTO tenants(code,nom,type,actif) VALUES($1,$2,'TEST_SYNTHETIQUE',TRUE) RETURNING id",
    [TENANT_C,`Tenant C ${TAG}`]
  ); fixture.tenantC = num(t2.rows[0].id);
  for (const [field,tn] of [["orgA",fixture.tenantA],["orgB",fixture.tenantA],["orgC",fixture.tenantC]]) {
    const o = await dbClient.query(
      "INSERT INTO organisations(nom,type,tenant_id) VALUES($1,'TEST_SYNTHETIQUE',$2) RETURNING id",
      [`${TAG}_${field}`,tn]
    ); fixture[field] = num(o.rows[0].id);
  }
  const exp = await dbClient.query(
    "INSERT INTO experiences(code,nom,type,actif,ordre) VALUES($1,$2,'INSTITUTIONNELLE',TRUE,80) RETURNING id",
    [EXPERIENCE,`Experience ${TAG}`]
  ); fixture.experienceId = num(exp.rows[0].id);
  const VIEW="VIEW_ORGANISATION_EXPERIENCES", MANAGE="MANAGE_ORGANISATION_EXPERIENCES";
  await makePerson("ADMIN_A",fixture.orgA,TENANT_A,[VIEW,MANAGE]);
  await makePerson("ADMIN_B",fixture.orgB,TENANT_A,[VIEW,MANAGE]);
  await makePerson("ADMIN_C",fixture.orgC,TENANT_C,[VIEW,MANAGE]);
  await makePerson("LECTEUR_A",fixture.orgA,TENANT_A,[VIEW]);
  logOk("Deux tenants, trois organisations et quatre comptes/roles synthétiques préparés sous ROLLBACK");
}
async function bootServer() {
  const saved = express.application.listen;
  express.application.listen = function (...args) {
    // Imposer localhost:0 même si server.js change un paramètre de listen.
    httpServer = saved.call(this,0,"127.0.0.1",typeof args.at(-1)==="function"?args.at(-1):undefined);
    return httpServer;
  };
  try {require("../server");} finally {express.application.listen=saved;}
  assert.ok(httpServer,"Serveur temporaire non capturé");
  if (!httpServer.listening) await new Promise((resolve,reject)=>{httpServer.once("listening",resolve);httpServer.once("error",reject);});
  const addr = httpServer.address();
  assert.equal(addr.address,"127.0.0.1","Le serveur de test doit écouter exclusivement sur loopback");
  const base = `http://127.0.0.1:${addr.port}`;
  logOk(`Serveur HTTP de recette éphémère sur 127.0.0.1 (port ${addr.port})`);
  return base;
}
async function login(base,label) {
  const account=fixture.users[label];
  const reply=await http(base,"/api/auth/login","POST",{identifiant:account.email,motDePasse:PASSWORD},null,ORIGIN);
  await checkStatus(reply,200,`Session réelle de ${label}`);
  const cookie = (typeof reply.headers.getSetCookie === "function" ? reply.headers.getSetCookie() : [reply.headers.get("set-cookie")||""])
    .map(x=>x.split(";")[0]).find(x=>x.startsWith("sateer_session="));
  assert.ok(cookie,"Session HttpOnly absente");
  fixture.cookies[label]=cookie;
}
function statusOf(result) {
  const entry=result.json?.experiences?.find(x=>x.code===EXPERIENCE);
  assert.ok(entry,"Expérience synthétique absente du catalogue HTTP");
  return entry.statut;
}
async function exercise(base) {
  const A=fixture.orgA,B=fixture.orgB,C=fixture.orgC;
  const queryA=href(A,TENANT_A),queryB=href(B,TENANT_A),queryC=href(C,TENANT_C);
  const putA=href(A,TENANT_A,EXPERIENCE),putB=href(B,TENANT_A,EXPERIENCE);
  await checkStatus(await http(base,queryA),401,"Liste sans session refusée");
  for (const label of Object.keys(fixture.users)) await login(base,label);
  const ca=fixture.cookies.ADMIN_A, cb=fixture.cookies.ADMIN_B, cc=fixture.cookies.ADMIN_C, cv=fixture.cookies.LECTEUR_A;
  let r=await http(base,queryA,"GET",undefined,ca); await checkStatus(r,200,"A consulte son registre");
  assert.equal(statusOf(r),"INACTIVE"); logOk("Expérience INACTIVE par défaut pour A");
  r=await http(base,queryB,"GET",undefined,cb); await checkStatus(r,200,"B consulte son registre");
  assert.equal(statusOf(r),"INACTIVE");logOk("Expérience INACTIVE par défaut pour B");
  r=await http(base,queryC,"GET",undefined,cc); await checkStatus(r,200,"C consulte son registre");
  assert.equal(statusOf(r),"INACTIVE");logOk("Expérience INACTIVE par défaut pour C (autre tenant)");
  await checkStatus(await http(base,queryA,"GET",undefined,cb),403,"B ne peut pas lire le registre A (même tenant)");
  await checkStatus(await http(base,queryC,"GET",undefined,ca),403,"A ne peut pas lire C (autre tenant)");
  await checkStatus(await http(base,href(A,TENANT_C),"GET",undefined,ca),403,"A ne peut pas utiliser un tenant étranger pour lire A");
  await checkStatus(await http(base,putA,"PUT",{statut:"ACTIVE"},null,ORIGIN),401,"Activation sans session refusée");
  await checkStatus(await http(base,putA,"PUT",{statut:"ACTIVE"},cv,ORIGIN),403,"Lecture seule ne permet pas d'activer");
  await checkStatus(await http(base,putA,"PUT",{statut:"ACTIVE"},ca,"https://origine-non-autorisee.invalid"),403,"Origine étrangère refusée");
  await checkStatus(await http(base,putA,"PUT",{statut:"ACTIVE"},ca),403,"Origine absente refusée");
  await checkStatus(await http(base,putA,"PUT",{statut:"AUTRE"},ca,ORIGIN),400,"Statut non autorisé rejeté");
  await checkStatus(await http(base,putA,"PUT",{statut:"ACTIVE",autre:true},ca,ORIGIN),400,"Corps comportant une clé supplémentaire rejeté");
  await checkStatus(await http(base,href("1%3Bdrop",TENANT_A,EXPERIENCE),"PUT",{statut:"ACTIVE"},ca,ORIGIN),400,"Identifiant organisation malformé rejeté");
  await checkStatus(await http(base,putA,"PUT",{statut:"ACTIVE"},cb,ORIGIN),403,"B ne peut pas activer A (même tenant)");
  await checkStatus(await http(base,href(C,TENANT_C,EXPERIENCE),"PUT",{statut:"ACTIVE"},ca,ORIGIN),403,"A ne peut pas activer C (autre tenant)");
  r=await http(base,putA,"PUT",{statut:"ACTIVE"},ca,ORIGIN); await checkStatus(r,200,"A active son expérience");
  assert.equal(r.json.activation.statut,"ACTIVE");
  r=await http(base,queryA,"GET",undefined,ca);assert.equal(statusOf(r),"ACTIVE");logOk("Activation A visible en HTTP");
  r=await http(base,queryB,"GET",undefined,cb);assert.equal(statusOf(r),"INACTIVE");logOk("Activation A ne modifie pas B");
  r=await http(base,queryC,"GET",undefined,cc);assert.equal(statusOf(r),"INACTIVE");logOk("Activation A ne modifie pas C");
  r=await http(base,putB,"PUT",{statut:"ACTIVE"},cb,ORIGIN);await checkStatus(r,200,"B s'active indépendamment");
  r=await http(base,putA,"PUT",{statut:"INACTIVE"},ca,ORIGIN);await checkStatus(r,200,"A se désactive indépendamment");
  r=await http(base,queryB,"GET",undefined,cb);assert.equal(statusOf(r),"ACTIVE");logOk("B reste ACTIVE après désactivation de A");
  r=await http(base,queryA,"GET",undefined,cv);await checkStatus(r,200,"Lecteur A peut consulter");
  assert.equal(statusOf(r),"INACTIVE");logOk("A reste INACTIVE pour son lecteur");
  r=await http(base,queryC,"GET",undefined,cc);assert.equal(statusOf(r),"INACTIVE");logOk("C reste INACTIVE (autre tenant)");
  const states = await dbClient.query(`SELECT organisation_id, statut, modifie_par_personne_id
       FROM organisation_experience_activations
       WHERE experience_id=$1 AND tenant_id=$2 ORDER BY organisation_id`,[fixture.experienceId,fixture.tenantA]);
  assert.equal(states.rows.length,2);
  assert.deepEqual(states.rows.map(x=>[num(x.organisation_id),x.statut]),[[A,"INACTIVE"],[B,"ACTIVE"]]);
  assert.equal(num(states.rows[0].modifie_par_personne_id),fixture.users.ADMIN_A.id);
  assert.equal(num(states.rows[1].modifie_par_personne_id),fixture.users.ADMIN_B.id);
  const other=await dbClient.query("SELECT count(*)::int AS n FROM organisation_experience_activations WHERE experience_id=$1 AND tenant_id=$2",[fixture.experienceId,fixture.tenantC]);
  assert.equal(other.rows[0].n,0);
  assert.ok(queryCount>0,"Aucune requête de l'application sur le client transactionnel");
  logOk(`Données SQL exactes confirmées et ${queryCount} requêtes applicatives dans la transaction contrôlée`);
}
async function main() {
  dbClient = await ORIGINAL.connect();
  const identity=await dbClient.query("SELECT current_database() AS db, (SELECT system_identifier::text FROM pg_control_system()) AS system_id, pg_backend_pid() AS pid");
  assert.equal(identity.rows.length,1);
  assert.equal(identity.rows[0].db,DB_NAME,"Identité de la base différente");
  assert.equal(identity.rows[0].system_id,ALLOWED_CLUSTER,"Identité physique du cluster PostgreSQL différente");
  logOk("Instance PostgreSQL ::1:5432/sateer_test et system_identifier épinglés");
  const schema=await dbClient.query(`SELECT
    to_regclass('public.organisation_experience_activations') IS NOT NULL AS activations,
    to_regclass('public.organisation_roles') IS NOT NULL AS roles,
    to_regclass('public.role_permissions') IS NOT NULL AS privileges,
    to_regclass('public.auth_accounts') IS NOT NULL AS accounts`);
  assert.ok(Object.values(schema.rows[0]).every(Boolean),"Schéma P3.3.3B incomplet");
  const permissions=await dbClient.query(`SELECT code,actif FROM permissions
    WHERE code = ANY($1::text[])`,[["VIEW_ORGANISATION_EXPERIENCES","MANAGE_ORGANISATION_EXPERIENCES"]]);
  assert.equal(permissions.rows.length,2);
  assert.ok(permissions.rows.every(x=>x.actif===true));
  const actualGrants=await dbClient.query(`SELECT count(*)::int AS n FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id
    WHERE p.code=ANY($1::text[])`,[["VIEW_ORGANISATION_EXPERIENCES","MANAGE_ORGANISATION_EXPERIENCES"]]);
  assert.equal(actualGrants.rows[0].n,0,"Des rôles réels disposent déjà de droits : arrêter pour revue manuelle");
  logOk("Permissions cataloguées mais aucun rôle réel habilité avant la recette");
  await dbClient.query("BEGIN");transactionOpen=true;
  await dbClient.query("SET LOCAL statement_timeout = '25000ms'");
  await dbClient.query("SET LOCAL lock_timeout = '1500ms'");
  const locked=await dbClient.query("SELECT pg_try_advisory_xact_lock(333,333) AS ok");
  assert.equal(locked.rows[0].ok,true,"Un autre test P3.3.3C est déjà en cours");
  logOk("Transaction sous verrou anti-concurrence ouverte");
  await seed();
  const base=await bootServer();
  await exercise(base);
  const identityEnd=await dbClient.query("SELECT pg_backend_pid() AS pid");
  assert.equal(identityEnd.rows[0].pid,identity.rows[0].pid,"Le backend SQL a changé");
}
async function cleanup() {
  const problems=[];
  if (httpServer) {
    try { await new Promise((resolve,reject)=>httpServer.close(err=>err?reject(err):resolve())); }
    catch(e) {problems.push(`Fermeture serveur HTTP : ${e.message}`);}
    httpServer=null;
  }
  if (dbClient) {
    if (transactionOpen) {
      try {
        await dbClient.query("ROLLBACK");
        transactionOpen=false;
        logOk("ROLLBACK de toutes les écritures synthétiques (comptes, rôles, sessions, activations)");
      } catch(e) {
        problems.push(`ROLLBACK non confirmé : ${e.message}`);
      }
    }
    try {dbClient.release();} catch(e){problems.push(`Libération connexion : ${e.message}`);}
    dbClient=null;
  }
  if (!problems.some(x=>x.startsWith("ROLLBACK non confirmé"))) {
    try {
      const check=await auditPool.query(`SELECT
        (SELECT count(*)::int FROM tenants WHERE code=ANY($1::text[])) AS tenants,
        (SELECT count(*)::int FROM organisations WHERE nom LIKE $2) AS organisations,
        (SELECT count(*)::int FROM personnes WHERE nom LIKE $2) AS personnes,
        (SELECT count(*)::int FROM experiences WHERE code=$3) AS experiences,
        (SELECT count(*)::int FROM auth_accounts WHERE identifiant LIKE $4) AS accounts,
        (SELECT count(*)::int FROM organisation_roles WHERE code LIKE $2) AS roles,
        (SELECT count(*)::int FROM organisation_experience_activations a JOIN experiences e ON e.id=a.experience_id WHERE e.code=$3) AS activations`,
        [[TENANT_A,TENANT_C],`${TAG}%`,EXPERIENCE,`p333c.${RUN.toLowerCase()}%`]);
      assert.ok(Object.values(check.rows[0]).every(v=>Number(v)===0),"ALERTE : données synthétiques résiduelles après ROLLBACK");
      logOk("Contrôle indépendant PostgreSQL : zéro résidu synthétique");
    } catch(e) {problems.push(`Contrôle résidus : ${e.message}`);}
  }
  try {await auditPool.end();} catch(e){problems.push(`Fermeture pool : ${e.message}`);}
  ROOT_DATABASE.executerRequete=ORIGINAL.query;
  ROOT_DATABASE.obtenirClientDatabase=ORIGINAL.connect;
  ROOT_DATABASE.fermerDatabase=ORIGINAL.end;
  if (problems.length) throw Error(problems.join(" | "));
}

let testFailed=false;
main().catch(e=>{testFailed=true;process.exitCode=1;console.error("P3_3_3C_ECHEC :",e.stack||e.message);})
  .finally(async()=>{
    try {await cleanup();}
    catch(e){testFailed=true;process.exitCode=1;console.error("P3_3_3C_NETTOYAGE_ECHEC :",e.stack||e.message);}
    if (!testFailed) console.log("P3_3_3C_HTTP_DB_TRANSACTIONNEL_PASS");
  });
