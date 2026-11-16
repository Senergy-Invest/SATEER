'use strict';
/**
 * Installs ONLY a local synthetic SUNU Courant fixture on the pinned sateer_test DB.
 * Never invoke for production. Requires explicit flag AND shell authorization.
 * Existing tenant / existing energy tables fail closed if no matching manifest.
 */
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const ROOT=path.resolve(__dirname,'../..');
const {Client}=require(path.join(ROOT,'node_modules/pg'));
const {hacherMotDePasse}=require(path.join(ROOT,'auth-passwords'));
const TENANT='ENERGY_MVP01D_RECETTE';
const EXPECTED_CLUSTER='7699611241381229531';
const DIR=path.join(os.homedir(),'.sateer-recette','energy-mvp01d');
const PRIVATE=path.join(DIR,'IDENTIFIANTS_PRIVES.json');
const MANIFEST=path.join(DIR,'MANIFESTE.json');

function ensureScope(){
 assert.equal(process.env.PGDATABASE,'sateer_test','DB_DE_RECETTE_REQUISE');
 assert.equal(process.env.PGHOST,'::1','HOTE_DE_RECETTE_REQUIS');
 assert.equal(process.env.PGPORT,'5432','PORT_PG_REQUIS');
 assert.equal(process.env.NODE_ENV,'development','NODE_ENV_NON_PRODUCTION_REQUIS');
 assert.equal(process.env.SATEER_ENERGY_MVP01D_AUTHORISATION,'AUTORISER_RECETTE_MVP01','AUTORISATION_EXPLICITE_REQUISE');
}
function config(){return {host:'::1',port:5432,database:'sateer_test',user:process.env.PGUSER||process.env.USER,
 ...(process.env.PGPASSWORD?{password:process.env.PGPASSWORD}:{}),application_name:'sateer_energy_mvp01d_fixture',connectionTimeoutMillis:5000,statement_timeout:15000,query_timeout:20000};}
async function main(){
 ensureScope();
 fs.mkdirSync(DIR,{recursive:true,mode:0o700});fs.chmodSync(DIR,0o700);
 const client=new Client(config());let transaction=false,privateCreated=false,committed=false;
 try{
  await client.connect();
  const pin=(await client.query('SELECT current_database() AS db,(SELECT system_identifier::text FROM pg_control_system()) AS cluster')).rows[0];
  assert.equal(pin.db,'sateer_test');assert.equal(String(pin.cluster),EXPECTED_CLUSTER);
  console.log('CLUSTER_EPINGLE=PASS');
  const existing=(await client.query('SELECT id FROM tenants WHERE code=$1',[TENANT])).rows;
  if(fs.existsSync(MANIFEST)||fs.existsSync(PRIVATE)||existing.length){
    if(!fs.existsSync(MANIFEST)||!fs.existsSync(PRIVATE)||existing.length!==1)throw Error('ETAT_RECETTE_INCOHERENT_STOP');
    const manifest=JSON.parse(fs.readFileSync(MANIFEST,'utf8'));
    if(manifest.tenant!==TENANT||Number(manifest.tenantId)!==Number(existing[0].id))throw Error('MANIFESTE_INCOHERENT_STOP');
    for(const account of manifest.accounts){
      const check=await client.query('SELECT a.id FROM auth_accounts a JOIN relations_personne_organisation rel ON rel.personne_id=a.personne_id AND rel.organisation_id=$2 WHERE a.personne_id=$1 AND a.actif=TRUE',[account.personneId,manifest.organisationId]);
      if(check.rows.length!==1)throw Error('COMPTE_RECETTE_ABSENT_STOP');
    }
    const tables=(await client.query("SELECT to_regclass('public.energy_cases') AS c,to_regclass('public.energy_case_events') AS e")).rows[0];
    if(!tables.c||!tables.e)throw Error('MIGRATION_RECETTE_INCOMPLETE_STOP');
    console.log('FIXTURE_EXISTANTE_VERIFIEE=PASS');return;
  }
  const tables=(await client.query("SELECT to_regclass('public.energy_cases') AS c,to_regclass('public.energy_case_events') AS e")).rows[0];
  if(tables.c||tables.e)throw Error('TABLES_ENERGY_EXISTANTES_SANS_MANIFESTE_STOP');
  // SQL migration is versioned, and runs INSIDE the same transaction as the fixture.
  const sql=fs.readFileSync(path.join(ROOT,'database/050_energy_cases.sql'),'utf8');
  const begin=sql.match(/^BEGIN;\s*$/gm)||[],end=sql.match(/^COMMIT;\s*$/gm)||[];
  if(begin.length!==1||end.length!==1||!sql.includes('CREATE TABLE IF NOT EXISTS energy_cases'))throw Error('MIGRATION_050_NON_RECONNUE');
  const body=sql.replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'');
  const accounts=[0,1].map(i=>({identifiant:'recette.energy.m01d.'+crypto.randomBytes(5).toString('hex')+'.'+i+'@sateer.test',motDePasse:crypto.randomBytes(24).toString('base64url')}));
  // Save credentials privately BEFORE commit; remove them on any transaction failure.
  fs.writeFileSync(PRIVATE,JSON.stringify({tenant:TENANT,origin:'http://localhost:3472',accounts},null,2)+'\n',{flag:'wx',mode:0o600});
  fs.chmodSync(PRIVATE,0o600);privateCreated=true;
  await client.query('BEGIN');transaction=true;
  await client.query("SET LOCAL lock_timeout='5s'");
  const tenantRow=(await client.query("INSERT INTO tenants(code,nom,type,actif) VALUES($1,'SATEER Energy MVP01D FICTIF','PILOTE_TECHNIQUE',TRUE) RETURNING id",[TENANT])).rows[0];
  const organisation=(await client.query("INSERT INTO organisations(nom,type,tenant_id) VALUES('Organisation Energy FICTIVE MVP01D','SATEER',$1) RETURNING id",[tenantRow.id])).rows[0];
  const inserted=[];
  for(let i=0;i<accounts.length;i++){
    const p=(await client.query("INSERT INTO personnes(prenom,nom,profil) VALUES('Recette',$1,'CITOYEN') RETURNING id",['Energy Fictive '+(i===0?'A':'B')])).rows[0];
    await client.query("INSERT INTO relations_personne_organisation(personne_id,organisation_id,type) VALUES($1,$2,'CITOYEN')",[p.id,organisation.id]);
    const hash=await hacherMotDePasse(accounts[i].motDePasse);
    await client.query('INSERT INTO auth_accounts(personne_id,identifiant,mot_de_passe_hash,actif) VALUES($1,$2,$3,TRUE)',[p.id,accounts[i].identifiant,hash]);
    inserted.push({personneId:p.id});
  }
  await client.query(body);
  const check=(await client.query("SELECT to_regclass('public.energy_cases') AS c,to_regclass('public.energy_case_events') AS e")).rows[0];
  if(!check.c||!check.e)throw Error('TABLES_NON_CREEES');
  await client.query('COMMIT');transaction=false;committed=true;
  fs.writeFileSync(MANIFEST,JSON.stringify({tenant:TENANT,tenantId:tenantRow.id,organisationId:organisation.id,accounts:inserted,migration:'050_energy_cases.sql',database:'sateer_test',synthetic:true},null,2)+'\n',{flag:'wx',mode:0o600});
  fs.chmodSync(MANIFEST,0o600);
  console.log('MIGRATION_050_ET_FIXTURE_FICTIVE=PASS');
  console.log('NB_COMPTES_FICTIFS=2');
  console.log('SECRET_NON_AFFICHE=OUI');
 } catch(err){
  if(transaction)await client.query('ROLLBACK').catch(()=>{});
  if(privateCreated&&!committed)try{fs.unlinkSync(PRIVATE);}catch(_){}
  console.error('ECHEC_FIXTURE='+String(err.message||err));process.exitCode=1;
 } finally{await client.end().catch(()=>{});}
}
main();
