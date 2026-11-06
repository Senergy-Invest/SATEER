'use strict';
// Repeatable multi-profile Bordeaux pilot verification (HTTP GET only, except login).
// Authoritative sandbox is sateer_test. No business writes and no password output.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {Client}=require('pg');
const {AuditAuthCache}=require('./bordeaux-recette-auth-cache');
const ROOT=process.cwd();
const ORG=70, TENANT='P6V_3B5AC5AB9DB04657';
const DB='sateer_test', SYS='7699611241381229531';
const BASE='http://127.0.0.1:3200';
const credentialsPath=path.join(ROOT,'.sateer-backups/bordeaux-dossiers-persistants-v1/comptes-demonstration.txt');
const associationPath=path.join(os.tmpdir(),`association-relay-${TENANT}-credentials.txt`);
const results=[], warnings=[];
const fail=(name, detail) => { results.push({name, state:'ECHEC', detail}); console.log('ECHEC '+name+': '+detail); };
const pass=(name,detail='') => { results.push({name, state:'OK', detail}); console.log('OK '+name+(detail?' : '+detail:'')); };
const skip=(name,detail) => {warnings.push(name+': '+detail);results.push({name,state:'NON_TESTE',detail});console.log('NON_TESTE '+name+': '+detail);};
function protectRead(file){
  if(!fs.existsSync(file))return null;
  const mode=fs.statSync(file).mode&0o077;
  assert.equal(mode,0,`Identifiants non protégés (${path.basename(file)}), arrêt`);
  return fs.readFileSync(file,'utf8');
}
function credentials(raw, label){
  if (!raw) return null;
  const chunk=raw.split(/\r?\n\s*\r?\n/).find(x=>x.split(/\r?\n/)[0].trim()===label);
  if(!chunk)return null;
  const login=chunk.match(/^Identifiant : (.+)$/m)?.[1]?.trim();
  const password=chunk.match(/^Mot de passe(?: temporaire)? : (.+)$/m)?.[1]?.trim();
  return login&&password ? {login,password} : null;
}
async function req(url,cookie,options={}){
  const res=await fetch(BASE+url,{...options,redirect:'manual',headers:{Accept:'application/json',...(options.headers||{}),...(cookie?{Cookie:cookie}:{})}});
  const raw=await res.text(); let body;
  try {body=raw?JSON.parse(raw):{};}catch{body=null;}
  return {status:res.status,body, contentType:res.headers.get('content-type')||'',rawLength:raw.length,headers:res.headers};
}

function jsView(f,needle){
  if (!fs.existsSync(f))return fail('UI '+f,'fichier manquant');
  const data=fs.readFileSync(f,'utf8');
  if(!data.includes(needle))fail('UI '+f,'numérotation absente');
  else pass('UI '+f,'références présentes');
}
async function run(){
  assert.equal(process.env.PGDATABASE,DB,'PGDATABASE=sateer_test obligatoire');
  assert.equal(process.env.PGHOST,'::1','PGHOST=::1 obligatoire');
  assert.equal(Number(process.env.PGPORT),5432,'PGPORT=5432 obligatoire');
  const client=new Client({host:'::1',port:5432,database:DB,user:process.env.PGUSER||process.env.USER,password:process.env.PGPASSWORD});
  await client.connect();
  let cases=[],units={};
  try {
    await client.query('BEGIN READ ONLY');
    const info=await client.query('SELECT current_database() AS db, (SELECT system_identifier::text FROM pg_control_system()) AS sys');
    assert.equal(info.rows[0]?.db, DB); assert.equal(info.rows[0]?.sys,SYS);
    const org=await client.query(`SELECT o.id,o.nom,o.type,t.code,t.type tenant_type FROM organisations o JOIN tenants t ON t.id=o.tenant_id WHERE o.id=$1`,[ORG]);
    assert.equal(org.rowCount,1);assert.equal(org.rows[0].code,TENANT);assert.equal(org.rows[0].tenant_type,'TEST_SYNTHETIQUE');assert.equal(org.rows[0].type,'CONSULAT');
    pass('Base/tenant sécurisé','sateer_test, organisation 70, tenant synthétique');
    const r=await client.query(`SELECT d.id,d.statut,d.priorite,d.personne_id,d.categorie,d.destination_unit_id FROM demandes d JOIN tenants t ON t.id=d.tenant_id WHERE d.organisation_id=$1 AND t.code=$2 ORDER BY d.id`,[ORG,TENANT]);
    cases=r.rows;pass('Dossiers en base',String(cases.length)+' dossiers : '+cases.map(d=>d.id+':'+d.statut).join(' '));
    const ru=await client.query(`SELECT r.category_key,u.id,u.nom FROM organisation_routing_rules r JOIN organisation_units u ON u.id=r.destination_unit_id JOIN tenants t ON t.id=r.tenant_id WHERE r.organisation_id=$1 AND t.code=$2 AND r.source='MON_CONSULAT' AND r.actif=true`,[ORG,TENANT]);
    units=Object.fromEntries(ru.rows.map(r=>[r.category_key,Number(r.id)]));
    for(const code of ['PASSEPORT','CARTE_CONSULAIRE','ETAT_CIVIL']){
      if(units[code])pass('Routage '+code,'bureau '+units[code]);else fail('Routage '+code,'règle absente');
    }
    const pubs=await client.query(`SELECT COUNT(*)::int n FROM publications p JOIN tenants t ON t.id=p.tenant_id WHERE p.organisation_id=$1 AND t.code=$2`,[ORG,TENANT]).catch(()=>null);
    if(pubs)pass('Publications DB',String(pubs.rows[0].n));else skip('Publications DB','table ou colonnes non disponibles; contrôle HTTP prioritaire');
    await client.query('ROLLBACK');
  }finally{await client.end();}

  jsView('public/consulat.js','Dossier n°${demande.id}');
  jsView('public/unit-workspace.js','Dossier n°${demande.id}');
  jsView('public/dashboard-vice-consul.js','SATEER_REF_PILOTE_BORDEAUX');
  jsView('public/publication-institutionnelle.js','Publication n°${publicationId}');

  const noAuth=await req(`/api/organisations/${ORG}/dashboard-operationnel?tenant=${TENANT}`);
  if(noAuth.status===401 && noAuth.body)pass('Accès anonyme refusé','HTTP 401 JSON');else fail('Accès anonyme refusé',`HTTP ${noAuth.status}`);
  const mainRaw=protectRead(credentialsPath);
  assert.ok(mainRaw,'Fichier privé des 5 comptes de démo absent');
  const assoRaw=protectRead(associationPath);
  const persona=[
    ['Samba','CITOYEN_SAMBA',mainRaw,'citizen'],
    ['Awa','CITOYEN_AWA',mainRaw,'citizen'],
    ['Moussa (Passeports)','AGENT_PASSEPORTS',mainRaw,'pass'],
    ['Fatou (État civil)','AGENT_ETAT_CIVIL',mainRaw,'civil'],
    ['Consul','CONSUL',mainRaw,'consul'],
    ['Vice-Consul','VICE',assoRaw,'vice'],
    ['Responsable association','RESPONSABLE_ASSOCIATIF',assoRaw,'association'],
    ['Membre association','MEMBRE_ASSOCIATION',assoRaw,'association']
  ];
  const identities={}; const cookies={};
  const cache=new AuditAuthCache(path.join(ROOT,'.sateer-backups','recette-sessions-temporaires.json'));
  let ipLimitReached=false;
  for(const [name,label,raw,kind] of persona){
    if(ipLimitReached){skip('Authentification '+name,'non relancee : plafond HTTP 429 atteint pour cette IP');continue;}
    const user=credentials(raw,label);
    if(!user){skip(name,'identifiants de recette introuvables');continue;}
    const auth=await cache.authenticate(label,user,req);
    if(!auth.ok){
      const diagnostic='HTTP '+auth.status+' / '+auth.code;
      if(auth.rateLimited){
        ipLimitReached=true;
        skip('Authentification '+name,diagnostic+' (10 connexions/IP sur 15 min ; ne pas bloquer les comptes)');
      }else fail('Authentification '+name,diagnostic);
      continue;
    }
    const cookie=auth.cookie;
    const me=auth.me;
    const person=Number(me.body?.personne?.id||me.body?.personneId||me.body?.personne_id||0);
    if(me.status!==200 || !me.body){fail(name,'/api/auth/me non disponible');continue;}
    pass('Authentification '+name,auth.cached?'session de recette verifiee':'HTTP 200');
    identities[name]={person,kind};cookies[name]=cookie;
    if(kind==='citizen'){
      if(!person){fail(name+' identité','personne.id absent');continue;}
      const mine=await req(`/api/mon-consulat/${person}?tenant=${TENANT}&organisation=${ORG}`,cookie);
      if(mine.status!==200||!mine.body){fail(name+' Mon Consulat',`HTTP ${mine.status}`);continue;}
      const expected=cases.filter(d=>Number(d.personne_id)===person);
      const got=mine.body.demandes||[];
      const actual=new Set(got.map(d=>Number(d.id)));
      if(expected.length===got.length&&expected.every(d=>actual.has(Number(d.id))))pass(name+' dossiers','API '+got.length+' dossiers avec identifiants corrects');
      else fail(name+' dossiers',`base ${expected.length}, API ${got.length}; vérifier permissions`);
      pass(name+' communication',`${(mine.body.publications||[]).length} publications / ${(mine.body.notifications||[]).length} notifications`);
      if(name==='Samba'){
        if(!actual.has(136))fail('Dossier 136 Samba','absent');
        const publicationVisible=(mine.body.publications||[]).some(p=>Number(p.id)===58);
        if(publicationVisible)pass('Samba publication #58','visible sans abonnement');
        else fail('Samba publication #58','invisible malgré audience générale');
        const detail=await req(`/api/demandes/136?organisationId=${ORG}&tenant=${TENANT}`,cookie);
        if(detail.status===200&&(detail.body?.reponses||[]).length>0)pass('Samba réponse #136','réponse accessible');
        else fail('Samba réponse #136',`HTTP ${detail.status} / réponse absente`);
      }
    }
    if(kind==='pass'||kind==='civil'){
      const unitId=kind==='pass'?units.PASSEPORT:units.ETAT_CIVIL;
      if(!unitId){fail(name+' unité','routage indisponible');continue;}
      const inbox=await req(`/api/organisations/${ORG}/units/${unitId}/inbox?tenant=${TENANT}`,cookie);
      if(inbox.status!==200||!inbox.body){fail(name+' boîte',`HTTP ${inbox.status}`);continue;}
      const expected=cases.filter(d=>Number(d.destination_unit_id)===unitId);
      const actual=new Set((inbox.body.demandes||[]).map(d=>Number(d.id)));
      if(expected.every(d=>actual.has(Number(d.id))))pass(name+' boîte',`${actual.size} dossiers avec identifiants`);
      else fail(name+' boîte',`manque ${expected.filter(d=>!actual.has(Number(d.id))).map(d=>d.id).join(',')}`);
      const other=kind==='pass'?units.ETAT_CIVIL:units.PASSEPORT;
      if(other){const denied=await req(`/api/organisations/${ORG}/units/${other}/inbox?tenant=${TENANT}`,cookie);
        if(denied.status===403)pass(name+' isolation','403 autre bureau');
        else fail(name+' isolation','HTTP '+denied.status);}
    }
    if(kind==='consul'){
      const strategic=await req(`/api/organisations/${ORG}/dashboard-strategique?tenant=${TENANT}`,cookie);
      if(strategic.status===200&&strategic.body){
        const total=Number(strategic.body.indicateurs?.total);
        if(total===cases.length)pass('Consul indicateurs',`${total} dossiers`);else fail('Consul indicateurs',`API=${total}, DB=${cases.length}`);
      }else fail('Consul stratégique',`HTTP ${strategic.status}`);
      const op=await req(`/api/organisations/${ORG}/dashboard-operationnel?tenant=${TENANT}`,cookie);
      if(op.status===403)pass('Consul séparation des rôles','403 accès opérationnel');else fail('Consul séparation des rôles',`HTTP ${op.status}`);
    }
    if(kind==='association'){
      const assocUrl=kind==='association'&&name==='Membre association'?'association-relays':'association-communications';
      const feed=await req(`/api/organisations/132/${assocUrl}?tenant=${TENANT}`,cookie);
      if(feed.status===200&&feed.body)pass(name+' fil associatif','HTTP 200 JSON');
      else fail(name+' fil associatif',`HTTP ${feed.status} ${feed.contentType}`);
    }
    if(kind==='vice'){
      const op=await req(`/api/organisations/${ORG}/dashboard-operationnel?tenant=${TENANT}`,cookie);
      if(op.status===200&&op.body){
        const total=Number(op.body.demandes?.total);
        if(total===cases.length)pass('Vice indicateurs',`${total} dossiers`);else fail('Vice indicateurs',`API=${total}, DB=${cases.length}`);
      }else fail('Vice opérationnel',`HTTP ${op.status}`);
      const pub=await req(`/api/organisations/${ORG}/publications?tenant=${TENANT}`,cookie);
      if(pub.status===200&&Array.isArray(pub.body?.publications)){
        pass('Vice publications',`${pub.body.publications.length} publications identifiées`);
        const p57=pub.body.publications.find(x=>Number(x.id)===57);
        if(p57){const relay=await req(`/api/organisations/${ORG}/publications/57/association-relay-authorizations?tenant=${TENANT}`,cookie);
          if(relay.status===200 && relay.body)pass('Vice relais #57','HTTP 200 JSON');else fail('Vice relais #57',`HTTP ${relay.status} ${relay.contentType}`);}
      }else fail('Vice publications',`HTTP ${pub.status}`);
    }
  }
  if(cookies.Samba&&cookies.Awa){
    const r1=await req(`/api/demandes/136?organisationId=${ORG}&tenant=${TENANT}`,cookies.Awa);
    if(r1.status===404)pass('Isolement Samba/Awa','Awa ne lit pas n°136');else fail('Isolement Samba/Awa',`Awa HTTP ${r1.status}`);
    const r2=await req(`/api/demandes/133?organisationId=${ORG}&tenant=${TENANT}`,cookies.Samba);
    if(r2.status===404)pass('Isolement Awa/Samba','Samba ne lit pas n°133');else fail('Isolement Awa/Samba',`Samba HTTP ${r2.status}`);
  }
  const failCount=results.filter(x=>x.state==='ECHEC').length;
  const tested=results.filter(x=>x.state==='OK').length;
  const summary={time:new Date().toISOString(),database:DB,tenant:TENANT,pass:tested,failed:failCount,untested:warnings.length,checks:results};
  const out=process.env.SATEER_AUDIT_REPORT||path.join(ROOT,'.sateer-backups/recette-multi-profils-rapport.json');
  fs.writeFileSync(out,JSON.stringify(summary,null,2)+'\n',{mode:0o600});
  console.log(`\n=== RECETTE_MULTI_PROFILS : ${tested} OK / ${failCount} ECHEC / ${warnings.length} NON_TESTE ===`);
  console.log('Rapport JSON (sans mot de passe) : '+out);
  if(failCount>0) process.exitCode=1;
  else if(warnings.length>0) {
    console.log('RECETTE_PARTIELLE : profils non testes, ne pas declarer validation complete.');
    process.exitCode=2;
  }
}
run().catch(err=>{console.error('STOP_RECETTE_MULTI_PROFILS : '+err.message);process.exitCode=1;});
