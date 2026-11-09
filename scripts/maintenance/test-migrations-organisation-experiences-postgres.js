'use strict';
/** Test d'integration sur une BASE TEMPORAIRE VIDE. Jamais de DDL/DML sur sateer_test.
 *  Le schema minimal couvre les tables referencees par 040/041; il ne prouve pas
 *  la migration d'un dump complet du schema de production. */
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {createRequire}=require('node:module');
const root=path.resolve(process.argv[2]||path.join(__dirname,'../..'));
const {Client}=createRequire(path.join(root,'package.json'))('pg');
const adminCfg={host:'::1',port:5432,database:'sateer_test',user:process.env.PGUSER||process.env.USER,
  ...(process.env.PGPASSWORD?{password:process.env.PGPASSWORD}:{}),connectionTimeoutMillis:6000,statement_timeout:12000};
const name='sateer_p335ae_'+crypto.randomBytes(6).toString('hex');
const admin=new Client(adminCfg);
let created=false;
let connection;
let failed=false;
const sql40=fs.readFileSync(path.join(root,'database/040_organisation_experience_activations.sql'),'utf8');
const sql41=fs.readFileSync(path.join(root,'database/041_organisation_experience_permissions.sql'),'utf8');
async function main(){
 await admin.connect();
 await admin.query('BEGIN READ ONLY');
 try{
  const {rows:[ctx]}=await admin.query(`SELECT current_database() AS db, host(inet_server_addr()) AS host,
     inet_server_port() AS port, current_setting('transaction_read_only') AS ro`);
  assert.equal(ctx.db,'sateer_test');assert.equal(ctx.host,'::1');
  assert.equal(Number(ctx.port),5432);assert.equal(ctx.ro,'on');
  const {rows:[idx]}=await admin.query(`SELECT EXISTS (SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='permissions'
      AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%(code)%') AS code_unique`);
  assert.equal(idx.code_unique,true,'CONTRAINTE_UNIQUE_PERMISSIONS_CODE_ABSENTE');
  await admin.query('ROLLBACK');
 }catch(e){await admin.query('ROLLBACK').catch(()=>{});throw e;}
 console.log('P335AE_CIBLE_RECETTE: introspection READ ONLY sur ::1:5432/sateer_test');
 // Seule cette nouvelle base vide recevra les DDL/DML de test.
 await admin.query(`CREATE DATABASE "${name}" TEMPLATE template0`);created=true;
 console.log('P335AE_BASE_ISOLEE_CREEE: '+name+' (aucune donnee copiee)');
 connection=new Client({...adminCfg,database:name});await connection.connect();
 await connection.query(`CREATE TABLE public.tenants(id SERIAL PRIMARY KEY);
 CREATE TABLE public.personnes(id SERIAL PRIMARY KEY);
 CREATE TABLE public.experiences(id SERIAL PRIMARY KEY);
 CREATE TABLE public.organisations(id SERIAL PRIMARY KEY,tenant_id INTEGER REFERENCES public.tenants(id));
 CREATE TABLE public.permissions(id SERIAL PRIMARY KEY,code VARCHAR(128) NOT NULL UNIQUE,
    nom VARCHAR(255) NOT NULL,description TEXT,actif BOOLEAN NOT NULL DEFAULT TRUE);`);
 await connection.query(`INSERT INTO public.permissions(code,nom,description,actif)
   VALUES('VIEW_ORGANISATION_EXPERIENCES','TEXTE_LEGACY_INCHANGE','DESCRIPTION_LEGACY_INCHANGEE',FALSE)`);
 for(let tour=1;tour<=2;tour++){
  await connection.query(sql40);
  await connection.query(sql41);
  console.log('P335AE_MIGRATIONS_TOUR_'+tour+': PASS');
 }
 const {rows:r}=await connection.query(`SELECT code,nom,description,actif FROM public.permissions
 WHERE code IN ('VIEW_ORGANISATION_EXPERIENCES','MANAGE_ORGANISATION_EXPERIENCES') ORDER BY code`);
 assert.equal(r.length,2);
 assert.equal(r.find(x=>x.code==='VIEW_ORGANISATION_EXPERIENCES').nom,'TEXTE_LEGACY_INCHANGE');
 assert.equal(r.find(x=>x.code==='VIEW_ORGANISATION_EXPERIENCES').actif,false);
 assert.equal(r.find(x=>x.code==='MANAGE_ORGANISATION_EXPERIENCES').actif,true);
 const {rows:[check]}=await connection.query(`SELECT to_regclass('public.organisation_experience_activations') IS NOT NULL AS table_ok,
 (SELECT count(*) FROM public.organisation_experience_activations) AS activations,
 (SELECT count(*) FROM public.permissions WHERE code='MANAGE_ORGANISATION_EXPERIENCES') AS permission_unique`);
 assert.equal(check.table_ok,true);assert.equal(Number(check.activations),0);
 assert.equal(Number(check.permission_unique),1);
 console.log('P335AE_IDEMPOTENCE_POSTGRES_PASS: zero activation, pas de doublon, valeurs preexistantes preservees');
}
main().catch(e=>{failed=true;console.error('P335AE_TEST_ECHEC: '+(e.stack||e.code||e.message));})
 .finally(async()=>{
  if(connection)await connection.end().catch(()=>{});
  if(created){
   try{await admin.query(`DROP DATABASE "${name}"`);console.log('P335AE_BASE_ISOLEE_SUPPRIMEE: '+name);}
   catch(e){failed=true;console.error('P335AE_NETTOYAGE_ECHEC: '+name+' '+(e.code||e.message));}
  }
  await admin.end().catch(()=>{});
  if(failed)process.exitCode=1;
 });
