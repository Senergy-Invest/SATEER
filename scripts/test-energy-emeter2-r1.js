'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {candidate}=require('../energy/energy-meter-photo-domain');
const {creerEnergyMeterPhotoRouter}=require('../energy/energy-meter-photo-http');
const ID='11111111-1111-4111-8111-111111111111';
test('proposition explicite index',()=>assert.deepEqual(candidate(['INDEX 1234.50 KWH'],'KWH'),{statut:'OCR_INDEX_A_CONFIRMER',valeurProposee:'1234.5',unite:'KWH',verification:'NON_VERIFIEE'}));
test('index simple 007.500',()=>assert.equal(candidate(['007.500'],'KWH').valeurProposee,'7.5'));
test('index negatif refusé',()=>assert.equal(candidate(['-123'],'KWH').statut,'OCR_AUCUN_INDEX_LISIBLE'));
test('expo refusé',()=>assert.equal(candidate(['1e5'],'KWH').statut,'OCR_AUCUN_INDEX_LISIBLE'));
test('tension jamais index',()=>assert.equal(candidate(['230 V'],'KWH').statut,'OCR_AUCUN_INDEX_LISIBLE'));
test('index multiples différents refusés',()=>assert.equal(candidate(['1234','1235'],'KWH').statut,'OCR_PLUSIEURS_INDEX_POSSIBLES'));
test('comma 1,234 ambigu',()=>assert.equal(candidate(['1,234'],'KWH').statut,'OCR_AMBIGU_SEPARATEUR'));
test('comma 12,34 accepté',()=>assert.equal(candidate(['12,34'],'KWH').valeurProposee,'12.34'));
test('unit incompatible',()=>assert.equal(candidate(['12 M3'],'KWH').statut,'OCR_UNITE_INCOMPATIBLE'));
test('unit m3',()=>assert.equal(candidate(['INDEX: 123 M3'],'M3').valeurProposee,'123'));
test('numéro de série exclu',()=>assert.equal(candidate(['SERIAL 123456'],'KWH').statut,'OCR_AUCUN_INDEX_LISIBLE'));
test('liste invalide',()=>assert.equal(candidate({lines:[]},'KWH').statut,'OCR_SORTIE_INVALIDE'));
test('aucune validation d index dans API photo',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../energy/energy-meter-photo-http.js'),'utf8');
 assert.equal(/INSERT INTO energy_meter_readings|MeterReadingDeclared|\.soumettre\(|\.decider\(/.test(src),false);
});
test('aucun SQL de migration dans domaine ou HTTP',()=>{const a=fs.readFileSync(path.join(__dirname,'../energy/energy-meter-photo-domain.js'),'utf8');const b=fs.readFileSync(path.join(__dirname,'../energy/energy-meter-photo-http.js'),'utf8');assert.equal(/CREATE TABLE|ALTER TABLE|DROP TABLE/i.test(a+b),false);});
test('API branchée par feature flag recette',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');assert.match(src,/SATEER_ENABLE_ENERGY_METER_2_R1 === '1'/);assert.match(src,/PGDATABASE === 'sateer_test'/);
});
test('photo validée sans persistance et refus session',async()=>{
 const routes={};const router={use(){},get(p,h){routes['GET '+p]=h;},post(p,...hs){routes['POST '+p]=hs.at(-1);}};
 let read=0;
 creerEnergyMeterPhotoRouter({router,tenantAutorise:'ENERGY_MVP01D_RECETTE',origineAutorisee:'http://localhost:3502',listerOrganisations:async()=>[{tenant_code:'ENERGY_MVP01D_RECETTE'}],
  store:{autoriser:async()=>{read++;return {unite:'KWH'};}},ocr:{recognize:async()=>['1234.5']}});
 const res=()=>({statusCode:200,data:null,headers:{},status(n){this.statusCode=n;return this;},set(k,v){this.headers[k]=v;return this;},json(d){this.data=d;return this;}});
 const req={auth:null,query:{tenant:'ENERGY_MVP01D_RECETTE'},params:{missionId:ID},get:()=>undefined};
 const r=res();await routes['GET /capacite'](req,r);assert.equal(r.statusCode,401);assert.equal(read,0);
});
function photoMock({authorize=true,lines=['INDEX 1234.50 KWH']}={}){
 const routes={};const router={use(){},get(p,h){routes['GET '+p]=h;},post(p,...hs){routes['POST '+p]=hs.at(-1);}};
 let ocrCalls=0,authCalls=0;
 creerEnergyMeterPhotoRouter({router,tenantAutorise:'ENERGY_MVP01D_RECETTE',origineAutorisee:'http://localhost:3502',
  listerOrganisations:async()=>[{tenant_code:'ENERGY_MVP01D_RECETTE'}],
  store:{autoriser:async()=>{authCalls++;return authorize?{unite:'KWH'}:null;}},
  ocr:{recognize:async()=>{ocrCalls++;return lines;}}});
 const respond=()=>({statusCode:200,body:null,status(n){this.statusCode=n;return this;},set(){return this;},json(v){this.body=v;return this;}});
 const photo=fs.readFileSync(path.join(__dirname,'../fixtures/afficheur-synthetique-emeter2.png'));
 const request=(opts={})=>({auth:{personneId:12},query:{tenant:'ENERGY_MVP01D_RECETTE'},params:{missionId:ID},body:photo,get(name){return {'Origin':'http://localhost:3502','Content-Type':'application/octet-stream'}[name];},...opts});
 return {routes,request,respond,get ocrCalls(){return ocrCalls;},get authCalls(){return authCalls;}};
}
test('HTTP OCR propose sans enregistrer de relevé',async()=>{
 const m=photoMock();const r=m.respond();await m.routes['POST /missions/:missionId/analyser'](m.request(),r);
 assert.equal(r.statusCode,200);assert.equal(r.body.statut,'OCR_INDEX_A_CONFIRMER');assert.equal(r.body.valeurProposee,'1234.5');assert.equal(r.body.photoConservee,false);assert.equal(m.ocrCalls,1);assert.equal(m.authCalls,2);
});
test('HTTP OCR mission étrangère 404 avant moteur',async()=>{
 const m=photoMock({authorize:false}),r=m.respond();await m.routes['POST /missions/:missionId/analyser'](m.request(),r);
 assert.equal(r.statusCode,404);assert.equal(m.ocrCalls,0);
});
test('HTTP OCR sans Origin 403 avant moteur',async()=>{
 const m=photoMock(),r=m.respond();await m.routes['POST /missions/:missionId/analyser'](m.request({get:()=>undefined}),r);
 assert.equal(r.statusCode,403);assert.equal(m.ocrCalls,0);assert.equal(m.authCalls,0);
});
test('HTTP OCR autre tenant 403 avant moteur',async()=>{
 const m=photoMock(),r=m.respond();await m.routes['POST /missions/:missionId/analyser'](m.request({query:{tenant:'AUTRE_TENANT'}}),r);
 assert.equal(r.statusCode,403);assert.equal(m.ocrCalls,0);
});
test('HTTP OCR image incompatible 415 sans moteur',async()=>{
 const m=photoMock(),r=m.respond();await m.routes['POST /missions/:missionId/analyser'](m.request({body:Buffer.alloc(100)}),r);
 assert.equal(r.statusCode,415);assert.equal(m.ocrCalls,0);
});
test('HTTP OCR valeur ambiguë ne propose aucun index',async()=>{
 const m=photoMock({lines:['1000','1001']}),r=m.respond();await m.routes['POST /missions/:missionId/analyser'](m.request(),r);
 assert.equal(r.statusCode,200);assert.equal(r.body.statut,'OCR_PLUSIEURS_INDEX_POSSIBLES');assert.equal(r.body.valeurProposee,undefined);
});
test('store READ ONLY : absence de mission refuse, aucun INSERT',async()=>{
 const {creerEnergyMeterPhotoStore}=require('../energy/energy-meter-photo-store');const queries=[];
 const client={async query(sql){queries.push(sql);return {rows:[]};},release(){}};
 const store=creerEnergyMeterPhotoStore({obtenirClient:async()=>client});
 assert.equal(await store.autoriser({tenant:'ENERGY_MVP01D_RECETTE',actor:12,missionId:ID}),null);
 assert.equal(queries[0],'BEGIN READ ONLY');assert.equal(queries.at(-1),'ROLLBACK');
 assert.equal(queries.some(q=>/^\s*(INSERT|UPDATE|DELETE|CREATE|DROP)\b/i.test(q)),false);
});
