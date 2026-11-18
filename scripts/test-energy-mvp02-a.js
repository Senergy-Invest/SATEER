'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {zone,equipement,parentAdmis}=require('../energy/energy-inventory-domain');
const {creerEnergyInventoryRouter}=require('../energy/energy-inventory-http');
const TENANT='ENERGYREC_MVP02',ID='8e926138-f914-4148-8659-5b6bb11cb5ab',KEY='55a478ce-b08f-4c9b-8888-8b1d5417771e';
const bodyZone={nom:'Bâtiment A',typeZone:'BATIMENT',parentId:null};const bodyEq={nom:'Lampe',famille:'ECLAIRAGE',quantite:4,puissanceUnitaireW:12,zoneId:ID};
function fake(opts={}){
 const routes={},counts={read:0,createSite:0,zone:0,eq:0,membership:0};
 const router={post:(url,h)=>routes['POST '+url]=h,get:(url,h)=>routes['GET '+url]=h};
 const store={
  creerSite:async()=>{counts.createSite++;return {code:'OK',nouveau:true,site:{id:ID,energyCaseId:ID}};},
  listerSites:async()=>{counts.read++;return {sites:[],autresDisponibles:false};},
  obtenirSite:async()=>{counts.read++;return null;},
  creerZone:async()=>{counts.zone++;return {code:'OK',nouveau:true,id:ID};},
  creerEquipement:async()=>{counts.eq++;return {code:'OK',nouveau:true,id:ID};}
 };
 creerEnergyInventoryRouter({router,listerOrganisations:async(owner,tenant)=>{counts.membership++;return opts.member===false?[]:[{tenant_code:tenant}];},
  store,origineAutorisee:'http://localhost:3472',tenantAutorise:TENANT});
 async function call(method,route,{body,owner=3,tenant=TENANT,origin='http://localhost:3472',key=KEY,siteId=ID}={}){
  const h=routes[method+' '+route];assert.ok(h,'Route '+route+' absent');
  const req={auth:owner?{personneId:owner}:null,query:{tenant},params:{siteId},body,
   get:name=>name==='Origin'?origin:name==='Idempotency-Key'?key:undefined};
  const res={code:200,data:null,headers:{},status(v){this.code=v;return this;},json(v){this.data=v;return this;},set(k,v){this.headers[k]=v;return this;}};
  await h(req,res);return res;
 }
 return {counts,call,routes};
}
test('zone racine bâtiment déclarée valide',()=>{assert.deepEqual(zone(bodyZone),bodyZone);});
test('étage exige un parent existant',()=>{assert.equal(zone({typeZone:'ETAGE',nom:'Étage 1',parentId:null}),null);assert.ok(zone({typeZone:'ETAGE',nom:'Étage 1',parentId:ID}));});
test('hiérarchie étages, pièces et zones cohérente',()=>{assert.equal(parentAdmis('ETAGE','BATIMENT'),true);assert.equal(parentAdmis('PIECE','ETAGE'),true);assert.equal(parentAdmis('ZONE','EXTERIEUR'),true);assert.equal(parentAdmis('ETAGE','PIECE'),false);});
test('zone refuse identité ou tenant fourni par le client',()=>{assert.equal(zone({...bodyZone,owner:7}),null);assert.equal(zone({...bodyZone,tenantCode:TENANT}),null);});
test('nom vide, caractères de contrôle, type erroné refusés',()=>{assert.equal(zone({...bodyZone,nom:'  '}),null);assert.equal(zone({...bodyZone,nom:'A\nB'}),null);assert.equal(zone({...bodyZone,typeZone:'DOMICILE'}),null);});
test('équipement déclaré valide avec puissance optionnelle',()=>{assert.deepEqual(equipement(bodyEq),bodyEq);assert.equal(equipement({...bodyEq,puissanceUnitaireW:null}).puissanceUnitaireW,null);});
test('équipement refuse identité injectée, quantité décimale et puissance zéro',()=>{
 assert.equal(equipement({...bodyEq,personneId:5}),null);assert.equal(equipement({...bodyEq,quantite:1.5}),null);assert.equal(equipement({...bodyEq,puissanceUnitaireW:0}),null);
});
test('l’accès anonyme ne touche pas la base',async()=>{const f=fake();const r=await f.call('GET','/sites',{owner:null});assert.equal(r.code,401);assert.equal(f.counts.membership,0);});
test('tenant institutionnel bloqué avant accès DB',async()=>{const f=fake();const r=await f.call('GET','/sites',{tenant:'AMBVIS_96C7FBBEA383DD'});assert.equal(r.code,403);assert.equal(f.counts.membership,0);});
test('tenant sans rattachement refusé',async()=>{const f=fake({member:false});const r=await f.call('GET','/sites');assert.equal(r.code,403);assert.equal(f.counts.read,0);});
test('POST site refuse une origine externe',async()=>{const f=fake();const r=await f.call('POST','/sites',{body:{energyCaseId:ID},origin:'https://evil.example'});assert.equal(r.code,403);assert.equal(f.counts.createSite,0);});
test('POST site exige un identifiant dossier, pas un champ propriétaire',async()=>{const f=fake();const r=await f.call('POST','/sites',{body:{energyCaseId:ID,owner:99}});assert.equal(r.code,400);assert.equal(f.counts.createSite,0);});
test('POST site est autorisé et privé avec dossier valide',async()=>{const f=fake();const r=await f.call('POST','/sites',{body:{energyCaseId:ID}});assert.equal(r.code,201);assert.equal(r.headers['Cache-Control'],'private, no-store');assert.equal(f.counts.createSite,1);});
test('POST zone exige idempotence et saisie valide',async()=>{const f=fake();assert.equal((await f.call('POST','/sites/:siteId/zones',{body:bodyZone,key:null})).code,400);
 assert.equal((await f.call('POST','/sites/:siteId/zones',{body:{...bodyZone,owner:1}})).code,400);
 assert.equal((await f.call('POST','/sites/:siteId/zones',{body:bodyZone})).code,201);assert.equal(f.counts.zone,1);
});
test('POST équipement exige zone UUID et quantité positive',async()=>{const f=fake();assert.equal((await f.call('POST','/sites/:siteId/equipements',{body:{...bodyEq,zoneId:'no'}})).code,400);
 assert.equal((await f.call('POST','/sites/:siteId/equipements',{body:bodyEq})).code,201);assert.equal(f.counts.eq,1);
});
test('seulement 5 routes prévues, aucun endpoint de partage ni de validation',()=>{
 const f=fake();assert.deepEqual(Object.keys(f.routes).sort(),[
 'POST /sites','GET /sites','GET /sites/:siteId','POST /sites/:siteId/zones','POST /sites/:siteId/equipements'].sort());
});
test('migration versionnée : FKs composite interdisent les références cross-owner et cross-site',()=>{
 const sql=fs.readFileSync(path.join(__dirname,'../database/051_energy_inventory.sql'),'utf8');
 assert.match(sql,/current_database\(\) <> 'sateer_test'/);assert.match(sql,/FOREIGN KEY\(energy_case_id,tenant_id,owner_personne_id\)/);
 assert.match(sql,/FOREIGN KEY\(parent_id,site_id,tenant_id,owner_personne_id\)/);
 assert.match(sql,/FOREIGN KEY\(zone_id,site_id,tenant_id,owner_personne_id\)/);
 assert.match(sql,/InventoryEquipmentDeclared\.v1/);
});
test('UI utilise Core et aucun espace institutionnel, financement ou simulation',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../public/inventaire-energie.html'),'utf8');
 assert.match(html,/auth-client\.js/);assert.match(html,/Données.*déclarées/);assert.match(html,/sans calcul|Aucun calcul/i);
 assert.doesNotMatch(html,/signature institutionnelle|consommation certifiée|investisseur.*transmis/i);
});
