#!/usr/bin/env node
'use strict';
/** Schéma et droit réservés à A01, base Bordeaux local test, opération transactionnelle. */
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const ROOT=path.join(process.env.HOME||'','SATEER');
const localRequire=createRequire(path.join(ROOT,'package.json'));
const {Client}=localRequire('pg');
const mode=process.argv[2];if(!['preflight','apply','verify'].includes(mode))throw Error('MODE_INVALIDE');
const ORG=70,TENANT='P6V_3B5AC5AB9DB04657',SID='7699611241381229531';
const LOGIN='p6v.3b5ac5ab9db04657.vice@sateer.test',ROLE='CASE_ASSIGNMENT_P335BY_BORDEAUX';
const PERMISSION='ASSIGN_CONSULAR_CASES_PILOT';
const assert=(ok,reason)=>{if(!ok)throw Error(reason);};
assert(!process.env.DATABASE_URL&&!process.env.PGOPTIONS,'CONNEXION_PG_AMBIGUE');
const client=new Client({host:'::1',port:5432,database:'sateer_test',user:process.env.PGUSER||process.env.USER,
 ...(process.env.PGPASSWORD?{password:process.env.PGPASSWORD}:{}),connectionTimeoutMillis:7000,statement_timeout:18000});
async function one(sql,args=[],reason='LIGNE_UNIQUE_REQUISE'){
 const r=await client.query(sql,args);assert(r.rowCount===1,reason);return r.rows[0];
}
async function check(){
 const ctx=await one('SELECT current_database() AS db, inet_server_addr()::text AS host, inet_server_port() AS port, system_identifier::text AS sid FROM pg_control_system()');
 assert(ctx.db==='sateer_test' && ['::1','::1/128'].includes(ctx.host) && Number(ctx.port)===5432,'INSTANCE_LOCALE_NON_AUTORISEE');
 assert(ctx.sid===SID,'INSTANCE_POSTGRES_DIFFERENTE');
 const o=await one('SELECT t.code FROM organisations o JOIN tenants t ON t.id=o.tenant_id WHERE o.id=$1',[ORG],'ORG_INTROUVABLE');
 assert(o.code===TENANT,'TENANT_INATTENDU');
 const user=await one(`SELECT a.personne_id FROM auth_accounts a WHERE LOWER(a.identifiant)=$1 AND a.actif=TRUE
 AND EXISTS(SELECT 1 FROM relations_personne_organisation r WHERE r.personne_id=a.personne_id AND r.organisation_id=$2)`,[LOGIN,ORG],'VICE_A01_ABSENT');
 // Le schéma canonique attendu doit être vérifié avant toute migration : aucune table de remplacement.
 for(const [tab,col] of [['demandes','assignee_a'],['demande_history','date_action'],['organisation_units','id']]){
   const c=await one('SELECT COUNT(*)::int AS n FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1 AND column_name=$2',[tab,col]);
   assert(c.n===1,'SCHEMA_CANONIQUE_INATTENDU_'+tab+'.'+col);
 }
 return Number(user.personne_id);
}
async function apply(){
 await client.query("SELECT pg_advisory_xact_lock(hashtext('sateer-p335by-case-org70'))");
 const vice=await check();
 const sql=fs.readFileSync(path.join(__dirname,'046_bordeaux_case_dispatch.sql'),'utf8');
 await client.query(sql);
 const p=await one('SELECT id,actif FROM permissions WHERE code=$1',[PERMISSION]);assert(p.actif===true,'PERMISSION_INACTIVE');
 let roles=await client.query('SELECT id,actif,scope FROM organisation_roles WHERE organisation_id=$1 AND code=$2',[ORG,ROLE]);
 if(!roles.rowCount)roles=await client.query(`INSERT INTO organisation_roles(organisation_id,code,nom,description,scope,metadata)
 VALUES($1,$2,'Répartition de dossiers de recette Bordeaux','Affectation des dossiers au seul pilote Bordeaux',
 'ORGANISATION','{"recette":true,"lot":"P335BY"}'::jsonb) RETURNING id,actif,scope`,[ORG,ROLE]);
 assert(roles.rowCount===1 && roles.rows[0].actif===true && roles.rows[0].scope==='ORGANISATION','ROLE_INVALIDE');
 const roleId=roles.rows[0].id;
 const others=await client.query('SELECT personne_id FROM relations_personne_organisation_roles WHERE role_id=$1 AND actif=TRUE',[roleId]);
 assert(others.rows.every(x=>Number(x.personne_id)===vice),'ROLE_OCCUPE_PAR_AUTRE');
 const rights=await client.query(`SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id
 WHERE rp.role_id=$1 AND rp.actif=TRUE`,[roleId]);
 assert(rights.rows.every(x=>x.code===PERMISSION),'PERMISSIONS_SUPPLEMENTAIRES_INATTENDUES');
 const grant=await client.query('SELECT actif FROM role_permissions WHERE role_id=$1 AND permission_id=$2',[roleId,p.id]);
 if(!grant.rowCount)await client.query('INSERT INTO role_permissions(role_id,permission_id,actif) VALUES($1,$2,TRUE)',[roleId,p.id]);
 else assert(grant.rowCount===1&&grant.rows[0].actif===true,'GRANT_DESACTIVE');
 const rel=await client.query('SELECT id,actif FROM relations_personne_organisation_roles WHERE personne_id=$1 AND organisation_id=$2 AND role_id=$3',[vice,ORG,roleId]);
 if(!rel.rowCount)await client.query('INSERT INTO relations_personne_organisation_roles(personne_id,organisation_id,role_id,actif) VALUES($1,$2,$3,TRUE)',[vice,ORG,roleId]);
 else assert(rel.rowCount===1&&rel.rows[0].actif===true,'DROIT_A01_DESACTIVE');
 console.log('P335BY_MIGRATION_BORDEAUX_PASS : tables, droit nominatif A01, aucun dossier modifié');
}
async function verify(){
 const vice=await check();
 for(const tab of ['pilot_case_dispatch_agent_settings','pilot_case_dispatch_audit']){
  const c=await one('SELECT COUNT(*)::int AS n FROM pg_tables WHERE schemaname=current_schema() AND tablename=$1',[tab]);
  assert(c.n===1,'TABLE_ABSENTE_'+tab);
 }
 const right=await one(`SELECT COUNT(*)::int AS n FROM relations_personne_organisation_roles r
 JOIN organisation_roles o ON o.id=r.role_id AND r.organisation_id=o.organisation_id
 JOIN role_permissions rp ON rp.role_id=o.id AND rp.actif=TRUE
 JOIN permissions p ON p.id=rp.permission_id AND p.actif=TRUE
 WHERE r.personne_id=$1 AND r.organisation_id=$2 AND r.actif=TRUE AND o.actif=TRUE AND p.code=$3`,[vice,ORG,PERMISSION]);
 assert(right.n===1,'DROIT_A01_INTROUVABLE');console.log('P335BY_SCHEMA_ET_DROIT_PASS');
}
(async()=>{
 let open=false;
 try{await client.connect();await client.query(mode==='preflight'?'BEGIN READ ONLY':'BEGIN');open=true;
 await client.query("SET LOCAL lock_timeout='4s'");
 if(mode==='preflight'){await check();console.log('P335BY_PREFLIGHT_DB_PASS');}
 else if(mode==='apply')await apply();else await verify();
 await client.query(mode==='apply'?'COMMIT':'ROLLBACK');open=false;
 }finally{if(open)await client.query('ROLLBACK').catch(()=>{});await client.end().catch(()=>{});}
})().catch(e=>{console.error('P335BY_POSTGRES_BLOQUE: '+String(e.code||e.message).slice(0,180));process.exitCode=1;});
