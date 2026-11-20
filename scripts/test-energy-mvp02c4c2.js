'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {filtreValide,ageEnJours,presenterAction}=require('../energy/energy-dashboard-actions-domain');
const {creerEnergyDashboardRouter}=require('../energy/energy-dashboard-http');
const {creerEnergyDashboardStore}=require('../energy/energy-dashboard-store');
const id=()=>crypto.randomUUID(),site=id(),grant=id(),node=id(),prop=id(),tenant='ENERGY_MVP01D_RECETTE';
const now='2026-11-20T12:00:00.000Z',before='2026-11-18T12:00:00.000Z';
for(const [v,expected] of [[undefined,'TOUTES'],['TOUTES','TOUTES'],['EN_REVUE','EN_REVUE'],['A_CORRIGER','A_CORRIGER'],['',null],['REFUSEE',null],['INTEGREE',null],[{},null]])
 test('C4C2 filtre '+String(v),()=>assert.equal(filtreValide(v),expected));
test('C4C2 ancienneté en jours, aucune échéance induite',()=>{
 assert.equal(ageEnJours(before,now),2);assert.equal(ageEnJours('2026-11-21T00:00:00Z',now),0);
 assert.throws(()=>ageEnJours('pas une date',now),/DATE_CONTRIBUTION/);
});
test('C4C2 action : pas de puissance, noms personnels, kWh ni échéance',()=>{
 const a=presenterAction({id:prop,nom:'Lampe test',famille:'ECLAIRAGE',statut:'EN_REVUE',scope_node_id:node,scope_nom:'Bureau A',est_relecteur:true,est_auteur:false,date_modification:before},now);
 assert.equal(a.pourMoi,true);assert.equal(a.joursDepuisModification,2);assert.equal(a.prochaineEtape,'EXAMEN_HUMAIN');
 assert.equal(a.unite.id,node);assert.equal(a.dateDerniereModification,before);
 assert.ok(!/kwh|economie|dateLimite|auteurPersonneId|motDePasse/i.test(JSON.stringify(a)));
});
test('C4C2 retour correction : seul auteur pourMoi',()=>{
 const a=presenterAction({id:prop,nom:'Machine',famille:'FROID',statut:'A_CORRIGER',scope_node_id:node,scope_nom:'Atelier',est_relecteur:true,est_auteur:false,date_modification:now},now);
 assert.equal(a.pourMoi,false);assert.equal(a.prochaineEtape,'CORRECTION_AUTEUR');
});
function fakeRouter(){const routes={};return {routes,use(){},get(path,fn){routes[path]=fn;}};}
function response(){return {statusCode:200,body:null,set(){return this;},status(s){this.statusCode=s;return this;},json(d){this.body=d;return this;}};}
function make({auth=true,member=true,tenantOn=true,allowed=true}={}){
 const r=fakeRouter(),s={sites:async()=>({sites:[]}),synthese:async()=>({}),actions:async()=>allowed?{actions:[],suivant:false}:null};
 creerEnergyDashboardRouter({router:r,listerOrganisations:async()=>member?[{tenant_code:tenant}]:[],store:s,tenantAutorise:tenantOn?tenant:'AUTRE'});
 return {route:r.routes['/sites/:siteId/actions'],routes:r.routes,req:{auth:auth?{personneId:22}:null,query:{tenant,statut:'TOUTES',offset:'0'},params:{siteId:site},method:'GET'}};
}
for(const [name,opts,expected] of [
 ['auth correcte',{},200],['sans session',{auth:false},401],['autre tenant',{member:false},403],
 ['flag désactivé',{tenantOn:false},403],['site non autorisé',{allowed:false},404]
 ])test('C4C2 HTTP '+name,async()=>{const {route,req}=make(opts),res=response();await route(req,res);assert.equal(res.statusCode,expected);});
for(const [name,modify] of [
 ['site invalide',r=>r.params.siteId='incorrect'],['grant invalide',r=>r.query.grantId='incorrect'],
 ['pagination invalide',r=>r.query.offset='-3'],['statut invalide',r=>r.query.statut='EN_CATALOGUE'],
 ['tenant absent',r=>delete r.query.tenant]
 ])test('C4C2 HTTP refuse '+name,async()=>{const {route,req}=make(),res=response();modify(req);await route(req,res);assert.equal(res.statusCode,400);});
test('C4C2 API : GET seulement, contrat C4C1 inchangé',()=>{
 const {routes}=make();assert.deepEqual(Object.keys(routes).sort(),['/sites','/sites/:siteId/actions','/sites/:siteId/synthese']);
});
function database({owner=true,activeGrant=true,siteExists=true,root=true}={}){
 const queries=[];
 const mock={async query(sql,args){queries.push({sql,args});
  if(sql.includes('FROM energy_inventory_sites s JOIN tenants t'))return {rows:siteExists?[{id:404,public_id:site,nom:'Site fictif',type_site:'LOGEMENT',tenant_id:7,owner_personne_id:owner?12:23}]:[]};
  if(sql.includes('FROM energy_scope_grants g JOIN energy_scope_nodes n'))return {rows:activeGrant?[{node_id:node,role_scope:'RESPONSABLE',nom:'Bureau'}]:[]};
  if(sql.includes("'PROPRIETAIRE' AS role_scope"))return {rows:root?[{node_id:node,role_scope:'PROPRIETAIRE',nom:'Site'}]:[]};
  if(sql.includes('p.date_modification ASC,p.id ASC'))return {rows:[{id:prop,nom:'Lampe fictive',famille:'ECLAIRAGE',statut:'EN_REVUE',date_modification:before,scope_node_id:node,scope_nom:'Bureau',est_auteur:false,est_relecteur:true}]};
  throw Error('SQL_MOCK_NON_ATTENDU '+sql.slice(0,50));
 },release(){}};
 return {queries,store:creerEnergyDashboardStore({obtenirClient:async()=>mock})};
}
test('C4C2 propriétaire : sous-arbre C1 puis liste paginée',async()=>{
 const {queries,store}=database();const r=await store.actions({tenant,actor:12,siteId:site});
 assert.equal(r.acces.complet,true);assert.equal(r.actions.length,1);assert.equal(r.actions[0].pourMoi,true);
 assert.deepEqual(queries.at(-1).args.slice(0,7),[404,7,12,node,12,true,'TOUTES']);
 assert.ok(queries.at(-1).sql.includes('JOIN scope n ON n.id=p.scope_node_id'));
 assert.ok(queries.at(-1).sql.includes('p.tenant_id=$2 AND p.owner_personne_id=$3'));
 assert.ok(queries.every(q=>!/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP)\b/i.test(q.sql)));
});
test('C4C2 collaborateur : filtrage des affectations sur le serveur',async()=>{
 const {queries,store}=database({owner:false});const r=await store.actions({tenant,actor:12,siteId:site,grantId:grant,statut:'A_CORRIGER',offset:50});
 assert.equal(r.acces.complet,false);assert.equal(queries.at(-1).args[5],false);
 assert.equal(queries.at(-1).args[6],'A_CORRIGER');assert.equal(queries.at(-1).args[7],50);
 assert.ok(queries.at(-1).sql.includes("g.statut='ACTIF'"));
 assert.ok(queries.at(-1).sql.includes('p.auteur_personne_id=$5'));
});
test('C4C2 collaborateur sans grant : fail closed AVANT lecture des propositions',async()=>{
 const {queries,store}=database({owner:false});const r=await store.actions({tenant,actor:12,siteId:site});
 assert.equal(r,null);assert.equal(queries.length,1);
});
test('C4C2 grant révoqué : fail closed AVANT lecture des propositions',async()=>{
 const {queries,store}=database({owner:false,activeGrant:false});const r=await store.actions({tenant,actor:12,siteId:site,grantId:grant});
 assert.equal(r,null);assert.equal(queries.length,2);
});
test('C4C2 autre site : fail closed AVANT lecture des propositions',async()=>{
 const {queries,store}=database({siteExists:false});const r=await store.actions({tenant,actor:12,siteId:site});
 assert.equal(r,null);assert.equal(queries.length,1);
});
test('C4C2 site C1 non initialisé : statut explicite, pas de zéro affirmatif',async()=>{
 const {queries,store}=database({root:false});const r=await store.actions({tenant,actor:12,siteId:site});
 assert.equal(r.statutStructure,'STRUCTURE_C1_NON_INITIALISEE');assert.deepEqual(r.actions,[]);assert.equal(queries.length,2);
});
