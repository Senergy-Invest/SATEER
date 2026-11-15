"use strict";
/** Recette D2B-B : trois comptes fictifs D2A, tenant TEST_SYNTHETIQUE uniquement.
 * Opérations persistantes strictement autorisées dans le runner, jamais en tests préalables.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),http=require('node:http');
const {Pool}=require('pg');
const dir=process.argv[2],port=Number(process.env.SATEER_D2BB_PORT||3436);
if(process.env.SATEER_DIASPORA_FIXTURES_GRANTED!=='1'||!dir||!Number.isSafeInteger(port))throw Error('AUTORISATION_FICTURES_REQUISE');
if(process.env.PGDATABASE!=='sateer_test'||process.env.PGHOST!=='::1'||process.env.PGPORT!=='5432')throw Error('ENVIRONNEMENT_PG_REFUSE');
const m=JSON.parse(fs.readFileSync(path.join(dir,'MANIFESTE.json'),'utf8'));
assert.equal(m.type,'DIASPORA_D2A_FIXTURE');assert.equal(m.tenant,'AMBVIS_96C7FBBEA383DD');
const tenant=m.tenant,orgA=m.ids.association,orgB=m.ids.bureau,person=m.personnes.citoyen;
const secret=fs.readFileSync(path.join(dir,'IDENTIFIANTS_PRIVES.txt'),'utf8');
const pool=new Pool({host:'::1',port:5432,database:'sateer_test',user:process.env.PGUSER||process.env.USER,
 ...(process.env.PGPASSWORD?{password:process.env.PGPASSWORD}:{})});
const stateFile=path.join(dir,'D2BB-CAMPAGNE.json');const origin=`http://localhost:${port}`;
const results=[];function check(k,ok,detail=''){results.push({controle:k,statut:ok?'PASS':'FAIL'});if(!ok)throw Error(k+': '+String(detail).slice(0,300));}
function credentials(role){const s=secret.split(role.toUpperCase()+'\n')[1]?.split(/\n\s*\n/)[0]||'';
 const user=s.match(/Identifiant : (.+)/),pw=s.match(/Mot de passe : (.+)/);if(!user||!pw)throw Error('COMPTES_FICTIFS_MANQUANTS_'+role);
 return {identifiant:user[1],motDePasse:pw[1]};}
function request(method,url,body=null,cookie=''){return new Promise((resolve,reject)=>{
 const data=body===null?null:JSON.stringify(body),headers={Origin:origin,Accept:'application/json',...(data?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}:{}),...(cookie?{Cookie:cookie}:{})};
 const rq=http.request({hostname:'127.0.0.1',port,path:url,method,headers,timeout:8000},rs=>{
  let txt='';rs.on('data',x=>{if(txt.length<100000)txt+=x;});rs.on('end',()=>{
   let j={};try{j=JSON.parse(txt)}catch{j={text:txt.slice(0,100)}};
   resolve({status:rs.statusCode,json:j,cookie:(rs.headers['set-cookie']||[]).find(x=>x.startsWith('sateer_session='))?.split(';')[0]});});});
 rq.on('timeout',()=>rq.destroy(Error('TIMEOUT_HTTP')));rq.on('error',reject);if(data)rq.write(data);rq.end();});}
async function api(label,method,url,body,cookie,expected=200){const r=await request(method,url,body,cookie);
 check(label,r.status===expected,`HTTP ${r.status}, attendu ${expected} : ${r.json.statut||''}`);return r.json;}
async function login(role){const x=await request('POST','/api/auth/login',credentials(role));check('Connexion '+role,x.status===200&&!!x.cookie,'HTTP '+x.status);return x.cookie;}
async function notifications(id){const r=await pool.query(`SELECT COUNT(*)::int n FROM notifications WHERE tenant_id=$1 AND personne_id=$2
  AND type='DIASPORA_ABONNEMENT' AND reference_type='PUBLICATION' AND reference_id=$3`,[m.ids.tenant,person,id]);return r.rows[0].n;}
async function createPublications(){
 let cp;
 if(fs.existsSync(stateFile)){cp=JSON.parse(fs.readFileSync(stateFile,'utf8'));
  check('Reprise campagne privée D2BB',cp.type==='D2BB_FICTIF'&&cp.tenant===tenant&&/^[a-f0-9]{12}$/.test(cp.token));}
 else{cp={type:'D2BB_FICTIF',token:crypto.randomBytes(6).toString('hex'),tenant,createdAt:new Date().toISOString()};
  fs.writeFileSync(stateFile,JSON.stringify(cp,null,2),{mode:0o600,flag:'wx'});fs.chmodSync(stateFile,0o600);}
 const ids={};for(const key of ['matched','unsubscribed','wrong_area']){
  const titre=`FICTIF D2BB ${key.toUpperCase()} ${cp.token}`;
  let r=await pool.query(`SELECT id FROM publications WHERE tenant_id=$1 AND organisation_id=$2 AND titre=$3 LIMIT 2`,[m.ids.tenant,orgA,titre]);
  check('Publication fictive unique '+key,r.rowCount<=1);
  if(r.rowCount===0)r=await pool.query(`INSERT INTO publications(tenant_id,organisation_id,publie_par,titre,
    contenu,categorie,priorite,audience_type,medias,statut,statut_diffusion_diaspora)
    VALUES($1::integer,$2::integer,$3::integer,$4::varchar(255),$5::text,'EVENEMENT','NORMALE',
      'TOUS','[]'::jsonb,'PUBLIEE','NON_DEMANDEE') RETURNING id`,
    [m.ids.tenant,orgA,m.personnes.source,titre,'FICTIF — test de ciblage volontaire Diaspora. Aucune annonce institutionnelle réelle.']);
  ids[key]=Number(r.rows[0].id);
 }
 return ids;
}
async function getState(id){const r=await pool.query(`SELECT statut_diffusion_diaspora FROM publications
 WHERE id=$1 AND tenant_id=$2 AND organisation_id=$3`,[id,m.ids.tenant,orgA]);
 check('Etat de publication dans tenant source '+id,r.rowCount===1);return r.rows[0].statut_diffusion_diaspora;}
async function advance(label,id,areaId,source,bureau){
 const before=await getState(id),q='?'+new URLSearchParams({tenant});
 if(before==='NON_DEMANDEE'){
  await api('Définir la cible '+label,'PUT',`/api/organisations/${orgA}/diaspora/geo-target/${id}${q}`,{territoryId:areaId},source);
  const pub=await api('Source relit la cible '+label,'GET',`/api/organisations/${orgA}/diaspora/source-publications${q}`,null,source);
  check('Cible projetée au source '+label,pub.publications.some(x=>x.id===id&&x.geoTerritoryId===areaId));
  await api('Soumission '+label,'POST',`/api/organisations/${orgA}/diaspora/submit/${id}${q}`,{tenantCode:tenant},source);
 }
 const submitted=await getState(id);
 if(submitted==='SOUMISE'){
  const queue=await api('Bureau relit sa file '+label,'GET',`/api/organisations/${orgB}/diaspora/review-queue${q}`,null,bureau);
  check('Bureau voit la zone '+label,queue.publications.some(x=>x.id===id&&x.geoTerritoryId===areaId));
  await api('Bureau approuve '+label,'POST',`/api/organisations/${orgB}/diaspora/approve/${id}${q}`,{tenantCode:tenant},bureau);
 }
 check('Publication DIFFUSEE '+label,(await getState(id))==='DIFFUSEE');
 await api('La cible est verrouillée après soumission '+label,'PUT',`/api/organisations/${orgA}/diaspora/geo-target/${id}${q}`,
  {territoryId:null},source,409);
}
async function main(){
 const c=await pool.query(`SELECT current_database() AS db,(SELECT system_identifier::text FROM pg_control_system()) sys`);
 check('Cluster PostgreSQL autorisé',c.rows[0].db==='sateer_test'&&c.rows[0].sys==='7699611241381229531');
 const tr=await pool.query(`SELECT type FROM tenants WHERE id=$1 AND code=$2 AND actif=TRUE`,[m.ids.tenant,tenant]);
 check('Tenant synthétique exclusivement',tr.rowCount===1&&tr.rows[0].type==='TEST_SYNTHETIQUE');
 const terr=await pool.query(`SELECT id,nom,type FROM territories WHERE actif=TRUE AND
   ((nom='Bordeaux' AND type='VILLE') OR (nom='Gironde' AND type='DEPARTEMENT'))`);
 const b=terr.rows.find(x=>x.nom==='Bordeaux'),g=terr.rows.find(x=>x.nom==='Gironde');
 check('Territoires canoniques présents',!!b&&!!g);const bdx=Number(b.id),gironde=Number(g.id);
 check('Territoires distincts',bdx!==gironde);
 const recent=await pool.query(`SELECT COUNT(*)::int n FROM notifications
    WHERE tenant_id=$1 AND personne_id=$2 AND type='DIASPORA_ABONNEMENT'
    AND date_creation>=NOW()-INTERVAL '24 hours'`,[m.ids.tenant,person]);
 check('Quota disponible pour la recette',recent.rows[0].n<3,`Déjà ${recent.rows[0].n} alertes sur 24h`);
 const source=await login('source'),bureau=await login('bureau'),citizen=await login('citoyen');
 const q='?'+new URLSearchParams({tenant});
 await api('Citoyen interdit cibler une publication','PUT',`/api/organisations/${orgA}/diaspora/geo-target/165${q}`,
   {territoryId:bdx},citizen,403);
 await api('Bureau interdit cibler source sans délégation','PUT',`/api/organisations/${orgA}/diaspora/geo-target/165${q}`,
   {territoryId:bdx},bureau,403);
 await api('Rechercher Bordeaux','GET','/api/diaspora/geo-options?'+new URLSearchParams({tenant,q:'Bordeaux'}),null,citizen);
 // Des préférences de géographie n'autorisent aucune notification à elles seules :
 // l'abonnement thème et association reste explicitement activé par le citoyen fictif.
 await api('Maintenir choix thème','PUT',`/api/diaspora/subscriptions/theme/EVENEMENT${q}`,{actif:true},citizen);
 await api('Maintenir choix association','PUT',`/api/diaspora/subscriptions/association/${orgA}${q}`,{actif:true},citizen);
 const ids=await createPublications();
 const complete=await Promise.all(Object.values(ids).map(getState));
 if(complete.every(x=>x==='DIFFUSEE')){
  // Reprise après erreur au push: la vérification finale ci-dessous demeure obligatoire.
  check('Reprise trois publications approuvées',true);
 } else {
  // Vérification de l'opt-in Bordeaux, puis retrait, puis erreur de zone Gironde.
  await api('Choisir Bordeaux','PUT',`/api/diaspora/geo-preferences/${bdx}${q}`,{actif:true},citizen);
  await advance('matched',ids.matched,bdx,source,bureau);
  check('Bordeaux notifié une seule fois',await notifications(ids.matched)===1);
  await api('Retirer Bordeaux','PUT',`/api/diaspora/geo-preferences/${bdx}${q}`,{actif:false},citizen);
  await advance('unsubscribed',ids.unsubscribed,bdx,source,bureau);
  check('Aucune alerte après retrait zone',await notifications(ids.unsubscribed)===0);
  const followedNoGeo=await api('Fil suivi après retrait','GET','/api/diaspora/followed-feed'+q,null,citizen);
  check('Fil suivi ne révèle pas Bordeaux sans opt-in',!followedNoGeo.publications.some(x=>x.id===ids.matched||x.id===ids.unsubscribed));
  await api('Choisir Bordeaux à nouveau','PUT',`/api/diaspora/geo-preferences/${bdx}${q}`,{actif:true},citizen);
  await advance('wrong_area',ids.wrong_area,gironde,source,bureau);
  check('Gironde ne notifie pas Bordeaux',await notifications(ids.wrong_area)===0);
 }
 const feed=await api('Fil général intact','GET','/api/diaspora/feed'+q,null,citizen);
 check('Toutes publications générales restent visibles',Object.values(ids).every(id=>feed.publications.some(p=>p.id===id)));
 const followed=await api('Mes suivis avec Bordeaux','GET','/api/diaspora/followed-feed'+q,null,citizen);
 check('Bordeaux suivi, Gironde absent',followed.publications.some(p=>p.id===ids.matched)&&
  !followed.publications.some(p=>p.id===ids.wrong_area));
 check('Pas de notification rétroactive',await notifications(ids.unsubscribed)===0);
 check('Une seule notification cible correcte',await notifications(ids.matched)===1&&await notifications(ids.wrong_area)===0);
 const audits=await pool.query(`SELECT action,entity_id FROM audit_trail WHERE tenant_id=$1
   AND entity_type='publications' AND entity_id=ANY($2::text[])
   AND action IN ('DIASPORA_GEO_TARGET','DIASPORA_APPROVE')`,
  [m.ids.tenant,Object.values(ids).map(String)]);
 for(const id of Object.values(ids)){
  check('Cible et approbation tracées '+id,
   ['DIASPORA_GEO_TARGET','DIASPORA_APPROVE'].every(a=>audits.rows.some(x=>x.entity_id===String(id)&&x.action===a)));
 }
 console.log(JSON.stringify({statut:'D2BB_E2E_REUSSIE',publications:ids,tenant,geoBordeaux:bdx,geoGironde:gironde,checks:results}));
}
main().catch(e=>{console.error(JSON.stringify({statut:'D2BB_E2E_ECHEC',erreur:e.message,checks:results}));process.exitCode=1;}).finally(()=>pool.end());
