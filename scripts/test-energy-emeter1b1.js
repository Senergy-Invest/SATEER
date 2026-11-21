'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {declaration,date,amount}=require('../energy/energy-billing-domain');
const {creerEnergyBillingRouter}=require('../energy/energy-billing-http');
const {creerEnergyBillingStore}=require('../energy/energy-billing-store');
const fs=require('node:fs');const path=require('node:path');
const TENANT='ENERGY_MVP01D_RECETTE',ORIGIN='http://localhost:3489',SITE=crypto.randomUUID(),POINT=crypto.randomUUID(),METER=crypto.randomUUID();
const NOW=Date.UTC(2026,10,21,12),I='2026-10-01';
const base={nature:'FACTURE',energie:'ELECTRICITE',dateDocument:'2026-11-15',periodeDebut:I,periodeFin:'2026-10-31',devise:'XOF',montant:'001200.5'};
const recharge={nature:'RECHARGE',energie:'ELECTRICITE',dateDocument:'2026-11-15',devise:'XOF',montant:'5000',periodeDebut:null,periodeFin:null};
const valid=o=>declaration(o,NOW);
for(const [label,o] of [
 ['facture complete',base],['facture avec point',{...base,pointId:POINT}],['facture avec compteur',{...base,pointId:POINT,meterId:METER}],
 ['recharge site seul',recharge],['recharge point seul',{...recharge,pointId:POINT}],
 ['montant nul déclaré',{...base,montant:'0'}],['devise EUR',{...base,devise:'EUR'}],['energie eau',{...base,energie:'EAU'}],
 ['document referencé',{...base,referenceDocument:'N° 123',referenceJustificatif:'Dossier papier 12'}],
 ['jour bissextile',{...base,dateDocument:'2024-02-29',periodeFin:'2024-02-29',periodeDebut:'2024-02-01'}],
 ['recharge sans periode',{...recharge,periodeDebut:undefined,periodeFin:undefined}]
])test('E-METER1B1 accepte '+label,()=>assert.ok(valid(o)));
for(const [label,o] of [
 ['nature inconnue',{...base,nature:'PAIEMENT'}],['energie inconnue',{...base,energie:'VAPEUR'}],
 ['date invalide',{...base,dateDocument:'2026-02-30'}],['document futur',{...base,dateDocument:'2027-01-01'}],
 ['periode inverse',{...base,periodeDebut:'2026-11-01'}],['periode apres document',{...base,periodeFin:'2026-12-01'}],
 ['facture sans periode',{...base,periodeDebut:null}],['recharge avec periode',{...recharge,periodeDebut:'2026-01-01'}],
 ['montant flottant JS',{...base,montant:12500.55}],['montant negatif',{...base,montant:'-5'}],
 ['montant plus de 2 decimales',{...base,montant:'12.345'}],['montant exponentiel',{...base,montant:'1e5'}],
 ['montant trop grand',{...base,montant:'1234567890123'}],['devise invalide',{...base,devise:'XOF €'}],
 ['compteur sans point',{...base,meterId:METER}],['compteur UUID falsifie',{...base,pointId:POINT,meterId:'pasuuid'}],
 ['champ identite injecte',{...base,ownerId:123}],['reference vide',{...base,referenceDocument:' '}],
 ['chaine reference controle',{...base,referenceDocument:'A\nB'}],['observation piece trop longue',{...base,referenceJustificatif:'X'.repeat(121)}],
 ['tableau en entree',[]],['null en entree',null],['periode date impossible',{...base,periodeFin:'2026-04-31'}]
])test('E-METER1B1 refuse '+label,()=>assert.equal(valid(o),null));
for(const [x,y] of [['00001500.2','1500.20'],['0','0.00'],['10.01','10.01']])test('Montant decimal exact '+x,()=>assert.equal(amount(x),y));
test('Date canonique rejette 29 fevrier hors bissextile',()=>assert.equal(date('2025-02-29'),false));
test('Aucune equation de consommation ou tarification dans domaine',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../energy/energy-billing-domain.js'),'utf8');
 assert.doesNotMatch(source,/\b(kwh|consommation|economie|tarif)\s*[=+*/-]/i);
});
test('Schema SQL utilise FKs composites, montants NUMERIC et immuabilite',()=>{
 const sql=fs.readFileSync(path.join(__dirname,'../database/062_energy_billing_manual.sql'),'utf8');
 for(const s of ['NUMERIC(14,2)','fk_billing_site','fk_billing_point','fk_billing_meter','tr_billing_declaration_append_only','E_BILLING_REFUS_BASE_OU_CLUSTER','uq_billing_idempotence','tr_billing_point_energy'])assert.ok(sql.includes(s),s);
});
test('Store et UI ne lisent aucune photographie ou coffre de documents',()=>{
 for(const s of ['energy/energy-billing-store.js','public/energie-factures.js']){
  const t=fs.readFileSync(path.join(__dirname,'..',s),'utf8');assert.doesNotMatch(t,/\b(photoVault|readFileSync|uploadFile|photo_content)\b/i);
 }
});
function fixture(){
 const handlers=new Map();const router={use(){},get(p,cb){handlers.set('GET '+p,cb);},post(p,cb){handlers.set('POST '+p,cb);}};
 const calls=[];const store={sites:async()=>({sites:[]}),lister:async a=>{calls.push(['lister',a]);return {declarations:[],calculsDisponibles:false};},creer:async a=>{calls.push(['creer',a]);return {code:'OK',nouveau:true,id:crypto.randomUUID()};}};
 const listerOrganisations=async(actor,tenant)=>actor===8?[{tenant_code:tenant}]:[];
 creerEnergyBillingRouter({router,listerOrganisations,store,origineAutorisee:ORIGIN,tenantAutorise:TENANT});
 const res=()=>({code:0,body:null,headers:{},set(k,v){this.headers[k]=v;return this;},status(n){this.code=n;return this;},json(v){this.body=v;return this;}});
 const ask=async(method,path,{actor=8,tenant=TENANT,siteId=SITE,origin=ORIGIN,body=base,key=crypto.randomUUID(),offset=0}={})=>{
  const req={auth:{personneId:actor},query:{tenant,offset},params:{siteId},method,
  get(k){return k==='Origin'?origin:k==='Idempotency-Key'?key:null;},body};
  const r=res();await handlers.get(method+' '+path)(req,r);return r;
 };
 return {ask,calls,router};
}
const p='/sites/:siteId/declarations';
for(const [name,options,expected] of [
 ['sans session',{actor:null},401],['sans autorisation Core',{actor:9},403],['mauvais tenant',{tenant:'AUTRE_TENANT'},403],
 ['tenant invalide',{tenant:'xxx'},400],['site UUID invalide',{siteId:'no'},400],
 ['origine non autorisee',{origin:'https://untrusted.invalid'},403],['origine absente',{origin:null},403],
 ['cle manquante',{key:null},400],['payload avec ownerId',{body:{...base,ownerId:8}},400],
 ['montant float',{body:{...base,montant:20.5}},400],['charge justificatif fictif',{body:{...base,fileContent:'secret'}},400]
])test('HTTP refuse '+name,async()=>{const {ask,calls}=fixture();const r=await ask('POST',p,options);assert.equal(r.code,expected);assert.equal(calls.length,0);});
test('HTTP accepte demande declaree depuis propriétaire',async()=>{
 const {ask,calls}=fixture();const r=await ask('POST',p);assert.equal(r.code,201);assert.equal(r.body.statut,'DOCUMENT_DECLARE_NON_VERIFIE');
 assert.equal(calls.length,1);assert.equal(calls[0][1].data.montant,'1200.50');
});
test('HTTP liste documents prives pour propriétaire',async()=>{
 const {ask,calls}=fixture();const r=await ask('GET',p);assert.equal(r.body.calculsDisponibles,false);assert.equal(calls.length,1);
});
test('HTTP refuse pagination negative',async()=>{const {ask}=fixture();const r=await ask('GET',p,{offset:-1});assert.equal(r.code,400);});
test('HTTP refuse pagination excessive',async()=>{const {ask}=fixture();const r=await ask('GET',p,{offset:10001});assert.equal(r.code,400);});
test('HTTP ne publie aucune route PUT PATCH DELETE',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../energy/energy-billing-http.js'),'utf8');
 assert.doesNotMatch(source,/router\.(?:put|patch|delete)\s*\(/i);
});
test('Store depend d un client postgres explicitement injecte',()=>assert.throws(()=>creerEnergyBillingStore({}),/CLIENT_PG_REQUIS/));
