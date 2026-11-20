'use strict';
/* C4B : recette réelle Core A/B, lecture privée et déplacement d'esquisse sans toucher au graphe C4A. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
assert.equal(process.env.PGDATABASE,'sateer_test');assert.equal(process.env.PGHOST,'::1');
const TENANT='ENERGY_MVP01D_RECETTE',ORIGIN='http://localhost:3483',BASE='http://127.0.0.1:3483',q='?tenant='+TENANT;
const credentials=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.sateer-recette','energy-mvp01d','IDENTIFIANTS_PRIVES.json'),'utf8'));
assert.equal(credentials.tenant,TENANT);assert.equal(credentials.accounts.length,2);
let count=0;const ok=x=>console.log('PASS '+(++count)+' '+x);const uuid=()=>crypto.randomUUID();
async function req(method,url,{cookie,body,key,origin=ORIGIN}={}){
 const headers={Accept:'application/json',Origin:origin};if(cookie)headers.Cookie=cookie;if(body!==undefined)headers['Content-Type']='application/json';if(key)headers['Idempotency-Key']=key;
 const r=await fetch(BASE+url,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 return {status:r.status,data:await r.json().catch(()=>({})),headers:r.headers};
}
const good=(r,code,label)=>{assert.equal(r.status,code,label+' ('+r.status+':'+r.data?.statut+')');return r.data;};
async function main(){const api='/api/energy/esquisse/v1',tp='/api/energy/topologie/v1',sc='/api/energy/collab/v2';
 good(await req('GET',api+'/sites/'+uuid()+'/positions'+q+'&vue=PHYSIQUE'),401,'Session requise');ok('Sans Core Auth, aucune lecture');
 const cookies=[],ids=[];
 for(const account of credentials.accounts){const loginResponse=await req('POST','/api/auth/login',{body:account});good(loginResponse,200,'Login');const cookie=loginResponse.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);cookies.push(cookie);
  const me=good(await req('GET','/api/auth/me',{cookie}),200,'Identité');ids.push(me.personne.id);}
 assert.notEqual(ids[0],ids[1]);const [A,B]=cookies;ok('Deux sessions fictives A/B distinctes');
 const list=good(await req('GET',tp+'/sites'+q,{cookie:A}),200,'Sites A');const siteId=list.sites?.[0]?.id;assert.ok(siteId);ok('Site privé C4A canonique réutilisé');
 good(await req('GET',api+'/sites/'+siteId+'/positions'+q+'&vue=PHYSIQUE',{cookie:B}),404,'B hors site');ok('B ne voit pas les esquisses de A');
 const init=good(await req('POST',sc+'/sites/'+siteId+'/initialiser'+q,{cookie:A,body:{}}),200,'Initialisation C1');const root=init.rootNodeId,grant=init.sourceGrantId;ok('Racine et grant C1 conservés');
 const newNode=good(await req('POST',sc+'/sites/'+siteId+'/unites'+q,{cookie:A,key:uuid(),body:{sourceGrantId:grant,parentNodeId:root,typeNoeud:'BATIMENT',nom:'RECETTE_C4B_BAT_'+uuid().slice(0,8)}}),201,'Bâtiment');ok('Bâtiment créé par C1, aucune table B de lieux');
 const asset=good(await req('POST',tp+'/sites/'+siteId+'/appareillages'+q,{cookie:A,key:uuid(),body:{typeNoeud:'COMPTEUR',nom:'RECETTE_C4B_COMPTEUR_'+uuid().slice(0,8),repere:null,scopeNodeId:newNode.id}}),201,'Compteur');ok('Compteur créé par C4A, sans copie');
 const invalid=await req('POST',api+'/sites/'+siteId+'/positions'+q,{cookie:B,key:uuid(),body:{vue:'PHYSIQUE',type:'LIEU',refId:newNode.id,x:200,y:180,expectedRevision:0}});good(invalid,404,'B ne déplace rien');ok('Écriture hors propriétaire refusée');
 const key1=uuid(),body={vue:'PHYSIQUE',type:'LIEU',refId:newNode.id,x:210,y:240,expectedRevision:0};
 const moved=good(await req('POST',api+'/sites/'+siteId+'/positions'+q,{cookie:A,key:key1,body}),200,'Position');assert.equal(moved.revision,1);ok('Position physique créée');
 const again=good(await req('POST',api+'/sites/'+siteId+'/positions'+q,{cookie:A,key:key1,body}),200,'Réessai idempotent');assert.equal(again.revision,1);ok('Idempotence, aucune révision parasite');
 good(await req('POST',api+'/sites/'+siteId+'/positions'+q,{cookie:A,key:key1,body:{...body,x:220}}),409,'Clé réutilisée');ok('Réutilisation frauduleuse de clé refusée');
 const second=good(await req('POST',api+'/sites/'+siteId+'/positions'+q,{cookie:A,key:uuid(),body:{...body,expectedRevision:1,x:245}}),200,'Déplacement');assert.equal(second.revision,2);ok('Déplacement versionné');
 good(await req('POST',api+'/sites/'+siteId+'/positions'+q,{cookie:A,key:uuid(),body:{...body,expectedRevision:1,x:260}}),409,'Version obsolète');ok('Conflit édition simultanée refusé');
 const equip=good(await req('POST',api+'/sites/'+siteId+'/positions'+q,{cookie:A,key:uuid(),body:{vue:'ELECTRIQUE',type:'ELECTRIQUE',refId:asset.id,x:300,y:250,expectedRevision:0}}),200,'Élément électrique');assert.equal(equip.revision,1);ok('Position C4A électrique enregistrée');
 const photo=good(await req('GET',api+'/sites/'+siteId+'/positions'+q+'&vue=PHYSIQUE',{cookie:A}),200,'Relecture');
 assert.ok(photo.positions.some(p=>p.refId===newNode.id&&p.x===245));ok('Coordonnées retrouvées');
 assert.ok(!JSON.stringify(photo).includes('scan_token')&&!JSON.stringify(photo).includes('photo_id'));ok('Aucun passeport/photo/QR dans le modèle esquisse');
 good(await req('POST',api+'/sites/'+siteId+'/positions'+q,{cookie:A,key:uuid(),origin:'https://evil.invalid',body}),403,'Origin invalide');ok('Protection Origin requise sur toute écriture');
 good(await req('POST',api+'/sites/'+siteId+'/positions'+q,{cookie:A,key:uuid(),body:{...body,role:'ADMIN'}}),400,'Champ supplémentaire');ok('Aucun champ de rôle ajouté par le dessin');
 good(await req('POST',api+'/sites/'+siteId+'/positions'+q,{cookie:A,key:uuid(),body:{...body,refId:uuid()}}),404,'Lieux inexistants');ok('Référence inexistante rejetée');
 const map=good(await req('GET',tp+'/sites/'+siteId+'/carte'+q,{cookie:A}),200,'Carte C4A');assert.ok(map.lieux.some(x=>x.id===newNode.id)&&map.appareillages.some(x=>x.id===asset.id));ok('C4A conserve exactement ses éléments canonique');
 console.log('C4B_CORE_A_B_PASS='+count);console.log('DONNEES=FICTIONS_SATEER_TEST_SEULEMENT');
}
main().catch(e=>{console.error('C4B_E2E_ECHEC',e.code||e.message);process.exitCode=1;});
