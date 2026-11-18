'use strict';
/** Test E2E : sessions Core REELLES, photos synthétiques uniquement, pas de secret dans les logs. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const TENANT='ENERGY_MVP01D_RECETTE',ORIGIN='http://localhost:3474',BASE='http://127.0.0.1:3474';
const credsFile=path.join(os.homedir(),'.sateer-recette','energy-mvp01d','IDENTIFIANTS_PRIVES.json');
const creds=JSON.parse(fs.readFileSync(credsFile,'utf8'));
assert.equal(creds.tenant,TENANT);assert.equal(creds.accounts.length,2);
assert.equal(process.env.PGDATABASE,'sateer_test');assert.equal(process.env.PGHOST,'::1');
let count=0;const ok=s=>console.log('PASS '+(++count)+' '+s);
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO//a9kAAAAASUVORK5CYII=','base64');
async function req(method,uri,{cookie,body,origin=ORIGIN,mime='application/json'}={}){
 const headers={'Accept':'application/json',Origin:origin};if(cookie)headers.Cookie=cookie;if(body!==undefined)headers['Content-Type']=mime;
 const res=await fetch(BASE+uri,{method,headers,body:body===undefined?undefined:Buffer.isBuffer(body)?body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
 const isImg=(res.headers.get('content-type')||'').startsWith('image/');
 return {status:res.status,data:isImg?Buffer.from(await res.arrayBuffer()):await res.json().catch(()=>({})),headers:res.headers};
}
const Q='?tenant='+TENANT,P='/api/energy/passports';
async function main(){
 const anon=await req('GET',P+'/sites/00000000-0000-4000-8000-000000000000'+Q);assert.equal(anon.status,401);ok('Sans session : 401');
 const cookies=[];for(const account of creds.accounts){const r=await req('POST','/api/auth/login',{body:account});assert.equal(r.status,200);
  assert.match(r.headers.get('set-cookie')||'',/HttpOnly/i);cookies.push(r.headers.get('set-cookie').split(';')[0]);}
 ok('Deux comptes fictifs SATEER Core authentifiés');
 const inv=await req('GET','/api/energy/inventory/sites'+Q,{cookie:cookies[0]});assert.equal(inv.status,200);
 const site=inv.data.sites?.[0]?.id;assert.ok(site,'SITE_A_REQUIS');
 const detail=await req('GET','/api/energy/inventory/sites/'+site+Q,{cookie:cookies[0]});assert.equal(detail.status,200);
 const equipment=detail.data.equipements?.[0];assert.ok(equipment,'EQUIPEMENT_A_REQUIS');ok('Site et équipement existants réutilisés');
 const endpoint=P+'/sites/'+site+'/equipements/'+equipment.id+Q;
 const create=await req('POST',endpoint,{cookie:cookies[0],body:{numeroIndividuel:1}});
 assert.ok([200,201].includes(create.status),'CREATION_PASSEPORT_'+create.status);const id=create.data.id;assert.ok(id);ok('Passeport individuel créé/récupéré');
 const retry=await req('POST',endpoint,{cookie:cookies[0],body:{numeroIndividuel:1}});assert.equal(retry.status,200);assert.equal(retry.data.id,id);ok('Idempotence même équipement et rang');
 const groupCount=Number(equipment.quantite);if(groupCount>1){
  const nonexistent=await req('POST',endpoint,{cookie:cookies[0],body:{numeroIndividuel:groupCount+1}});assert.equal(nonexistent.status,409);ok('Rang hors groupe refusé');
 }
 const impossible=await req('POST',endpoint,{cookie:cookies[1],body:{numeroIndividuel:1}});assert.equal(impossible.status,404);ok('Compte B ne crée pas le passeport de A');
 const list=await req('GET',P+'/sites/'+site+Q,{cookie:cookies[0]});assert.equal(list.status,200);assert.ok(list.data.passeports.some(p=>p.id===id));ok('Liste des passeports propriétaire');
 const privateGet=await req('GET',P+'/'+id+Q,{cookie:cookies[0]});assert.equal(privateGet.status,200);
 const url=privateGet.data.qrUrl;assert.ok(url.startsWith(ORIGIN+'/equipement-qr.html?t='));assert.ok(!url.includes('personneId')&&!url.includes(equipment.nom));ok('URL QR opaque et privée');
 const token=new URL(url).searchParams.get('t');
 const scan=await req('GET',P+'/scan/'+token,{cookie:cookies[0]});assert.equal(scan.status,200);assert.equal(scan.data.passeport.id,id);ok('Lecture QR par le propriétaire');
 const forbidden=await req('GET',P+'/scan/'+token,{cookie:cookies[1]});assert.equal(forbidden.status,404);ok('QR divulgué ne donne aucun accès à B');
 const bdetail=await req('GET',P+'/'+id+Q,{cookie:cookies[1]});assert.equal(bdetail.status,404);ok('Détail interdit au compte B');
 const wrongTenant=await req('GET',P+'/'+id+'?tenant=AMBVIS_96C7FBBEA383DD',{cookie:cookies[0]});assert.equal(wrongTenant.status,403);ok('Autre tenant interdit');
 const photoRoute=P+'/'+id+'/photos/APPAREIL'+Q;
 const badOrigin=await req('POST',photoRoute,{cookie:cookies[0],body:png,mime:'application/octet-stream',origin:'https://attacker.example'});assert.equal(badOrigin.status,403);ok('Upload cross-origin interdit');
 const badFile=await req('POST',photoRoute,{cookie:cookies[0],body:Buffer.alloc(125,1),mime:'application/octet-stream'});assert.equal(badFile.status,415);ok('Fichier non-image refusé');
 const upload=await req('POST',photoRoute,{cookie:cookies[0],body:png,mime:'application/octet-stream'});assert.equal(upload.status,201,'UPLOAD_'+upload.status);const photoId=upload.data.photoId;ok('Photo synthétique enregistrée chiffrée');
 const read=await req('GET',P+'/'+id+'/photos/'+photoId+Q,{cookie:cookies[0]});assert.equal(read.status,200);assert.deepEqual(read.data,png);ok('Photo déchiffrée au propriétaire');
 const readB=await req('GET',P+'/'+id+'/photos/'+photoId+Q,{cookie:cookies[1]});assert.equal(readB.status,404);ok('Photo interdite à B');
 const del=await req('DELETE',P+'/'+id+'/photos/'+photoId+Q,{cookie:cookies[0]});assert.equal(del.status,200);ok('Suppression logique de photo par propriétaire');
 const missing=await req('GET',P+'/'+id+'/photos/'+photoId+Q,{cookie:cookies[0]});assert.equal(missing.status,404);ok('Photo supprimée inaccessible');
 const logout=await req('POST','/api/auth/logout',{cookie:cookies[0]});assert.equal(logout.status,200);
 const after=await req('GET',P+'/'+id+Q,{cookie:cookies[0]});assert.equal(after.status,401);ok('Session révoquée, fiche inaccessible');
 console.log('ENERGY_MVP02A1_CORE_PHOTO_QR_PASS='+count);
}
main().catch(e=>{console.error('ENERGY_MVP02A1_E2E_ECHEC='+String(e.message||e));process.exitCode=1;});
