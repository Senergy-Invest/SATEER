'use strict';
// P335BY-C1 : tests du contrat PostgreSQL -> JSON -> interface, sans DB ni réseau.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Module=require('node:module');
const path=require('node:path');
const ROOT=process.env.SATEER_PROJECT_ROOT||path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(ROOT,'pilot-case-dispatch-http.js'),'utf8');
const frontend=fs.readFileSync(path.join(ROOT,'public/repartition-dossiers-bordeaux.js'),'utf8');
const keys=['enAttente','enCours','sansAgent','agentsAvecCharge'];
const routes={get:[],use:[],post:[],put:[]};
const router=()=>({use:fn=>routes.use.push(fn),get:(p,fn)=>routes.get.push({p,fn}),post:(p,fn)=>routes.post.push({p,fn}),put:(p,fn)=>routes.put.push({p,fn})});
const original=Module._load;
let createCaseDispatchRouter;
try{
 Module._load=function(id,parent,isMain){
  if(id==='express')return {Router:router};
  if(id==='./database')return {executerRequete:()=>{throw Error('DB_NOT_ALLOWED')},obtenirClientDatabase:()=>{throw Error('DB_NOT_ALLOWED')}};
  if(id==='./services-database')return {obtenirPermissionsEffectivesDatabase:()=>{throw Error('RIGHTS_NOT_ALLOWED')}};
  if(id==='./pilot-mail-dispatch-core')return {proposerAgent:()=>{throw Error('NO_ASSIGNMENT_ALLOWED')},durees:()=>{throw Error('NO_DURATIONS_ALLOWED')}};
  return original.apply(this,arguments);
 };
 ({createCaseDispatchRouter}=require(path.join(ROOT,'pilot-case-dispatch-http.js')));
}finally{Module._load=original;}
const values={enAttente:2,enCours:0,traitees:4,sansAgent:2,agentsAvecCharge:0};
const fakeQuery=async sql=>{
 if(sql.startsWith('SELECT current_database()'))return {rows:[{db:'sateer_test',sid:'7699611241381229531'}],rowCount:1};
 if(sql.includes('COUNT(d.id)::int AS total')){
   const row={unitId:115,bureau:'Bureau Passeports',total:6,traitees:4};
   for(const k of keys){
    const re=new RegExp('\\bAS\\s+("'+k+'"|'+k+')(?=\\s|,|$)');
    const match=re.exec(sql); assert(match,'COLONNE_MANQUANTE: '+k);
    // PostgreSQL folds identifiers not protected by double quotes to lowercase.
    const actual=match[1].startsWith('"')?k:k.toLowerCase();
    row[actual]=values[k];
   }
   return {rows:[row],rowCount:1};
 }
 throw Error('SQL_UNEXPECTED');
};
createCaseDispatchRouter({query:fakeQuery,rights:async()=>({succes:true,permissionsOrganisation:['VIEW_OPERATIONAL_DASHBOARD','ASSIGN_CONSULAR_CASES_PILOT']}),isTest:()=>true});
async function call(p){
 const req={auth:{personneId:322},query:{organisationId:'70',tenant:'P6V_3B5AC5AB9DB04657'}};
 const res={statusCode:200,set(){return this},status(n){this.statusCode=n;return this},json(body){this.body=body;return this}};
 for(const fn of routes.use){let nextCalled=false;await fn(req,res,()=>{nextCalled=true});if(!nextCalled)return res;}
 const handler=routes.get.find(r=>r.p===p)?.fn;assert(handler,'ROUTE_NOT_FOUND');await handler(req,res);return res;
}
for(const k of keys){
 test('alias PostgreSQL respecte la casse : '+k,()=>assert.match(source,new RegExp('\\bAS\\s+"'+k+'"(?=\\s|,|$)')));
}
test('réponse API /stats : tous les nombres sont présents',async()=>{
 const r=await call('/stats');assert.equal(r.statusCode,200);
 assert.equal(r.body.statut,'CHARGE_BUREAUX');
 assert.equal(r.body.bureaux.length,1);
 for(const k of keys)assert.equal(r.body.bureaux[0][k],values[k]);
 assert.equal(r.body.bureaux[0].enAttente+r.body.bureaux[0].enCours,2);
});
test('interface refuse les données incomplètes au lieu de NaN',()=>{
 assert.match(frontend,/STATISTIQUES_INCOMPATIBLES/);
 assert.match(frontend,/Number\.isSafeInteger\(b\[k\]\)/);
 assert.doesNotMatch(frontend,/innerHTML|document\.write|\beval\(/);
});
test('version frontend actualisée pour invalider le cache',()=>{
 const html=fs.readFileSync(path.join(ROOT,'public/repartition-dossiers-bordeaux.html'),'utf8');
 assert.match(html,/repartition-dossiers-bordeaux\.js\?v=p335byc1/);
});
