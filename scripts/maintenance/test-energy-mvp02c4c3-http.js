'use strict';
/** C4C3 : HTTP A/B réel, toujours GET dans C4C. Les secrets ne sont jamais loggés. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const base='http://127.0.0.1:3486',tenant='ENERGY_MVP01D_RECETTE',api='/api/energy/pilotage/v1',q='?tenant='+tenant;
assert.equal(process.env.PGDATABASE,'sateer_test');
const accounts=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.sateer-recette','energy-mvp01d','IDENTIFIANTS_PRIVES.json'),'utf8'));
assert.equal(accounts.tenant,tenant);assert.equal(accounts.accounts.length,2);
let n=0;const ok=x=>console.log('C4C3_HTTP_PASS_'+(++n)+' '+x);
async function get(u,cookie,accept='application/json'){
 const headers={Accept:accept};if(cookie)headers.Cookie=cookie;
 const r=await fetch(base+u,{headers,signal:AbortSignal.timeout(15000)});
 return {status:r.status,data:accept==='application/json'?await r.json().catch(()=>({})):await r.text(),headers:r.headers};
}
async function login(account){
 const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:3486'},
  body:JSON.stringify(account),signal:AbortSignal.timeout(15000)});
 assert.equal(r.status,200,'CONNEXION_FIXTURE_REFUSEE');const cookie=r.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);return cookie;
}
async function main(){
 const unauth=await get(api+'/sites/00000000-0000-4000-8000-000000000000/actions'+q+'&suivi=SANS_RELECTEUR_ACTIF');
 assert.equal(unauth.status,401);ok('Session Core exigée');
 const [A,B]=await Promise.all(accounts.accounts.map(login));ok('Sessions fictives A et B isolées');
 const list=await get(api+'/sites'+q,A);assert.equal(list.status,200);
 const site=list.data.sites.find(x=>x.role==='PROPRIETAIRE');assert.ok(site);ok('Site propriétaire A');
 const synth=await get(api+'/sites/'+site.id+'/synthese'+q,A);assert.equal(synth.status,200);ok('Synthèse C4C1 non régressée');
 const before=await get(api+'/sites/'+site.id+'/actions'+q,A);assert.equal(before.status,200);ok('File C4C2 reste accessible');
 const review=await get(api+'/sites/'+site.id+'/actions'+q+'&suivi=SANS_RELECTEUR_ACTIF',A);
 assert.equal(review.status,200);assert.ok(review.data.acces.complet);
 assert.ok(review.data.actions.every(x=>x.suiviRelecture==='SANS_RELECTEUR_ACTIF'&&x.statut==='EN_REVUE'));
 ok('Filtre propriétaire correct, aucune requalification de statut');
 assert.ok(!/"reviewer_grant_id"|"email"|"personneId"|"puissance"|"kwh"/i.test(JSON.stringify(review.data)));
 ok('Aucun détail privé ou kWh');
 const denied=await get(api+'/sites/'+site.id+'/actions'+q+'&suivi=SANS_RELECTEUR_ACTIF',B);
 assert.equal(denied.status,404);ok('Compte B interdit sur site A');
 const bad=await get(api+'/sites/'+site.id+'/actions'+q+'&suivi=AUTRE',A);
 assert.equal(bad.status,400);assert.equal(bad.data.statut,'SUIVI_INVALIDE');ok('Filtre invalide refusé');
 const old=await get(api+'/sites/'+site.id+'/actions'+q+'&statut=EN_REVUE',A);
 assert.equal(old.status,200);assert.ok(old.data.actions.every(x=>x.statut==='EN_REVUE'));ok('Filtre C4C2 EN_REVUE inchangé');
 const wrong=await get(api+'/sites/'+site.id+'/actions?tenant=AUTRE&suivi=SANS_RELECTEUR_ACTIF',A);
 assert.equal(wrong.status,403);ok('Tenant incorrect refusé');
 const html=await get('/energie-actions.html?tenant='+tenant,null,'text/html');
 assert.equal(html.status,200);assert.ok(html.data.includes('id="suiviBox"'));assert.ok(html.data.includes('/auth-client.js'));
 ok('Interface enrichie avec auth Core');
 const c2=await get('/energie-collecte.html?tenant='+tenant,null,'text/html');assert.equal(c2.status,200);ok('Parcours C2 existant toujours servi');
 console.log('C4C3_HTTP_AB_TOTAL='+n);
}
main().catch(e=>{console.error('C4C3_HTTP_AB_ECHEC',e.code||e.message);process.exitCode=1;});
