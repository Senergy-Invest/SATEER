'use strict';
/** Vrais cookies Core, compte A/B, photo purement synthétique, OCR local, versionnement et isolation. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const TENANT='ENERGY_MVP01D_RECETTE',ORIGIN='http://localhost:3475',BASE='http://127.0.0.1:3475';
const C=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.sateer-recette','energy-mvp01d','IDENTIFIANTS_PRIVES.json'),'utf8'));
assert.equal(C.tenant,TENANT);assert.equal(C.accounts.length,2);assert.equal(process.env.PGDATABASE,'sateer_test');assert.equal(process.env.PGHOST,'::1');
const fixture=fs.readFileSync(path.join(__dirname,'../fixtures/energy-plaque-fictive.png'));
let n=0;const ok=s=>console.log('PASS '+(++n)+' '+s);
function key(tag){const v=crypto.createHash('sha256').update('energy-mvp02a2/'+tag).digest('hex');return v.slice(0,8)+'-'+v.slice(8,12)+'-4'+v.slice(13,16)+'-8'+v.slice(17,20)+'-'+v.slice(20,32);}
async function req(method,uri,{cookie,body,origin=ORIGIN,mime='application/json',idempotency}={}){
 const headers={Accept:'application/json',Origin:origin};if(cookie)headers.Cookie=cookie;
 if(body!==undefined)headers['Content-Type']=mime;if(idempotency)headers['Idempotency-Key']=idempotency;
 const r=await fetch(BASE+uri,{method,headers,body:body===undefined?undefined:Buffer.isBuffer(body)?body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
 return {status:r.status,data:await r.json().catch(()=>({})),headers:r.headers};
}
async function main(){
 const Q='?tenant='+TENANT,labels='/api/energy/labels',p='/api/energy/passports';
 const anon=await req('GET',labels+'/11111111-1111-4111-8111-111111111111'+Q);assert.equal(anon.status,401);ok('Sans cookie Core : 401');
 const cookies=[];for(const account of C.accounts){const r=await req('POST','/api/auth/login',{body:account});assert.equal(r.status,200);cookies.push(r.headers.get('set-cookie').split(';')[0]);}
 ok('Comptes A/B authentifiés par Core réel');
 const sites=await req('GET','/api/energy/inventory/sites'+Q,{cookie:cookies[0]});assert.equal(sites.status,200);
 const site=sites.data.sites?.[0]?.id;assert.ok(site);const detail=await req('GET','/api/energy/inventory/sites/'+site+Q,{cookie:cookies[0]});assert.equal(detail.status,200);
 const zone=detail.data.zones?.[0]?.id;assert.ok(zone);ok('Site et zone déjà autorisés du compte A');
 const record={zoneId:zone,nom:'Plaque fictive MVP02A2',famille:'FROID',quantite:1,puissanceUnitaireW:null};
 const eq=await req('POST','/api/energy/inventory/sites/'+site+'/equipements'+Q,{cookie:cookies[0],body:record,idempotency:key(site+'/equipment')});
 assert.ok([200,201].includes(eq.status));const eqId=eq.data.id;assert.ok(eqId);ok('Ligne équipement synthétique idempotente');
 const passport=await req('POST',p+'/sites/'+site+'/equipements/'+eqId+Q,{cookie:cookies[0],body:{numeroIndividuel:1}});
 assert.ok([200,201].includes(passport.status));const id=passport.data.id;assert.ok(id);ok('Passeport synthétique lié à A');
 const get=await req('GET',p+'/'+id+Q,{cookie:cookies[0]});assert.equal(get.status,200);
 let photoId=(get.data.photos||[]).find(x=>x.type==='ETIQUETTE')?.id;
 if(!photoId){const photo=await req('POST',p+'/'+id+'/photos/ETIQUETTE'+Q,{cookie:cookies[0],body:fixture,mime:'application/octet-stream'});
  assert.equal(photo.status,201,'UPLOAD_SYNTHETIQUE_'+photo.status);photoId=photo.data.photoId;}
 assert.ok(photoId);ok('Photo étiquette fictive enregistrée ou retrouvée');
 const bad=await req('POST',labels+'/'+id+'/analyser'+Q,{cookie:cookies[0],origin:'https://attacker.invalid',body:{photoId}});
 assert.equal(bad.status,403);ok('Origine tierce refusée pour OCR');
 const B=await req('POST',labels+'/'+id+'/analyser'+Q,{cookie:cookies[1],body:{photoId}});
 assert.equal(B.status,404);ok('Compte B ne peut ni lire ni analyser photo A');
 const a=await req('POST',labels+'/'+id+'/analyser'+Q,{cookie:cookies[0],body:{photoId}});
 assert.equal(a.status,200,'OCR_LOCAL_HTTP_'+a.status+'_'+a.data.statut);
 assert.equal(a.data.statut,'PROPOSITIONS_A_CONFIRMER','OCR_FICTIF_SANS_PROPOSITION');
 assert.ok(Object.keys(a.data.propositions||{}).length>0);assert.ok(a.data.analyseId);ok('OCR Mac local propose des valeurs sans les valider');
 const valeurs=Object.entries(a.data.propositions).map(([champ,valeur])=>({champ,valeur}));
 const confirm=await req('POST',labels+'/'+id+'/confirmer'+Q,{cookie:cookies[0],body:{analyseId:a.data.analyseId,valeurs}});
 assert.equal(confirm.status,200);assert.equal(confirm.data.verification,'NON_CERTIFIE');ok('Confirmation volontaire historisée');
 const replay=await req('POST',labels+'/'+id+'/confirmer'+Q,{cookie:cookies[0],body:{analyseId:a.data.analyseId,valeurs}});
 assert.equal(replay.status,409);ok('Une proposition OCR ne peut être confirmée deux fois');
 const latest=await req('GET',labels+'/'+id+Q,{cookie:cookies[0]});assert.equal(latest.status,200);
 for(const x of valeurs){assert.ok(latest.data.valeurs.some(v=>v.champ===x.champ&&v.valeur===x.valeur&&v.provenance==='OCR_CONFIRME_PAR_UTILISATEUR'));}
 ok('Provenance OCR confirmée et relue');
 const corr=await req('POST',labels+'/'+id+'/confirmer'+Q,{cookie:cookies[0],body:{analyseId:null,valeurs:[{champ:'MARQUE',valeur:'TESTLAB2'}]}});
 assert.equal(corr.status,200);ok('Correction manuelle explicite');
 const r2=await req('GET',labels+'/'+id+Q,{cookie:cookies[0]});assert.equal(r2.status,200);
 const brand=r2.data.valeurs.find(v=>v.champ==='MARQUE');assert.equal(brand.valeur,'TESTLAB2');assert.equal(brand.provenance,'SAISIE_MANUELLE');ok('Dernière révision et provenance manuelle');
 const denied=await req('GET',labels+'/'+id+Q,{cookie:cookies[1]});assert.equal(denied.status,404);ok('Compte B ne lit pas les caractéristiques A');
 const otherTenant=await req('GET',labels+'/'+id+'?tenant=AMBVIS_96C7FBBEA383DD',{cookie:cookies[0]});assert.equal(otherTenant.status,403);ok('Tenant Ambassade sans droit');
 await req('POST','/api/auth/logout',{cookie:cookies[0]});const revoked=await req('GET',labels+'/'+id+Q,{cookie:cookies[0]});assert.equal(revoked.status,401);ok('Révocation de session Core');
 console.log('ENERGY_MVP02A2_E2E_CORE_OCR_PASS='+n);console.log('DONNEES=PLAQUE_PUREMENT_SYNTHETIQUE_AUCUNE_SOURCE_PRIVEE_PARTAGEE');
}
main().catch(e=>{console.error('MVP02A2_E2E_ECHEC='+String(e.message||e));process.exitCode=1;});
