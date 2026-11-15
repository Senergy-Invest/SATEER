"use strict";
/** D2B-A E2E volontaire et nominativement fictif. Exige confirmation depuis l'orchestrateur.
 * 2 publications strictement FICTIVES dans le tenant TEST_SYNTHETIQUE, une notifiee
 * par double abonnement, une non notifiee apres desabonnement, avec audit.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),http=require('node:http');
const {Pool}=require('pg');
const privateDir=process.argv[2],port=Number(process.env.SATEER_D2B_PORT||3434);
if(process.env.SATEER_DIASPORA_FIXTURES_GRANTED!=='1'||!privateDir||!Number.isSafeInteger(port))throw Error('RECETTE_EXPLICITE_REQUISE');
if(process.env.PGHOST!=='::1'||process.env.PGDATABASE!=='sateer_test'||process.env.PGPORT!=='5432')throw Error('ENVIRONNEMENT_REFUSE');
const m=JSON.parse(fs.readFileSync(path.join(privateDir,'MANIFESTE.json'),'utf8'));
const credentials=fs.readFileSync(path.join(privateDir,'IDENTIFIANTS_PRIVES.txt'),'utf8');
assert.equal(m.type,'DIASPORA_D2A_FIXTURE');assert.equal(m.tenant,'AMBVIS_96C7FBBEA383DD');
const origin=`http://localhost:${port}`,tenant=m.tenant,orgA=m.ids.association,orgB=m.ids.bureau;
const pool=new Pool({host:'::1',port:5432,database:'sateer_test',user:process.env.PGUSER||process.env.USER,...(process.env.PGPASSWORD?{password:process.env.PGPASSWORD}:{})});
const E2B=path.join(privateDir,'D2B-CAMPAGNE.json');
const checks=[];
function check(label,ok,detail=''){checks.push({controle:label,statut:ok?'PASS':'FAIL',detail:String(detail).slice(0,240)});if(!ok)throw Error(label+' : '+detail);}
function creds(role){const sect=credentials.split(role.toUpperCase()+'\n')[1]?.split(/\n\s*\n/)[0]||'';
 const user=sect.match(/Identifiant : (.+)/),pass=sect.match(/Mot de passe : (.+)/);
 if(!user||!pass)throw Error('CREDENTIALS_INVALIDES_'+role);return {identifiant:user[1],motDePasse:pass[1]};}
function request(method,endpoint,body,cookie){return new Promise((resolve,reject)=>{
 const payload=body==null?null:JSON.stringify(body);
 const headers={Origin:origin,Accept:'application/json',...(payload?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}:{}),...(cookie?{Cookie:cookie}:{})};
 const r=http.request({hostname:'127.0.0.1',port,method,path:endpoint,headers,timeout:8000},res=>{
  let txt='';res.on('data',x=>{if(txt.length<100000)txt+=x;});res.on('end',()=>{
   let json;try{json=JSON.parse(txt);}catch{json={texte:txt.slice(0,300)}};
   resolve({code:res.statusCode,body:json,cookie:(res.headers['set-cookie']||[]).find(x=>x.startsWith('sateer_session='))?.split(';')[0]});
  });});r.on('timeout',()=>r.destroy(Error('TIMEOUT_HTTP')));r.on('error',reject);if(payload)r.write(payload);r.end();});}
async function api(label,method,endpoint,body,cookie,code=200){const r=await request(method,endpoint,body,cookie);
 check(label,r.code===code,'HTTP '+r.code+', attendu '+code+', statut '+r.body.statut);return r.body;}
async function login(role){const r=await request('POST','/api/auth/login',creds(role));check('Connexion '+role,r.code===200&&r.cookie,'HTTP '+r.code);return r.cookie;}
async function getState(pubId){const x=await pool.query('SELECT statut_diffusion_diaspora FROM publications WHERE id=$1 AND organisation_id=$2 AND tenant_id=$3',[pubId,orgA,m.ids.tenant]);
 check('Publication fictive toujours dans son scope',x.rowCount===1,pubId);return x.rows[0].statut_diffusion_diaspora;}
async function createPublications(){let cp;if(fs.existsSync(E2B)){cp=JSON.parse(fs.readFileSync(E2B,'utf8'));
  check('Manifest D2B prive valide',cp.type==='D2B_FICTIF'&&/^[a-f0-9]{12}$/.test(cp.token));}
 else{cp={type:'D2B_FICTIF',token:crypto.randomBytes(6).toString('hex'),tenant,createdAt:new Date().toISOString()};
  fs.writeFileSync(E2B,JSON.stringify(cp,null,2),{flag:'wx',mode:0o600});fs.chmodSync(E2B,0o600);}
 const ids={};for(const key of ['notified','silent']){
  const title=`FICTIF D2B ${key.toUpperCase()} ${cp.token}`;
  let r=await pool.query('SELECT id FROM publications WHERE tenant_id=$1 AND organisation_id=$2 AND titre=$3 LIMIT 2',[m.ids.tenant,orgA,title]);
  check('Publication de recette non ambiguë '+key,r.rowCount<=1,title);
  if(!r.rowCount){r=await pool.query(`INSERT INTO publications(tenant_id,organisation_id,publie_par,titre,contenu,categorie,priorite,
    audience_type,medias,statut,statut_diffusion_diaspora)
    VALUES($1,$2,$3,$4,$5,'EVENEMENT','NORMALE','TOUS','[]'::jsonb,'PUBLIEE','NON_DEMANDEE') RETURNING id`,
    [m.ids.tenant,orgA,m.personnes.source,title,'FICTIF — publication de recette opt-in Diaspora. Aucune offre commerciale ni information officielle.']);}
  ids[key]=Number(r.rows[0].id);
 }
 return ids;
}
async function notifCount(pubId,person=m.personnes.citoyen){const r=await pool.query(`SELECT COUNT(*)::integer AS nb FROM notifications n
 JOIN tenants t ON t.id=n.tenant_id WHERE t.code=$1 AND n.personne_id=$2 AND n.reference_type='PUBLICATION'
 AND n.reference_id=$3 AND n.type='DIASPORA_ABONNEMENT'`,[tenant,person,pubId]);return r.rows[0].nb;}
async function transitions(key,id,source,bureau){const st=await getState(id);
 if(st==='NON_DEMANDEE')await api('Soumission fictive '+key,'POST',`/api/organisations/${orgA}/diaspora/submit/${id}?tenant=${tenant}`,{tenantCode:tenant},source);
 if(st!=='DIFFUSEE')await api('Approbation par Bureau '+key,'POST',`/api/organisations/${orgB}/diaspora/approve/${id}?tenant=${tenant}`,{tenantCode:tenant},bureau);
 check('Etat DIFFUSEE '+key,await getState(id)==='DIFFUSEE');}
async function run(){
 const cl=await pool.query('SELECT current_database() db,(SELECT system_identifier::text FROM pg_control_system()) sys');
 check('Cluster PostgreSQL de recette exact',cl.rows[0].db==='sateer_test'&&cl.rows[0].sys==='7699611241381229531');
 const t=await pool.query('SELECT type FROM tenants WHERE id=$1 AND code=$2 AND actif=TRUE',[m.ids.tenant,tenant]);
 check('Tenant explicitement TEST_SYNTHETIQUE',t.rowCount===1&&t.rows[0].type==='TEST_SYNTHETIQUE');
 const source=await login('source'),bureau=await login('bureau'),citizen=await login('citoyen');
 const q='?'+new URLSearchParams({tenant});
 await api('Citoyen refuse repertoire bureau','GET',`/api/organisations/${orgB}/diaspora/association-directory${q}`,null,citizen,403);
 await api('Source refuse repertoire bureau','GET',`/api/organisations/${orgB}/diaspora/association-directory${q}`,null,source,403);
 const registry=await api('Registre bureau','GET',`/api/organisations/${orgB}/diaspora/association-directory${q}`,null,bureau);
 check('Association source presente',registry.associations.some(x=>x.id===orgA));
 await api('Bureau verifie association','POST',`/api/organisations/${orgB}/diaspora/association-directory/${orgA}${q}`,
  {statut:'VERIFIEE'},bureau);
 const prefs=await api('Abonnements citoyen','GET','/api/diaspora/subscriptions'+q,null,citizen);
 check('Association verifiee visible',prefs.associations.some(x=>x.id===orgA));
 await api('Citoyen suit theme','PUT','/api/diaspora/subscriptions/theme/EVENEMENT'+q,{actif:true},citizen);
 await api('Citoyen suit association','PUT',`/api/diaspora/subscriptions/association/${orgA}${q}`,{actif:true},citizen);
 const ids=await createPublications();
 await transitions('notified',ids.notified,source,bureau);
 check('Exactly one notification for double follow',await notifCount(ids.notified)===1);
 check('No notification for source',await notifCount(ids.notified,m.personnes.source)===0);
 const followed=await api('Fil suivi apres abonnement','GET','/api/diaspora/followed-feed'+q,null,citizen);
 check('Publication suivie une seule fois',followed.publications.filter(x=>x.id===ids.notified).length===1);
 await api('Desabonnement theme','PUT','/api/diaspora/subscriptions/theme/EVENEMENT'+q,{actif:false},citizen);
 await api('Desabonnement association','PUT',`/api/diaspora/subscriptions/association/${orgA}${q}`,{actif:false},citizen);
 await transitions('silent',ids.silent,source,bureau);
 check('Absence de notification apres desabonnement',await notifCount(ids.silent)===0);
 const noFollow=await api('Fil suivi apres desabonnement','GET','/api/diaspora/followed-feed'+q,null,citizen);
 check('Fil suivi ne conserve pas les contenus non suivis',!noFollow.publications.some(x=>x.id===ids.notified||x.id===ids.silent));
 const global=await api('Fil general Diaspora conserve','GET','/api/diaspora/feed'+q,null,citizen);
 check('Publication generale toujours accessible',global.publications.some(x=>x.id===ids.silent));
 // Laisser le profil de demo abonne : on peut observer Mes suivis a l'ecran.
 await api('Restaurer theme de demo','PUT','/api/diaspora/subscriptions/theme/EVENEMENT'+q,{actif:true},citizen);
 await api('Restaurer association de demo','PUT',`/api/diaspora/subscriptions/association/${orgA}${q}`,{actif:true},citizen);
 check('Pas de notification retroactive apres reabonnement',await notifCount(ids.silent)===0);
 const audit=await pool.query(`SELECT action FROM audit_trail WHERE tenant_id=$1 AND entity_type='publications'
 AND entity_id=ANY($2::text[]) AND action IN ('DIASPORA_SUBMIT','DIASPORA_APPROVE')`,
  [m.ids.tenant,[String(ids.notified),String(ids.silent)]]);
 check('Audits des deux publications',audit.rowCount>=4,audit.rows.map(x=>x.action));
 const a=await pool.query(`SELECT COUNT(*)::int AS n FROM audit_trail WHERE tenant_id=$1 AND action='DIASPORA_ASSOCIATION_STATUS'
 AND entity_id=$2`,[m.ids.tenant,String(orgA)]);
 check('Audit verification association',a.rows[0].n>=1);
 console.log(JSON.stringify({statut:'D2B_E2E_REUSSIE',checks,tenant,publications:ids,abonneDeDemo:true}));
}
run().catch(e=>{console.error(JSON.stringify({statut:'D2B_E2E_ECHEC',message:e.message,checks}));process.exitCode=1;})
 .finally(()=>pool.end());
