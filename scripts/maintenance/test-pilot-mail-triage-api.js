'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),Module=require('node:module');
const ROOT=process.env.SATEER_PROJECT_ROOT||path.resolve(__dirname,'../..');
const original=Module._load, handlers={use:[],get:[],all:[],put:[]};
const makeRouter=()=>({use:f=>handlers.use.push(f),get:(p,f)=>handlers.get.push([p,f]),all:(p,f)=>handlers.all.push([p,f]),put:(p,f)=>handlers.put.push([p,f])});
let create;
try{
 Module._load=function(id,parent,isMain){
  if(id==='express')return {Router:makeRouter};
  if(id==='./database')return {executerRequete:()=>{throw Error('DB_TEST_INTERDITE')},obtenirClientDatabase:()=>{throw Error('DB_TEST_INTERDITE')}};
  if(id==='./services-database')return {obtenirPermissionsEffectivesDatabase:()=>{throw Error('DROITS_TEST_INTERDITS')}};
  return original.apply(this,arguments);
 };
 create=require(path.join(ROOT,'bordeaux-email-demo-http.js')).createEmailDemoRouter;
}finally{Module._load=original;}
const TENANT='P6V_3B5AC5AB9DB04657';
const context={organisationId:'70',tenant:TENANT};
const rows=[
 {id:1,objet:'Carte consulaire',texte:'Bonjour, je souhaite préparer une carte consulaire. Merci.',expediteur:'Fiction A',boite:'CONSULAT_DEMO'},
 {id:2,objet:'Passeport',texte:'Bonjour, quels documents pour renouveler mon passeport ?',expediteur:'Fiction B',boite:'CONSULAT_DEMO'},
 {id:3,objet:'Passeport',texte:'Je souhaite déposer mon dossier de passeport.',expediteur:'Fiction C',boite:'CONSULAT_DEMO'},
 {id:4,objet:'Question',texte:'Question sur mon passeport et mon acte de naissance.',expediteur:'Fiction D',boite:'CONSULAT_DEMO'}
];
let rules=[{categorie:'PASSEPORT',mode:'PROPOSITION',bureauId:115,bureauValide:true,actif:true}];
let writes=[];
const q=async (sql,args)=>{
 if(sql.startsWith('SELECT current_database'))return {rows:[{db:'sateer_test',sid:'7699611241381229531'}],rowCount:1};
 if(sql.includes('FROM pilot_email_triage_demo_rules r'))return {rows:rules,rowCount:rules.length};
 if(sql.includes('FROM pilot_email_inbox_demo e')){
   const selected=args?.length===3?rows.filter(x=>String(x.id)===String(args[2])):rows;
   return {rows:selected,rowCount:selected.length};
 }
 if(sql.includes('FROM pilot_email_triage_demo_audit'))return {rows:[],rowCount:0};
 if(sql.includes('FROM organisation_units u'))return {rows:[{id:115,nom:'Bureau Passeports'}],rowCount:1};
 throw Error('REQUETE_INATTENDUE '+sql.slice(0,75));
};
const rights=async person=>({succes:true,permissionsOrganisation:person===1?['VIEW_CONSULAR_MAIL_DEMO']:
 person===2?['VIEW_OPERATIONAL_DASHBOARD','CONFIGURE_CONSULAR_MAIL_DEMO']:
 person===3?['VIEW_STRATEGIC_DASHBOARD']:[]});
const clientFactory=async()=>({release(){},query:async(sql,args)=>{
 writes.push(sql.slice(0,40));
 if(sql.includes('SELECT u.id FROM organisation_units'))return {rows:[{id:115}],rowCount:1};
 if(sql.includes('SELECT category_key,mode,destination_unit_id'))return {rows:[],rowCount:0};
 if(sql.includes('INSERT INTO pilot_email_triage_demo_rules'))return {rows:[{category_key:'PASSEPORT',mode:args[3],destination_unit_id:args[4]}],rowCount:1};
 return {rows:[],rowCount:1};
}});
create({query:q,rights,isTest:()=>true,clientFactory});
function res(){return {code:200,body:null,headers:{},set(k,v){this.headers[k]=v;return this},status(code){this.code=code;return this},json(o){this.body=o;return this}};}
async function call(route,{person=1,method='get',params=context,id='1',body=null,origin='http://127.0.0.1:3200'}={}){
 const req={auth:person?{personneId:person}:null,query:params,params:{id,categorie:id},body,
   get:k=>k.toLowerCase()==='origin'?origin:null};
 const response=res();
 for(const mw of handlers.use){let proceed=false;await mw(req,response,()=>{proceed=true});if(!proceed)return response;}
 const fn=handlers[method].find(([p])=>p===route||p==='/triage/regles/:categorie'&&route.startsWith('/triage/regles/'))?.[1];assert(fn,'route '+route+' MANQUANTE');
 await fn(req,response);return response;
}
process.env.SATEER_PUBLIC_ORIGIN='http://127.0.0.1:3200';
test('anonyme, Consul stratégique et mauvais tenant refusés',async()=>{
 assert.equal((await call('/triage/vice',{person:0})).code,401);
 assert.equal((await call('/triage/vice',{person:3})).code,403);
 assert.equal((await call('/triage/vice',{person:2,params:{...context,tenant:'AUTRE'}})).code,400);
});
test('Secrétariat : uniquement cas humains et aucune supervision générale',async()=>{
 const r=await call('/triage/secretariat');assert.equal(r.code,200);
 assert.deepEqual(r.body.messages.map(x=>x.id),[1,4]);
 assert.equal(r.body.totalCourriers,4);assert.equal(r.body.nombres.secretariat,2);
 assert.equal((await call('/triage/vice')).code,403);
 assert.equal((await call('/triage/regles')).code,403);
 assert.equal((await call('/triage/bureaux')).code,403);
 assert.equal((await call('/triage/audit')).code,403);
});
test('Vice-Consul : vue tous les courriers et distribution transparente',async()=>{
 const r=await call('/triage/vice',{person:2});assert.equal(r.code,200);
 assert.deepEqual(r.body.messages.map(x=>x.id),[1,2,3,4]);
 assert.deepEqual(r.body.nombres,{secretariat:2,assistant:1,bureau:1});
 assert(r.body.messages.every(x=>!('texte' in x)&&x.decisionFile.execution===false));
});
test('API historique : Secrétariat ne peut contourner la restriction',async()=>{
 const r=await call('/messages');assert.equal(r.code,200);
 assert.deepEqual(r.body.messages.map(x=>x.id),[1,4]);
 assert.equal((await call('/messages/:id',{id:'2'})).code,403);
 assert.equal((await call('/messages/:id/qualification',{id:'2'})).code,403);
 assert.equal((await call('/messages/:id/conseil',{id:'2'})).code,403);
 assert.equal((await call('/messages/:id',{id:'1'})).code,200);
 assert.equal((await call('/messages/:id',{person:2,id:'2'})).code,200);
});
test('paramétrage: seul A01 peut écrire, contrôles Origin et valeurs strictes',async()=>{
 assert.equal((await call('/triage/regles/PASSEPORT',{method:'put',person:1,id:'PASSEPORT',body:{mode:'MANUEL'}})).code,403);
 assert.equal((await call('/triage/regles/PASSEPORT',{method:'put',person:2,id:'PASSEPORT',origin:'http://evil.example',body:{mode:'MANUEL'}})).code,403);
 assert.equal((await call('/triage/regles/PASSEPORT',{method:'put',person:2,id:'PASSEPORT',body:{mode:'AUTO_ENVOI'}})).code,400);
 assert.equal((await call('/triage/regles/PASSEPORT',{method:'put',person:2,id:'PASSEPORT',body:{mode:'PROPOSITION'}})).code,400);
 assert.equal((await call('/triage/regles/PASSEPORT',{method:'put',person:2,id:'PASSEPORT',body:{mode:'PROPOSITION',destinationUnitId:115}})).code,200);
 assert(writes.some(x=>x.includes('INSERT INTO pilot_email_triage_demo_')));
});
test('faux mails uniquement : aucune route d’envoi ni traitement',async()=>{
 assert(!handlers.put.some(([name])=>/messages\/|send|transmettre|dossier/.test(name)));
 const a=await call('/triage/access',{person:1}),b=await call('/triage/access',{person:2});
 assert.equal(a.body.profil,'SECRETARIAT');assert.equal(a.body.peutConfigurer,false);
 assert.equal(b.body.peutConfigurer,true);assert.equal(b.body.envoiAutorise,false);
});
