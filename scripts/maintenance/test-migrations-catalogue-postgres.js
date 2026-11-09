'use strict';
/**
 * SATEER Bordeaux — contrôle de migrations sur base éphémère.
 * - Lecture seule sur sateer_test.
 * - Copie uniquement le SCHÉMA via pg_dump/psql.
 * - Toutes les écritures sont limitées à une nouvelle base au nom aléatoire.
 * - Suppression de la base isolée en finally, même en cas d'échec.
 * Ne déploie PAS de migration sur sateer_test.
 * Test d'intégration local : exige PostgreSQL sur ::1:5432 avec CREATEDB.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {createRequire}=require('node:module');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..','..'));
const die=(key,message='')=>{throw new Error(`${key}${message?': '+message:''}`)};
const assert=(condition,key)=>{if(!condition)die(key)};
const quoted=x=>'"'+x.replace(/"/g,'""')+'"';
const startTag='p335z_'+crypto.randomBytes(6).toString('hex');
const target=`sateer_${startTag}`;
const user=process.env.PGUSER||process.env.USER;
const host=process.env.PGHOST||'::1';
const port=Number(process.env.PGPORT||5432);
assert(host==='::1'&&port===5432,'CIBLE_POSTGRES_INATTENDUE');
assert(!process.env.PGDATABASE||process.env.PGDATABASE==='sateer_test','PGDATABASE_INATTENDUE');
assert(user&&typeof user==='string','PGUSER_MANQUANT');
assert(fs.existsSync(path.join(root,'package.json')),'PROJET_ABSENT');
assert(fs.existsSync(path.join(root,'database','042_procedure_catalogue_validation_explicite.sql')),'MIGRATION_042_ABSENTE');
assert(fs.existsSync(path.join(root,'database','043_permission_manage_procedures.sql')),'MIGRATION_043_ABSENTE');
const {Client}=createRequire(path.join(root,'package.json'))('pg');
const conn=(database)=>new Client({database,host,port,user,...(process.env.PGPASSWORD?{password:process.env.PGPASSWORD}:{})});
const command=(bin,args,opts={})=>{
 const p=spawnSync(bin,args,{encoding:'utf8',timeout:120000,maxBuffer:40*1024*1024,env:{...process.env,PGUSER:user,PGHOST:host,PGPORT:String(port)},...opts});
 if(p.error)die('BINAIRE_INDISPONIBLE_'+bin,p.error.code||'erreur');
 if(p.status!==0)die('ECHEC_'+bin,(p.stderr||'').trim().split('\n').slice(-3).join(' | ').slice(0,360));
 return p.stdout;
};
const sq=async(c,sql,args)=>{const r=await c.query(sql,args);return r.rows};
let admin=null,reader=null,temp=null,created=false,cleaned=false;
async function run(){
 // Aucun verrouillage à une branche ou à un commit : test relançable après les commits futurs.
 for(const bin of ['pg_dump','psql'])command(bin,['--version']);
 const p42=fs.readFileSync(path.join(root,'database/042_procedure_catalogue_validation_explicite.sql'),'utf8');
 const p43=fs.readFileSync(path.join(root,'database/043_permission_manage_procedures.sql'),'utf8');
 reader=conn('sateer_test'); await reader.connect();
 await reader.query('BEGIN READ ONLY');
 const info=(await sq(reader,`SELECT current_database() AS db,current_user AS actor,inet_server_port() AS port`))[0];
 assert(info.db==='sateer_test'&&Number(info.port)===5432,'MAUVAISE_SOURCE');
 const tables=await sq(reader,`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('organisation_procedure_catalogue','permissions')`);
 assert(tables.length===2,'TABLES_SOURCE_ABSENTES');
 const live=await sq(reader,`SELECT column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='organisation_procedure_catalogue' AND column_name IN ('validation_explicite','date_validation','date_publication')`);
 assert(live.length===3,'MIGRATION_042_NON_PRESENTE_SUR_RECETTE');
 const validate=live.find(x=>x.column_name==='validation_explicite');
 assert(validate.data_type==='boolean'&&validate.is_nullable==='NO'&&/false/i.test(validate.column_default||''),'COLONNE_VALIDATION_INATTENDUE');
 const p=await sq(reader,"SELECT code,actif FROM public.permissions WHERE code='MANAGE_PROCEDURES'");
 assert(p.length===1&&p[0].actif===true,'PERMISSION_043_NON_PRESENTE_SUR_RECETTE');
 await reader.query('ROLLBACK');await reader.end();reader=null;
 console.log('P335Z_RECETTE_LECTURE_SEULE: PASS (042 et 043 déjà présentes dans sateer_test)');
 admin=conn('postgres');await admin.connect();
 const rights=(await sq(admin,`SELECT rolcreatedb,rolsuper FROM pg_roles WHERE rolname=current_user`))[0];
 assert(rights&&(rights.rolcreatedb||rights.rolsuper),'CREATEDB_NON_AUTORISE_TEST_ISOLE_IMPOSSIBLE');
 const exists=await sq(admin,'SELECT 1 FROM pg_database WHERE datname=$1',[target]);
 assert(exists.length===0,'NOM_BASE_TEMP_DEJA_UTILISE');
 await admin.query('CREATE DATABASE '+quoted(target));created=true;
 console.log('P335Z_BASE_ISOLEE_CREEE: '+target+' (aucune donnée copiée)');
 // Outil PostgreSQL de schéma uniquement : aucun SELECT de données utilisateurs.
 const dump=command('pg_dump',['--schema-only','--no-owner','--no-acl','--dbname=sateer_test']);
 assert(dump.length>500,'SCHEMA_DUMP_ANORMALEMENT_COURT');
 command('psql',['--no-psqlrc','--set=ON_ERROR_STOP=1','--dbname='+target],{input:dump});
 temp=conn(target);await temp.connect();
 assert((await sq(temp,'SELECT current_database() AS db'))[0].db===target,'BASE_CIBLE_INATTENDUE');
 // La base copiée n'a que le schéma actuel : revenir au schéma pré-Q sur la COPIE.
 await temp.query('ALTER TABLE public.organisation_procedure_catalogue DROP COLUMN IF EXISTS date_publication');
 await temp.query('ALTER TABLE public.organisation_procedure_catalogue DROP COLUMN IF EXISTS date_validation');
 await temp.query('ALTER TABLE public.organisation_procedure_catalogue DROP COLUMN IF EXISTS validation_explicite');
 // Le dump de schéma ne copie aucune ligne de permissions.
 assert((await sq(temp,'SELECT count(*)::int AS n FROM public.permissions'))[0].n===0,'COPIE_CONTIENT_DES_DONNEES');
 for(let round=1;round<=2;round++){
   await temp.query(p42);
   await temp.query(p43);
   const cols=await sq(temp,`SELECT column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='organisation_procedure_catalogue' AND column_name IN ('validation_explicite','date_validation','date_publication')`);
   assert(cols.length===3,'COLONNES_042_NON_CREEES');
   const v=cols.find(x=>x.column_name==='validation_explicite');
   assert(v.data_type==='boolean'&&v.is_nullable==='NO'&&/false/i.test(v.column_default||''),'DEFAULT_042_INVALIDE');
   assert(cols.filter(x=>x.data_type==='timestamp with time zone').length===2,'TIMESTAMPS_042_INCORRECTS');
   const perm=await sq(temp,"SELECT code,actif FROM public.permissions WHERE code='MANAGE_PROCEDURES'");
   assert(perm.length===1&&perm[0].actif===true,'PERMISSION_043_NON_IDEMPOTENTE');
   console.log('P335Z_MIGRATIONS_TOUR_'+round+': PASS');
 }
 const tablesNoRoles=await sq(temp,`SELECT count(*)::int AS n FROM public.role_permissions`);
 assert(tablesNoRoles[0].n===0,'ATTRIBUTION_ROLE_NON_ATTENDUE');
 console.log('P335Z_SCHEMA_REEL_MIGRATIONS: PASS (042/043 sur copie sans données, deux exécutions)');
 console.log('P335Z_CONSOLIDATION_SQL: PRÊT_POUR_REVUE_GIT, PAS_APPLIQUÉ_A_RECETTE');
}
async function cleanup(){
 if(reader){try{await reader.query('ROLLBACK')}catch{}try{await reader.end()}catch{}}
 if(temp){try{await temp.end()}catch{}}
 if(admin){
   if(created){try{await admin.query('DROP DATABASE '+quoted(target));cleaned=true;console.log('P335Z_BASE_ISOLEE_SUPPRIMEE: '+target)}catch(e){console.error('P335Z_ATTENTION_BASE_TEMP_RESTANTE:',target,e.message)}}
   try{await admin.end()}catch{}
 }
}
run().then(async()=>{await cleanup();if(created&&!cleaned)process.exitCode=1;else console.log('P335Z_TERMINÉ: source intacte, Git inchangé');}).catch(async(e)=>{console.error('P335Z_BLOQUE: '+e.message);await cleanup();process.exitCode=1;});
