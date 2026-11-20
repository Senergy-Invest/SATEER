'use strict';
/** C4C2 : recette HTTP réelle A/B, GET uniquement sur le registre, jamais de mot de passe loggé. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const base='http://127.0.0.1:3485',tenant='ENERGY_MVP01D_RECETTE',api='/api/energy/pilotage/v1',q='?tenant='+tenant;
assert.equal(process.env.PGDATABASE,'sateer_test');
const credentials=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.sateer-recette','energy-mvp01d','IDENTIFIANTS_PRIVES.json'),'utf8'));
assert.equal(credentials.tenant,tenant);assert.equal(credentials.accounts.length,2);
let n=0;const ok=x=>console.log('PASS '+(++n)+' '+x);
async function get(u,cookie){const headers={Accept:'application/json'};if(cookie)headers.Cookie=cookie;
 const r=await fetch(base+u,{headers,signal:AbortSignal.timeout(15000)});return {status:r.status,data:await r.json().catch(()=>({})),headers:r.headers};}
async function login(account){const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:3485'},body:JSON.stringify(account),signal:AbortSignal.timeout(15000)});
 assert.equal(r.status,200,'CONNEXION_FIXTURE_REFUSEE');const cookie=r.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);return cookie;}
async function main(){
 const unauth=await get(api+'/sites/00000000-0000-4000-8000-000000000000/actions'+q);
 assert.equal(unauth.status,401);ok('Session Core exigée');
 const [A,B]=await Promise.all(credentials.accounts.map(login));ok('Deux sessions fictives A et B');
 const list=await get(api+'/sites'+q,A);assert.equal(list.status,200);
 const site=list.data.sites.find(x=>x.role==='PROPRIETAIRE');assert.ok(site);ok('Site propriétaire du compte A');
 const initial=await get(api+'/sites/'+site.id+'/synthese'+q,A);
 assert.equal(initial.status,200);assert.equal(initial.data.acces.complet,true);ok('Synthèse C4C1 non régressée');
 const r=await get(api+'/sites/'+site.id+'/actions'+q,A);assert.equal(r.status,200);
 assert.equal(r.data.acces.complet,true);assert.ok(Array.isArray(r.data.actions));ok('File C2 du site propriétaire');
 const text=JSON.stringify(r.data);assert.ok(!/"kwh"|"economies"|motDePasse|auteurPersonneId/i.test(text));ok('Aucune énergie inventée ni identité exposée');
 const b=await get(api+'/sites/'+site.id+'/actions'+q,B);assert.equal(b.status,404);ok('Isolation propriétaire A contre B');
 const unknown=await get(api+'/sites/'+site.id+'/actions?tenant=AUTRE',A);assert.equal(unknown.status,403);ok('Tenant incorrect refusé');
 const invalid=await get(api+'/sites/'+site.id+'/actions'+q+'&statut=INTEGREE',A);assert.equal(invalid.status,400);ok('Statut de filtre non prévu refusé');
 const fake=await get(api+'/sites/'+site.id+'/actions'+q+'&grantId=INVALID',A);assert.equal(fake.status,400);ok('Grant malformé rejeté');
 const filtered=await get(api+'/sites/'+site.id+'/actions'+q+'&statut=EN_REVUE',A);
 assert.equal(filtered.status,200);assert.ok(filtered.data.actions.every(x=>x.statut==='EN_REVUE'));ok('Filtre EN_REVUE exact');
 const html=await fetch(base+'/energie-actions.html?tenant='+tenant);assert.equal(html.status,200);
 assert.ok((await html.text()).includes('/auth-client.js'));ok('Écran C4C2 et client de session Core servis');
 console.log('C4C2_HTTP_AB_PASS='+n);
}
main().catch(e=>{console.error('C4C2_HTTP_AB_ECHEC',e.code||e.message);process.exitCode=1;});
