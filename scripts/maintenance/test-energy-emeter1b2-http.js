'use strict';
/** E-METER-1B2 HTTP : pas de vraie pièce ni de POST valide, tests A/B non destructifs. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const PORT=Number(process.env.SATEER_E_METER_PORT||3490),TENANT='ENERGY_MVP01D_RECETTE';
const host='http://127.0.0.1:'+PORT,origin='http://localhost:'+PORT,api='/api/energy/justificatifs/v1';
let n=0;const pass=s=>console.log('EMETER1B2_HTTP_PASS_'+(++n)+' '+s);
async function ask(route,{method='GET',cookie,body,originHeader,headers={}}={}){
 const h={Accept:'application/json',...headers};if(cookie)h.Cookie=cookie;if(originHeader)h.Origin=originHeader;
 const r=await fetch(host+route,{method,headers:h,body,signal:AbortSignal.timeout(12000)});
 return {status:r.status,data:await r.json().catch(()=>({}))};
}
async function login(credentials){const r=await fetch(host+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(credentials),signal:AbortSignal.timeout(12000)});
 assert.equal(r.status,200);const cookie=r.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);return cookie;}
async function main(){assert.equal(process.env.PGDATABASE,'sateer_test');
 const page=await fetch(host+'/energie-factures.html?tenant='+TENANT);assert.equal(page.status,200);assert.match(await page.text(),/E-METER-1B2/);pass('Interface 1B2 présente');
 const fp=path.join(os.homedir(),'.sateer-recette','energy-mvp01d','IDENTIFIANTS_PRIVES.json');const fixture=JSON.parse(fs.readFileSync(fp,'utf8'));
 assert.equal(fixture.tenant,TENANT);assert.equal(fixture.accounts.length,2);const [A,B]=await Promise.all(fixture.accounts.map(login));pass('Sessions Core A/B');
 const bills='/api/energy/facturation/v1/sites?tenant='+TENANT;const own=await ask(bills,{cookie:A});assert.equal(own.status,200);const site=own.data.sites[0];assert.ok(site?.id);pass('Site A autorisé');
 const [x,y]=await Promise.all([ask(bills,{cookie:B}),ask(api+'/sites/'+site.id+'/declarations/00000000-0000-4000-8000-000000000000/fichiers?tenant='+TENANT,{cookie:B})]);
 assert.equal(x.status,200);assert.ok(!x.data.sites.some(s=>s.id===site.id));assert.equal(y.status,404);pass('Compte B sans accès au site A');
 const prefix=api+'/sites/'+site.id+'/declarations/00000000-0000-4000-8000-000000000000/fichiers?tenant='+TENANT;
 let r=await ask(prefix);assert.equal(r.status,401);pass('Session requise');
 r=await ask(prefix,{cookie:A});assert.equal(r.status,404);pass('Déclaration inconnue masquée');
 r=await ask(prefix.replace(TENANT,'AUTRE'),{cookie:A});assert.equal(r.status,403);pass('Tenant étranger refusé');
 r=await ask(prefix,{cookie:A,method:'POST',body:Buffer.alloc(80),headers:{'Content-Type':'application/octet-stream','Idempotency-Key':'00000000-0000-4000-8000-000000000001'},originHeader:'https://intrus.invalid'});
 assert.equal(r.status,403);pass('Origin hostile refusé');
 r=await ask(prefix,{cookie:A,method:'POST',body:Buffer.alloc(80),headers:{'Content-Type':'application/octet-stream','Idempotency-Key':'00000000-0000-4000-8000-000000000001'},originHeader:origin});
 assert.equal(r.status,415);pass('Octets non PDF/PNG refusés');
 r=await ask(prefix,{cookie:A,method:'POST',body:'{}',headers:{'Content-Type':'application/json'},originHeader:origin});
 assert.equal(r.status,415);pass('Transport non octet-stream refusé');
 r=await ask(api+'/sites/'+site.id+'/declarations/00000000-0000-4000-8000-000000000000/fichiers/00000000-0000-4000-8000-000000000000/telecharger?tenant='+TENANT,{cookie:A});
 assert.equal(r.status,404);pass('Fichier inconnu non divulgué');
 console.log('EMETER1B2_HTTP_TOTAL='+n);
}
main().catch(e=>{console.error('EMETER1B2_HTTP_ECHEC',e.message||e.code);process.exitCode=1;});
