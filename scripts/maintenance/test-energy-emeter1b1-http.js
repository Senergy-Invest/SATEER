'use strict';
/** E2E non destructif : sessions fictives Core A/B, GET, refus POST, aucune piece reelle. */
const assert=require('node:assert/strict');const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const PORT=Number(process.env.SATEER_E_METER_PORT||3489),TENANT='ENERGY_MVP01D_RECETTE';
const host=`http://127.0.0.1:${PORT}`,origin=`http://localhost:${PORT}`,api='/api/energy/facturation/v1',query='?tenant='+TENANT;
let count=0;const pass=x=>console.log(`EMETER1B1_HTTP_PASS_${++count} ${x}`);
async function ask(url,{method='GET',cookie,body,requestOrigin}={}){
 const headers={Accept:'application/json'};if(cookie)headers.Cookie=cookie;
 if(body){headers['Content-Type']='application/json';headers['Idempotency-Key']='00000000-0000-4000-8000-000000000008';}
 if(requestOrigin)headers.Origin=requestOrigin;
 const r=await fetch(host+url,{method,headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000)});
 return {code:r.status,data:await r.json().catch(()=>({}))};
}
async function login(credentials){const r=await fetch(host+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},
 body:JSON.stringify(credentials),signal:AbortSignal.timeout(15000)});
 assert.equal(r.status,200,'FIXTURE_CORE_NON_CONNECTABLE');const cookie=r.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);return cookie;}
async function main(){
 assert.equal(process.env.PGDATABASE,'sateer_test');
 const no=await ask(api+'/sites'+query);assert.equal(no.code,401);pass('Sans session Core 401');
 const page=await fetch(host+'/energie-factures.html'+query);assert.equal(page.status,200);assert.match(await page.text(),/E-METER-1B1/);pass('Ecran de recette present');
 const filepath=path.join(os.homedir(),'.sateer-recette','energy-mvp01d','IDENTIFIANTS_PRIVES.json');
 const fixture=JSON.parse(fs.readFileSync(filepath,'utf8'));assert.equal(fixture.tenant,TENANT);assert.equal(fixture.accounts.length,2);
 const [A,B]=await Promise.all(fixture.accounts.map(login));pass('Sessions A/B distinctes');
 const aa=await ask(api+'/sites'+query,{cookie:A});assert.equal(aa.code,200);const site=aa.data.sites?.[0];assert.ok(site?.id);pass('Site A visible a proprietaire');
 const ab=await ask(api+'/sites'+query,{cookie:B});assert.equal(ab.code,200);assert.ok(!ab.data.sites.some(x=>x.id===site.id));pass('Site A absent du compte B');
 const endpoint=api+'/sites/'+site.id+'/declarations'+query;
 const x=await ask(endpoint,{cookie:B});assert.equal(x.code,404);pass('Lecture site A refusee a B');
 const good={nature:'FACTURE',energie:'ELECTRICITE',dateDocument:'2026-10-15',periodeDebut:'2026-09-01',periodeFin:'2026-09-30',devise:'XOF',montant:'12500.00'};
 const untrusted=await ask(endpoint,{method:'POST',cookie:A,body:good,requestOrigin:'https://untrusted.invalid'});assert.equal(untrusted.code,403);pass('Origine hostile refusee');
 const invalid=await ask(endpoint,{method:'POST',cookie:A,body:{...good,ownerPersonneId:99},requestOrigin:origin});assert.equal(invalid.code,400);pass('Identite injectee refusee');
 const nofile=await ask(endpoint,{method:'POST',cookie:A,body:{...good,fichierBase64:'tresprive'},requestOrigin:origin});assert.equal(nofile.code,400);pass('Fichier non gere refuse');
 const amt=await ask(endpoint,{method:'POST',cookie:A,body:{...good,montant:12500.5},requestOrigin:origin});assert.equal(amt.code,400);pass('Float JS refuse');
 const list=await ask(endpoint,{cookie:A});assert.equal(list.code,200);assert.equal(list.data.calculsDisponibles,false);assert.equal(list.data.preuveFichierDisponible,false);pass('Liste sans mesures inventees');
 const foreign=await ask(api+'/sites/00000000-0000-4000-8000-000000000000/declarations'+query,{cookie:A});assert.equal(foreign.code,404);pass('Site inconnu non divulgue');
 console.log('EMETER1B1_HTTP_TOTAL='+count);
}
main().catch(e=>{console.error('EMETER1B1_HTTP_ECHEC',e.code||e.message);process.exitCode=1;});
