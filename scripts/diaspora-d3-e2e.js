"use strict";
/** Parcours E2E de recette STRICTEMENT synthetique apres autorisation Terminal.
 * Trois comptes fictifs du Mac, nouveau titre FICTIF, quota reel conserve.
 * Reprise contrôlee par titre idempotent / state privé, aucune publication réelle.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {Pool}=require('pg');
const privateDir=process.argv[2],stateFile=process.argv[3],port=Number(process.env.SATEER_D3_PORT||3450);
if(process.env.SATEER_D3_GRANTED!=='1'||!Number.isSafeInteger(port)||!stateFile)throw Error('RECETTE_EXPLICITEMENT_AUTORISEE_REQUISE');
for(const [k,v] of [['PGHOST','::1'],['PGPORT','5432'],['PGDATABASE','sateer_test']])assert.equal(process.env[k],v);
const m=JSON.parse(fs.readFileSync(path.join(privateDir,'MANIFESTE.json'),'utf8'));
assert.equal(m.type,'DIASPORA_D2A_FIXTURE');assert.equal(m.tenant,'AMBVIS_96C7FBBEA383DD');
const secrets=fs.readFileSync(path.join(privateDir,'IDENTIFIANTS_PRIVES.txt'),'utf8');
const pool=new Pool({host:'::1',port:5432,database:'sateer_test',user:process.env.PGUSER||process.env.USER,
 ...(process.env.PGPASSWORD?{password:process.env.PGPASSWORD}:{})});
const tenant=m.tenant,orgA=Number(m.ids.association),orgB=Number(m.ids.bureau),citizenId=Number(m.personnes.citoyen);
const q='?'+new URLSearchParams({tenant}),a=`/api/organisations/${orgA}/diaspora/`,b=`/api/organisations/${orgB}/diaspora/`;
const checks=[],check=(name,ok)=>{checks.push({name,status:ok?'PASS':'FAIL'});if(!ok)throw Error(name);};
function credentials(role){const block=secrets.split(role.toUpperCase()+'\n')[1]?.split(/\n\s*\n/)[0]||'';
 const u=block.match(/Identifiant : (.+)/),p=block.match(/Mot de passe : (.+)/);
 if(!u||!p)throw Error('FIXTURE_ROLE_INDISPONIBLE_'+role);return{identifiant:u[1],motDePasse:p[1]};}
function request(method,endpoint,body=null,cookie=''){
 return new Promise((resolve,reject)=>{
 const data=body===null?null:JSON.stringify(body),headers={Accept:'application/json',Origin:'http://localhost:'+port,
  ...(cookie?{Cookie:cookie}:{}),...(data?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}:{})};
 const req=http.request({hostname:'127.0.0.1',port,path:endpoint,method,headers,timeout:12000},res=>{
 let buf='';res.on('data',chunk=>{if(buf.length<300000)buf+=chunk.toString()});res.on('end',()=>{
 let j={};try{j=JSON.parse(buf)}catch{};
 resolve({status:res.statusCode,data:j,cookie:(res.headers['set-cookie']||[]).find(v=>v.startsWith('sateer_session='))?.split(';')[0]});
 });});req.on('error',reject);req.on('timeout',()=>req.destroy(Error('HTTP_TIMEOUT')));if(data)req.write(data);req.end();});}
async function api(name,method,url,body,cookie,want=200){const r=await request(method,url,body,cookie);
 check(name,r.status===want);return r.data;}
async function login(role){const r=await request('POST','/api/auth/login',credentials(role));
 check('Connexion '+role,r.status===200&&!!r.cookie);return r.cookie;}
async function publication(id){const r=await pool.query(`SELECT id,statut_diffusion_diaspora,tenant_id,categorie,
 date_diffusion_diaspora FROM publications WHERE id=$1 AND organisation_id=$2 AND tenant_id=$3`,[id,orgA,m.ids.tenant]);
 check('Publication dans le périmètre synthétique',r.rowCount===1);return r.rows[0];}
async function notifCount(id){const r=await pool.query(`SELECT id FROM notifications
 WHERE tenant_id=$1 AND personne_id=$2 AND type='DIASPORA_ABONNEMENT' AND reference_type='PUBLICATION' AND reference_id=$3`,
 [m.ids.tenant,citizenId,id]);return r.rowCount;}
async function recent(){const r=await pool.query(`SELECT COUNT(*)::int AS n FROM notifications WHERE tenant_id=$1 AND personne_id=$2
 AND type='DIASPORA_ABONNEMENT' AND date_creation>=NOW()-INTERVAL '24 hours'`,[m.ids.tenant,citizenId]);return r.rows[0].n;}
function save(s){fs.writeFileSync(stateFile,JSON.stringify(s,null,2)+'\n',{mode:0o600});fs.chmodSync(stateFile,0o600);}
async function run(){
 const cluster=await pool.query('SELECT current_database() AS db,(SELECT system_identifier::text FROM pg_control_system()) AS sys');
 check('Cluster synthetique autorise',cluster.rows[0].sys==='7699611241381229531'&&cluster.rows[0].db==='sateer_test');
 const t=await pool.query('SELECT type FROM tenants WHERE id=$1 AND code=$2 AND actif=TRUE',[m.ids.tenant,tenant]);
 check('Tenant TEST_SYNTHETIQUE',t.rows[0]?.type==='TEST_SYNTHETIQUE');
 const source=await login('source'),bureau=await login('bureau'),citizen=await login('citoyen');
 const subs=await api('Lecture abonnements','GET','/api/diaspora/subscriptions'+q,null,citizen);
 check('Abonnement association actif',subs.abonnements.some(x=>Number(x.associationId)===orgA&&x.actif));
 const geo=await api('Lecture zones volontaires','GET','/api/diaspora/geo-preferences'+q,null,citizen);
 const bdx=await pool.query("SELECT id FROM territories WHERE nom='Bordeaux' AND type='VILLE' AND actif=TRUE");
 check('Bordeaux unique',bdx.rowCount===1);const territory=Number(bdx.rows[0].id);
 check('Bordeaux suivi volontairement',geo.preferences.some(x=>Number(x.id)===territory&&x.actif));
 const directory=await pool.query('SELECT statut FROM diaspora_association_directory WHERE tenant_id=$1 AND organisation_id=$2',[m.ids.tenant,orgA]);
 check('Association vérifiée',directory.rows[0]?.statut==='VERIFIEE');
 const payload=(titre)=>({tenantCode:tenant,titre,contenu:'FICTIF — recette finale de la création associative Diaspora. Aucun événement réel.',categorie:'EVENEMENT'});
 await api('Citoyen interdit de création','POST',a+'publications'+q,payload('INTERDIT CITOYEN'),citizen,403);
 await api('Catégorie institutionnelle interdite','POST',a+'publications'+q,{...payload('INTERDIT CATEGORIE'),categorie:'COMMUNIQUE'},source,400);
 let state;if(fs.existsSync(stateFile)){
  state=JSON.parse(fs.readFileSync(stateFile,'utf8'));
  check('Reprise campagne identique',state.type==='DIASPORA_D3_FICTIVE'&&state.tenant===tenant&&/^[a-f0-9]{12}$/.test(state.token));
 }else{state={type:'DIASPORA_D3_FICTIVE',tenant,token:crypto.randomBytes(6).toString('hex')};
  fs.writeFileSync(stateFile,JSON.stringify(state,null,2),{flag:'wx',mode:0o600});}
 const title='FICTIF DIASPORA D3 PARCOURS '+state.token;
 const rows=await pool.query('SELECT id FROM publications WHERE tenant_id=$1 AND organisation_id=$2 AND titre=$3 LIMIT 2',[m.ids.tenant,orgA,title]);
 check('Titre de recette unique',rows.rowCount<=1);
 let id=state.publicationId||rows.rows[0]?.id;
 if(!id){const r=await api('Création par interface native D3','POST',a+'publications'+q,payload(title),source,201);
  check('Publication créée non soumise',r.statut==='DIASPORA_PUBLICATION_CREEE'&&r.etatDiffusion==='NON_DEMANDEE');id=Number(r.publicationId);}
 state.publicationId=Number(id);save(state);
 let p=await publication(Number(id));check('Catégorie Diaspora conservée',p.categorie==='EVENEMENT');
 if(p.statut_diffusion_diaspora==='NON_DEMANDEE'){
  await api('Ciblage Bordeaux','PUT',a+'geo-target/'+id+q,{territoryId:territory},source);
  await api('Soumission SOURCE','POST',a+'submit/'+id+q,{tenantCode:tenant},source);
 }
 p=await publication(Number(id));check('Soumission effective',p.statut_diffusion_diaspora==='SOUMISE'||p.statut_diffusion_diaspora==='DIFFUSEE');
 await api('Zone verrouillée après soumission','PUT',a+'geo-target/'+id+q,{territoryId:null},source,409);
 let quota=state.quotaAtApproval;
 if(p.statut_diffusion_diaspora==='SOUMISE'){
  const queue=await api('File du Bureau','GET',b+'review-queue'+q,null,bureau);
  check('Bureau voit catégorie, zone et source',queue.publications.some(x=>Number(x.id)===id&&x.categorie==='EVENEMENT'&&x.geoTerritoryId===territory&&x.sponsorisee===false));
  quota=await recent();state.quotaAtApproval=quota;save(state);
  await api('Approbation Bureau','POST',b+'approve/'+id+q,{tenantCode:tenant},bureau);
 }
 p=await publication(Number(id));check('Publication diffusée',p.statut_diffusion_diaspora==='DIFFUSEE');
 const list=await api('Fil général citoyen','GET','/api/diaspora/feed'+q,null,citizen);
 check('Publication au fil général',list.publications.some(x=>Number(x.id)===id&&x.titre===title));
 const followed=await api('Fil suivi citoyen','GET','/api/diaspora/followed-feed'+q,null,citizen);
 check('Publication au fil suivi',followed.publications.some(x=>Number(x.id)===id));
 const notification=await notifCount(id);
 if(Number.isInteger(quota))check('Règle de quota notifications respectée',quota>=3?notification===0:notification===1);
 const audit=await pool.query('SELECT action FROM audit_trail WHERE tenant_id=$1 AND entity_id=$2 AND action IN ($3,$4)',
  [m.ids.tenant,String(id),'DIASPORA_SUBMIT','DIASPORA_APPROVE']);
 check('Transitions auditées',audit.rows.some(x=>x.action==='DIASPORA_SUBMIT')&&audit.rows.some(x=>x.action==='DIASPORA_APPROVE'));
 console.log(JSON.stringify({statut:'DIASPORA_D3_E2E_PASS',publication:title,etat:'DIFFUSEE',
  categorie:'EVENEMENT',zone:'Bordeaux',quotaAvantApprobation:quota,notificationPourCettePublication:notification,
  resultatNotification:quota>=3?'ABSENCE_ATTENDUE_QUOTA':'ALERTE_PRESENTE',tests:checks},null,2));
}
run().catch(e=>{console.error(JSON.stringify({statut:'DIASPORA_D3_E2E_FAIL',erreur:e.message,tests:checks}));process.exitCode=1}).finally(()=>pool.end());
