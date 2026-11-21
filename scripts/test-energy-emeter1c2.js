'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {SOURCES,LIMIT,pagination,compareDecimal,signauxReleve,signauxDocument,statut}=require('../energy/energy-meter-quality-domain');
const {creerEnergyMeterQualityRouter}=require('../energy/energy-meter-quality-http');
const {creerEnergyMeterQualityStore}=require('../energy/energy-meter-quality-store');
const TENANT='ENERGY_MVP01D_RECETTE',SITE=crypto.randomUUID();
for(const [v,w] of [[undefined,0],['0',0],['50',50],['10000',10000]])test('Pagination accepte '+String(v),()=>assert.equal(pagination(v),w));
for(const v of [null,'-1','01','10001','abc','1.2',3,'',' 0 ','+0','0\n'])test('Pagination refuse '+String(v),()=>assert.equal(pagination(v),null));
for(const [a,b,result] of [['0','0.000000',0],['000000.1','0.100000',0],['100','99.999999',1],['9.999999','10',-1],['1.000001','1.000000',1],['99999999999999.999999','99999999999999.999998',1],['0','00000000000001',-1],['200.500','200.5',0]])test('Indice exact compare '+a+' et '+b,()=>assert.equal(compareDecimal(a,b),result));
for(const x of ['-1','1e3','1.1111111',12,NaN,'',null,'0,1'])test('Indice invalide '+String(x),()=>assert.throws(()=>compareDecimal('1',x),/INDEX_NON_CANONIQUE/));
for(const [valeur,precedente,expected] of [['12',null,null],['12','10',null],['10','12','INDEX_EN_BAISSE'],['12','12.0','INDEX_INCHANGE'],['0','999','INDEX_EN_BAISSE']])test('Signal indice '+valeur+' / '+precedente,()=>{
 const signals=signauxReleve({valeur,precedente});assert.equal(signals[0]?.code||null,expected);
 if(expected==='INDEX_EN_BAISSE')assert.equal(statut(signals),'A_VERIFIER');
 else assert.equal(statut(signals),'AUCUNE_ALERTE_DETECTEE');
});
for(const [same,piece,count,first] of [[true,true,1,'REFERENCE_REPETEE'],[false,false,1,'PIECE_NON_ASSOCIEE'],[true,false,2,'REFERENCE_REPETEE'],[false,true,0,null]])test('Signal facture '+same+'/'+piece,()=>{
 const s=signauxDocument({referenceDoublon:same,preuveVersionCourante:piece});assert.equal(s.length,count);assert.equal(s[0]?.code||null,first);
});
test('Sources declarees et limite fixe',()=>{assert.deepEqual(SOURCES,['RELEVES','DOCUMENTS']);assert.equal(LIMIT,50);});
test('Conditions sans calculs et aucune certification',()=>{
 const d=fs.readFileSync(path.join(__dirname,'../energy/energy-meter-quality-domain.js'),'utf8');
 const q=fs.readFileSync(path.join(__dirname,'../energy/energy-meter-quality-store.js'),'utf8');
 assert.match(d,/INDEX_EN_BAISSE/);assert.match(d,/REFERENCE_REPETEE/);
 assert.match(q,/BEGIN READ ONLY/);assert.doesNotMatch(q,/\b(?:INSERT|UPDATE|DELETE|CREATE TABLE|ALTER TABLE)\b/i);
 assert.doesNotMatch(q,/(?:consommation|economie|tarif)\s*[=+*/-]/i);
});
test('Relevés : predecessor strictement chronologique et site cloisonné',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../energy/energy-meter-quality-store.js'),'utf8');
 assert.match(s,/ant\.releve_le<r\.releve_le/);assert.match(s,/ant\.register_id=r\.register_id/);
 assert.match(s,/r\.site_id=\$1 AND r\.tenant_id=\$2 AND r\.owner_personne_id=\$3/);
 assert.match(s,/ORDER BY r\.releve_le DESC,r\.id DESC LIMIT 51 OFFSET \$4/);
});
test('Documents : considérer uniquement version actuelle et pièce de cette version',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../energy/energy-meter-quality-store.js'),'utf8');
 assert.match(s,/COALESCE\(rev\.corrected_declaration_id,root\.id\)/);
 assert.match(s,/a\.declaration_id=page\.actuel_id/);
 assert.match(s,/same\.original_id<>page\.original_id/);
});
function fakeRouter(){const h=new Map(),middleware=[],router={use(fn){middleware.push(fn);},get(p,cb){h.set('GET '+p,cb);}};
 const calls=[];const store={sites:async x=>{calls.push(['sites',x]);return {sites:[]};},
 releves:async x=>{calls.push(['releves',x]);return {items:[],source:'RELEVES',aucunCalculConsommation:true};},
 documents:async x=>{calls.push(['documents',x]);return {items:[],source:'DOCUMENTS',aucunCalculConsommation:true};}};
 creerEnergyMeterQualityRouter({router,store,listerOrganisations:async(a,t)=>a===7?[{tenant_code:t}]:[],tenantAutorise:TENANT});
 async function ask(route,{actor=7,tenant=TENANT,siteId=SITE,source='RELEVES',offset=undefined}={}){
  const req={auth:{personneId:actor},query:{tenant,source,offset},params:{siteId}};
  const res={code:200,body:null,headers:{},set(k,v){this.headers[k]=v;return this;},status(c){this.code=c;return this;},json(v){this.body=v;return this;}};
  for(const fn of middleware)fn(req,res,()=>{});
  await h.get('GET '+route)(req,res);return res;
 }return {ask,calls,handlers:h};}
const route='/sites/:siteId/signaux';
for(const [name,o,status] of [['sans session',{actor:0},401],['sans rôle Core',{actor:8},403],['mauvais tenant',{tenant:'AUTRE'},403],['tenant invalide',{tenant:'bad'},400],['site falsifie',{siteId:'inconnu'},400],['source inconnue',{source:'BILL'},400],['pagination hostile',{offset:'-10'},400],['pagination non canonique',{offset:'01'},400]])test('HTTP refuse '+name,async()=>{
 const f=fakeRouter(),r=await f.ask(route,o);assert.equal(r.code,status);assert.equal(f.calls.length,0);
});
test('HTTP lectures RELEVES, query contrôlée',async()=>{const f=fakeRouter(),r=await f.ask(route,{offset:'50'});
 assert.equal(r.code,200);assert.equal(r.body.source,'RELEVES');assert.equal(f.calls[0][1].offset,50);
 assert.equal(r.headers['Cache-Control'],'private, no-store');});
test('HTTP lectures DOCUMENTS',async()=>{const f=fakeRouter(),r=await f.ask(route,{source:'DOCUMENTS'});
 assert.equal(r.code,200);assert.equal(f.calls[0][0],'documents');});
test('HTTP liste sites privée',async()=>{const f=fakeRouter();const r=await f.ask('/sites');assert.equal(r.code,200);assert.equal(f.calls[0][0],'sites');});
test('HTTP ne publie aucune méthode mutative',()=>{const f=fakeRouter();assert.equal([...f.handlers.keys()].filter(x=>!x.startsWith('GET')).length,0);});
test('Store refuse client absent',()=>assert.throws(()=>creerEnergyMeterQualityStore({}),/CLIENT_PG_REQUIS/));
test('Store refuse autre site et restaure transaction READ ONLY',async()=>{
 const statements=[];const client={async query(sql,args){statements.push([sql,args]);if(sql.startsWith('SELECT s.id'))return {rows:[]};return {rows:[]};},release(){statements.push(['RELEASE']);}};
 const store=creerEnergyMeterQualityStore({obtenirClient:async()=>client});const x=await store.releves({tenant:TENANT,actor:7,siteId:SITE});
 assert.equal(x,null);assert.equal(statements[0][0],'BEGIN READ ONLY');assert.equal(statements.at(-2)[0],'COMMIT');assert.equal(statements.at(-1)[0],'RELEASE');
});
test('Store déclenche rollback en cas erreur et libère client',async()=>{
 const statements=[];const client={async query(sql){statements.push(sql);if(sql.startsWith('SELECT s.public_id'))throw Error('FAUX_SQL');return {rows:[]};},release(){statements.push('RELEASE');}};
 const store=creerEnergyMeterQualityStore({obtenirClient:async()=>client});await assert.rejects(store.sites({tenant:TENANT,actor:7}),/FAUX_SQL/);
 assert.deepEqual(statements,['BEGIN READ ONLY',statements[1],'ROLLBACK','RELEASE']);
});
test('UI chargée par session Core, sans POST ni HTML injecté',()=>{
 const js=fs.readFileSync(path.join(__dirname,'../public/energie-controles.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'../public/energie-controles.html'),'utf8');
 assert.match(js,/SATEER_CONTEXT_READY/);assert.match(js,/textContent/);assert.doesNotMatch(js,/innerHTML|method\s*:\s*['"]POST['"]/);
 assert.match(html,/E-METER-1C2/);assert.match(html,/energie-controles\.js/);
});
test('Navigation C1 depuis rectifications conserve tenant dynamqiue',()=>{
 const js=fs.readFileSync(path.join(__dirname,'../public/energie-rectifications.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'../public/energie-rectifications.html'),'utf8');
 assert.match(html,/id="versControles"/);assert.match(js,/el\('versControles'\)\.href='\/energie-controles\.html\?tenant='/);
});

test('Store projette une baisse d index depuis PostgreSQL sans calcul de difference',async()=>{
 const c={async query(sql){if(sql==='BEGIN READ ONLY'||sql==='COMMIT')return {rows:[]};
  if(sql.includes('SELECT s.id,s.public_id'))return {rows:[{id:1,public_id:SITE,nom:'S',tenant_id:1,owner_personne_id:7}]};
  if(sql.includes('SELECT r.id,r.register_id'))return {rows:[{id:SITE,register_id:SITE,valeur:'15.000000',precedente:'20.000000',releve_le:'2026-11-01T00:00:00Z',registre_code:'T1',unite:'KWH',compteur_nom:'C',point_nom:'P'}]};
  throw Error('REQUETE_INCONNUE');},release(){}};
 const store=creerEnergyMeterQualityStore({obtenirClient:async()=>c});
 const v=await store.releves({tenant:TENANT,actor:7,siteId:SITE});
 assert.equal(v.items[0].signaux[0].code,'INDEX_EN_BAISSE');
 assert.equal(v.items[0].statut,'A_VERIFIER');assert.equal(v.aucunCalculConsommation,true);
});
test('Store projette référence répétée sur version courante et pièce absente',async()=>{
 const c={async query(sql){if(sql==='BEGIN READ ONLY'||sql==='COMMIT')return {rows:[]};
  if(sql.includes('SELECT s.id,s.public_id'))return {rows:[{id:1,public_id:SITE,nom:'S',tenant_id:1,owner_personne_id:7}]};
  if(sql.includes('WITH roots AS'))return {rows:[{original_id:SITE,actuel_id:SITE,date_document:'2026-11-01',nature:'FACTURE',energie:'ELECTRICITE',montant:'100.00',devise:'XOF',reference_document:'A123',reference_doublon:true,preuve_version_courante:false}]};
  throw Error('REQUETE_INCONNUE');},release(){}};
 const store=creerEnergyMeterQualityStore({obtenirClient:async()=>c});
 const v=await store.documents({tenant:TENANT,actor:7,siteId:SITE});
 assert.deepEqual(v.items[0].signaux.map(s=>s.code),['REFERENCE_REPETEE','PIECE_NON_ASSOCIEE']);
 assert.equal(v.items[0].date,'2026-11-01');
});
test('SQL transmet date facture canonique sans conversion de fuseau',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../energy/energy-meter-quality-store.js'),'utf8');
 assert.match(src,/to_char\(cur\.date_document,'YYYY-MM-DD'\) AS date_document/);
});
