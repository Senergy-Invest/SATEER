'use strict';
/** Real server.js + Core auth + real PG; only a synthetic Energy tenant is used. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const TENANT='ENERGY_MVP01D_RECETTE';
const origin='http://localhost:3472';
const base='http://127.0.0.1:3472';
const credentials=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.sateer-recette/energy-mvp01d/IDENTIFIANTS_PRIVES.json'),'utf8'));
assert.equal(credentials.tenant,TENANT);
assert.equal(process.env.PGDATABASE,'sateer_test');
const body={tenantCode:TENANT,profil:'PARTICULIER',typeSite:'LOGEMENT',nomSite:'RECETTE SYNTHETIQUE MVP01D',pays:'SN',alimentation:'SANS_ALIMENTATION',compteur:'NON',besoins:['POMPAGE','EFFICACITE'],description:'Données fictives. Aucun projet réel.',consentement:true};
let count=0;function pass(label){console.log('PASS '+(++count)+' '+label);}
async function req(method,p,{cookie,json,key,requestOrigin}={}){
 const headers={Accept:'application/json'};
 if(cookie)headers.Cookie=cookie;
 if(json!==undefined)headers['Content-Type']='application/json';
 if(key)headers['Idempotency-Key']=key;
 if(requestOrigin!==false)headers.Origin=requestOrigin||origin;
 const response=await fetch(base+p,{method,headers,body:json===undefined?undefined:JSON.stringify(json),signal:AbortSignal.timeout(9000)});
 let data;try{data=await response.json();}catch(e){throw Error('REPONSE_NON_JSON:'+p+':'+response.status);}
 return {code:response.status,data,headers:response.headers};
}
async function main(){
 const no=await req('GET','/api/energy/cases?tenant='+TENANT);
 assert.equal(no.code,401);pass('Acces anonyme refuse 401');
 const cookies=[];
 for(const c of credentials.accounts){
  const a=await req('POST','/api/auth/login',{json:c});
  assert.equal(a.code,200);assert.match(a.headers.get('set-cookie')||'',/httponly/i);
  const cookie=(a.headers.get('set-cookie')||'').split(';')[0];assert.match(cookie,/^sateer_session=/);
  const me=await req('GET','/api/auth/me',{cookie});assert.equal(me.code,200);cookies.push(cookie);
 }
 pass('Deux authentifications Core et cookies HttpOnly');
 const bad=await req('GET','/api/energy/cases?tenant=AMBVIS_96C7FBBEA383DD',{cookie:cookies[0]});
 assert.equal(bad.code,403);pass('Tenant Ambassade interdit');
 const otherOrigin=await req('POST','/api/energy/cases?tenant='+TENANT,{cookie:cookies[0],json:body,key:crypto.randomUUID(),requestOrigin:'https://invalide.example'});
 assert.equal(otherOrigin.code,403);pass('Origin tiers refusee');
 const spoof=await req('POST','/api/energy/cases?tenant='+TENANT,{cookie:cookies[0],json:{...body,personneId:123},key:crypto.randomUUID()});
 assert.equal(spoof.code,400);pass('Usurpation identite refusee');
 const key=crypto.randomUUID();
 const created=await req('POST','/api/energy/cases?tenant='+TENANT,{cookie:cookies[0],json:body,key});
 assert.equal(created.code,201);assert.match(created.data.id,/^[a-f0-9-]{36}$/i);pass('Dossier synthetique cree via serveur reel');
 const retry=await req('POST','/api/energy/cases?tenant='+TENANT,{cookie:cookies[0],json:body,key});
 assert.equal(retry.code,200);assert.equal(retry.data.id,created.data.id);pass('Rejeu idempotent');
 const other=await req('GET','/api/energy/cases/'+created.data.id+'?tenant='+TENANT,{cookie:cookies[1]});
 assert.equal(other.code,404);pass('Dossier A invisible par B');
 const listB=await req('GET','/api/energy/cases?tenant='+TENANT,{cookie:cookies[1]});
 assert.equal(listB.code,200);assert.equal(listB.data.cases.some(x=>x.id===created.data.id),false);pass('Liste privee B');
 const own=await req('GET','/api/energy/cases/'+created.data.id+'?tenant='+TENANT,{cookie:cookies[0]});
 assert.equal(own.code,200);assert.equal(own.data.energyCase.id,created.data.id);pass('Dossier visible pour proprietaire');
 const out=await req('POST','/api/auth/logout',{cookie:cookies[0]});assert.equal(out.code,200);
 const revoked=await req('GET','/api/energy/cases?tenant='+TENANT,{cookie:cookies[0]});assert.equal(revoked.code,401);pass('Deconnexion Core et revocation');
 console.log('MVP01_D_REEL_PASS='+count);
 console.log('DONNEES=EXCLUSIVEMENT_FICTIVES_SUR_TENANT_ENERGY');
}
main().catch(e=>{console.error('MVP01_D_ECHEC='+String(e.message||e));process.exitCode=1;});
