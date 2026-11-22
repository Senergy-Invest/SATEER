'use strict';
/** Confrontation de preuves API après 3 insertions synthétiques explicitement consenties. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const TENANT='ENERGY_MVP01D_RECETTE',PORT=Number(process.env.SATEER_E_METER_PORT||3494);
const base='http://127.0.0.1:'+PORT,origin='http://localhost:'+PORT;
async function login(credentials){const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(credentials)});
 assert.equal(r.status,200);const cookie=r.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);return cookie;}
async function main(){
 const fixture=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
 assert.equal(fixture.type,'EMETER1C3_FIXTURES_FICTIVES');assert.equal(fixture.ids.length,3);
 const creds=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.sateer-recette','energy-mvp01d','IDENTIFIANTS_PRIVES.json'),'utf8'));
 const [A,B]=await Promise.all(creds.accounts.map(login));
 const uri='/api/energy/proximite/v1/sites/'+encodeURIComponent(fixture.siteId)+'/signaux?tenant='+TENANT+'&offset=0';
 const response=await fetch(base+uri,{headers:{Cookie:A}});assert.equal(response.status,200);
 const page=await response.json(),ids=new Set(fixture.ids),chosen=page.items.filter(x=>ids.has(x.id));
 assert.equal(chosen.length,3,'FIXTURES_NON_VISIBLES_DANS_PAGE (pagination, horodatage ou serveur)');
 const found=new Set(chosen.flatMap(x=>x.signaux.map(y=>y.code)));
 assert.ok(found.has('RELEVES_RAPPROCHES_DIFFERENTS'));
 assert.ok(found.has('RELEVES_RAPPROCHES_IDENTIQUES'));
 assert.ok(chosen.filter(x=>x.signaux.length).every(x=>x.intervalleSecondes===30));
 const forbidden=await fetch(base+uri,{headers:{Cookie:B}});assert.equal(forbidden.status,404);
 const other=await fetch(base+uri.replace(TENANT,'AUTRE_TENANT'),{headers:{Cookie:A}});assert.equal(other.status,403);
 const anonymous=await fetch(base+uri);assert.equal(anonymous.status,401);
 const report={statut:'EMETER1C3_PREUVES_API_CONFORMES',scenario:'trois releves entierement fictifs',
  marker:fixture.marker,ids:fixture.ids,signalCodes:[...found].sort(),delaiSecondes:30,
  accesA:'200',accesB:'404',tenantAutre:'403',anonyme:'401',lectureSeule:true};
 fs.writeFileSync(process.argv[3],JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.log('EMETER1C3_PREUVES_API_PASS=1');
}
main().catch(e=>{console.error('EMETER1C3_PREUVES_ECHEC',e.code||e.message);process.exitCode=1;});
