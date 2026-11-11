'use strict';
// Tests sans connexion réseau ni PostgreSQL.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Module=require('node:module');
const path=require('node:path');
const original=Module._load;
const routes={use:[],get:[],all:[],put:[]};
const router=()=>({use:f=>routes.use.push(f),get:(path,fn)=>routes.get.push({path,fn}),all:(path,fn)=>routes.all.push({path,fn}),put:(path,fn)=>routes.put.push({path,fn})});
Module._load=function(id,parent,isMain){if(id==='express')return {Router:router};if(id==='./database')return {executerRequete:()=>{throw Error('DB_INTERDITE_EN_TEST')}};if(id==='./services-database')return {obtenirPermissionsEffectivesDatabase:()=>{throw Error('RIGHTS_INTERDITS_EN_TEST')}};return original.apply(this,arguments);};
const {createEmailDemoRouter}=require('../bordeaux-email-demo-http');Module._load=original;
let isTest=true,person=333,permit=true,seen=[],noResult=false;
const query=async(sql,params)=>{seen.push([sql,params]);if(sql.startsWith('SELECT current_database'))return {rows:[{db:'sateer_test',sid:'7699611241381229531'}],rowCount:1};assert.match(sql,/pilot_email_inbox_demo/);assert.match(sql,/DEMO_SYNTHETIQUE/);if(params)assert.deepEqual(params.slice(0,2),[70,'P6V_3B5AC5AB9DB04657']);if(noResult)return {rows:[],rowCount:0};return {rows:[{id:1,objet:'<img src=x onerror=alert(1)>',texte:'Texte totalement fictif',categorieProposee:'CARTE_CONSULAIRE',uniteSuggeree:'Bureau Passeports'}],rowCount:1};};
createEmailDemoRouter({query,rights:async()=>({succes:true,permissionsOrganisation:permit?['VIEW_OPERATIONAL_DASHBOARD']:['VIEW_STRATEGIC_DASHBOARD']}),isTest:()=>isTest});
assert.equal(routes.use.length,2);
const same={organisationId:'70',tenant:'P6V_3B5AC5AB9DB04657'};
function response(){return {code:200,head:{},body:null,set(k,v){this.head[k]=v;return this;},status(n){this.code=n;return this;},json(x){this.body=x;return this;}};}
async function call(method,route,queryParams=same,id='1'){
 const req={auth:person?{personneId:person}:null,query:queryParams,params:{id}};const res=response();
 for(const m of routes.use){let next=false;await m(req,res,()=>{next=true;});if(!next)return res;}
 let handler=routes[method].find(x=>x.path===route)?.fn;
 if(!handler)throw Error('HANDLER_NOT_FOUND '+method+route);
 await handler(req,res);return res;
}
(async()=>{
 person=0;assert.equal((await call('get','/messages')).code,401);person=333;
 permit=false;assert.equal((await call('get','/messages')).code,403);permit=true;
 assert.equal((await call('get','/messages',{...same,tenant:'BAD'})).code,400);
 const list=await call('get','/messages');assert.equal(list.code,200);assert.equal(list.body.messages[0].id,1);assert.equal(list.body.enLectureSeule,true);
 const one=await call('get','/messages/:id',same,'1');assert.equal(one.code,200);assert.equal(one.body.message.categorieProposee,'CARTE_CONSULAIRE');
 assert.equal((await call('get','/messages/:id',same,'1 OR 1=1')).code,400);
 noResult=true;assert.equal((await call('get','/messages/:id',same,'999')).code,404);noResult=false;
 assert.equal((await call('all','/messages')).code,405);
 isTest=false;assert.equal((await call('get','/messages')).code,503);isTest=true;
 const frontend=fs.readFileSync(path.join(__dirname,'../public/email-secretariat-demo.js'),'utf8');
 assert.match(frontend,/textContent/);assert.doesNotMatch(frontend,/innerHTML|document\.write|eval\(/);
 const mainSource=fs.readFileSync(path.join(__dirname,'../bordeaux-email-demo-http.js'),'utf8');
 assert.doesNotMatch(mainSource,/\bINSERT\s+INTO\b|\bUPDATE\s+\w+\s+SET\b|\bDELETE\s+FROM\b/i);
 assert.match(mainSource,/VIEW_OPERATIONAL_DASHBOARD/);
 assert.match(mainSource,/pg_control_system/);
 console.log('EMAIL_SECRETARIAT_DEMO_PASS : 10 contrôles (session, isolation, contexte, API, écriture interdite, XSS, périmètre test).');
})().catch(e=>{console.error(e);process.exitCode=1;});
