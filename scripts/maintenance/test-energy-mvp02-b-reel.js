'use strict';
/** E2E sur serveur réel + Core Auth + DB de recette persistante, données exclusivement fictives. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const TENANT='ENERGY_MVP01D_RECETTE',ORIGIN='http://localhost:3473',BASE='http://127.0.0.1:3473';
const PRIVATE=path.join(os.homedir(),'.sateer-recette','energy-mvp01d','IDENTIFIANTS_PRIVES.json');
const CREDS=JSON.parse(fs.readFileSync(PRIVATE,'utf8'));
assert.equal(CREDS.tenant,TENANT);assert.equal(CREDS.accounts.length,2);
assert.equal(process.env.PGDATABASE,'sateer_test');assert.equal(process.env.PGHOST,'::1');
let count=0;const ok=s=>console.log('PASS '+String(++count).padStart(2,'0')+' '+s);
const idempotentKey=tag=>{
 const s=crypto.createHash('sha256').update('sateer-energy-mvp02b/v1/'+tag).digest('hex');
 return s.slice(0,8)+'-'+s.slice(8,12)+'-4'+s.slice(13,16)+'-8'+s.slice(17,20)+'-'+s.slice(20,32);
};
async function request(method,uri,{cookie,body,key,origin=ORIGIN}={}){
 const headers={Accept:'application/json',Origin:origin};if(cookie)headers.Cookie=cookie;
 if(body!==undefined)headers['Content-Type']='application/json';if(key)headers['Idempotency-Key']=key;
 const res=await fetch(BASE+uri,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
 const data=await res.json().catch(()=>({}));return {status:res.status,data,headers:res.headers};
}
const q='?tenant='+TENANT;
const inv=(suffix='')=>'/api/energy/inventory'+suffix+q;
async function main(){
 const anon=await request('GET',inv('/sites'));assert.equal(anon.status,401);ok('Sans cookie Core : 401');
 const cookies=[];
 for(const account of CREDS.accounts){
  const r=await request('POST','/api/auth/login',{body:account});assert.equal(r.status,200);
  assert.match(r.headers.get('set-cookie')||'',/httponly/i);
  const cookie=(r.headers.get('set-cookie')||'').split(';')[0];assert.match(cookie,/^sateer_session=/);
  const me=await request('GET','/api/auth/me',{cookie});assert.equal(me.status,200);
  cookies.push(cookie);
 }
 ok('Deux comptes fictifs authentifiés par les vrais composants Core');
 const other=await request('GET','/api/energy/inventory/sites?tenant=AMBVIS_96C7FBBEA383DD',{cookie:cookies[0]});
 assert.equal(other.status,403);ok('Tenant Ambassade refusé');
 const casesA=await request('GET','/api/energy/cases'+q,{cookie:cookies[0]});
 assert.equal(casesA.status,200);assert.ok(Array.isArray(casesA.data.cases)&&casesA.data.cases.length>0,'DOSSIER_A_ABSENT');
 const caseId=casesA.data.cases[0].id;assert.match(caseId,/^[0-9a-f-]{36}$/i);ok('Dossier EnergyCase A récupéré depuis la session');
 const forbidden=await request('POST',inv('/sites'),{cookie:cookies[1],body:{energyCaseId:caseId}});
 assert.equal(forbidden.status,404);ok('B ne peut pas créer un site pour le dossier A');
 const create=await request('POST',inv('/sites'),{cookie:cookies[0],body:{energyCaseId:caseId}});
 assert.ok([200,201].includes(create.status));const site=create.data.site?.id;assert.match(site,/^[0-9a-f-]{36}$/i);
 ok('Site privé A créé ou récupéré sans duplication');
 const retry=await request('POST',inv('/sites'),{cookie:cookies[0],body:{energyCaseId:caseId}});
 assert.equal(retry.status,200);assert.equal(retry.data.site.id,site);ok('Recréation du site idempotente');
 const readB=await request('GET',inv('/sites/'+site),{cookie:cookies[1]});assert.equal(readB.status,404);
 ok('Accès direct B vers le site A interdit');
 const xorigin=await request('POST',inv('/sites'),{cookie:cookies[0],body:{energyCaseId:caseId},origin:'https://invalid.example'});
 assert.equal(xorigin.status,403);ok('Origine tierce refusée');
 const building={typeZone:'BATIMENT',nom:'Bâtiment de recette MVP02B',parentId:null};
 const keyBuilding=idempotentKey(site+'/batiment');
 const bat=await request('POST',inv('/sites/'+site+'/zones'),{cookie:cookies[0],body:building,key:keyBuilding});
 assert.ok([200,201].includes(bat.status));const batId=bat.data.id;assert.match(batId,/^[0-9a-f-]{36}$/i);
 ok('Bâtiment fictif enregistré');
 const batRetry=await request('POST',inv('/sites/'+site+'/zones'),{cookie:cookies[0],body:building,key:keyBuilding});
 assert.equal(batRetry.status,200);assert.equal(batRetry.data.id,batId);ok('Bâtiment sans doublon au rejeu');
 const room={typeZone:'PIECE',nom:'Salle de recette MVP02B',parentId:batId};
 const roomPost=await request('POST',inv('/sites/'+site+'/zones'),{cookie:cookies[0],body:room,key:idempotentKey(site+'/salle')});
 assert.ok([200,201].includes(roomPost.status));ok('Pièce rattachée au bâtiment');
 const equip={zoneId:roomPost.data.id,nom:'Lampe fictive MVP02B',famille:'ECLAIRAGE',quantite:3,puissanceUnitaireW:12};
 const eq=await request('POST',inv('/sites/'+site+'/equipements'),{cookie:cookies[0],body:equip,key:idempotentKey(site+'/equipement')});
 assert.ok([200,201].includes(eq.status));ok('Équipement déclaré et lié à la pièce');
 const wrong=await request('POST',inv('/sites/'+site+'/equipements'),{cookie:cookies[1],body:equip,key:crypto.randomUUID()});
 assert.equal(wrong.status,404);ok('B ne peut pas déposer un équipement dans le site A');
 const own=await request('GET',inv('/sites/'+site),{cookie:cookies[0]});
 assert.equal(own.status,200);assert.ok(own.data.zones.some(z=>z.id===roomPost.data.id));
 assert.ok(own.data.equipements.some(e=>e.id===eq.data.id&&e.provenance==='DECLAREE'));
 ok('Inventaire réel relu avec zones et équipements déclarés');
 const allB=await request('GET',inv('/sites'),{cookie:cookies[1]});
 assert.equal(allB.status,200);assert.ok(!allB.data.sites.some(s=>s.id===site));ok('Liste B ne contient aucun site A');
 const logout=await request('POST','/api/auth/logout',{cookie:cookies[0]});assert.equal(logout.status,200);
 const expired=await request('GET',inv('/sites'),{cookie:cookies[0]});assert.equal(expired.status,401);
 ok('Déconnexion réelle Core et révocation confirmée');
 console.log('ENERGY_MVP02_B_REEL_CORE_PASS='+count);console.log('DONNEES=RECETTE_FICTIVE_ENERGY_UNIQUEMENT');
}
main().catch(e=>{console.error('MVP02_B_E2E_ECHEC='+String(e.message||e));process.exitCode=1;});
