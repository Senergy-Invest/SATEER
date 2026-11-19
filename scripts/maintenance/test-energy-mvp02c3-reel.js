'use strict';
/** Recette Core A/B réelle. Comptes et sessions tenus exclusivement dans un fichier privé Mac. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const T='ENERGY_MVP01D_RECETTE',ORIGIN='http://localhost:3480',BASE='http://127.0.0.1:3480',q='?tenant='+T;
assert.equal(process.env.PGDATABASE,'sateer_test');assert.equal(process.env.PGHOST,'::1');
const creds=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.sateer-recette','energy-mvp01d','IDENTIFIANTS_PRIVES.json'),'utf8'));
assert.equal(creds.tenant,T);assert.equal(creds.accounts.length,2);
const uuid=()=>crypto.randomUUID();let n=0;const ok=x=>console.log('PASS '+(++n)+' '+x);
async function req(method,url,{cookie,body,key,origin=ORIGIN}={}){
 const headers={Accept:'application/json',Origin:origin};if(cookie)headers.Cookie=cookie;if(body!==undefined)headers['Content-Type']='application/json';if(key)headers['Idempotency-Key']=key;
 const r=await fetch(BASE+url,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(18000)});
 return {status:r.status,data:await r.json().catch(()=>({})),headers:r.headers};
}
async function main(){
 const api='/api/energy/catalogue/v1';assert.equal((await req('GET',api+'/sites/'+uuid()+'/references'+q)).status,401);ok('Core Auth obligatoire');
 const sessions=[];for(const account of creds.accounts){const r=await req('POST','/api/auth/login',{body:account});assert.equal(r.status,200);sessions.push(r.headers.get('set-cookie').split(';')[0]);}
 const [A,B]=sessions;ok('Deux sessions fictives distinctes');
 const siteList=await req('GET','/api/energy/inventory/sites'+q,{cookie:A});assert.equal(siteList.status,200);
 const siteId=siteList.data.sites?.[0]?.id;assert.ok(siteId);ok('Site A existant');
 assert.equal((await req('GET',api+'/sites/'+siteId+'/references'+q,{cookie:B})).status,404);ok('B ne voit pas les references de A');
 const passports=await req('GET','/api/energy/passports/sites/'+siteId+q,{cookie:A});assert.equal(passports.status,200);ok('Passeports A existants lisibles');
 const pass=passports.data.passeports?.[0];assert.ok(pass?.id);const ps=await req('GET',api+'/sites/'+siteId+'/sources/'+pass.id+q,{cookie:A});assert.equal(ps.status,200);
 assert.equal(ps.data.passportId,pass.id);ok('Lecture privee des champs de plaque, pas des photos');
 assert.equal((await req('GET',api+'/sites/'+siteId+'/sources/'+pass.id+q,{cookie:B})).status,404);ok('B ne lit pas les valeurs de plaque de A');
 const s=uuid().slice(0,8),data={famille:pass.famille,sousFamille:'Recette C3 '+s,designation:'Machine fictive '+s,
  marque:'FabricantFictif'+s,modele:'Model'+s,puissanceNominaleW:1200,tensionV:230,sourcePassportId:null};
 const origin=await req('POST',api+'/sites/'+siteId+'/references'+q,{cookie:A,origin:'https://evil.invalid',body:data,key:uuid()});assert.equal(origin.status,403);ok('Origine tierce refusee');
 const bWrite=await req('POST',api+'/sites/'+siteId+'/references'+q,{cookie:B,body:data,key:uuid()});assert.equal(bWrite.status,404);ok('B ne cree pas de fiche technique sur A');
 const invalid=await req('POST',api+'/sites/'+siteId+'/references'+q,{cookie:A,body:{...data,owner:99},key:uuid()});assert.equal(invalid.status,400);ok('Champs injectes refusés');
 const key=uuid();const created=await req('POST',api+'/sites/'+siteId+'/references'+q,{cookie:A,body:data,key});
 assert.equal(created.status,201,'CREATE_'+created.status+'_'+created.data.statut);const refId=created.data.id;assert.ok(refId);ok('Candidate creee dans le site A');
 const idem=await req('POST',api+'/sites/'+siteId+'/references'+q,{cookie:A,body:data,key});assert.equal(idem.status,200);assert.equal(idem.data.id,refId);ok('Creation idempotente');
 const list=await req('GET',api+'/sites/'+siteId+'/references'+q,{cookie:A});assert.equal(list.status,200);assert.ok(list.data.references.some(x=>x.id===refId&&x.statut==='CANDIDATE'));ok('Reference candidate visible au proprietaire');
 const reviewed=await req('POST',api+'/sites/'+siteId+'/references/'+refId+'/decision'+q,{cookie:A,body:{decision:'REFERENCER'}});assert.equal(reviewed.status,200);ok('Revue explicite A');
 const again=await req('POST',api+'/sites/'+siteId+'/references/'+refId+'/decision'+q,{cookie:A,body:{decision:'REFERENCER'}});assert.equal(again.status,409);ok('Pas de double decision');
 const copy=await req('POST',api+'/sites/'+siteId+'/references'+q,{cookie:A,body:{...data,designation:'Autre nom'},key:uuid()});assert.equal(copy.status,201);
 const dupe=await req('POST',api+'/sites/'+siteId+'/references/'+copy.data.id+'/decision'+q,{cookie:A,body:{decision:'REFERENCER'}});assert.equal(dupe.status,409);assert.equal(dupe.data.statut,'MODELE_DEJA_REFERENCE');ok('Doublon de modèle détecté');
 const reject=await req('POST',api+'/sites/'+siteId+'/references/'+copy.data.id+'/decision'+q,{cookie:A,body:{decision:'REJETER'}});assert.equal(reject.status,200);ok('Rejet candidat historisé');
 const approved=await req('GET',api+'/sites/'+siteId+'/references'+q,{cookie:A});assert.ok(approved.data.references.some(x=>x.id===refId&&x.statut==='REFERENCE_INTERNE'));ok('Référencement interne et non certification');
 // Les liens physiques sont testés en base sous rollback. En réel, éviter d'affecter
 // un modèle fictif à un appareil A dont une plaque déclarée contredirait la référence.
 const noB=await req('POST',api+'/sites/'+siteId+'/references/'+refId+'/associer'+q,{cookie:B,body:{passportId:pass.id}});assert.equal(noB.status,404);ok('B ne lie aucun passeport A');
 const ssp=await req('GET',api+'/sites/'+siteId+'/sources/'+pass.id+q,{cookie:A});assert.equal(ssp.status,200);ok('Source A conservee apres validation');
 console.log('C3_REEL_TERMINE='+n);
}
main().catch(e=>{console.error('C3_REEL_ECHEC',e.code||e.message);process.exitCode=1;});
