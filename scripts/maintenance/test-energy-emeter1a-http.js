'use strict';
/** E-METER-1A : HTTP Core + tenant + propriétaire, sans créer de relevés de test. */
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const PORT=Number(process.env.SATEER_E_METER_PORT||3488);const TENANT='ENERGY_MVP01D_RECETTE';
const host=`http://127.0.0.1:${PORT}`,origin=`http://localhost:${PORT}`;
const api='/api/energy/mesures/v1',query='?tenant='+TENANT;let count=0;
const pass=x=>console.log(`E_METER_HTTP_PASS_${++count} ${x}`);
async function ask(url,{method='GET',cookie,body,requestOrigin}={}){
 const headers={Accept:'application/json'};if(cookie)headers.Cookie=cookie;
 if(body){headers['Content-Type']='application/json';headers['Idempotency-Key']='00000000-0000-4000-8000-000000000002';}
 if(requestOrigin)headers.Origin=requestOrigin;
 const r=await fetch(host+url,{method,headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
 return {code:r.status,data:await r.json().catch(()=>({}))};
}
async function login(credentials){
 const r=await fetch(host+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(credentials),signal:AbortSignal.timeout(15000)});
 assert.equal(r.status,200,'SESSION_DE_RECETTE_ABSENTE');const cookie=r.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);return cookie;
}
async function main(){
 assert.equal(process.env.PGDATABASE,'sateer_test');
 const un=await ask(api+'/sites'+query);assert.equal(un.code,401);pass('Sans session : 401');
 const page=await fetch(host+'/energie-releves.html'+query);assert.equal(page.status,200);assert.match(await page.text(),/E-METER-1A/);pass('Page E-METER disponible');
 const f=path.join(os.homedir(),'.sateer-recette','energy-mvp01d','IDENTIFIANTS_PRIVES.json');
 const fixture=JSON.parse(fs.readFileSync(f,'utf8'));assert.equal(fixture.tenant,TENANT);assert.equal(fixture.accounts.length,2);
 const [A,B]=await Promise.all(fixture.accounts.map(login));pass('Sessions propriétaires et étrangères distinctes');
 const aa=await ask(api+'/sites'+query,{cookie:A});assert.equal(aa.code,200);const site=aa.data.sites?.[0];assert.ok(site?.id);pass('Site du propriétaire visible');
 const ab=await ask(api+'/sites'+query,{cookie:B});assert.equal(ab.code,200);assert.ok(!ab.data.sites.some(s=>s.id===site.id));pass('Site A absent de la liste du compte B');
 const pathSite=api+'/sites/'+encodeURIComponent(site.id)+'/points'+query;
 const bb=await ask(pathSite,{cookie:B});assert.equal(bb.code,404);pass('Compte B : accès au site A refusé 404');
 const forbidden=await ask(pathSite,{method:'POST',cookie:A,requestOrigin:'https://untrusted.invalid',body:{nom:'Test',energie:'ELECTRICITE',typePoint:'GENERAL'}});
 assert.equal(forbidden.code,403);pass('POST origine externe refusé');
 const payload={nom:'Test',energie:'ELECTRICITE',typePoint:'GENERAL'};
 const invalid=await ask(pathSite,{method:'POST',cookie:A,requestOrigin:origin,body:{...payload,ownerId:99}});assert.equal(invalid.code,400);pass('POST champ d’identité injecté refusé');
 const unknown=await ask(api+'/sites/'+encodeURIComponent(site.id)+'/registres/00000000-0000-4000-8000-000000000000/releves'+query,{cookie:A});assert.equal(unknown.code,404);pass('Registre inexistant non divulgué');
 const meta=await ask(pathSite,{cookie:A});assert.equal(meta.code,200);assert.equal(meta.data.calculsDisponibles,false);pass('Réponse déclarative sans calcul');
 assert.ok(!JSON.stringify(meta.data).match(/"consommation"|"economie"|"factureMontant"/i));pass('Aucun chiffre énergétique calculé inventé');
 console.log(`E_METER_HTTP_A_B_TOTAL=${count}`);
}
main().catch(e=>{console.error('E_METER_HTTP_ECHEC',e.code||e.message);process.exitCode=1;});
