'use strict';
/** E-METER-1D1 : vérifications HTTP réelles A/B, PREVIEW exclusivement, ZÉRO écriture. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const TENANT='ENERGY_MVP01D_RECETTE',PORT=Number(process.env.SATEER_E_METER_PORT||3497);
const host='http://127.0.0.1:'+PORT,origin='http://localhost:'+PORT;
const api='/api/energy/import/v1',mapi='/api/energy/mesures/v1',q='?tenant='+TENANT;
let count=0;const pass=m=>console.log('EMETER1D1_HTTP_PASS_'+(++count)+' '+m);
async function ask(u,{method='GET',cookie,body,origin:ref=origin,key}={}){
 const headers={Accept:'application/json'};if(cookie)headers.Cookie=cookie;
 if(body!==undefined){headers['Content-Type']='application/json';headers.Origin=ref;}
 if(key)headers['Idempotency-Key']=key;
 const r=await fetch(host+u,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});
 return {status:r.status,data:await r.json().catch(()=>({}))};
}
async function login(account){
 const r=await fetch(host+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},
  body:JSON.stringify(account),signal:AbortSignal.timeout(15000)});
 assert.equal(r.status,200);const cookie=r.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);return cookie;
}
async function main(){
 assert.equal(process.env.PGDATABASE,'sateer_test');
 const page=await fetch(host+'/energie-import.html'+q);assert.equal(page.status,200);assert.match(await page.text(),/E-METER-1D1/);pass('HTML import visible');
 let v=await ask(api+'/sites'+q);assert.equal(v.status,401);pass('Sans session 401');
 const fixture=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.sateer-recette','energy-mvp01d','IDENTIFIANTS_PRIVES.json'),'utf8'));
 assert.equal(fixture.tenant,TENANT);assert.equal(fixture.accounts.length,2);
 const [A,B]=await Promise.all(fixture.accounts.map(login));pass('Sessions Core A et B');
 v=await ask(api+'/sites'+q,{cookie:A});assert.equal(v.status,200);assert.ok(v.data.sites.length);pass('Liste des sites A');
 const site=v.data.sites.find(x=>x.nom==='RECETTE SYNTHETIQUE MVP01D')||v.data.sites[0];
 v=await ask(api+'/sites'+q,{cookie:B});assert.equal(v.status,200);assert.ok(!v.data.sites.some(s=>s.id===site.id));pass('Site A absent de B');
 v=await ask(mapi+'/sites/'+site.id+'/points'+q,{cookie:A});assert.equal(v.status,200);
 const regs=(v.data.points||[]).flatMap(p=>(p.compteurs||[]).filter(m=>m.actif).flatMap(m=>m.registres||[]));
 assert.ok(regs.length>0,'Registre actif requis dans la fixture de recette');
 const reg=regs[0],csv='registre_id,releve_le,valeur_index,observation\n'+
  `${reg.id},2026-11-17T12:00:00Z,230.000000,IMPORT_CSV_1D1_FICTIF\n`+
  `${reg.id},2026-11-17T13:00:00Z,235.000000,IMPORT_CSV_1D1_FICTIF\n`;
 if(process.argv[2])fs.writeFileSync(process.argv[2],csv,{mode:0o600});
 pass('Registre existant et échantillon CSV fictif');
 const p=api+'/sites/'+site.id+'/apercu'+q;
 v=await ask(p,{method:'POST',cookie:A,body:{csv}});assert.equal(v.status,200);
 assert.equal(v.data.total,2);assert.equal(v.data.admissibles,2);assert.equal(v.data.importPossible,true);
 assert.equal(v.data.aucunCalculConsommation,true);pass('Prévisualisation deux lignes et zéro calcul');
 v=await ask(p,{method:'POST',cookie:B,body:{csv}});assert.equal(v.status,404);pass('Site A refusé à B');
 v=await ask(p.replace(TENANT,'AUTRE_TENANT'),{method:'POST',cookie:A,body:{csv}});assert.equal(v.status,403);pass('Tenant étranger 403');
 v=await ask(p,{method:'POST',cookie:A,body:{csv},origin:'https://autre.example'});assert.equal(v.status,403);pass('Origin étranger 403');
 v=await ask(p,{method:'POST',body:{csv}});assert.equal(v.status,401);pass('POST anonyme 401');
 v=await ask(p,{method:'POST',cookie:A,body:{csv:'a,b,c,d\n1,2,3,4'}});assert.equal(v.status,400);pass('CSV invalides 400');
 const commit=api+'/sites/'+site.id+'/valider'+q;
 v=await ask(commit,{method:'POST',cookie:A,body:{csv}});assert.equal(v.status,400);pass('Confirmation humaine absente, refusée');
 v=await ask(commit,{method:'POST',cookie:A,body:{csv,confirmation:'CONFIRMER_IMPORT'}});
 assert.equal(v.status,400);pass('Clé idempotence absente, refusée');
 console.log('EMETER1D1_HTTP_TOTAL='+count);
 console.log('EMETER1D1_HTTP_AUCUN_COMMIT_AUCUNE_ECRITURE=1');
}
main().catch(e=>{console.error('EMETER1D1_HTTP_ECHEC',e.code||e.message);process.exitCode=1;});
