'use strict';
/** P335BO — vraies routes HTTP Express, DB simulée. Aucune boîte IMAP/SMTP et aucun SQL. */
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const root=process.env.SATEER_BORDEAUX_ROOT || path.resolve(__dirname,'../..');
const express=require(path.join(root,'node_modules/express'));
const {createEmailDemoRouter}=require(path.join(root,'bordeaux-email-demo-http.js'));
const ORG=70,TENANT='P6V_3B5AC5AB9DB04657';
const fixtures={
  1:{id:1,objet:'[DEMARCHE:PASSEPORT] Renseignements',texte:'Comment faire pour renouveler mon passeport ? Quels documents faut-il ?'},
  2:{id:2,objet:'Passeport',texte:'Je souhaite déposer mon dossier de passeport.'},
  3:{id:3,objet:'Suivi passeport',texte:'Mon dossier de passeport est bloqué. Où en est ma demande ?'}
};
const approved={code:'BO_TEST_FICHE',categorie:'PASSEPORT',titre:'Renouvellement de passeport',actif:true,valide_par:123,validation_explicite:true,pieces_obligatoires:['CNI_RECTO','PASSEPORT']};
const seen=[];
async function fakeQuery(sql,params=[]){
 const s=String(sql);seen.push(s);
 assert.match(s,/^\s*SELECT\b/i,'Les routes en lecture seule ne peuvent écrire');
 if(s.includes('current_database()')) return {rows:[{db:'sateer_test',sid:'7699611241381229531'}],rowCount:1};
 if(s.includes('FROM organisation_procedure_catalogue')){
  assert.equal(params[0],ORG);assert.equal(params[1],TENANT);
  return {rows:[approved],rowCount:1};
 }
 if(s.includes('FROM pilot_email_inbox_demo')){
  assert.equal(params[0],ORG);assert.equal(params[1],TENANT);
  if(params.length===2){const rows=Object.values(fixtures);return {rows,rowCount:rows.length};}
  const item=fixtures[Number(params[2])];const rows=item?[item]:[];return {rows,rowCount:rows.length};
 }
 throw Error('SQL_INTERDITE_DANS_FIXTURE');
}
const app=express();
app.use((req,_res,next)=>{const actor=req.get('x-fixture-actor');if(actor==='vice')req.auth={personneId:901};else if(actor==='consul')req.auth={personneId:903};next();});
app.use('/api/bordeaux-email-demo',createEmailDemoRouter({
 query:fakeQuery,
 rights:async personId=>({succes:true,permissionsOrganisation:personId===901?['VIEW_OPERATIONAL_DASHBOARD']:['VIEW_STRATEGIC_DASHBOARD']}),
 isTest:()=>true
}));
function start(){return new Promise((resolve,reject)=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));server.once('error',reject);});}
async function call(base,url,actor,method='GET'){
 const res=await fetch(base+url,{method,headers:{accept:'application/json',...(actor?{'x-fixture-actor':actor}:{})},redirect:'manual'});
 return {status:res.status,body:await res.json().catch(()=>null)};
}
test('API synthétique HTTP réelle : droits, intention, absence de modification ou envoi',async()=>{
 const server=await start();
 const base=`http://127.0.0.1:${server.address().port}`;
 const q=`?organisationId=${ORG}&tenant=${TENANT}`;
 const route='/api/bordeaux-email-demo';
 try {
  assert.equal((await call(base,route+'/messages'+q)).status,401,'anonyme');
  assert.equal((await call(base,route+'/messages'+q,'consul')).status,403,'Consul non opérationnel');
  assert.equal((await call(base,route+'/messages?organisationId=70&tenant=AUTRE','vice')).status,400,'tenant inconnu');
  assert.equal((await call(base,route+'/messages?organisationId=71&tenant='+TENANT,'vice')).status,400,'organisation inconnue');
  const list=await call(base,route+'/messages'+q,'vice');
  assert.equal(list.status,200);assert.equal(list.body.enLectureSeule,true);assert.equal(list.body.messages.length,3);
  for(const [id,expected] of [[1,'INFORMATION'],[2,'DEMANDE'],[3,'SECRETARIAT']]){
   const r=await call(base,`${route}/messages/${id}/qualification${q}`,'vice');
   assert.equal(r.status,200,`qualification ${id}`);
   assert.equal(r.body.decision.intention,expected);
   assert.equal(r.body.decision.envoiAutorise,false);
   assert.equal(r.body.decision.creationDossierAutorisee,false);
   assert.equal(r.body.decision.routageAutomatiqueAutorise,false);
   assert.equal(r.body.validationHumaineRequise,true);
  }
  const faq=await call(base,route+'/messages/1/conseil'+q,'vice');
  assert.equal(faq.status,200);assert.equal(faq.body.conseil.etat,'FICHE_VALIDEE_ACTIVE');
  assert.equal(faq.body.envoiAutorise,false);
  const actionable=await call(base,route+'/messages/2/conseil'+q,'vice');
  assert.equal(actionable.status,200);assert.equal(actionable.body.conseil.etat,'HORS_INFORMATION');
  const individual=await call(base,route+'/messages/3/conseil'+q,'vice');
  assert.equal(individual.status,200);assert.equal(individual.body.conseil.etat,'HORS_INFORMATION');
  assert.equal((await call(base,route+'/messages/999'+q,'vice')).status,404);
  assert.equal((await call(base,route+'/messages/1%20OR%201=1'+q,'vice')).status,400);
  assert.equal((await call(base,route+'/messages'+q,'vice','POST')).status,405);
  assert.equal((await call(base,route+'/scenarios/SCENARIO_INCONNU/conseil'+q,'vice')).status,404);
  assert(seen.length>0);assert(seen.every(s=>/^\s*SELECT\b/i.test(s)),'Aucune écriture SQL');
 } finally {
  await new Promise(resolve=>server.close(resolve));
 }
});
