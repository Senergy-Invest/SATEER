'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {LIMIT,offsetValide,normaliserIndicateurs,nombre}=require('../energy/energy-dashboard-domain');
const {creerEnergyDashboardRouter}=require('../energy/energy-dashboard-http');
const {creerEnergyDashboardStore}=require('../energy/energy-dashboard-store');
const uuid=()=>crypto.randomUUID(), siteId=uuid(), grantId=uuid(), nodeId=uuid();
const tenant='ENERGY_MVP01D_RECETTE';
const testsOffsets=[[undefined,0],['0',0],['50',50],['10000',10000],['',null],['-1',null],['0x10',null],['12e2',null],['1.2',null],['10001',null],['99999999999999',null]];
for(const [value,expected] of testsOffsets)test('C4C pagination '+JSON.stringify(value),()=>assert.equal(offsetValide(value),expected));
test('C4C domaine compteurs et invariants',()=>{
 assert.equal(LIMIT,50); assert.equal(nombre('25'),25);
 assert.throws(()=>nombre('-1'),/COMPTEUR/);assert.throws(()=>nombre('1.5'),/COMPTEUR/);
 const x=normaliserIndicateurs({unites:'3',enRevue:'1',equipementsLocalises:'0'});
 assert.equal(x.unites,3);assert.equal(x.enRevue,1);assert.equal(x.equipementsLocalises,0);
 assert.ok(!('kwh' in x));assert.ok(!('economies' in x));
});
function fakeRouter(){const routes=new Map();return {routes,use(){},get(path,fn){routes.set('GET '+path,fn);}};}
function fakeResponse(){return {code:200,headers:{},set(k,v){this.headers[k]=v;return this;},status(n){this.code=n;return this;},json(data){this.body=data;return this;}};}
function fixtures({session=true,member=true,activeTenant=true,owner=true,grant=false}={}){
 const router=fakeRouter(), store={async sites(){return {sites:[{id:siteId,nom:'Bâtiment de recette'}],suivant:false};},async synthese(){return owner?{site:{id:siteId}}:null;}};
 creerEnergyDashboardRouter({router,listerOrganisations:async()=>member?[{tenant_code:tenant}]:[],store,tenantAutorise:activeTenant?tenant:'OTHER'});
 const req={auth:session?{personneId:123}:null,query:{tenant,offset:'0',...(grant?{grantId}:null)},params:{siteId},method:'GET'};
 return {router,req};
}
for(const [desc,options,code] of [
 ['connexion',{},200],['sans session',{session:false},401],['hors tenant',{member:false},403],
 ['moteur inactif',{activeTenant:false},403],['site non autorisé',{owner:false},404]
])test('C4C API synthèse '+desc,async()=>{
 const {router,req}=fixtures(options),res=fakeResponse();
 await router.routes.get('GET /sites/:siteId/synthese')(req,res);assert.equal(res.code,code);
});
test('C4C API sans paramètre tenant',async()=>{const {router,req}=fixtures();delete req.query.tenant;const res=fakeResponse();await router.routes.get('GET /sites')(req,res);assert.equal(res.code,400);});
test('C4C API rejette ID site et grant malformés',async()=>{
 const {router,req}=fixtures();req.params.siteId='invalid';let res=fakeResponse();
 await router.routes.get('GET /sites/:siteId/synthese')(req,res);assert.equal(res.code,400);
 req.params.siteId=siteId;req.query.grantId='INVALID';res=fakeResponse();
 await router.routes.get('GET /sites/:siteId/synthese')(req,res);assert.equal(res.code,400);
});
test('C4C API rejette pagination malformée',async()=>{const {router,req}=fixtures();req.query.offset='NaN';const res=fakeResponse();await router.routes.get('GET /sites')(req,res);assert.equal(res.code,400);});
test('C4C API sans endpoint écriture',()=>{const {router}=fixtures();assert.deepEqual([...router.routes.keys()].sort(),['GET /sites','GET /sites/:siteId/synthese']);});
function db({authorised=true,root=true,owner=true,siteExists=true}={}){
 const queries=[];
 const mock={async query(sql,args){queries.push({sql,args});
  if(sql.includes('CASE WHEN s.owner_personne_id'))return {rows:[{public_id:siteId,nom:'Site recette',type_site:'LOGEMENT',role:owner?'PROPRIETAIRE':'RESPONSABLE',grant_id:owner?null:grantId,perimetre:owner?null:'Bloc A'}]};
  if(sql.includes('FROM energy_inventory_sites s JOIN tenants t'))return {rows:siteExists?[{id:44,public_id:siteId,nom:'Site recette',type_site:'LOGEMENT',tenant_id:2,owner_personne_id:owner?123:333}]:[]};
  if(sql.includes('FROM energy_scope_grants g JOIN energy_scope_nodes n'))return {rows:authorised?[{node_id:nodeId,role_scope:'RESPONSABLE',nom:'Bloc A'}]:[]};
  if(sql.includes("'PROPRIETAIRE' AS role_scope"))return {rows:root?[{node_id:nodeId,role_scope:'PROPRIETAIRE',nom:'Site recette'}]:[]};
  if(sql.includes('WITH RECURSIVE scope AS') && sql.includes('FROM page n ORDER BY'))return {rows:[{id:nodeId,parent_id:null,nom:'Bloc A',type_noeud:'BATIMENT',responsables:'1',en_revue:'2',a_corriger:'0',equipements:'3',appareillages:'1',esquisses:'1'}]};
  if(sql.includes('WITH RECURSIVE scope AS'))return {rows:[{unites:'1',responsabilites:'1',enRevue:'2',aCorriger:'0',integrees:'4',equipementsLocalises:'3',appareillages:'1',compteurs:'1',relationsDeclarees:'0',esquisses:'1'}]};
  if(sql.includes('SELECT COUNT(*) AS total FROM energy_inventory_equipements'))return {rows:[{total:'5'}]};
  throw Error('SQL_NON_ATTENDU '+sql.slice(0,80));
 },release(){}};
 return {queries,store:creerEnergyDashboardStore({obtenirClient:async()=>mock})};
}
test('C4C propriétaire : tous les indicateurs mais pas de kWh, lecture seule',async()=>{
 const {queries,store}=db();const r=await store.synthese({tenant,actor:123,siteId});
 assert.equal(r.acces.complet,true);assert.equal(r.indicateurs.enRevue,2);
 assert.equal(r.equipementsSansLocalisation,2);assert.equal(r.unites[0].equipements,3);assert.equal(r.mesuresDisponibles,false);
 assert.ok(queries.every(x=>!/^\s*(INSERT|UPDATE|DELETE|ALTER|TRUNCATE)\b/im.test(x.sql)));
 assert.ok(queries.filter(x=>x.sql.includes('WITH RECURSIVE scope AS')).length===2);
 assert.ok(queries.every(x=>!x.sql.includes('SELECT * FROM personnes')));
});
test('C4C collaborateur : seulement le périmètre accordé, pas total des équipements du propriétaire',async()=>{
 const {queries,store}=db({owner:false});
 const r=await store.synthese({tenant,actor:123,siteId,grantId});
 assert.equal(r.acces.complet,false);assert.equal(r.equipementsSansLocalisation,null);
 assert.equal(r.indicateurs.unites,1);
 assert.ok(!queries.some(x=>x.sql.includes('SELECT COUNT(*) AS total FROM energy_inventory_equipements')));
 assert.ok(queries.some(x=>x.sql.includes("g.statut='ACTIF'")));
});
test('C4C collaborateur sans grant : refus fermé',async()=>{const {queries,store}=db({owner:false});const r=await store.synthese({tenant,actor:123,siteId});assert.equal(r,null);assert.equal(queries.length,1);});
test('C4C grant révoqué ou étranger : refus fermé',async()=>{const {queries,store}=db({owner:false,authorised:false});const r=await store.synthese({tenant,actor:123,siteId,grantId});assert.equal(r,null);assert.equal(queries.length,2);});
test('C4C aucun site : pas d’oracle de droits',async()=>{const {queries,store}=db({siteExists:false});const r=await store.synthese({tenant,actor:123,siteId});assert.equal(r,null);assert.equal(queries.length,1);});
test('C4C site sans arborescence C1 : indicateurs inconnus, non forcés à zéro',async()=>{const {store}=db({root:false});const r=await store.synthese({tenant,actor:123,siteId});assert.equal(r.indicateurs,null);assert.equal(r.statutStructure,'STRUCTURE_C1_NON_INITIALISEE');});
test('C4C liste sites : sans doublon propriétaire, pagination',async()=>{const {store}=db();const r=await store.sites({tenant,actor:123,offset:0});assert.equal(r.sites[0].role,'PROPRIETAIRE');assert.equal(r.limite,50);assert.equal(r.suivant,false);});
