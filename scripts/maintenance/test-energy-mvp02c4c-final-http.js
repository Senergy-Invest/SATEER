'use strict';
/** Recette HTTP finale C4C (lecture seule) : visibilité du nouveau lien et isolation A/B. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const port=Number(process.env.SATEER_C4C_FINAL_PORT||3487);
assert.ok(Number.isSafeInteger(port)&&port>=1024&&port<=65535);
assert.equal(process.env.PGDATABASE,'sateer_test');
const host=`http://127.0.0.1:${port}`,origin=`http://localhost:${port}`;
const tenant='ENERGY_MVP01D_RECETTE',api='/api/energy/pilotage/v1',query='?tenant='+tenant;
let count=0;
function ok(name){console.log('C4C_FINAL_HTTP_PASS_'+(++count)+' '+name);}
async function get(url,cookie,accept='application/json'){
 const headers={Accept:accept};if(cookie)headers.Cookie=cookie;
 const response=await fetch(host+url,{headers,signal:AbortSignal.timeout(15000),cache:'no-store'});
 return {status:response.status,body:accept==='application/json'?await response.json().catch(()=>({})):await response.text()};
}
async function login(credentials){
 const response=await fetch(host+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(credentials),signal:AbortSignal.timeout(15000)});
 assert.equal(response.status,200,'SESSION_FIXTURE_REFUSEE');
 const cookie=response.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie,'COOKIE_SESSION_ABSENT');
 return cookie;
}
async function main(){
 const u=await get(api+'/sites'+query);assert.equal(u.status,401);ok('API Core privée sans session');
 const html=await get('/energie-actions.html'+query,null,'text/html');
 assert.equal(html.status,200);assert.match(html.body,/id="versResponsabilites"[^>]+hidden/);
 assert.ok(html.body.indexOf('/auth-client.js')<html.body.indexOf('/energie-actions.js'));
 ok('HTML C4C4 servi avec lien C1 caché au démarrage et Core initialisé');
 const js=await get('/energie-actions.js?v=c4c4',null,'text/javascript');assert.equal(js.status,200);
 assert.match(js.body,/lienC1\.hidden=!data\.acces\.complet/);ok('JS C4C4 propriétaire seulement');
 const css=await get('/energie-actions.css',null,'text/css');assert.equal(css.status,200);
 assert.match(css.body,/\.actions-navigation a\[hidden\]/);ok('Lien caché réellement masqué par CSS');
 const file=path.join(os.homedir(),'.sateer-recette','energy-mvp01d','IDENTIFIANTS_PRIVES.json');
 const credentials=JSON.parse(fs.readFileSync(file,'utf8'));
 assert.equal(credentials.tenant,tenant);assert.equal(credentials.accounts.length,2);
 const [A,B]=await Promise.all(credentials.accounts.map(login));ok('Sessions de recette A et B distinctes');
 const list=await get(api+'/sites'+query,A);assert.equal(list.status,200);
 const site=list.body.sites.find(s=>s.role==='PROPRIETAIRE');assert.ok(site);ok('Contexte propriétaire récupéré par API');
 const actions=await get(api+'/sites/'+encodeURIComponent(site.id)+'/actions'+query,A);
 assert.equal(actions.status,200);assert.equal(actions.body.acces.complet,true);ok('Vue propriétaire calculée côté serveur');
 const denied=await get(api+'/sites/'+encodeURIComponent(site.id)+'/actions'+query,B);
 assert.equal(denied.status,404);ok('Compte B ne voit pas les propositions du site A');
 for(const p of ['/energie-collecte.html','/energie-responsabilites.html']){
  const page=await get(p+query,null,'text/html');assert.equal(page.status,200);
  assert.match(page.body,/energie-retour-c4c3\.js/);
 }
 ok('C1 et C2 servis avec le contrat de retour C4C3');
 console.log('C4C_FINAL_HTTP_TOTAL='+count);
}
main().catch(e=>{console.error('C4C_FINAL_HTTP_ECHEC',e.code||e.message);process.exitCode=1;});
