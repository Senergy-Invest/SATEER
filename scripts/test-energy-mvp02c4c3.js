'use strict';
/** C4C3 — responsabilité de relecture, jamais de droits déduits. */
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {suiviValide,presenterAction}=require('../energy/energy-dashboard-actions-domain');
const {creerEnergyDashboardStore}=require('../energy/energy-dashboard-store');
const {creerEnergyDashboardRouter}=require('../energy/energy-dashboard-http');
const id=()=>crypto.randomUUID(),tenant='ENERGY_MVP01D_RECETTE';
const site=id(),node=id(),grant=id(),prop=id(),time='2026-11-19T12:00:00Z';
const proposal=(active,statut='EN_REVUE')=>({id:prop,nom:'Matériel de recette',famille:'FROID',statut,
 date_modification:time,scope_node_id:node,scope_nom:'Bureau fictif',est_auteur:false,est_relecteur:false,relecteur_actif:active});
for (const [value,expected] of [[undefined,'TOUS'],['TOUS','TOUS'],['SANS_RELECTEUR_ACTIF','SANS_RELECTEUR_ACTIF'],['',null],['INCONNU',null],[{},null],[['TOUS'],null]]) {
 test('C4C3 validation filtre suivi '+String(value),()=>assert.equal(suiviValide(value),expected));
}
test('C4C3 relecteur actif est un constat, pas autorisation',()=>{
 const r=presenterAction(proposal(true),new Date(time));assert.equal(r.suiviRelecture,'RELECTEUR_ACTIF');assert.equal(r.pourMoi,false);
});
test('C4C3 statut sans relecteur actif explicite',()=>{
 const r=presenterAction(proposal(false),new Date(time));assert.equal(r.suiviRelecture,'SANS_RELECTEUR_ACTIF');assert.equal(r.prochaineEtape,'EXAMEN_HUMAIN');
});
test('C4C3 correction auteur : ne pas qualifier le relecteur',()=>{
 const r=presenterAction(proposal(false,'A_CORRIGER'),new Date(time));assert.equal(r.suiviRelecture,'NON_APPLICABLE');
});
test('C4C3 aucune identité personnelle ni énergie dans la réponse',()=>{
 const r=presenterAction(proposal(false),new Date(time));const s=JSON.stringify(r);
 assert.ok(!/email|auteur_personne_id|reviewer_grant_id|relecteur_id|puissance|kWh|economies|nom_relecteur/i.test(s));
});
function fakeRouter(){const routes={};return {use(){},get(path,fn){routes[path]=fn;},routes};}
function fakeRes(){return {statusCode:200,set(){return this;},status(n){this.statusCode=n;return this;},json(o){this.body=o;return this;}};}
function fakeRoute({member=true,auth=true,allowed=true}={}){
 const router=fakeRouter();const store={sites:async()=>({sites:[]}),synthese:async()=>({}),actions:async(x)=>allowed?{actions:[],filtre:x.statut,suivi:x.suivi}:null};
 creerEnergyDashboardRouter({router,store,listerOrganisations:async()=>member?[{tenant_code:tenant}]:[],tenantAutorise:tenant});
 const req={auth:auth?{personneId:12}:null,params:{siteId:site},query:{tenant,suivi:'SANS_RELECTEUR_ACTIF'},method:'GET'};
 return {handler:router.routes['/sites/:siteId/actions'],routes:router.routes,req};
}
test('C4C3 HTTP transmet le filtre propriétaire au store',async()=>{
 const {handler,req}=fakeRoute(),res=fakeRes();await handler(req,res);
 assert.equal(res.statusCode,200);assert.equal(res.body.suivi,'SANS_RELECTEUR_ACTIF');
});
for(const [nom,change,code] of [
 ['filtre inconnu',r=>r.query.suivi='REVOQUE',400],
 ['tableau dans filtre',r=>r.query.suivi=['TOUS'],400],
 ['session absente',r=>r.auth=null,401],
 ['tenant invalide',r=>r.query.tenant='AUTRE',403],
 ['site invalide',r=>r.params.siteId='abc',400]
]) test('C4C3 HTTP refuse '+nom,async()=>{
 const {handler,req}=fakeRoute(),res=fakeRes();change(req);await handler(req,res);assert.equal(res.statusCode,code);
});
test('C4C3 ne crée aucun endpoint POST ou PUT',()=>{
 const {routes}=fakeRoute();assert.deepEqual(Object.keys(routes).sort(),['/sites','/sites/:siteId/actions','/sites/:siteId/synthese']);
});
function db({owner=true,active=true,siteExists=true,root=true}={}){
 const qs=[];
 const mock={async query(sql,args){qs.push({sql,args});
  if(sql.includes('FROM energy_inventory_sites s JOIN tenants t'))return {rows:siteExists?[{id:404,public_id:site,nom:'Site',type_site:'LOGEMENT',tenant_id:7,owner_personne_id:owner?12:23}]:[]};
  if(sql.includes('FROM energy_scope_grants g JOIN energy_scope_nodes n'))return {rows:active?[{node_id:node,role_scope:'RESPONSABLE',nom:'Bureau'}]:[]};
  if(sql.includes("'PROPRIETAIRE' AS role_scope"))return {rows:root?[{node_id:node,role_scope:'PROPRIETAIRE',nom:'Site'}]:[]};
  if(sql.includes('p.date_modification ASC,p.id ASC'))return {rows:[proposal(false)]};
  throw Error('REQUETE_NON_ATTENDUE '+sql.slice(0,90));},release(){}};
 return {qs,store:creerEnergyDashboardStore({obtenirClient:async()=>mock})};
}
test('C4C3 propriétaire seulement : diagnostic sans relecteur, SQL paramétré',async()=>{
 const {qs,store}=db();const r=await store.actions({tenant,actor:12,siteId:site,suivi:'SANS_RELECTEUR_ACTIF'});
 assert.equal(r.actions[0].suiviRelecture,'SANS_RELECTEUR_ACTIF');
 const q=qs.at(-1);assert.equal(q.args[8],'SANS_RELECTEUR_ACTIF');
 assert.ok(q.sql.includes("review_grant.statut='ACTIF'"));
 assert.ok(q.sql.includes('p.reviewer_grant_id'));
 assert.ok(q.sql.includes('JOIN scope n ON n.id=p.scope_node_id'));
 assert.ok(q.sql.includes('p.tenant_id=$2 AND p.owner_personne_id=$3'));
 assert.ok(qs.every(x=>!/^\s*(UPDATE|INSERT|DELETE|ALTER|DROP|TRUNCATE)\b/i.test(x.sql)));
});
test('C4C3 collaborateur : filtre réservé propriétaire, refus AVANT lecture de propositions',async()=>{
 const {qs,store}=db({owner:false});const r=await store.actions({tenant,actor:12,siteId:site,grantId:grant,suivi:'SANS_RELECTEUR_ACTIF'});
 assert.equal(r,null);assert.equal(qs.length,2);
});
test('C4C3 grant révoqué : refus avant diagnostic',async()=>{
 const {qs,store}=db({owner:false,active:false});const r=await store.actions({tenant,actor:12,siteId:site,grantId:grant,suivi:'SANS_RELECTEUR_ACTIF'});
 assert.equal(r,null);assert.equal(qs.length,2);
});
test('C4C3 autre site : refus avant diagnostic',async()=>{
 const {qs,store}=db({siteExists:false});const r=await store.actions({tenant,actor:12,siteId:site,suivi:'SANS_RELECTEUR_ACTIF'});
 assert.equal(r,null);assert.equal(qs.length,1);
});
test('C4C3 propriétaire sans structure C1 : pas de diagnostic de relecture fabriqué',async()=>{
 const {qs,store}=db({root:false});const r=await store.actions({tenant,actor:12,siteId:site,suivi:'SANS_RELECTEUR_ACTIF'});
 assert.equal(r.statutStructure,'STRUCTURE_C1_NON_INITIALISEE');assert.deepEqual(r.actions,[]);assert.equal(qs.length,2);
});
