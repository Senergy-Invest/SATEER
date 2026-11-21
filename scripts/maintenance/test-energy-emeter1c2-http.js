'use strict';
/** Contrôles GET A/B, non destructifs. Aucune donnée factice injectée en HTTP. */
const assert=require('node:assert/strict'),os=require('node:os'),fs=require('node:fs'),path=require('node:path');
const PORT=Number(process.env.SATEER_E_METER_PORT||3492),TENANT='ENERGY_MVP01D_RECETTE';
const host=`http://127.0.0.1:${PORT}`,origin=`http://localhost:${PORT}`,api='/api/energy/qualite/v1',query='?tenant='+TENANT;
let count=0;const pass=m=>console.log('EMETER1C2_HTTP_PASS_'+(++count)+' '+m);
async function ask(u,{method='GET',cookie}={}){const headers={Accept:'application/json'};
 if(cookie)headers.Cookie=cookie;const r=await fetch(host+u,{method,headers,signal:AbortSignal.timeout(15000)});
 return {status:r.status,body:await r.json().catch(()=>({}))};}
async function login(credentials){const r=await fetch(host+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(credentials),signal:AbortSignal.timeout(15000)});
 assert.equal(r.status,200,'FIXTURE_AUTH_NON_CONNECTABLE');const c=r.headers.get('set-cookie')?.split(';')[0];assert.ok(c);return c;}
async function main(){
 assert.equal(process.env.PGDATABASE,'sateer_test');
 const page=await fetch(host+'/energie-controles.html'+query);assert.equal(page.status,200);assert.match(await page.text(),/E-METER-1C2/);pass('Nouvelle page disponible');
 const r=await ask(api+'/sites'+query);assert.equal(r.status,401);pass('Sans session refuse');
 const fixture=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.sateer-recette','energy-mvp01d','IDENTIFIANTS_PRIVES.json'),'utf8'));
 assert.equal(fixture.tenant,TENANT);assert.equal(fixture.accounts.length,2);
 const [A,B]=await Promise.all(fixture.accounts.map(login));pass('Sessions distinctes A/B');
 const list=await ask(api+'/sites'+query,{cookie:A});assert.equal(list.status,200);const s=list.body.sites?.[0];assert.ok(s?.id);pass('Site A accessible au proprietaire');
 const other=await ask(api+'/sites'+query,{cookie:B});assert.equal(other.status,200);assert.ok(!other.body.sites.some(x=>x.id===s.id));pass('Site A non visible par B');
 const url=api+'/sites/'+s.id+'/signaux'+query;
 let v=await ask(url,{cookie:A});assert.equal(v.status,200);assert.equal(v.body.source,'RELEVES');assert.equal(v.body.aucunCalculConsommation,true);pass('Index en lecture seule');
 v=await ask(url+'&source=DOCUMENTS',{cookie:A});assert.equal(v.status,200);assert.equal(v.body.source,'DOCUMENTS');assert.equal(v.body.aucunCalculConsommation,true);pass('Factures courantes en lecture seule');
 v=await ask(url,{cookie:B});assert.equal(v.status,404);pass('Index site A refuse a B');
 v=await ask(url+'&source=DOCUMENTS',{cookie:B});assert.equal(v.status,404);pass('Documents site A refuses a B');
 v=await ask(url.replace(TENANT,'AUTRE_TENANT'),{cookie:A});assert.equal(v.status,403);pass('Tenant non autorise');
 v=await ask(url+'&offset=-1',{cookie:A});assert.equal(v.status,400);pass('Offset invalide refuse');
 v=await ask(url+'&source=INCONNUE',{cookie:A});assert.equal(v.status,400);pass('Source invalide refusee');
 v=await ask(api+'/sites/invalide/signaux'+query,{cookie:A});assert.equal(v.status,400);pass('Identifiant invalide refuse');
 v=await ask(url,{cookie:A,method:'POST'});assert.ok([404,405].includes(v.status));pass('Aucune route POST publiee');
 v=await ask(url+'&source=DOCUMENTS&offset=50',{cookie:A});assert.equal(v.status,200);assert.ok(v.body.items.length<=50);pass('Pagination limitee');
 console.log('EMETER1C2_HTTP_TOTAL='+count);
}
main().catch(e=>{console.error('EMETER1C2_HTTP_ECHEC',e.code||e.message);process.exitCode=1;});
