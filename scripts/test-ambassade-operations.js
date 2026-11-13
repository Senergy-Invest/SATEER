"use strict";
const assert=require('node:assert/strict');
const {creerProjectionOperationsAmbassade,SQL_DEMANDES,SQL_PUBLICATIONS,SQL_UNITES}=require('../ambassade-operations');
const {creerRouteOperationsAmbassade}=require('../ambassade-operations-http');
let n=0;
function ok(c,msg){assert.ok(c,msg);n++;}
const metrics={total:10,nouvelles:3,enCours:4,traitees:3,sansDestination:2,urgentesOuvertes:1};
let calls=[];
const requete=async (sql,args)=>{calls.push({sql,args});return {rows: sql===SQL_DEMANDES?[metrics]:sql===SQL_PUBLICATIONS?[{publiees:5}]:sql===SQL_UNITES?[{id:33,nom:'Bureau fictif',code:'BUREAU_TEST'}]:[]};};
const charger=creerProjectionOperationsAmbassade({requete});
(async()=>{
  const vue=await charger({organisationId:11,tenantCode:'SN'});
  ok(vue.demandes.total===10&&vue.demandes.sansDestination===2,'Agrégats de Workflow');
  ok(vue.publications.publiees===5,'Agrégat Communication');
  ok(vue.unites.length===1&&vue.unites[0].code==='BUREAU_TEST','Unités sans personnels');
  ok(vue.orientationInterPostes==='NON_CONFIGUREE','Aucun routage inventé');
  ok(calls.length===3&&calls.every(x=>x.args[0]===11&&x.args[1]==='SN'),'Toutes requêtes filtrées par organisation et tenant');
  ok([SQL_DEMANDES,SQL_PUBLICATIONS,SQL_UNITES].every(s=>!/(?:INSERT|UPDATE|DELETE|DROP|CREATE)\s+/i.test(s)),'Lecture seule');
  ok(!JSON.stringify(vue).includes('prenom')&&!JSON.stringify(vue).includes('description'),'Pas de donnée de dossier');
  await assert.rejects(()=>charger({organisationId:0,tenantCode:'SN'}),/CONTEXTE_INVALIDE/);n++;
  await assert.rejects(()=>charger({organisationId:11,tenantCode:'FR;DROP'}),/CONTEXTE_INVALIDE/);n++;
  await assert.rejects(()=>charger({organisationId:11,tenantCode:'fr'}),/CONTEXTE_INVALIDE/);n++;
  let broken=creerProjectionOperationsAmbassade({requete:async sql=>({rows:sql===SQL_DEMANDES?[{...metrics,total:-1}]:sql===SQL_PUBLICATIONS?[{publiees:2}]:[]})});
  await assert.rejects(()=>broken({organisationId:11,tenantCode:'SN'}),/COMPTEUR_INVALIDE/);n++;
  const routes={};const router={get:(p,h)=>routes[p]=h};
  let orgType='AMBASSADE',allowed=true,roleScope='ORGANISATION',sourceDown=false,accesses=0,queryCount=0,ids=[];
  creerRouteOperationsAmbassade({router,
    trouverOrganisation:async (id,tenant)=>{accesses++;return orgType==='MISSING'?null:{id,type:orgType,tenant_code:tenant};},
    verifierPermission:async p=>{queryCount++;ids.push(p);return {succes:true,autorise:allowed,portee:roleScope};},
    charger:async p=>{if(sourceDown)throw new Error('Secret failure');return {...vue,...p};}
  });
  ok(typeof routes['/:organisationId/summary']==='function','Une seule route GET');
  function res(){return {statusCode:200,headers:{},body:null,set(k,v){this.headers[k]=v;return this;},status(s){this.statusCode=s;return this;},json(x){this.body=x;return this;}};}
  async function run({auth={personneId:66},id='11',tenant='SN'}={}){const response=res();await routes['/:organisationId/summary']({auth,params:{organisationId:id},query:{tenant}},response);return response;}
  let r=await run();ok(r.statusCode===200&&r.body.statut==='OPERATIONS_AMBASSADE','Lecture permise');
  ok(r.body.vue.demandes.sansDestination===2,'Compte demandes non orientées');
  ok(r.headers['Cache-Control']==='private, no-store','Données non cachées');
  ok(ids[0].permissionCode==='VIEW_ORGANISATION_ANALYTICS'&&ids[0].uniteId===null,'Permission organisationnelle existante');
  let avant=accesses;r=await run({auth:null});ok(r.statusCode===401&&accesses===avant,'Session requise avant accès BD');
  for(const obj of [{id:'abc'},{id:'0'},{id:'9007199254740993'},{tenant:'fr'},{tenant:'SN;'}]){
    r=await run(obj);ok(r.statusCode===400,'Requête invalide refusée');
  }
  ok(accesses===avant,'Paramètres invalides : zéro accès BD');
  orgType='CONSULAT';r=await run();ok(r.statusCode===403,'Autre type d organisation refusé');
  orgType='MISSING';r=await run();ok(r.statusCode===403,'Organisation inexistante refusée');
  orgType='AMBASSADE';allowed=false;r=await run();ok(r.statusCode===403,'Permission non attribuée refusée');
  allowed=true;roleScope='UNIT';r=await run();ok(r.statusCode===403,'Permission unité pas équivalente');
  roleScope='ORGANISATION';sourceDown=true;r=await run();ok(r.statusCode===503&&!JSON.stringify(r.body).includes('Secret'),'Erreur masquée');
  const source=require('node:fs').readFileSync(require('node:path').resolve(__dirname,'../server.js'),'utf8');
  ok(source.includes('SATEER_ENABLE_AMBASSADE_OPERATIONS')&&source.includes('PGDATABASE === "sateer_test"'),'Drapeau recette');
  ok(source.includes('app.use("/api/ambassade-operations", exigerSession'),'Middleware session Core');
  ok(!source.includes('app.post("/api/ambassade-operations"'),'Aucune écriture exposée');
  console.log('AMBASSADE_A5_SERVICE_HTTP_PASS='+n);
})().catch(e=>{console.error(e);process.exitCode=1;});
