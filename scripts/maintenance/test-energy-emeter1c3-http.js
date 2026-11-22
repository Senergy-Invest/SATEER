'use strict';
/** Vérification réelle sessions A/B, API GET exclusivement, sans mutation. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const TENANT='ENERGY_MVP01D_RECETTE',PORT=Number(process.env.SATEER_E_METER_PORT||3494);
const host='http://127.0.0.1:'+PORT,origin='http://localhost:'+PORT,api='/api/energy/proximite/v1',q='?tenant='+TENANT;
let count=0;const pass=m=>console.log('EMETER1C3_HTTP_PASS_'+(++count)+' '+m);
async function ask(u,{method='GET',cookie}={}){const h={Accept:'application/json'};if(cookie)h.Cookie=cookie;
 const r=await fetch(host+u,{method,headers:h,signal:AbortSignal.timeout(15000)});
 return {status:r.status,data:await r.json().catch(()=>({}))};}
async function login(account){const r=await fetch(host+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(account),signal:AbortSignal.timeout(15000)});
 assert.equal(r.status,200);const cookie=r.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);return cookie;}
async function main(){assert.equal(process.env.PGDATABASE,'sateer_test');
 const page=await fetch(host+'/energie-rapproches.html'+q);assert.equal(page.status,200);assert.match(await page.text(),/E-METER-1C3/);pass('Page de controle servie');
 const blocked=await ask(api+'/sites'+q);assert.equal(blocked.status,401);pass('Session anonyme refusee');
 const fixture=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.sateer-recette','energy-mvp01d','IDENTIFIANTS_PRIVES.json'),'utf8'));
 assert.equal(fixture.tenant,TENANT);assert.equal(fixture.accounts.length,2);
 const [A,B]=await Promise.all(fixture.accounts.map(login));pass('Deux sessions Core distinctes');
 const list=await ask(api+'/sites'+q,{cookie:A});assert.equal(list.status,200);const site=list.data.sites?.[0];assert.ok(site?.id);pass('Site de A visible');
 const other=await ask(api+'/sites'+q,{cookie:B});assert.equal(other.status,200);assert.ok(!other.data.sites.some(x=>x.id===site.id));pass('Site de A non visible par B');
 const target=api+'/sites/'+site.id+'/signaux'+q;
 let v=await ask(target,{cookie:A});assert.equal(v.status,200);assert.ok(Array.isArray(v.data.items));assert.equal(v.data.aucunCalculConsommation,true);pass('Index privés en lecture seule');
 v=await ask(target,{cookie:B});assert.equal(v.status,404);pass('Site A refuse a B');
 v=await ask(target.replace(TENANT,'AUTRE_TENANT'),{cookie:A});assert.equal(v.status,403);pass('Tenant etranger refuse');
 v=await ask(target+'&offset=-1',{cookie:A});assert.equal(v.status,400);pass('Pagination illegale refusee');
 v=await ask(api+'/sites/not-uuid/signaux'+q,{cookie:A});assert.equal(v.status,400);pass('Identifiant invalide refuse');
 v=await ask(target,{cookie:A,method:'POST'});assert.ok([404,405].includes(v.status));pass('Route POST inexistante');
 v=await ask(target+'&offset=50',{cookie:A});assert.equal(v.status,200);assert.ok(v.data.items.length<=50);pass('Page suivante borne');
 console.log('EMETER1C3_HTTP_TOTAL='+count);
}
main().catch(e=>{console.error('EMETER1C3_HTTP_ECHEC',e.code||e.message);process.exitCode=1;});
