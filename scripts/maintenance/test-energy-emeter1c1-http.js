'use strict';
/** HTTP A/B non destructif : aucune rectification valide ecrite en recette automatisee. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const PORT=Number(process.env.SATEER_E_METER_PORT||3491),TENANT='ENERGY_MVP01D_RECETTE';
const host='http://127.0.0.1:'+PORT,origin='http://localhost:'+PORT;
const api='/api/energy/rectifications/v1',bills='/api/energy/facturation/v1',query='?tenant='+TENANT;
let count=0;const pass=t=>console.log('EMETER1C1_HTTP_PASS_'+(++count)+' '+t);
async function ask(uri,{method='GET',cookie,body,orig}={}){
 const h={Accept:'application/json'};if(cookie)h.Cookie=cookie;if(orig)h.Origin=orig;
 if(body){h['Content-Type']='application/json';h['Idempotency-Key']='00000000-0000-4000-8000-000000000111';}
 const r=await fetch(host+uri,{method,headers:h,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
 return {code:r.status,body:await r.json().catch(()=>({}))};
}
async function login(c){const r=await fetch(host+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(c),signal:AbortSignal.timeout(15000)});
 assert.equal(r.status,200,'COMPTE_CORE_NON_CONNECTABLE');const cookie=r.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);return cookie;}
async function main(){
 assert.equal(process.env.PGDATABASE,'sateer_test');
 const page=await fetch(host+'/energie-rectifications.html'+query);
 assert.equal(page.status,200);assert.match(await page.text(),/E-METER-1C1/);pass('Nouvel ecran disponible');
 const fp=path.join(os.homedir(),'.sateer-recette','energy-mvp01d','IDENTIFIANTS_PRIVES.json');
 const fixture=JSON.parse(fs.readFileSync(fp,'utf8'));assert.equal(fixture.tenant,TENANT);assert.equal(fixture.accounts.length,2);
 const [A,B]=await Promise.all(fixture.accounts.map(login));pass('Sessions A/B distinctes');
 const la=await ask(bills+'/sites'+query,{cookie:A});assert.equal(la.code,200);const site=la.body.sites?.[0];assert.ok(site?.id);pass('Site A visible au proprietaire');
 const lb=await ask(bills+'/sites'+query,{cookie:B});assert.equal(lb.code,200);assert.ok(!lb.body.sites?.some(x=>x.id===site.id));pass('Site A absent du compte B');
 const list=api+'/sites/'+site.id+'/rectifications'+query;
 let r=await ask(list);assert.equal(r.code,401);pass('Liste sans session refusee');
 r=await ask(list,{cookie:A});assert.equal(r.code,200);assert.equal(r.body.calculsDisponibles,false);pass('Liste A sans calcul ni doublon');
 r=await ask(list,{cookie:B});assert.equal(r.code,404);pass('Liste de A refusee a B');
 r=await ask(list.replace(TENANT,'AUTRE'),{cookie:A});assert.equal(r.code,403);pass('Tenant adverse refuse');
 r=await ask(list+'&offset=-5',{cookie:A});assert.equal(r.code,400);pass('Offset negatif refuse');
 const prefix=api+'/sites/'+site.id+'/declarations/00000000-0000-4000-8000-000000000000/rectifications'+query;
 r=await ask(prefix,{cookie:A});assert.equal(r.code,404);pass('Declaration inconnue non divulguee');
 r=await ask(prefix,{cookie:B});assert.equal(r.code,404);pass('Historique de A refuse a B');
 const payload={motif:'Correction du montant saisi par erreur',valeurs:{nature:'FACTURE',energie:'ELECTRICITE',dateDocument:'2026-10-10',periodeDebut:'2026-09-01',periodeFin:'2026-09-30',devise:'XOF',montant:'1200'}};
 r=await ask(prefix,{method:'POST',cookie:A,body:payload,orig:'https://intrus.invalid'});assert.equal(r.code,403);pass('Origine hostile refusee');
 r=await ask(prefix,{method:'POST',cookie:A,body:{...payload,ownerPersonneId:123},orig:origin});assert.equal(r.code,400);pass('Identite fournie par navigateur refusee');
 r=await ask(prefix,{method:'POST',cookie:A,body:{...payload,motif:'non'},orig:origin});assert.equal(r.code,400);pass('Motif non suffisant refuse');
 console.log('EMETER1C1_HTTP_TOTAL='+count);
}
main().catch(e=>{console.error('EMETER1C1_HTTP_ECHEC',e.code||e.message);process.exitCode=1;});
