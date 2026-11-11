#!/usr/bin/env node
'use strict';
/** Migration P335BX locale en transaction, sécurité forte, sans secrets. */
const fs=require('node:fs');
const path=require('node:path');
const {createRequire}=require('node:module');
const ROOT=path.join(process.env.HOME||'','SATEER');
const req=createRequire(path.join(ROOT,'package.json'));
const {Client}=req('pg');
const mode=process.argv[2];
if(!['preflight','apply','verify'].includes(mode))throw Error('MODE_INVALIDE');
const ORG=70,TENANT='P6V_3B5AC5AB9DB04657';
const VICE='p6v.3b5ac5ab9db04657.vice@sateer.test';
const ROLE='CONFIG_COURRIERS_DEMO_P335BX_BORDEAUX';
const PERM='CONFIGURE_CONSULAR_MAIL_DEMO';
const SID='7699611241381229531';
const fail=(ok,msg)=>{if(!ok)throw Error(msg);};
fail(!process.env.DATABASE_URL && !process.env.PGOPTIONS,'CONNEXION_INDETERMINEE');
const client=new Client({host:'::1',port:5432,database:'sateer_test',
 user:process.env.PGUSER||process.env.USER,...(process.env.PGPASSWORD?{password:process.env.PGPASSWORD}:{}),
 connectionTimeoutMillis:7000,statement_timeout:18000});
async function row(sql,params=[],err='RESULTAT_INATTENDU'){
 const x=await client.query(sql,params);fail(x.rowCount===1,err+' '+x.rowCount);return x.rows[0];
}
async function contexte(){
 const c=await row(`SELECT current_database() AS db,inet_server_addr()::text AS host,inet_server_port() AS port,
   system_identifier::text AS sid FROM pg_control_system()`);
 fail(c.db==='sateer_test' && ['::1','::1/128'].includes(c.host) && c.port===5432,'INSTANCE_POSTGRES_NON_AUTORISEE');
 fail(c.sid===SID,'CLUSTER_NON_CONFORME_POUR_P335BX');
 const o=await row('SELECT t.code FROM organisations o JOIN tenants t ON t.id=o.tenant_id WHERE o.id=$1',[ORG],'ORG_ABSENTE');
 fail(o.code===TENANT,'TENANT_DIFFERENT');
 const person=await row(`SELECT a.personne_id FROM auth_accounts a WHERE LOWER(a.identifiant)=$1 AND a.actif=TRUE
 AND EXISTS(SELECT 1 FROM relations_personne_organisation r WHERE r.personne_id=a.personne_id AND r.organisation_id=$2)`,
 [VICE,ORG],'VICE_A01_ABSENT_OU_NON_RATTACHE');
 return Number(person.personne_id);
}
async function apply(){
 await client.query("SELECT pg_advisory_xact_lock(hashtext('sateer-p335bx-mail-demo-org70'))");
 const viceId=await contexte();
 const sql=fs.readFileSync(path.join(__dirname,'045_bordeaux_email_triage_demo.sql'),'utf8');
 await client.query(sql);
 const perm=await row('SELECT id,actif FROM permissions WHERE code=$1',[PERM]);fail(perm.actif===true,'PERMISSION_DESACTIVEE');
 let r=await client.query('SELECT id,actif,scope FROM organisation_roles WHERE organisation_id=$1 AND code=$2',[ORG,ROLE]);
 if(r.rowCount===0){
  r=await client.query(`INSERT INTO organisation_roles(organisation_id,code,nom,description,scope,metadata)
  VALUES($1,$2,'Configuration courriers fictifs Bordeaux','Privilège de réglage de files simulées','ORGANISATION',
  '{"recette":true,"campagne":"P335BX"}'::jsonb) RETURNING id,actif,scope`,[ORG,ROLE]);
 }
 fail(r.rowCount===1 && r.rows[0].actif===true && r.rows[0].scope==='ORGANISATION','ROLE_CONFIG_NON_CONFORME');
 const rid=r.rows[0].id;
 const occupants=await client.query('SELECT personne_id FROM relations_personne_organisation_roles WHERE role_id=$1 AND actif=TRUE',[rid]);
 fail(occupants.rows.every(x=>Number(x.personne_id)===viceId),'ROLE_DEJA_ATTRIBUE_A_UN_AUTRE_COMPTE');
 const autresDroits=await client.query(`SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=$1 AND rp.actif=TRUE`,[rid]);
 fail(autresDroits.rows.every(x=>x.code===PERM),'ROLE_AVEC_PERMISSIONS_INATTENDUES');
 const grant=await client.query('SELECT actif FROM role_permissions WHERE role_id=$1 AND permission_id=$2',[rid,perm.id]);
 if(!grant.rowCount)await client.query('INSERT INTO role_permissions(role_id,permission_id,actif) VALUES($1,$2,TRUE)',[rid,perm.id]);
 else fail(grant.rowCount===1 && grant.rows[0].actif===true,'ROLE_PERMISSION_INACTIVE');
 const rel=await client.query('SELECT id,actif FROM relations_personne_organisation_roles WHERE personne_id=$1 AND organisation_id=$2 AND role_id=$3',[viceId,ORG,rid]);
 if(!rel.rowCount)await client.query('INSERT INTO relations_personne_organisation_roles(personne_id,organisation_id,role_id,actif) VALUES($1,$2,$3,TRUE)',[viceId,ORG,rid]);
 else fail(rel.rowCount===1&&rel.rows[0].actif===true,'ATTRIBUTION_INACTIVE');
 console.log('P335BX_MIGRATION_TRANSACT_PASS permission dédiée exclusivement à A01, deux tables DEMO');
}
async function verify(){
 const id=await contexte();
 for(const tab of ['pilot_email_triage_demo_rules','pilot_email_triage_demo_audit']){
  const t=await row('SELECT COUNT(*)::int AS n FROM pg_tables WHERE schemaname=current_schema() AND tablename=$1',[tab]);
  fail(t.n===1,'TABLE_MANQUANTE_'+tab);
 }
 const rights=await row(`SELECT COUNT(*)::int AS n FROM relations_personne_organisation_roles r
 JOIN organisation_roles o ON o.id=r.role_id AND o.organisation_id=r.organisation_id
 JOIN role_permissions rp ON rp.role_id=o.id AND rp.actif=TRUE
 JOIN permissions p ON p.id=rp.permission_id AND p.actif=TRUE
 WHERE r.personne_id=$1 AND r.organisation_id=$2 AND r.actif=TRUE AND o.actif=TRUE AND p.code=$3`,[id,ORG,PERM]);
 fail(rights.n===1,'A01_DROIT_CONFIGURATION_ABSENT');
 console.log('P335BX_PERMISSION_A01_ET_SCHEMA_PASS');
}
(async()=>{
 let open=false;
 try{
  await client.connect();
  if(mode==='preflight'){
   await client.query('BEGIN READ ONLY');open=true;
   await contexte();
   await client.query('ROLLBACK');open=false;
   console.log('P335BX_PREFLIGHT_POSTGRES_PASS');
  }else{
   await client.query('BEGIN');open=true;
   await client.query("SET LOCAL lock_timeout='4s'");
   if(mode==='apply')await apply();else await verify();
   if(mode==='verify')await client.query('ROLLBACK');else await client.query('COMMIT');
   open=false;
  }
 }finally{if(open)await client.query('ROLLBACK').catch(()=>{});await client.end().catch(()=>{});}
})().catch(e=>{console.error('P335BX_BLOQUE_'+String(e.code||e.message).slice(0,180));process.exitCode=1;});
