'use strict';
/** E2E GET C4C, comptes fictifs A/B. Login seulement : aucune écriture métier. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
assert.equal(process.env.PGDATABASE,'sateer_test');
const TENANT='ENERGY_MVP01D_RECETTE',BASE='http://127.0.0.1:3484';
const q='?tenant='+encodeURIComponent(TENANT);
const credentials=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.sateer-recette','energy-mvp01d','IDENTIFIANTS_PRIVES.json'),'utf8'));
assert.equal(credentials.tenant,TENANT);assert.equal(credentials.accounts.length,2);
let passed=0;const ok=x=>console.log('PASS '+(++passed)+' '+x);
async function req(method,path,{cookie,body}={}){
 const headers={Accept:'application/json',Origin:'http://localhost:3484'};
 if(cookie)headers.Cookie=cookie;
 if(body!==undefined)headers['Content-Type']='application/json';
 const r=await fetch(BASE+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 return {status:r.status,data:await r.json().catch(()=>({})),headers:r.headers};
}
const expect=(r,status,label)=>{assert.equal(r.status,status,label+` HTTP ${r.status} ${r.data.statut}`);return r.data;};
async function main(){const api='/api/energy/pilotage/v1';
 expect(await req('GET',api+'/sites'+q),401,'Sans session Core');ok('Sans session, lecture C4C refusée');
 const cookies=[];
 for(const account of credentials.accounts){
  const response=await req('POST','/api/auth/login',{body:account});expect(response,200,'Login compte fictif');
  const cookie=response.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie,'Cookie absent');cookies.push(cookie);
 }
 ok('Deux comptes fictifs authentifiés');
 const [A,B]=cookies;
 const list=expect(await req('GET',api+'/sites'+q,{cookie:A}),200,'Liste A');
 assert.ok(list.sites.length>=1);const mine=list.sites.find(x=>x.role==='PROPRIETAIRE');assert.ok(mine,'Site propriétaire attendu');
 ok('Propriétaire A retrouve ses sites déclarés');
 const dashboard=expect(await req('GET',api+'/sites/'+mine.id+'/synthese'+q,{cookie:A}),200,'Bilan A');
 assert.equal(dashboard.acces.complet,true);assert.equal(dashboard.mesuresDisponibles,false);
 assert.ok(Number.isSafeInteger(dashboard.indicateurs.unites));ok('Bilan et nombre d’unités vérifiés');
 assert.equal(dashboard.equipementsSansLocalisation===null,false);ok('Qualité de localisation calculée sans inventer de mesure');
 const denied=await req('GET',api+'/sites/'+mine.id+'/synthese'+q,{cookie:B});expect(denied,404,'Autre utilisateur B');
 ok('Autre utilisateur ne voit pas le site A');
 expect(await req('GET',api+'/sites/'+mine.id+'/synthese?tenant=AUTRE',{cookie:A}),403,'Tenant incorrect');ok('Tenant incorrect refusé');
 expect(await req('GET',api+'/sites/'+mine.id+'/synthese'+q+'&grantId=INVALID',{cookie:A}),400,'Affectation incorrecte');ok('Grant invalidé sans accès');
 const noKwh=JSON.stringify(dashboard);assert.ok(!/\"kwh\"|\"economies\"|\"consommation\"/i.test(noKwh));
 ok('Aucun chiffre de consommation ou économie inventé');
 console.log('C4C_HTTP_AB_PASS='+passed);
}
main().catch(e=>{console.error('C4C_HTTP_AB_ECHEC',e.code||e.message);process.exitCode=1;});
