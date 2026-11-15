"use strict";
/** Recette D2B-C1 sur tenant TEST_SYNTHETIQUE uniquement, après consentement terminal explicite.
 * Trois publications fictives ; reprise idempotente sans changer des données institutionnelles.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {Pool}=require('pg');
const dir=process.argv[2],port=Number(process.env.SATEER_D2BC_PORT||3440);
if(!dir||process.env.SATEER_D2BC_GRANTED!=='1'||!Number.isSafeInteger(port))throw Error('AUTORISATION_RECETTE_SPONSOR_REQUISE');
if(process.env.PGDATABASE!=='sateer_test'||process.env.PGHOST!=='::1'||process.env.PGPORT!=='5432')throw Error('DATABASE_PROTEGEE');
const m=JSON.parse(fs.readFileSync(path.join(dir,'MANIFESTE.json'),'utf8'));
assert.equal(m.type,'DIASPORA_D2A_FIXTURE');assert.equal(m.tenant,'AMBVIS_96C7FBBEA383DD');
const tenant=m.tenant,orgA=Number(m.ids.association),orgB=Number(m.ids.bureau),person=Number(m.personnes.citoyen);
const secret=fs.readFileSync(path.join(dir,'IDENTIFIANTS_PRIVES.txt'),'utf8'),stateFile=path.join(dir,'D2BC-CAMPAGNE.json');
const pool=new Pool({host:'::1',port:5432,database:'sateer_test',user:process.env.PGUSER||process.env.USER,
 ...(process.env.PGPASSWORD?{password:process.env.PGPASSWORD}:{})});
const origin=`http://localhost:${port}`,checks=[];
const check=(n,ok,detail='')=>{checks.push({controle:n,statut:ok?'PASS':'FAIL'});if(!ok)throw Error(n+': '+String(detail).slice(0,350));};
function creds(role){const s=secret.split(role.toUpperCase()+'\n')[1]?.split(/\n\s*\n/)[0]||'';
 const u=s.match(/Identifiant : (.+)/),p=s.match(/Mot de passe : (.+)/);
 if(!u||!p)throw Error('COMPTE_FICTIF_'+role+'_ABSENT');return{identifiant:u[1],motDePasse:p[1]};}
function request(method,url,body=null,cookie=''){return new Promise((resolve,reject)=>{
 const data=body==null?null:JSON.stringify(body),headers={Accept:'application/json',Origin:origin,
  ...(data?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}:{}),...(cookie?{Cookie:cookie}:{})};
 const rq=http.request({hostname:'127.0.0.1',port,path:url,method,headers,timeout:9000},res=>{
  let buf='';res.on('data',x=>{if(buf.length<150000)buf+=x});res.on('end',()=>{
   let j={};try{j=JSON.parse(buf)}catch{j={text:buf.slice(0,100)}};
   resolve({code:res.statusCode,json:j,cookie:(res.headers['set-cookie']||[]).find(x=>x.startsWith('sateer_session='))?.split(';')[0]});});
 });rq.on('timeout',()=>rq.destroy(Error('HTTP_TIMEOUT')));rq.on('error',reject);if(data)rq.write(data);rq.end();});}
async function api(name,method,url,body,cookie,expected=200){const r=await request(method,url,body,cookie);
 check(name,r.code===expected,`HTTP ${r.code} attendu ${expected} ${r.json.statut||''}`);return r.json;}
async function login(role){const r=await request('POST','/api/auth/login',creds(role));check('Connexion '+role,r.code===200&&!!r.cookie,`HTTP ${r.code}`);return r.cookie;}
const q='?'+new URLSearchParams({tenant}),base=`/api/organisations/${orgA}/diaspora/`,review=`/api/organisations/${orgB}/diaspora/`;
async function notifications(pubId){const r=await pool.query(`SELECT n.id,n.metadata,n.message FROM notifications n
 WHERE n.tenant_id=$1 AND n.personne_id=$2 AND n.type='DIASPORA_ABONNEMENT'
 AND n.reference_type='PUBLICATION' AND n.reference_id=$3`,[m.ids.tenant,person,pubId]);return r.rows;}
async function state(id){const r=await pool.query(`SELECT statut_diffusion_diaspora FROM publications
 WHERE tenant_id=$1 AND organisation_id=$2 AND id=$3`,[m.ids.tenant,orgA,id]);
 check('Publication fictive retrouvée '+id,r.rowCount===1);return r.rows[0].statut_diffusion_diaspora;}
async function ids(){let s;
 if(fs.existsSync(stateFile)){s=JSON.parse(fs.readFileSync(stateFile,'utf8'));
  check('Campagne reprise contrôlée',s.type==='D2BC_FICTIF'&&s.tenant===tenant&&/^[a-f0-9]{12}$/.test(s.token));}
 else{s={type:'D2BC_FICTIF',tenant,token:crypto.randomBytes(6).toString('hex'),createdAt:new Date().toISOString()};
  fs.writeFileSync(stateFile,JSON.stringify(s,null,2),{mode:0o600,flag:'wx'});fs.chmodSync(stateFile,0o600);}
 const result={};for(const key of ['sans_consentement','avec_consentement','apres_retrait']){
  const titre=`FICTIF D2BC ${key.toUpperCase()} ${s.token}`;
  let rows=await pool.query(`SELECT id FROM publications WHERE tenant_id=$1 AND organisation_id=$2 AND titre=$3 LIMIT 2`,
   [m.ids.tenant,orgA,titre]);check('Publication unique '+key,rows.rowCount<=1);
  if(rows.rowCount===0)rows=await pool.query(`INSERT INTO publications(tenant_id,organisation_id,publie_par,titre,contenu,
   categorie,priorite,audience_type,medias,statut,statut_diffusion_diaspora)
   VALUES($1::integer,$2::integer,$3::integer,$4::varchar(255),$5::text,'EVENEMENT','NORMALE',
   'TOUS','[]'::jsonb,'PUBLIEE','NON_DEMANDEE') RETURNING id`,
   [m.ids.tenant,orgA,m.personnes.source,titre,'FICTIF — contenu de recette commerciale, aucune publicité réelle.']);
  result[key]=Number(rows.rows[0].id);
 }return result;
}
async function makeSponsor(key,id,bdx,source,bureau){
 const before=await state(id);
 if(before==='NON_DEMANDEE'){
  await api('Marquage sponsorisé '+key,'PUT',base+'sponsorisation/'+id+q,{sponsorise:true},source);
  await api('Ciblage Bordeaux '+key,'PUT',base+'geo-target/'+id+q,{territoryId:bdx},source);
  const sourcePubs=await api('Source voit marquage '+key,'GET',base+'source-publications'+q,null,source);
  check('Source sponsor affiché '+key,sourcePubs.publications.some(x=>x.id===id&&x.sponsorisee===true&&x.sponsorNom));
  await api('Soumission '+key,'POST',base+'submit/'+id+q,{tenantCode:tenant},source);
 }
 const submitted=await state(id);
 if(submitted==='SOUMISE'){
  const queue=await api('Bureau charge file '+key,'GET',review+'review-queue'+q,null,bureau);
  check('Bureau voit sponsor et Bordeaux '+key,queue.publications.some(x=>x.id===id&&x.sponsorisee===true&&x.geoTerritoryId===bdx&&x.sponsorNom));
  await api('Validation Bureau '+key,'POST',review+'approve/'+id+q,{tenantCode:tenant},bureau);
 }
 check('Publication approuvée '+key,(await state(id))==='DIFFUSEE');
 await api('Marquage interdit après soumission '+key,'PUT',base+'sponsorisation/'+id+q,{sponsorise:false},source,409);
}
async function main(){
 const system=await pool.query('SELECT current_database() AS db,(SELECT system_identifier::text FROM pg_control_system()) AS sys');
 check('Cluster autorisé',system.rows[0].db==='sateer_test'&&system.rows[0].sys==='7699611241381229531');
 const t=await pool.query('SELECT type FROM tenants WHERE id=$1 AND code=$2 AND actif=TRUE',[m.ids.tenant,tenant]);
 check('Tenant purement synthétique',t.rowCount===1&&t.rows[0].type==='TEST_SYNTHETIQUE');
 const directory=await pool.query(`SELECT statut FROM diaspora_association_directory
  WHERE tenant_id=$1 AND organisation_id=$2`,[m.ids.tenant,orgA]);
 check('Association fictive vérifiée D2BA',directory.rows[0]?.statut==='VERIFIEE');
 const b=await pool.query("SELECT id FROM territories WHERE nom='Bordeaux' AND type='VILLE' AND actif=TRUE");
 check('Territoire Bordeaux unique',b.rowCount===1);const bdx=Number(b.rows[0].id);
 const source=await login('source'),bureau=await login('bureau'),citizen=await login('citoyen');
 await api('Citoyen interdit marquer commercial','PUT',base+'sponsorisation/165'+q,{sponsorise:true},citizen,403);
 await api('Bureau sans droit source interdit marquage','PUT',base+'sponsorisation/165'+q,{sponsorise:true},bureau,403);
 const existing=await api('Consentement initial','GET','/api/diaspora/sponsor-consent'+q,null,citizen);
 check('Statut opt-in explicite boolean',typeof existing.actif==='boolean');
 await api('Assurer abonnement association','PUT',`/api/diaspora/subscriptions/association/${orgA}${q}`,{actif:true},citizen);
 await api('Assurer zone Bordeaux','PUT',`/api/diaspora/geo-preferences/${bdx}${q}`,{actif:true},citizen);
 const pubs=await ids();
 const s=JSON.parse(fs.readFileSync(stateFile,'utf8'));
 if(!s.firstCompleted){
  await api('Consentement commercial refusé','PUT','/api/diaspora/sponsor-consent'+q,{actif:false},citizen);
  await makeSponsor('sans accord',pubs.sans_consentement,bdx,source,bureau);
  check('Aucune alerte sans consentement',(await notifications(pubs.sans_consentement)).length===0);
  s.firstCompleted=true;fs.writeFileSync(stateFile,JSON.stringify(s,null,2),{mode:0o600});
 }else check('Reprise sans alerte sans accord',(await notifications(pubs.sans_consentement)).length===0);
 if(!s.secondCompleted){
  await api('Opt-in commercial actif','PUT','/api/diaspora/sponsor-consent'+q,{actif:true},citizen);
  await makeSponsor('avec accord',pubs.avec_consentement,bdx,source,bureau);
  const sent=await notifications(pubs.avec_consentement);
  check('Une notification sponsorisée autorisée',sent.length===1&&sent[0].metadata?.sponsorise===true);
  s.secondCompleted=true;fs.writeFileSync(stateFile,JSON.stringify(s,null,2),{mode:0o600});
 }else check('Reprise sponsor déjà notifié',(await notifications(pubs.avec_consentement)).length===1);
 await api('Retrait accord commercial','PUT','/api/diaspora/sponsor-consent'+q,{actif:false},citizen);
 await makeSponsor('après retrait',pubs.apres_retrait,bdx,source,bureau);
 check('Aucune notification après retrait',(await notifications(pubs.apres_retrait)).length===0);
 const after=await api('Statut consentement retiré','GET','/api/diaspora/sponsor-consent'+q,null,citizen);
 check('Accord commercial désactivé',after.actif===false);
 const feed=await api('Fil général marqué','GET','/api/diaspora/feed'+q,null,citizen);
 for(const id of Object.values(pubs))check('Publication visible et labellisée '+id,feed.publications.some(x=>x.id===id&&x.sponsorisee===true&&x.sponsorNom));
 const followed=await api('Fil suivi avec consentement retiré','GET','/api/diaspora/followed-feed'+q,null,citizen);
 check('Aucune sponsorisée dans Mes suivis sans accord',Object.values(pubs).every(id=>!followed.publications.some(x=>x.id===id)));
 const audits=await pool.query(`SELECT action,entity_id FROM audit_trail WHERE tenant_id=$1
   AND action IN('DIASPORA_SPONSOR_MARK','DIASPORA_APPROVE') AND entity_id=ANY($2::text[])`,
   [m.ids.tenant,Object.values(pubs).map(String)]);
 for(const id of Object.values(pubs))check('Marquage et approbation audités '+id,
  ['DIASPORA_SPONSOR_MARK','DIASPORA_APPROVE'].every(action=>audits.rows.some(x=>x.action===action&&x.entity_id===String(id))));
 const auditsCons=await pool.query(`SELECT COUNT(*)::int AS n FROM audit_trail WHERE tenant_id=$1 AND personne_id=$2
  AND action='DIASPORA_SPONSOR_CONSENT'`,[m.ids.tenant,person]);
 check('Consentement audit tracé',auditsCons.rows[0].n>=3);
 console.log(JSON.stringify({statut:'D2BC_E2E_REUSSIE',publications:pubs,tenant,checks}));
}
main().catch(e=>{console.error(JSON.stringify({statut:'D2BC_E2E_ECHEC',erreur:e.stack||e.message,checks}));process.exitCode=1}).finally(()=>pool.end());
