'use strict';
/** E-METER-1D1 — tests reproductibles sans dépendance à un serveur ni à PostgreSQL. */
const test=require('node:test'), assert=require('node:assert/strict');
const {analyserCsv,CsvInvalide,cleLigne,LIMITE_LIGNES,MODE,empreinte}=require('../energy/energy-meter-import-domain');
const {creerEnergyMeterImportStore}=require('../energy/energy-meter-import-store');
const {creerEnergyMeterImportRouter}=require('../energy/energy-meter-import-http');
const A='123e4567-e89b-42d3-a456-426614174000',B='123e4567-e89b-42d3-a456-426614174001';
const SITE='1c349328-4dc0-4d72-8907-4d4b92a5a3e7',TENANT='ENERGY_MVP01D_RECETTE';
const DATE='2026-11-20T10:00:00Z',NOW=Date.UTC(2026,10,22);
const enTete='registre_id,releve_le,valeur_index,observation\n';
const ligne=(id=A,date=DATE,val='230.000000',obs='Saisie test')=>[id,date,val,obs].join(',');
const bon=enTete+ligne()+'\n'+ligne(B,'2026-11-20T11:00:00+01:00','231.5','Autre registre');
const parse=(s)=>analyserCsv(s,NOW);
const erreur=(csv,code)=>assert.throws(()=>parse(csv),e=>e instanceof CsvInvalide&&e.code===code);
for(const [title,value,expected] of [
 ['entêtes absentes','mauvais,x,y,z\n'+ligne(),'ENTETES_CSV_V1_INVALIDES'],
 ['aucun enregistrement',enTete,'LIGNES_ABSENTES'],
 ['champ registre non uuid',enTete+ligne('pas-uuid'),'REGISTRE_ID_INVALIDE'],
 ['précision index dépassée',enTete+ligne(A,DATE,'1.0000001'),'RELEVE_CSV_INVALIDE'],
 ['valeur négative',enTete+ligne(A,DATE,'-1'),'RELEVE_CSV_INVALIDE'],
 ['notation scientifique',enTete+ligne(A,DATE,'1e6'),'RELEVE_CSV_INVALIDE'],
 ['date sans zone',enTete+ligne(A,'2026-11-20T10:00:00'),'RELEVE_CSV_INVALIDE'],
 ['date invalide',enTete+ligne(A,'2026-02-30T10:00:00Z'),'RELEVE_CSV_INVALIDE'],
 ['trop de colonnes',enTete+ligne()+',trop','COLONNES_INVALIDES'],
 ['en-tête différent',enTete.replace('observation','note')+ligne(),'ENTETES_CSV_V1_INVALIDES'],
 ['guillemet interrompu',enTete+A+','+DATE+',230,"saisie','GUILLEMET_NON_FERME'],
 ['guillemet non conforme',enTete+A+','+DATE+',230,sai"sie','GUILLEMET_CSV_INVALIDE'],
 ['suite après guillemet',enTete+A+','+DATE+',230,"a"b','APRES_GUILLEMET_INVALIDE'],
 ['observations multilignes',enTete+A+','+DATE+',230,"ligne\nautre"','CELLULE_MULTILIGNE_NON_AUTORISEE'],
 ['formule excel',enTete+ligne(A,DATE,'230','=HYPERLINK(1)'),'FORMULE_CSV_INTERDITE'],
 ['UTF8 altéré',enTete+ligne(A,DATE,'230','\ufffd'),'CONTROLE_OU_UTF8_INVALIDE'],
 ['retour chariot seul',enTete.replaceAll('\n','\r')+ligne(),'FIN_DE_LIGNE_INVALIDE'],
 ['doublon intra-fichier',enTete+ligne()+'\n'+ligne(A,'2026-11-20T11:00:00+01:00','999'),'DOUBLON_DANS_FICHIER'],
 ['virgule française',enTete+ligne(A,DATE,'230,5'),'COLONNES_INVALIDES'],
 ['fichier vide','', 'TAILLE_CSV_INVALIDE']
 ])test(title,()=>erreur(value,expected));

test('csv strict accepté, unités jamais apportées par le CSV',()=>{
 const x=parse(bon);assert.equal(x.lignes.length,2);assert.equal(x.mode,MODE);
 assert.equal(x.lignes[0].valeur,'230');assert.equal(x.lignes[1].valeur,'231.5');
 assert.equal(x.lignes[1].releveLe,'2026-11-20T10:00:00.000Z');
 assert.equal(x.lignes[0].unite,undefined);
});
test('BOM UTF8 et guillemets RFC acceptés',()=>{
 const x=parse('\ufeff'+enTete+`${A},${DATE},230,"Lecture, matin"`);
 assert.equal(x.lignes[0].observation,'Lecture, matin');
});
test('CRLF accepté sans changer l’empreinte du fichier',()=>{
 const a=parse(enTete+ligne());const b=parse((enTete+ligne()).replaceAll('\n','\r\n'));
 assert.notEqual(a.fichierSha256,b.fichierSha256);assert.deepEqual(a.lignes,b.lignes);
});
test('double guillemet échappé',()=>{
 const x=parse(enTete+`${A},${DATE},230,"vu ""à vérifier"""`);
 assert.equal(x.lignes[0].observation,'vu "à vérifier"');
});
test('taille bornée',()=>erreur('a'.repeat(65537),'TAILLE_CSV_INVALIDE'));
test('50 lignes acceptées',()=>{
 const x=parse(enTete+Array.from({length:LIMITE_LIGNES},(_,i)=>ligne(A,`2026-11-20T${String(i%24).padStart(2,'0')}:${String(Math.floor(i/24)).padStart(2,'0')}:00Z`,'12')).join('\n'));
 assert.equal(x.lignes.length,50);
});
test('51 lignes refusées',()=>erreur(enTete+Array.from({length:51},(_,i)=>ligne(A,`2026-11-20T${String(i%24).padStart(2,'0')}:${String(Math.floor(i/24)).padStart(2,'0')}:00Z`)).join('\n'),'TROP_DE_LIGNES'));
test('clé de ligne déterministe, différente entre lignes',()=>{
 assert.equal(cleLigne(A,2),cleLigne(A,2));assert.notEqual(cleLigne(A,2),cleLigne(A,3));
 assert.match(cleLigne(A,2),/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
});
test('empreintes modifiées si fichier différent',()=>assert.notEqual(parse(enTete+ligne()).hashLot,parse(enTete+ligne(A,DATE,'231')).hashLot));
function fake({foreign=false,inactive=false,collision=false,already=0,matchingHash=false,failInsert=false,failInsertAt=0}={}){
 const statements=[],effects={insertions:0,evenements:0,commit:0,rollback:0};
 let failed=false;
 const client={release(){}, async query(sql,params=[]){statements.push(sql);const s=sql.trim();
  if(s.startsWith('BEGIN'))return {rows:[]};
  if(s==='COMMIT'){effects.commit++;return {rows:[]};}
  if(s==='ROLLBACK'){effects.rollback++;return {rows:[]};}
  if(s.includes('FROM energy_inventory_sites s JOIN tenants t'))return {rows:foreign?[]:[{id:99,public_id:SITE,nom:'TEST SITE',tenant_id:70,owner_personne_id:12,pays:'SN'}]};
  if(s.includes('FROM energy_inventory_sites s\n'))return {rows:[{public_id:SITE,nom:'TEST SITE',pays:'SN'}]};
  if(s.startsWith('SELECT') && s.includes('FROM energy_meter_registers r') && s.includes('JOIN energy_meter_devices'))return {rows:
    [A,B].map(id=>({id,code:'DEMO',unite:'KWH',actif:!inactive}))};
  if(s.includes('FROM\n     UNNEST('))return {rows:collision?[{register_id:A,releve_le:DATE}]:[]};
  if(s.includes('FROM energy_meter_events')){const h=matchingHash?empreinte(JSON.stringify({siteId:SITE,actor:12,hash:parse(bon).hashLot})):'x';return {rows:[{n:already,min_hash:h,max_hash:h}]};}
  if(s.startsWith('INSERT INTO energy_meter_readings')){
   if(failInsert&&!failed||failInsertAt>0&&effects.insertions+1===failInsertAt){failed=true;return {rows:[]};}
   effects.insertions++;return {rows:[{id:params[0]}]};
  }
  if(s.startsWith('INSERT INTO energy_meter_events')){effects.evenements++;return {rows:[]};}
  throw Error('REQUETE_NON_SIMULEE: '+s.slice(0,100));
 }};
 return {store:creerEnergyMeterImportStore({obtenirClient:async()=>client}),statements,effects};
}
const sujet={tenant:TENANT,actor:12,siteId:SITE,lot:parse(bon)};
test('prévisualisation BEGIN READ ONLY et ROLLBACK, sans INSERT',async()=>{
 const x=fake();const r=await x.store.apercu(sujet);assert.equal(r.importPossible,true);assert.equal(r.total,2);
 assert.equal(r.provenance,'SAISIE_MANUELLE');assert.equal(r.aucunCalculConsommation,true);
 assert.ok(x.statements.some(s=>s==='BEGIN READ ONLY'));assert.ok(x.statements.every(s=>!s.includes('INSERT INTO')));
 assert.equal(x.effects.rollback,1);assert.equal(x.effects.insertions,0);
});
test('un registre inactif refuse tout le lot',async()=>{
 const x=fake({inactive:true}),r=await x.store.apercu(sujet);
 assert.equal(r.refusees,2);assert.equal(r.importPossible,false);
});
test('collision avec lecture existante refuse import avant toute écriture',async()=>{
 const x=fake({collision:true}),r=await x.store.importer({...sujet,requestKey:A});
 assert.equal(r.code,'LOT_NON_IMPORTABLE');assert.equal(x.effects.insertions,0);
});
test('site étranger inaccessible dans aperçu',async()=>{
 const x=fake({foreign:true});assert.equal(await x.store.apercu(sujet),null);
});
test('site étranger inaccessible dans écriture',async()=>{
 const x=fake({foreign:true});assert.equal((await x.store.importer({...sujet,requestKey:A})).code,'SITE_NON_AUTORISE');
});
test('import atomique : transaction, deux lectures et deux événements, mêmes portes',async()=>{
 const x=fake(),r=await x.store.importer({...sujet,requestKey:A});
 assert.equal(r.code,'OK');assert.equal(r.nouveau,true);assert.equal(r.total,2);
 assert.equal(x.effects.insertions,2);assert.equal(x.effects.evenements,2);assert.equal(x.effects.commit,1);
 assert.ok(x.statements.some(s=>s.includes('FOR UPDATE OF s')));
 assert.ok(x.statements.some(s=>s.includes('MeterReadingDeclared.v1')));
});
test('rejeu idempotent strict : zéro écriture supplémentaire',async()=>{
 const x=fake({already:2,matchingHash:true}),r=await x.store.importer({...sujet,requestKey:A});
 assert.equal(r.code,'OK');assert.equal(r.nouveau,false);assert.equal(r.total,2);
 assert.equal(x.effects.insertions,0);assert.equal(x.effects.commit,1);
});
test('clé d’idempotence déjà utilisée avec contenu différent = conflit',async()=>{
 const x=fake({already:2}),r=await x.store.importer({...sujet,requestKey:A});
 assert.equal(r.code,'CLE_REUTILISEE');assert.equal(x.effects.insertions,0);
});
test('échec insertion => ROLLBACK et zéro COMMIT',async()=>{
 const x=fake({failInsert:true});await assert.rejects(x.store.importer({...sujet,requestKey:A}),/IMPORT_CONFLIT_TRANSACTION/);
 assert.equal(x.effects.rollback,1);assert.equal(x.effects.commit,0);
});
test('échec de la deuxième ligne => transaction entière annulée, aucun COMMIT',async()=>{
 const x=fake({failInsertAt:2});await assert.rejects(x.store.importer({...sujet,requestKey:A}),/IMPORT_CONFLIT_TRANSACTION/);
 assert.equal(x.effects.insertions,1);assert.equal(x.effects.rollback,1);assert.equal(x.effects.commit,0);
});
function router(){const routes={GET:new Map(),POST:new Map()};return {use(){},
 get(p,h){routes.GET.set(p,h);},post(p,h){routes.POST.set(p,h);},routes};}
function response(){return {code:200,head:{},payload:null,set(k,v){this.head[k]=v;return this;},status(s){this.code=s;return this;},json(p){this.payload=p;return this;}};}
const api=()=>{const r=router();creerEnergyMeterImportRouter({router:r,listerOrganisations:async(a,t)=>a===12?[{tenant_code:t}]:[],
 store:{sites:async()=>({sites:[]}),apercu:async()=>({importPossible:true}),importer:async()=>({code:'OK',nouveau:true,total:2})},
 origineAutorisee:'http://localhost:3497',tenantAutorise:TENANT});return r;};
async function hit(type,p,{actor=12,tenant=TENANT,origin='http://localhost:3497',body={csv:bon},key=A,siteId=SITE}={}){
 const r=api(),res=response(),req={method:type,auth:actor?{personneId:actor}:null,query:{tenant},
 params:{siteId},body,get(n){return n==='Origin'?origin:n==='Idempotency-Key'?key:null;}};
 const h=r.routes[type].get(p);assert.ok(h,'Route attendue '+p);await h(req,res);return res;
}
test('session absente 401',async()=>assert.equal((await hit('GET','/sites',{actor:0})).code,401));
test('tenant étranger 403',async()=>assert.equal((await hit('GET','/sites',{tenant:'AUTRE_TENANT'})).code,403));
test('organisation non autorisée 403',async()=>assert.equal((await hit('GET','/sites',{actor:9})).code,403));
test('Origin étranger 403',async()=>assert.equal((await hit('POST','/sites/:siteId/apercu',{origin:'https://autre.test'})).code,403));
test('aperçu correct et aucun calcul',async()=>assert.equal((await hit('POST','/sites/:siteId/apercu')).code,200));
test('validation nécessite confirmation',async()=>assert.equal((await hit('POST','/sites/:siteId/valider')).code,400));
test('validation nécessite idempotency key UUID',async()=>assert.equal((await hit('POST','/sites/:siteId/valider',{key:'' ,body:{csv:bon,confirmation:'CONFIRMER_IMPORT'}})).code,400));
test('validation consentie donne 201',async()=>assert.equal((await hit('POST','/sites/:siteId/valider',{body:{csv:bon,confirmation:'CONFIRMER_IMPORT'}})).code,201));
test('format CSV incorrect 400',async()=>assert.equal((await hit('POST','/sites/:siteId/apercu',{body:{csv:'mauvais'}})).code,400));
test('corps avec champ surnuméraire 400',async()=>assert.equal((await hit('POST','/sites/:siteId/apercu',{body:{csv:bon,isAdmin:true}})).code,400));
test('identifiant site invalide 400',async()=>assert.equal((await hit('POST','/sites/:siteId/apercu',{siteId:'not-uuid'})).code,400));
test('réutilisation version 1A et tests anciens possible',()=>assert.equal(typeof require('../energy/energy-meter-domain').indexManuel,'function'));
