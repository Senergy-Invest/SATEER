'use strict';
/** Contrats d'API isolés : aucune DB, aucun HTTP réel, aucun e-mail. */
const test=require('node:test'),assert=require('node:assert/strict');
const Module=require('node:module'),path=require('node:path'),fs=require('node:fs');
const ROOT=process.env.SATEER_PROJECT_ROOT||path.resolve(__dirname,'..');
process.env.SATEER_PUBLIC_ORIGIN='http://127.0.0.1:3200';
const routes={use:[],get:[],put:[],post:[]};
const router=()=>({use:f=>routes.use.push(f),get:(p,f)=>routes.get.push({p,f}),post:(p,f)=>routes.post.push({p,f}),put:(p,f)=>routes.put.push({p,f})});
let entries=[],views=0,audits=0,commits=0,rollbacks=0,sqlLog=[];
let readAccess=true,writeAccess=true,cluster=true,isTest=true,staffAvailable=true,staffTakeRights=true;
const PERSON_A=21,PERSON_B=22;
const candidates=[
 {personneId:PERSON_A,prenom:'Agent',nom:'A',capacite:1,disponible:true,charge:6},
 {personneId:PERSON_B,prenom:'Agent',nom:'B',capacite:1,disponible:true,charge:1}
];
let doc={id:137,statut:'NOUVELLE',priorite:'NORMALE',assignee_a:null,destination_unit_id:115,tenant_id:12};
function result(rows){return {rows,rowCount:rows.length};}
async function query(sql,args=[]){sqlLog.push(sql);
 if(sql.startsWith('SELECT current_database()'))return result([{db:'sateer_test',sid:cluster?'7699611241381229531':'OTHER'}]);
 if(sql.includes('SELECT DISTINCT p.id AS'))return result(staffAvailable?candidates:[]);
 if(sql.includes('SELECT u.id,u.nom FROM organisation_units'))return result([{id:115,nom:'Bureau Passeports'}]);
 if(sql.includes('FROM organisation_units u JOIN organisations o')&&sql.includes('ORDER BY u.nom LIMIT'))return result([{id:115,nom:'Bureau Passeports'}]);
 if(sql.includes('FROM demandes d JOIN organisations o')&&sql.includes('FOR UPDATE OF d'))return result([{...doc}]);
 if(sql.startsWith('UPDATE demandes SET')){doc.assignee_a=args[0];return result([{id:doc.id,assignee_a:doc.assignee_a,statut:doc.statut}]);}
 if(sql.includes('INSERT INTO pilot_case_dispatch_audit')){audits++;return result([]);}
 if(sql.startsWith('SELECT COUNT(*)::int AS n FROM demandes'))return result([{n:1}]);
 if(sql.includes('SELECT d.id,d.categorie,d.objet,d.priorite'))return result([{id:137,objet:'Passeport',priorite:'NORMALE',statut:'NOUVELLE',agentId:doc.assignee_a}]);
 if(sql.includes('COUNT(d.id)::int AS total'))return result([{unitId:115,bureau:'Bureau Passeports',total:1,enAttente:1,enCours:0,traitees:0,sansAgent:doc.assignee_a?0:1}]);
 if(sql.includes('GROUP BY d.assignee_a'))return result([{agentId:21,dossiersOuverts:1,dossiersTraites:2,delaiPremiereReponseHeures:'12.5'}]);
 if(sql.includes('MIN(h.date_action)'))return result([{id:137,recuLe:'2026-01-01T00:00:00Z',orienteLe:'2026-01-01T01:00:00Z',prisEnChargeLe:null,premiereReponseLe:null,remisLe:null}]);
 if(sql.includes('FROM pilot_case_dispatch_audit WHERE'))return result([]);
 if(sql.includes('SELECT capacite,disponible FROM pilot_case_dispatch_agent_settings'))return result([]);
 if(sql.startsWith('SELECT pg_advisory_xact_lock')||sql.startsWith('SET LOCAL')||sql.startsWith('INSERT INTO pilot_case_dispatch_agent_settings'))return result([]);
 throw Error('REQUETE_MOCK_NON_PREVUE '+sql.slice(0,120));
}
async function rights(person){
 if(person===1)return {succes:true,permissionsOrganisation:[...(readAccess?['VIEW_OPERATIONAL_DASHBOARD']:[]),...(writeAccess?['ASSIGN_CONSULAR_CASES_PILOT']:[])]};
 if(person===PERSON_A||person===PERSON_B)return {succes:true,permissionsOrganisation:[],permissionsParUnite:[{uniteId:115,permissions:staffTakeRights?['TAKE_CASE']:[]}]};
 return {succes:true,permissionsOrganisation:[]};
}
const fakeClient=async()=>({query:async(sql,args)=>{
 if(sql==='COMMIT')commits++;else if(sql==='ROLLBACK')rollbacks++;
 if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return result([]);
 return query(sql,args);
},release(){}});
const original=Module._load;
try{
 Module._load=function(name,parent,isMain){
  if(name==='express')return {Router:router};
  if(name==='./database')return {executerRequete:()=>{throw Error('DB_INTERDITE')},obtenirClientDatabase:()=>{throw Error('DB_INTERDITE')}};
  if(name==='./services-database')return {obtenirPermissionsEffectivesDatabase:()=>{throw Error('DROITS_INTERDITS')}};
  return original.apply(this,arguments);
 };
 require(path.join(ROOT,'pilot-case-dispatch-http.js')).createCaseDispatchRouter({query,clientFactory:fakeClient,rights,isTest:()=>isTest});
}finally{Module._load=original;}
function response(){return {code:200,body:null,headers:{},set(k,v){this.headers[k]=v;return this},status(s){this.code=s;return this},json(obj){this.body=obj;return this}};}
async function request(method,route,{person=1,queryParams={},body={},param={},origin=true}={}){
 const req={auth:person?{personneId:person}:null,query:{organisationId:'70',tenant:'P6V_3B5AC5AB9DB04657',...queryParams},
   body,params:param,get:k=>k==='origin'&&origin?'http://127.0.0.1:3200':undefined};
 const res=response();
 for(const fn of routes.use){let nextCalled=false;await fn(req,res,()=>{nextCalled=true;});if(!nextCalled)return res;}
 const handler=routes[method].find(x=>x.p===route)?.f;assert(handler,'ROUTE_ABSENTE '+method+route);
 await handler(req,res);return res;
}
test('installation des routes séparées et du garde de session',()=>{
 assert(routes.use.length===1);assert(routes.post.some(x=>x.p==='/cases/:caseId/assign'));
 assert(routes.post.some(x=>x.p==='/units/:unitId/distribute'));
});
test('anonyme refusé',async()=>assert.equal((await request('get','/access',{person:0})).code,401));
test('mauvaise organisation refusée',async()=>assert.equal((await request('get','/access',{queryParams:{organisationId:'71'}})).code,400));
test('mauvais tenant refusé',async()=>assert.equal((await request('get','/access',{queryParams:{tenant:'INVALID'}})).code,400));
test('lecteur non autorisé refusé',async()=>{readAccess=false;assert.equal((await request('get','/access')).code,403);readAccess=true;});
test('base non test refusée',async()=>{isTest=false;assert.equal((await request('get','/access')).code,503);isTest=true;});
test('cluster différent refusé',async()=>{cluster=false;assert.equal((await request('get','/access')).code,503);cluster=true;});
test('vice A01 consultation autorisée',async()=>{const x=await request('get','/access');assert.equal(x.code,200);assert.equal(x.body.peutAffecter,true);});
test('consultation seule sans droit de répartition',async()=>{writeAccess=false;
 assert.equal((await request('get','/access')).body.peutAffecter,false);
 assert.equal((await request('post','/cases/:caseId/assign',{param:{caseId:'137'},body:{unitId:115,mode:'AUTO'}})).code,403);writeAccess=true;});
test('secrétariat exclu même avec URL directe',async()=>assert.equal((await request('get','/stats',{person:30})).code,403));
test('lecture des bureaux, dossiers, charges, délais',async()=>{
 assert.equal((await request('get','/units')).code,200);
 assert.equal((await request('get','/stats')).code,200);
 assert.equal((await request('get','/agent-metrics',{queryParams:{unitId:'115'}})).code,200);
 assert.equal((await request('get','/cases',{queryParams:{unitId:'115'}})).body.dossiers.length,1);
 const t=(await request('get','/delays',{queryParams:{unitId:'115'}}));assert.equal(t.code,200);
 assert.equal(t.body.moyennesSecondes.receptionVersOrientation,3600);
});
test('pagination invalide refusée',async()=>assert.equal((await request('get','/cases',{queryParams:{unitId:'115',offset:'-1'}})).code,400));
test('agent listé avec habilitation active et charge',async()=>{
 const x=(await request('get','/agents',{queryParams:{unitId:'115'}}));assert.equal(x.code,200);assert.equal(x.body.agents.length,2);
});
test('écriture sans Origin refusée',async()=>{
 assert.equal((await request('post','/cases/:caseId/assign',{param:{caseId:'137'},origin:false,body:{unitId:115,mode:'AUTO'}})).code,403);
});
test('mode invalide refusé',async()=>assert.equal((await request('post','/cases/:caseId/assign',{param:{caseId:'137'},body:{unitId:115,mode:'INCONNU'}})).code,400));
test('manuel : agent habilité et historique audit',async()=>{
 doc.assignee_a=null;const before=commits;
 const x=await request('post','/cases/:caseId/assign',{param:{caseId:'137'},body:{unitId:115,mode:'MANUEL',agentId:21}});
 assert.equal(x.code,200);assert.equal(x.body.affectations[0].agentId,21);
 assert.equal(commits,before+1);assert.equal(doc.assignee_a,21);assert(audits>0);
});
test('réaffectation sans motif explicite refusée et rollback',async()=>{
 doc.assignee_a=21;const before=rollbacks;
 const x=await request('post','/cases/:caseId/assign',{param:{caseId:'137'},body:{unitId:115,mode:'MANUEL',agentId:22}});
 assert.equal(x.code,400);assert.equal(x.body.statut,'MOTIF_REAFFECTATION_REQUIS');assert(rollbacks>before);
});
test('auto choisit le moins chargé et conserve statut nouvelle',async()=>{
 doc.assignee_a=null;const x=await request('post','/cases/:caseId/assign',{param:{caseId:'137'},body:{unitId:115,mode:'AUTO'}});
 assert.equal(x.code,200);assert.equal(x.body.affectations[0].agentId,22);assert.equal(doc.statut,'NOUVELLE');
});
test('aucun agent : aucun dossier modifié',async()=>{
 staffAvailable=false;doc.assignee_a=null;const x=await request('post','/cases/:caseId/assign',{param:{caseId:'137'},body:{unitId:115,mode:'AUTO'}});
 assert.equal(x.code,409);assert.equal(doc.assignee_a,null);staffAvailable=true;
});
test('lot nécessite confirmation explicite',async()=>{
 assert.equal((await request('post','/units/:unitId/distribute',{param:{unitId:'115'},body:{}})).code,400);
});
test('lot automatique confirmé, jamais plus de vingt',async()=>{
 doc.assignee_a=null;const x=await request('post','/units/:unitId/distribute',{param:{unitId:'115'},body:{confirmation:'REPARTIR_20_DOSSIERS_MAX'}});
 assert.equal(x.code,200);assert.equal(x.body.aucunEmail,true);assert.equal(x.body.aucunePriseEnCharge,true);
 assert(sqlLog.some(x=>x.includes('LIMIT $5 FOR UPDATE OF d')));
});

test('réaffectation manuelle avec motif auditée',async()=>{
 doc.assignee_a=21;const start=audits;
 const x=await request('post','/cases/:caseId/assign',{param:{caseId:'137'},body:{unitId:115,mode:'MANUEL',agentId:22,motif:'Absence imprévue agent précédent'}});
 assert.equal(x.code,200);assert.equal(doc.assignee_a,22);assert(audits>start);
});
test('aucun droit TAKE_CASE : aucune affectation',async()=>{
 staffTakeRights=false;doc.assignee_a=null;
 const x=await request('post','/cases/:caseId/assign',{param:{caseId:'137'},body:{unitId:115,mode:'AUTO'}});
 assert.equal(x.code,409);assert.equal(doc.assignee_a,null);staffTakeRights=true;
});
test('dossier en cours : pas de réaffectation par P335BY',async()=>{
 doc.statut='EN_COURS';doc.assignee_a=21;
 const x=await request('post','/cases/:caseId/assign',{param:{caseId:'137'},body:{unitId:115,mode:'MANUEL',agentId:22,motif:'Transfert après instruction'}});
 assert([404,409].includes(x.code));assert.equal(doc.assignee_a,21);
 doc.statut='NOUVELLE';doc.assignee_a=null;
});
test('seulement A01 peut consulter audit',async()=>{
 writeAccess=false;assert.equal((await request('get','/audit')).code,403);writeAccess=true;
 assert.equal((await request('get','/audit')).code,200);
});
test('config capacité validée et auditée',async()=>{
 const x=await request('put','/units/:unitId/agents/:agentId/settings',{param:{unitId:'115',agentId:'21'},body:{capacite:1.5,disponible:true}});
 assert.equal(x.code,200);assert.equal(x.body.capacite,1.5);
 assert.equal((await request('put','/units/:unitId/agents/:agentId/settings',{param:{unitId:'115',agentId:'21'},body:{capacite:0.1,disponible:true}})).code,400);
});
test('exclure les actions d envoi de courrier et de clôture',()=>{
 const code=fs.readFileSync(path.join(ROOT,'pilot-case-dispatch-http.js'),'utf8');
 assert.doesNotMatch(code,/\b(?:sendMail|smtp|imap|fetch\(['"]https?:|DELETE FROM demandes)\b/);
 assert.match(code,/AND d.statut='NOUVELLE'/);
});
test('prise en charge et réponse protégées par assignee_a',()=>{
 const code=fs.readFileSync(path.join(ROOT,'services-database.js'),'utf8');
 assert.match(code,/AND \(d\.assignee_a IS NULL OR d\.assignee_a = \$2\)/);
 assert.match(code,/AND d\.assignee_a = \$2/);
});
