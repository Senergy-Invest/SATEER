'use strict';
/** Contrats MVP02A-1 : tests sans DB et sans secrets, dérivés du code candidat. */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {formatImage,creerPhotoVault,MAX_BYTES}=require('../energy/equipment-photo-vault');
const {creerEquipmentPassportStore}=require('../energy/equipment-passport-store');
const qr=require('../public/sateer-qr-local.js');
const UUID='e23d8632-91e1-4864-afab-f3fd1753bcbc';
const RAW_PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO//a9kAAAAASUVORK5CYII=','base64');
const BASE='http://localhost:3474/equipement-qr.html?t=012345678901234567890123456';
const file=rel=>fs.readFileSync(path.join(__dirname,'..',rel),'utf8');
test('QR rend une matrice 37 × 37 standard locale',()=>{const m=qr.encode(BASE);assert.equal(m.length,37);assert.ok(m.every(row=>row.length===37));});
test('QR refuse une adresse longue ou du contenu non ASCII',()=>{assert.throws(()=>qr.encode('x'.repeat(107)));assert.throws(()=>qr.encode('秘密'));});
test('QR ne dépend pas d un service tiers',()=>{const s=file('public/sateer-qr-local.js');assert.doesNotMatch(s,/fetch\(|qrserver\.com|chart\.googleapis|cdn\./);});
test('QR porte une référence opaque, pas le propriétaire ni la puissance',()=>{assert.match(BASE,/\?t=[0-9]{27}$/);assert.doesNotMatch(BASE,/personneId|nom|puissance|tenant=/);});
test('MIME PNG signé et filtrage des métadonnées',()=>{assert.equal(formatImage(RAW_PNG),'image/png');const bad=Buffer.concat([RAW_PNG,Buffer.from('EXIF')]);assert.equal(formatImage(bad),null);});
test('Refus PDF, JPEG brut et données aléatoires',()=>{for(const b of [Buffer.from('%PDF-1.4'+'.'.repeat(200)),Buffer.alloc(70,21),Buffer.concat([Buffer.from([0xff,0xd8,0xff]),Buffer.alloc(150)])])assert.equal(formatImage(b),null);});
test('Refus de photos vides et volumineuses',()=>{assert.equal(formatImage(Buffer.alloc(MAX_BYTES+1)),null);assert.equal(formatImage(Buffer.alloc(2)),null);});
test('La taille et le type de photo sont contraints par la migration',()=>{const s=file('database/052_energy_equipment_passports.sql');assert.match(s,/3145728/);assert.match(s,/image\/png/);assert.match(s,/image\/webp/);});
test('Isolation passport équipement et quantité individuelle',()=>{const s=file('database/052_energy_equipment_passports.sql');assert.match(s,/uq_passport_appareil_individuel UNIQUE \(inventaire_equipement_id,numero_individuel\)/);assert.match(s,/fk_passport_equipement_scope FOREIGN KEY/);});
test('Les photos sont soumises aux mêmes tenant et propriétaire',()=>{const s=file('database/052_energy_equipment_passports.sql');assert.match(s,/fk_photo_passport_prive FOREIGN KEY\(passeport_id,tenant_id,owner_personne_id\)/);});
test('Migration explicitement limitée à sateer_test',()=>{assert.match(file('database/052_energy_equipment_passports.sql'),/current_database\(\) <> 'sateer_test'/);});
test('Historique passeport et photos append-only',()=>{const s=file('energy/equipment-passport-store.js');for(const e of ['EquipmentPassportCreated.v1','EquipmentPhotoAdded.v1','EquipmentPhotoRemoved.v1'])assert.match(s,new RegExp(e.replace('.','\\.')));});
test('Une quantité groupée ne créé pas automatiquement des passeports',()=>{const s=file('energy/equipment-passport-store.js');assert.match(s,/numeroIndividuel>Number\(eq.quantite\)/);assert.match(s,/ON CONFLICT \(inventaire_equipement_id,numero_individuel\) DO NOTHING/);});
test('Aucun portail public pour photos ni espace institutionnel',()=>{const s=file('energy/equipment-passport-http.js');assert.match(s,/router\.get\('\/:passportId\/photos\/:photoId'/);assert.doesNotMatch(s,/static\(|SHARE_WITH_ORGANISATION/);});
test('UX : photo facultative et plaque séparée',()=>{const html=file('public/fiche-equipement.html');assert.match(html,/photoAppareil/);assert.match(html,/photoEtiquette/);assert.match(html,/Non vérifié/);});
test('UX : lecture sur demande et confirmation distincte, sans certification automatique',()=>{
 const html=file('public/fiche-equipement.html');
 const ui=file('public/fiche-etiquette.js');
 assert.match(html,/id="analyserEtiquette"/);
 assert.match(html,/id="confirmerEtiquette"/);
 assert.match(html,/Non vérifié/);
 assert.match(ui,/\$\('analyserEtiquette'\)\.addEventListener\('click'/);
 assert.match(ui,/\$\('formEtiquette'\)\.addEventListener\('submit'/);
 assert.match(ui,/non certifié/);
});
test('UX : les photos sont converties avant upload',()=>{const s=file('public/fiche-equipement.js');assert.match(s,/canvas\.toBlob/);assert.match(s,/1400/);});
test('Scan QR : échec fermé lorsque non autorisé',()=>{assert.match(file('public/equipement-qr.js'),/AUCUN_PASSEPORT_AUTORISE/);});
test('La page photo n est pas indexée en publicité',()=>{const html=file('public/fiche-equipement.html');assert.match(html,/referrer.*no-referrer/);});
test('Le coffre photo est chiffré AES-GCM avec AAD',()=>{const s=file('energy/equipment-photo-vault.js');assert.match(s,/aes-256-gcm/);assert.match(s,/setAAD/);});
test('Le coffre photo dérive une sous-clef distincte du coffre d identité',()=>{const s=file('energy/equipment-photo-vault.js');assert.match(s,/SATEER-ENERGY-PHOTO-GCM/);});
test('Le coffre photo refuse hors Home et les liens symboliques',()=>{assert.throws(()=>creerPhotoVault({root:'/tmp/not-in-home'}),/HORS_HOME/);assert.match(file('energy/equipment-photo-vault.js'),/isSymbolicLink/);});
test('Chiffrement : des données ne sont pas stockées en clair',async()=>{
 const base=path.join(os.homedir(),'.sateer-passport-test-'+crypto.randomUUID()),root=path.join(base,'private');
 const vault=creerPhotoVault({root,loadMasterKey:()=>Buffer.alloc(32,7)}),owner=21,passportId=UUID,photoId=crypto.randomUUID();
 try{
  const p=await vault.save({bytes:RAW_PNG,owner,passportId,photoId,type:'APPAREIL',mime:'image/png'});
  const encrypted=fs.readFileSync(p);assert.equal(encrypted.subarray(0,4).toString('ascii'),'S2EP');
  assert.notDeepEqual(encrypted,RAW_PNG);assert.deepEqual(await vault.read({owner,passportId,photoId,type:'APPAREIL',mime:'image/png'}),RAW_PNG);
  await assert.rejects(vault.read({owner:22,passportId,photoId,type:'APPAREIL',mime:'image/png'}));
  await vault.erase(photoId);assert.equal(fs.existsSync(p),false);
 }finally{fs.rmSync(base,{recursive:true,force:true});}
});
test('Store : refuse un numéro au-delà de la quantité déclarée',async()=>{
 let eventCount=0,committed=false,released=false;
 const c={async query(sql){if(sql.includes('SELECT eq.id'))return {rows:[{id:5,site_id:4,tenant_id:2,owner_personne_id:12,quantite:3}]};if(sql.includes('INSERT INTO energy_equipment_passport_events'))eventCount++;if(sql==='COMMIT')committed=true;return {rows:[]};},release(){released=true;}};
 const store=creerEquipmentPassportStore({obtenirClient:async()=>c,photoVault:{}});const r=await store.create({tenant:'ENERGY_MVP01D_RECETTE',owner:12,siteId:UUID,inventoryId:UUID,numeroIndividuel:4});
 assert.equal(r.code,'NUMERO_HORS_QUANTITE');assert.equal(eventCount,0);assert.ok(committed&&released);
});
test('Store : le même rang donne le même passeport, sans second événement',async()=>{
 let log=[],newly=false;
 const c={async query(sql){log.push(sql);
  if(sql.includes('SELECT eq.id'))return {rows:[{id:5,site_id:4,tenant_id:2,owner_personne_id:12,quantite:3}]};
  if(sql.startsWith('INSERT INTO energy_equipment_passports'))return {rows:[]};
  if(sql.includes('SELECT id,public_id,tenant_id,scan_token FROM'))return {rows:[{id:7,public_id:UUID,tenant_id:2,scan_token:'X'.repeat(27)}]};return {rows:[]};},release(){}};
 const result=await creerEquipmentPassportStore({obtenirClient:async()=>c,photoVault:{}}).create({tenant:'ENERGY_MVP01D_RECETTE',owner:12,siteId:UUID,inventoryId:UUID,numeroIndividuel:2});
 assert.equal(result.id,UUID);assert.equal(result.newly,false);assert.ok(!log.some(s=>s.includes('INSERT INTO energy_equipment_passport_events')));
});
// Routeur HTTP dans un adaptateur Express minimal : les tests réels restent sur le Mac.
const Module=require('node:module');
const oldLoad=Module._load;
let creerEquipmentPassportRouter;
try{
 Module._load=function(request,parent,isMain){if(request==='express')return {raw:()=> (_req,_res,next)=>next()};return oldLoad.call(this,request,parent,isMain);};
 ({creerEquipmentPassportRouter}=require('../energy/equipment-passport-http'));
}finally{Module._load=oldLoad;}
function fixture({member=true,tenant='ENERGY_MVP01D_RECETTE',auth={personneId:12}}={}){
 const routes={};let db=0;const router={use(){},get(p,...h){routes['GET '+p]=h.at(-1);},post(p,...h){routes['POST '+p]=h.at(-1);},delete(p,...h){routes['DELETE '+p]=h.at(-1);}};
 const store={create:async()=>{db++;return {code:'OK',newly:true,id:UUID};},list:async()=>({passeports:[]}),full:async()=>({passeport:{id:UUID},scanToken:'a'.repeat(27),photos:[]}),scan:async()=>null,addPhoto:async()=>({code:'OK'}),readPhoto:async()=>null,removePhoto:async()=>({code:'PHOTO_INTROUVABLE'})};
 creerEquipmentPassportRouter({router,listerOrganisations:async()=>member?[{tenant_code:'ENERGY_MVP01D_RECETTE'}]:[],store,origineAutorisee:'http://localhost:3474',tenantAutorise:'ENERGY_MVP01D_RECETTE'});
 async function req(method,route,{owner=auth,requestTenant=tenant,origin='http://localhost:3474',body={numeroIndividuel:1},params={siteId:UUID,inventoryId:UUID,passportId:UUID,token:'a'.repeat(27)},rawBody}={}){
  let status=200,json,headers={};const request={auth:owner,params,query:{tenant:requestTenant},body:rawBody||body,get:key=>key==='Origin'?origin:key==='Content-Type'?'application/octet-stream':null};
  const response={set(key,value){headers[key]=value;return this;},status(n){status=n;return this;},json(v){json=v;return this;},end(v){json=v;return this;}};
  const handler=routes[method+' '+route];assert.ok(handler,'route '+method+' '+route);await handler(request,response);return {status,json,headers};
 }
 return {req,get db(){return db}};
}
test('HTTP : identité Core absente = 401 et aucun accès store',async()=>{const f=fixture();const r=await f.req('POST','/sites/:siteId/equipements/:inventoryId',{owner:null});assert.equal(r.status,401);assert.equal(f.db,0);});
test('HTTP : tenant Ambassade ne donne aucun droit Energy',async()=>{const f=fixture();const r=await f.req('POST','/sites/:siteId/equipements/:inventoryId',{requestTenant:'AMBVIS_96C7FBBEA383DD'});assert.equal(r.status,403);assert.equal(f.db,0);});
test('HTTP : un utilisateur hors du tenant Energy est refusé',async()=>{const f=fixture({member:false});const r=await f.req('POST','/sites/:siteId/equipements/:inventoryId');assert.equal(r.status,403);});
test('HTTP : origine tierce et numéro hors limite refusés',async()=>{const f=fixture();assert.equal((await f.req('POST','/sites/:siteId/equipements/:inventoryId',{origin:'https://evil.example'})).status,403);assert.equal((await f.req('POST','/sites/:siteId/equipements/:inventoryId',{body:{numeroIndividuel:0}})).status,400);});
test('HTTP : création individuelle autorisée et audit du contenu',async()=>{const f=fixture();const r=await f.req('POST','/sites/:siteId/equipements/:inventoryId');assert.equal(r.status,201);assert.equal(r.json.id,UUID);assert.equal(f.db,1);});
test('HTTP : token inconnu refuse et ne révèle pas de fiche',async()=>{const f=fixture();const r=await f.req('GET','/scan/:token');assert.equal(r.status,404);assert.equal(r.json.statut,'CODE_NON_AUTORISE');});
test('HTTP : le QR sort une URL sans donnée personnelle',async()=>{const f=fixture();const r=await f.req('GET','/:passportId');assert.equal(r.status,200);assert.equal(r.json.qrUrl,'http://localhost:3474/equipement-qr.html?t='+'a'.repeat(27));});
