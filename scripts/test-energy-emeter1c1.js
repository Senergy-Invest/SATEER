'use strict';
/** E-METER-1C1 : domaine, frontieres HTTP, SQL, projections et contrat de passation. */
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
const {rectification,normaliserMotif,equivalentes}=require('../energy/energy-billing-revision-domain');
const {creerEnergyBillingRevisionRouter}=require('../energy/energy-billing-revision-http');
const {creerEnergyBillingRevisionStore}=require('../energy/energy-billing-revision-store');
const TENANT='ENERGY_MVP01D_RECETTE',ORIGIN='http://localhost:3491',SITE=crypto.randomUUID(),BILL=crypto.randomUUID();
const NOW=Date.UTC(2026,10,21,12);
const facture={nature:'FACTURE',energie:'ELECTRICITE',dateDocument:'2026-11-12',periodeDebut:'2026-10-01',periodeFin:'2026-10-31',devise:'XOF',montant:'1000',pointId:null,meterId:null,referenceDocument:'FCT-001',referenceJustificatif:null};
const body={motif:'Correction du montant saisi par erreur',valeurs:facture};
const valid=o=>rectification(o,NOW);
for(const [label,o] of [
 ['facture correcte',body],['motif coupe espaces',{...body,motif:'   Correction d une date erronée  '}],
 ['montant 0',{...body,valeurs:{...facture,montant:'0'}}],['montant decimal exact',{...body,valeurs:{...facture,montant:'000002.5'}}],
 ['recharge site seul',{...body,valeurs:{nature:'RECHARGE',energie:'EAU',dateDocument:'2026-11-12',devise:'EUR',montant:'15'}}],
 ['sans compteur',{...body,valeurs:{...facture,meterId:null}}],
 ['energie gaz',{...body,valeurs:{...facture,energie:'GAZ'}}],
 ['date annee 2024',{...body,valeurs:{...facture,dateDocument:'2024-01-31',periodeDebut:'2024-01-01',periodeFin:'2024-01-30'}}],
 ['reference sans fichier',{...body,valeurs:{...facture,referenceJustificatif:'Dossier papier 21'}}]
])test('E-METER1C1 accepte '+label,()=>assert.ok(valid(o)));
for(const [label,o] of [
 ['motif absent',{valeurs:facture}],['motif vide',{...body,motif:''}],['motif court',{...body,motif:'trop court'}],
 ['motif trop long',{...body,motif:'x'.repeat(401)}],['motif ligne',{...body,motif:'Correction\nincorrecte'}],
 ['motif objet',{...body,motif:{text:'correction autorisee'}}],['valeurs absentes',{motif:body.motif}],
 ['valeurs nulles',{...body,valeurs:null}],['montant JS Number',{...body,valeurs:{...facture,montant:1200.5}}],
 ['date invalide',{...body,valeurs:{...facture,dateDocument:'2026-02-30'}}],
 ['montant negatif',{...body,valeurs:{...facture,montant:'-1'}}],
 ['periode absente',{...body,valeurs:{...facture,periodeDebut:null}}],
 ['devise invalide',{...body,valeurs:{...facture,devise:'Euros'}}],
 ['identite injectee',{...body,valeurs:{...facture,ownerId:777}}],
 ['champ fichier',{...body,valeurs:{...facture,fichierPDF:'secret'}}],
 ['champ commande',{...body,instruction:'effacer tout'}],['tableau',[]],['null',null]
])test('E-METER1C1 refuse '+label,()=>assert.equal(valid(o),null));
test('motif normalise avec longueur obligatoire',()=>assert.equal(normaliserMotif('    Corriger le montant initial    '),'Corriger le montant initial'));
test('valeurs identiques avec normalization decimale',()=>{
 const a={...facture,montant:'1000.00'};assert.equal(equivalentes(a,valid(body).valeurs),true);
});
test('deux montants reels differents',()=>assert.equal(equivalentes(facture,{...facture,montant:'1200'}),false));
test('valeurs canonique finalisees',()=>{
 const x=valid(body);assert.equal(x.valeurs.montant,'1000.00');assert.equal(x.motif,body.motif);
});
test('store client obligatoire',()=>assert.throws(()=>creerEnergyBillingRevisionStore({}),/CLIENT_PG_REQUIS/));
test('migration versionnee, FKs composites, immutable, garde base/cluster',()=>{
 const sql=fs.readFileSync(path.join(__dirname,'../database/064_energy_billing_rectifications.sql'),'utf8');
 for(const word of ['7699611241381229531','sateer_test','fk_billing_revision_original','fk_billing_revision_corrected',
  'fk_billing_revision_site','uq_billing_revision_sequence','uq_billing_revision_target',
  'uq_billing_revision_idempotence','tr_billing_revision_immutable','tr_billing_revision_root',
  'E_BILLING_REVISION_CIBLE_NON_CONFORME'])assert.ok(sql.includes(word),word);
});
test('aucun endpoint de modification ou suppression pour les declarations',()=>{
 const txt=fs.readFileSync(path.join(__dirname,'../energy/energy-billing-revision-http.js'),'utf8');
 assert.doesNotMatch(txt,/router\.(?:put|patch|delete)\s*\(/i);
});
test('codes Energy locaux et aucune facture reelle',()=>{
 const txt=fs.readFileSync(path.join(__dirname,'../energy/energy-billing-revision-store.js'),'utf8');
 assert.match(txt,/E_BILLING|energy_billing/);assert.doesNotMatch(txt,/(paymentGateway|stripe|paypal|senelec\.sn)/i);
});
test('vue et UI sans injection HTML et sans calcul de consommation',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../public/energie-rectifications.html'),'utf8');
 const js=fs.readFileSync(path.join(__dirname,'../public/energie-rectifications.js'),'utf8');
 assert.match(html,/Motif obligatoire/);assert.match(html,/Justificatifs/);
 assert.doesNotMatch(js,/innerHTML|outerHTML|insertAdjacentHTML|eval\s*\(/);
 assert.doesNotMatch(js,/kWh\s*[+-]|calculerConsommation|calculerTarif/i);
});
test('lien 1B1 vers rectifications dans la navigation',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../public/energie-factures.html'),'utf8');
 const js=fs.readFileSync(path.join(__dirname,'../public/energie-factures.js'),'utf8');
 assert.match(html,/id="versRectifications"/);assert.match(js,/versRectifications/);
});
function fixture(){
 const handlers=new Map(),calls=[];
 const router={use(){},get(k,fn){handlers.set('GET '+k,fn);},post(k,fn){handlers.set('POST '+k,fn);}};
 const store={get:async a=>{calls.push(['get',a]);return {original:{},actuel:{},revisions:[],calculsDisponibles:false};},
  lister:async a=>{calls.push(['lister',a]);return {declarations:[],suivant:false,calculsDisponibles:false};},
  creer:async a=>{calls.push(['creer',a]);return {code:'OK',nouveau:true,id:crypto.randomUUID(),revision:1};}};
 const listerOrganisations=async(actor,tenant)=>actor===8?[{tenant_code:tenant}]:[];
 creerEnergyBillingRevisionRouter({router,listerOrganisations,store,origineAutorisee:ORIGIN,tenantAutorise:TENANT});
 function res(){return {code:200,body:null,headers:{},set(k,v){this.headers[k]=v;return this;},status(n){this.code=n;return this;},json(v){this.body=v;return this;}};}
 const detail='/sites/:siteId/declarations/:declarationId/rectifications',list='/sites/:siteId/rectifications';
 async function ask(method,route,{actor=8,tenant=TENANT,siteId=SITE,declarationId=BILL,origin=ORIGIN,
   key=crypto.randomUUID(),payload=body,offset=0}={}){
  const req={auth:{personneId:actor},query:{tenant,offset},params:{siteId,declarationId},method,body:payload,
   get(k){return k==='Origin'?origin:k==='Idempotency-Key'?key:null;}};
  const r=res();await handlers.get(method+' '+route)(req,r);return r;
 }
 return {ask,calls,detail,list};
}
for(const [name,args,status] of [
 ['sans session',{actor:null},401],['autre acteur',{actor:9},403],['tenant inexistant',{tenant:'FOREIGN_TENANT'},403],
 ['tenant mal forme',{tenant:'lower'},400],['site mal forme',{siteId:'NON'},400],
 ['declaration mal formee',{declarationId:'n/a'},400],['origine hostile',{origin:'https://intrus.invalid'},403],
 ['origine absente',{origin:null},403],['cle manquante',{key:null},400],
 ['corps proprietaire injecte',{payload:{...body,ownerPersonneId:123}},400],
 ['montant Number',{payload:{motif:body.motif,valeurs:{...facture,montant:10}}},400],
 ['absence motif',{payload:{valeurs:facture}},400]
])test('HTTP POST refuse '+name,async()=>{
 const {ask,calls,detail}=fixture();const r=await ask('POST',detail,args);assert.equal(r.code,status);assert.equal(calls.length,0);
});
test('HTTP accepte la creation privee correctement filtree',async()=>{
 const {ask,calls,detail}=fixture();const r=await ask('POST',detail);
 assert.equal(r.code,201);assert.equal(r.body.statut,'RECTIFICATION_DECLAREE_NON_VERIFIEE');
 assert.equal(calls[0][1].data.valeurs.montant,'1000.00');
});
test('HTTP accepte GET historique dans la portee Core',async()=>{
 const {ask,calls,detail}=fixture();const r=await ask('GET',detail);
 assert.equal(r.code,200);assert.equal(r.body.calculsDisponibles,false);assert.equal(calls[0][0],'get');
});
test('HTTP accepte GET liste sans doublons',async()=>{
 const {ask,calls,list}=fixture();const r=await ask('GET',list);assert.equal(r.code,200);assert.equal(calls[0][0],'lister');
});
test('HTTP GET liste refuse offset negatif',async()=>{
 const {ask,calls,list}=fixture();const r=await ask('GET',list,{offset:-1});assert.equal(r.code,400);assert.equal(calls.length,0);
});
test('HTTP GET liste refuse offset trop grand',async()=>{
 const {ask,calls,list}=fixture();const r=await ask('GET',list,{offset:10001});assert.equal(r.code,400);assert.equal(calls.length,0);
});
test('HTTP GET liste refuse session absente',async()=>{
 const {ask,calls,list}=fixture();const r=await ask('GET',list,{actor:null});assert.equal(r.code,401);assert.equal(calls.length,0);
});
test('HTTP GET historique refuse tenant adverse',async()=>{
 const {ask,calls,detail}=fixture();const r=await ask('GET',detail,{tenant:'AUTRE'});assert.equal(r.code,403);assert.equal(calls.length,0);
});
test('HTTP ne publie jamais les pieces existantes automatiquement',()=>{
 const txt=fs.readFileSync(path.join(__dirname,'../energy/energy-billing-revision-store.js'),'utf8');
 assert.match(txt,/piecesTransfereesAutomatiquement:false/);
});
function fakeDatabase({prior=false,same=false,foreign=false}={}){
 const requests=[],uuid=crypto.randomUUID();
 const root={id:BILL,nature:'FACTURE',energie:'ELECTRICITE',date_document:'2026-11-12',
  periode_debut:'2026-10-01',periode_fin:'2026-10-31',devise:'XOF',montant:same?'1000.00':'900.00',
  point_id:null,meter_id:null,reference_document:'FCT-001',reference_justificatif:null};
 const c={release(){requests.push(['RELEASE']);},async query(sql,args=[]){requests.push([sql,args]);
  if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK')return {rows:[]};
  if(sql.includes('FROM energy_inventory_sites s JOIN tenants t'))return {rows:foreign?[]:[{id:5,tenant_id:3,owner_personne_id:8,public_id:SITE,nom:'Site A'}]};
  if(sql.includes('FROM energy_billing_declarations d')&&sql.includes('LIMIT 1'))return {rows:[root]};
  if(sql.includes('SELECT 1 FROM energy_billing_rectifications'))return {rows:[]};
  if(sql.includes('SELECT id,corrected_declaration_id,revision,content_hash'))return {rows:prior?[{
   id:uuid,corrected_declaration_id:uuid,revision:1,content_hash:crypto.createHash('sha256').update(JSON.stringify(valid(body))).digest('hex')
  }]:[]};
  if(sql.includes('FROM energy_billing_rectifications r')&&sql.includes('ORDER BY r.revision ASC'))return {rows:[]};
  if(sql.includes('INSERT INTO energy_billing_declarations'))return {rows:[{id:args[0]}]};
  if(sql.includes('INSERT INTO energy_billing_events'))return {rows:[]};
  if(sql.includes('INSERT INTO energy_billing_rectifications'))return {rows:[]};
  throw Error('SQL_INCONNU '+sql.slice(0,110));
 }};
 return {c,requests,store:creerEnergyBillingRevisionStore({obtenirClient:async()=>c})};
}
test('Store transaction atomique cree nouvelle declaration puis lien revision',async()=>{
 const {store,requests}=fakeDatabase();const v=await store.creer({tenant:TENANT,actor:8,siteId:SITE,declarationId:BILL,requestKey:crypto.randomUUID(),data:valid(body)});
 assert.equal(v.code,'OK');assert.equal(v.revision,1);assert.equal(v.nouveau,true);
 assert.ok(requests.some(x=>x[0]==='BEGIN'));assert.ok(requests.some(x=>x[0]==='COMMIT'));
 assert.ok(requests.some(x=>x[0].includes('INSERT INTO energy_billing_rectifications')));
 assert.ok(!requests.some(x=>/^\s*(?:UPDATE|DELETE)\s/i.test(x[0])));
 assert.equal(requests.at(-1)[0],'RELEASE');
});
test('Store refuse identite etrangere avant aucune ecriture',async()=>{
 const {store,requests}=fakeDatabase({foreign:true});const v=await store.creer({tenant:TENANT,actor:8,siteId:SITE,declarationId:BILL,
 requestKey:crypto.randomUUID(),data:valid(body)});
 assert.equal(v.code,'SITE_NON_AUTORISE');assert.ok(!requests.some(x=>x[0].includes('INSERT INTO')));
});
test('Store refuse revision sans modification de valeur',async()=>{
 const {store,requests}=fakeDatabase({same:true});const v=await store.creer({tenant:TENANT,actor:8,siteId:SITE,declarationId:BILL,
 requestKey:crypto.randomUUID(),data:valid(body)});
 assert.equal(v.code,'AUCUNE_MODIFICATION');assert.ok(!requests.some(x=>x[0].includes('INSERT INTO')));
});
test('Store idempotent ne cree aucune nouvelle declaration',async()=>{
 const {store,requests}=fakeDatabase({prior:true});const v=await store.creer({tenant:TENANT,actor:8,siteId:SITE,declarationId:BILL,
 requestKey:crypto.randomUUID(),data:valid(body)});
 assert.equal(v.code,'OK');assert.equal(v.nouveau,false);assert.ok(!requests.some(x=>x[0].includes('INSERT INTO')));
});
