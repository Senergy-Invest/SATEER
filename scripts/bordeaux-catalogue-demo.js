'use strict';
// Fixture strictement synthetique pour la recette Bordeaux P7, jamais pour une institution reelle.
// setup = une seule procedure DEMO, verify = verification SQL + HTTP sans creation de dossier.
// sql = PREPARE PostgreSQL sans INSERT effectue (annulation transactionnelle).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const ORG = 70;
const TENANT = 'P6V_3B5AC5AB9DB04657';
const SYS = '7699611241381229531';
const DB = 'sateer_test';
const CODE = 'DEMO_BORDEAUX_CARTE';
const TITLE = '[DEMO BORDEAUX] Simulation carte consulaire (aucune piece dans ce test)';
const ORIGIN = 'http://127.0.0.1:3200';
const CREDS = path.join(process.cwd(), '.sateer-backups', 'bordeaux-dossiers-persistants-v1', 'comptes-demonstration.txt');

function client() {
  assert.equal(process.env.PGDATABASE, DB, 'STOP : base non autorisee');
  assert.equal(process.env.PGHOST, '::1', 'STOP : hote PostgreSQL non autorise');
  assert.equal(String(process.env.PGPORT), '5432', 'STOP : port PostgreSQL non autorise');
  return new Client({host:'::1', port:5432, database:DB,
    user:process.env.PGUSER || process.env.USER,
    ...(process.env.PGPASSWORD ? {password:process.env.PGPASSWORD} : {})});
}
async function context(c) {
  const id = await c.query('SELECT current_database() AS db, (SELECT system_identifier::text FROM pg_control_system()) AS system_id');
  assert.equal(id.rows[0]?.db, DB);
  assert.equal(id.rows[0]?.system_id, SYS, 'STOP : cluster PostgreSQL inattendu');
  const q = await c.query(`SELECT o.id,o.nom,o.type,t.code,t.type AS tenant_type,t.id AS tenant_id
    FROM organisations o JOIN tenants t ON t.id=o.tenant_id WHERE o.id=$1`,[ORG]);
  assert.equal(q.rowCount, 1);
  assert.equal(q.rows[0].code, TENANT);
  assert.equal(q.rows[0].type, 'CONSULAT');
  assert.equal(q.rows[0].tenant_type, 'TEST_SYNTHETIQUE', 'STOP : ce tenant n est pas une recette');
  assert.ok(q.rows[0].nom.startsWith('Organisation recette P6 '));
  const routed = await c.query(`SELECT r.destination_unit_id, u.nom, u.actif
    FROM organisation_routing_rules r JOIN organisation_units u ON u.id=r.destination_unit_id
    WHERE r.organisation_id=$1 AND r.tenant_id=$2 AND r.source='MON_CONSULAT'
      AND r.category_key='CARTE_CONSULAIRE' AND r.actif=true AND u.actif=true`, [ORG,q.rows[0].tenant_id]);
  assert.equal(routed.rowCount,1,'Regle P6 CARTE_CONSULAIRE non active ou ambigue');
  assert.match(routed.rows[0].nom,/Passeport/i,'La procedure ne se dirige pas vers le Bureau Passeports');
  return q.rows[0].tenant_id;
}
async function record(c, tenantId) {
  const q = await c.query(`SELECT id,tenant_id,organisation_id,code,categorie,titre,
    pieces_obligatoires,delai_indicatif_jours,actif,valide_par
    FROM organisation_procedure_catalogue WHERE organisation_id=$1 AND code=$2`,[ORG,CODE]);
  if(!q.rowCount)return null;
  assert.equal(q.rowCount,1);
  const r=q.rows[0];
  assert.equal(Number(r.tenant_id),Number(tenantId));
  assert.equal(r.categorie,'CARTE_CONSULAIRE');
  assert.equal(r.titre,TITLE);
  assert.deepEqual(r.pieces_obligatoires,[], 'La fixture ne doit pas definir de vraies pieces');
  assert.equal(r.delai_indicatif_jours,null);
  assert.equal(r.valide_par,null,'Cette fixture ne doit pas se presenter comme validee officiellement');
  assert.equal(r.actif,true);
  return r;
}
async function sqlCheck(c) {
  const source=fs.readFileSync(path.join(process.cwd(),'pilot-procedures-http.js'),'utf8');
  assert.ok(source.includes("'procedureCode',$7::text,'catalogueMisAJour'"));
  assert.ok(source.includes("jsonb_build_object('nombre',$4::int)"));
  const match1=source.match(/const create=await client\.query\(`([\s\S]*?)`,\[org,tenant,req\.auth\.personneId/);
  const match2=source.match(/await client\.query\(`(INSERT INTO demande_history\(tenant_id,demande_id,auteur_personne_id,action,commentaire,metadata\)[\s\S]*?)`,\[create\.rows\[0\]\.tenant_id,caseId/);
  assert.ok(match1&&match2,'Les requetes P7 ne correspondent pas a la version verifiee');
  await c.query('BEGIN');
  try {
    await c.query('PREPARE sateer_p7_demo_insert AS '+match1[1]);
    await c.query('PREPARE sateer_p7_demo_history AS '+match2[1]);
    await c.query('ROLLBACK');
    console.log('P7_SEND_SQL_PREPARE_PASS : requetes de creation de dossier et d historique analysees par PostgreSQL, zero ecriture.');
  } catch(e) {await c.query('ROLLBACK').catch(()=>{});throw e;}
}
async function setup(c,tenantId){
  await c.query('BEGIN');
  try {
    const prior=await record(c,tenantId);
    if(prior)console.log('P7_DEMO_CATALOGUE_ALREADY_PRESENT : fixture conforme, aucune modification.');
    else {
      const insert=await c.query(`INSERT INTO organisation_procedure_catalogue
        (tenant_id,organisation_id,code,categorie,titre,pieces_obligatoires,delai_indicatif_jours,actif,valide_par)
        VALUES ($1,$2,$3,'CARTE_CONSULAIRE',$4,ARRAY[]::text[],NULL,true,NULL)
        ON CONFLICT (organisation_id,code) DO NOTHING RETURNING id`,[tenantId,ORG,CODE,TITLE]);
      assert.equal(insert.rowCount,1,'Code de fixture deja utilise, aucune modification');
      console.log('P7_DEMO_CATALOGUE_CREATED : 1 seule procedure de simulation inseree.');
    }
    assert.ok(await record(c,tenantId));
    await c.query('COMMIT');
  } catch(e) {await c.query('ROLLBACK').catch(()=>{});throw e;}
}
function credentials(label){
  const st=fs.statSync(CREDS);
  assert.equal(st.mode&0o077,0,'Identifiants prives insuffisamment proteges');
  const chunks=fs.readFileSync(CREDS,'utf8').split(/\r?\n\s*\r?\n/);
  for(const block of chunks){
    const lines=block.trim().split(/\r?\n/);
    if(lines[0]!==label)continue;
    const login=lines.find(x=>x.startsWith('Identifiant : '))?.slice(14);
    const password=lines.find(x=>x.startsWith('Mot de passe : '))?.slice(15);
    assert.ok(login&&password, 'Identifiants de recette incomplets : '+label);
    return {login,password};
  }
  throw Error('Profil de recette introuvable : '+label);
}
async function req(url,cookie,options={}){
  const resp=await fetch(ORIGIN+url,{redirect:'manual',signal:AbortSignal.timeout(10000),
    headers:{...(cookie?{Cookie:cookie}:{})},...options});
  return {code:resp.status,json:await resp.json().catch(()=>({})),headers:resp.headers};
}
async function login(label){
  const u=credentials(label);
  const resp=await fetch(ORIGIN+'/api/auth/login',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(10000),
    headers:{'Content-Type':'application/json'},body:JSON.stringify({identifiant:u.login,motDePasse:u.password})});
  assert.equal(resp.status,200,'Authentification refusee pour '+label);
  const cookies=typeof resp.headers.getSetCookie==='function'?resp.headers.getSetCookie():[resp.headers.get('set-cookie')||''];
  const cookie=cookies.map(s=>s.split(';')[0]).find(s=>s.startsWith('sateer_session='));
  assert.ok(cookie,'Cookie de session absent');return cookie;
}
async function verifyHttp(){
  const samba=await login('CITOYEN_SAMBA');
  const awa=await login('CITOYEN_AWA');
  const url=`/api/pilot-procedures/catalogue?organisationId=${ORG}&tenant=${TENANT}`;
  const result=await req(url,samba);
  assert.equal(result.code,200,'Catalogue Samba HTTP '+result.code+' '+result.json.statut);
  const proc=result.json.procedures.find(x=>x.code===CODE);
  assert.ok(proc&&proc.actif,'Procedure de demonstration absente');
  assert.deepEqual(proc.piecesObligatoires,[]);
  const prepared=await req(`/api/pilot-procedures/preparer?organisationId=${ORG}&tenant=${TENANT}&code=${CODE}`,samba);
  assert.equal(prepared.code,200,'Preparation Samba HTTP '+prepared.code+' '+prepared.json.statut);
  assert.equal(prepared.json.statut,'DOSSIER_PREPARE');
  assert.deepEqual(prepared.json.manquantes,[]);
  assert.deepEqual(prepared.json.pieces,[]);
  assert.equal((await req(url,awa)).code,200,'Awa doit voir le catalogue de son Consulat');
  assert.equal((await req(url)).code,401,'Sans session, le catalogue doit etre refuse');
  assert.equal((await req(`/api/pilot-procedures/catalogue?organisationId=132&tenant=${TENANT}`,samba)).code,403,'Consulat etranger doit etre refuse');
  console.log('P7_DEMO_CATALOGUE_HTTP_PASS : catalogue Samba/Awa, preparation sans pieces, isolement et anonymat.');
}
async function main(){
  const mode=process.argv[2];
  assert.ok(['preflight','sql','setup','verify'].includes(mode),'Mode non reconnu');
  const c=client();await c.connect();
  try{
    const id=await context(c);
    if(mode==='preflight'){const prior=await record(c,id);console.log('P7_DEMO_PREFLIGHT_PASS : instance/tenant/P6 corrects; procedure existante='+Boolean(prior));}
    if(mode==='sql')await sqlCheck(c);
    if(mode==='setup')await setup(c,id);
    if(mode==='verify'){assert.ok(await record(c,id));await sqlCheck(c);await verifyHttp();}
  }finally{await c.end();}
}
main().catch(e=>{console.error('P7_DEMO_FAIL:',e.message);process.exitCode=1;});
