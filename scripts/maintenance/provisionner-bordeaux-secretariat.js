#!/usr/bin/env node
'use strict';
// P335BR : création strictement ciblée du SEUL compte secrétariat de recette.
// preflight = transaction READ ONLY, apply = transaction unique sérialisable.
// Aucun mot de passe dans les arguments, variables d'environnement ou logs.
const fs=require('node:fs');
const path=require('node:path');
const {createRequire}=require('node:module');
const mode=process.argv[2];
const ROOT=path.join(process.env.HOME||'', 'SATEER');
const ORG=70, TENANT='P6V_3B5AC5AB9DB04657';
const LOGIN='p6v.3b5ac5ab9db04657.secretariat@sateer.test';
const ROLE='SECRETARIAT_BORDEAUX_RECETTE_3B5AC5AB9DB04657';
const PERMISSION='VIEW_CONSULAR_MAIL_DEMO';
const SYSTEM_ID='7699611241381229531';
const VICE_ID='p6v.3b5ac5ab9db04657.vice@sateer.test';
const assert=(ok,code)=>{if(!ok)throw Error(code);};
assert(['preflight','apply'].includes(mode),'MODE_INVALIDE');
assert(fs.existsSync(path.join(ROOT,'package.json')) && fs.existsSync(path.join(ROOT,'auth-passwords.js')),'SOURCES_SATEER_ABSENTES');
assert(!process.env.DATABASE_URL && !process.env.PGOPTIONS,'CONNEXION_POSTGRES_AMBIGUE');
const req=createRequire(path.join(ROOT,'package.json'));
const {Client}=req('pg');
const {hacherMotDePasse,verifierMotDePasse}=req('./auth-passwords.js');
const db=new Client({host:'::1',port:5432,database:'sateer_test',user:process.env.PGUSER||process.env.USER,
  ...(process.env.PGPASSWORD?{password:process.env.PGPASSWORD}:{}),connectionTimeoutMillis:7000,statement_timeout:12000});
async function one(sql,args=[],name='LIGNE_UNIQUE_ABSENTE'){
 const r=await db.query(sql,args);assert(r.rowCount===1,name);return r.rows[0];
}
async function context(readonly){
 const ctx=await one(`SELECT current_database() AS db,inet_server_addr()::text AS host,
 inet_server_port() AS port,current_setting('transaction_read_only') AS ro,
 (SELECT system_identifier::text FROM pg_control_system()) AS sid`);
 // Contrôles nominatifs : ne pas confondre une reconnexion à une autre instance
 // avec un simple changement d'identifiant après restauration locale de recette.
 // Le détail diagnostique est purement technique et ne contient aucun secret.
 assert(ctx.db==='sateer_test','INSTANCE_POSTGRES_NON_AUTORISEE_DB_'+String(ctx.db));
 // PostgreSQL inet_server_addr()::text renvoie selon la version/stack
 // ::1 ou ::1/128 ; les deux représentent la même adresse de loopback IPv6.
 // Ne jamais accepter de sous-réseau élargi, IPv4 ou adresse externe.
 assert(ctx.host==='::1' || ctx.host==='::1/128',
   'INSTANCE_POSTGRES_NON_AUTORISEE_HOST_'+String(ctx.host));
 assert(ctx.port===5432,'INSTANCE_POSTGRES_NON_AUTORISEE_PORT_'+String(ctx.port));
 assert(ctx.ro===(readonly?'on':'off'),'MODE_TRANSACTION_INATTENDU_'+String(ctx.ro));
 const org=await one('SELECT t.code FROM organisations o JOIN tenants t ON t.id=o.tenant_id WHERE o.id=$1',[ORG]);
 assert(org.code===TENANT,'CONTEXTE_ORG_TENANT_NON_CONFORME');
 if (ctx.sid!==SYSTEM_ID) {
   // Seule une base de recette portant AUSSI le compte A01 actif et son lien
   // institutionnel peut être reconnue si le cluster PG a été recréé.
   // Ce contrôle n'utilise ni identifiant de session ni mot de passe.
   const anchor=await one(`SELECT COUNT(*)::int AS n FROM auth_accounts a
     WHERE LOWER(a.identifiant)=$1 AND a.actif=TRUE
     AND EXISTS (SELECT 1 FROM relations_personne_organisation r
       WHERE r.personne_id=a.personne_id AND r.organisation_id=$2)`,[VICE_ID,ORG]);
   assert(anchor.n===1,'INSTANCE_POSTGRES_DIFFERENTE_A01_ABSENT_OU_NON_RATTACHE');
   console.log('P335BT_IDENTIFIANT_CLUSTER_DIFFERENT: attendu='+SYSTEM_ID+' actuel='+String(ctx.sid));
   console.log('P335BT_CONTEXTE_RESTAURE_CONFIRME: localhost IPv6, base sateer_test, organisation 70, tenant Bordeaux et compte A01 actif/rattache');
 } else {
   console.log('P335BT_CLUSTER_INITIAL_RECONNU: '+SYSTEM_ID);
 }
 const counts=await one(`SELECT
 (SELECT COUNT(*)::int FROM auth_accounts WHERE LOWER(identifiant)=$1) AS accounts,
 (SELECT COUNT(*)::int FROM organisation_roles WHERE organisation_id=$2 AND code=$3) AS roles`,[LOGIN,ORG,ROLE]);
 assert(counts.accounts===0&&counts.roles===0,'COMPTE_OU_ROLE_DEJA_EXISTANT_ARRET_SANS_ECRASER');
 const active=await db.query('SELECT id,actif FROM permissions WHERE code=$1',[PERMISSION]);
 assert(active.rowCount<=1,'PERMISSION_AMBIGUE');
 assert(!active.rowCount||active.rows[0].actif===true,'PERMISSION_DESACTIVEE');
}
async function receivePassword(){
 const blocks=[];for await (const c of process.stdin)blocks.push(c);
 const pass=Buffer.concat(blocks).toString('utf8').replace(/\r?\n$/,'');
 assert(Buffer.byteLength(pass,'utf8')>=14&&Buffer.byteLength(pass,'utf8')<=256,'MOT_DE_PASSE_LONGUEUR_INVALIDE');
 assert(!/[\x00-\x1f\x7f]/.test(pass),'MOT_DE_PASSE_CONTROLE_INTERDIT');
 const groups=[/[a-z]/.test(pass),/[A-Z]/.test(pass),/[0-9]/.test(pass),/[^a-zA-Z0-9]/.test(pass)].filter(Boolean).length;
 assert(groups>=3,'MOT_DE_PASSE_COMPLEXITE_INSUFFISANTE');
 assert(pass.toLowerCase()!==LOGIN,'MOT_DE_PASSE_IDENTIFIANT_INTERDIT');
 return pass;
}
async function main(){
 let pass, began=false;
 try{
  if(mode==='apply')pass=await receivePassword();
  await db.connect();
  if(mode==='apply'){
   assert(typeof pass==='string','MOT_DE_PASSE_ABSENT');
   const hash=await hacherMotDePasse(pass);
   assert(await verifierMotDePasse(pass,hash),'HASH_NATIF_INVALIDE');
   await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
   began=true;
   await db.query("SET LOCAL lock_timeout = '4s'");
   await db.query("SELECT pg_advisory_xact_lock(hashtext('sateer-p335br-secretariat-org70'))");
   await context(false);
   const localSql=path.join(__dirname,'044_bordeaux_mail_demo_permission.sql');
   const sqlPath=fs.existsSync(localSql)?localSql:path.join(ROOT,'database','044_bordeaux_mail_demo_permission.sql');
   const sql=fs.readFileSync(sqlPath,'utf8');
   await db.query(sql);
   const permission=await one('SELECT id,actif FROM permissions WHERE code=$1',[PERMISSION]);
   assert(permission.actif===true,'PERMISSION_NON_ACTIVE');
   const p=await one("INSERT INTO personnes(prenom,nom,profil) VALUES('Secretariat','Recette Bordeaux','TEST_SYNTHETIQUE') RETURNING id",[],'PERSONNE_NON_CREEE');
   await one('INSERT INTO relations_personne_organisation(personne_id,organisation_id,type) VALUES($1,$2,$3) RETURNING id',[p.id,ORG,'TEST_SYNTHETIQUE'],'RELATION_NON_CREEE');
   const r=await one(`INSERT INTO organisation_roles(organisation_id,code,nom,description,scope,metadata)
      VALUES($1,$2,$3,$4,'ORGANISATION',$5::jsonb) RETURNING id`,
     [ORG,ROLE,'Secrétariat fictif Bordeaux','Lecture des seuls courriers fictifs du pilote',JSON.stringify({recette:true,campagne:'P335BR'})]);
   const granted=await db.query('INSERT INTO role_permissions(role_id,permission_id,actif) VALUES($1,$2,TRUE)',[r.id,permission.id]);
   assert(granted.rowCount===1,'GRANT_NON_CREE');
   await one('INSERT INTO relations_personne_organisation_roles(personne_id,organisation_id,role_id,actif) VALUES($1,$2,$3,TRUE) RETURNING id',[p.id,ORG,r.id]);
   assert(await verifierMotDePasse(pass,hash),'VERIFICATION_MOT_DE_PASSE_ECHEC');
   await one('INSERT INTO auth_accounts(personne_id,identifiant,mot_de_passe_hash,actif) VALUES($1,$2,$3,TRUE) RETURNING id',[p.id,LOGIN,hash]);
   const got=await db.query(`SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id
     WHERE rp.role_id=$1 AND rp.actif=TRUE AND p.actif=TRUE`,[r.id]);
   assert(got.rowCount===1&&got.rows[0].code===PERMISSION,'ROLE_PRIVILEGES_NON_CONFORMES');
   const account=await one('SELECT actif,mot_de_passe_hash FROM auth_accounts WHERE personne_id=$1 AND identifiant=$2',[p.id,LOGIN]);
   assert(account.actif===true&&await verifierMotDePasse(pass,account.mot_de_passe_hash),'COMPTE_NON_CONFORME');
   await db.query('COMMIT');began=false;
   console.log('P335BR_COMPTE_RECETTE_CREE_PASS');
   console.log('P335BR_PERMISSION_UNIQUE: '+PERMISSION);
   console.log('P335BR_IDENTIFIANT: '+LOGIN);
   console.log('P335BR_SECRETS_NON_EXPORTES: PASS');
  }else{
   await db.query('BEGIN READ ONLY');began=true;
   await context(true);
   await db.query('ROLLBACK');began=false;
   console.log('P335BR_PREFLIGHT_DB_PASS: base et tenant autorises, compte absent, permission compatible');
  }
 }finally{
  pass=undefined;
  if(began)await db.query('ROLLBACK').catch(()=>{});
  await db.end().catch(()=>{});
 }
}
main().catch(e=>{console.error('P335BR_DB_BLOQUE: '+String(e.code||e.message||'ERREUR').slice(0,160));process.exitCode=1;});
