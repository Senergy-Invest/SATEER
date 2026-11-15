"use strict";
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {THEMES,creerServiceOptinDiaspora}=require('../diaspora-optin-service');
const {creerRoutesOptinDiaspora}=require('../diaspora-optin-http');
const {creerRoutesRepertoireDiaspora}=require('../diaspora-directory-http');
const {notifierAbonnesDiaspora}=require('../diaspora-optin-notifications');
const {creerServiceBureauDiaspora}=require('../diaspora-bureau-service');
const T='AMBVIS_96C7FBBEA383DD';
function fixture({auth=45,tenant=T,member=true,permissions=['TARGET_COMMUNICATION','MANAGE_PUBLICATIONS'],orgType='SATEER'}={}){
 const handlers=new Map(),calls={touch:0,grants:[],writes:[]};
 const router={get:(p,f)=>handlers.set('GET '+p,f),put:(p,f)=>handlers.set('PUT '+p,f),post:(p,f)=>handlers.set('POST '+p,f)};
 const service={contexteCitoyen:async()=>member?9:null,lister:async()=>[],listerAssociations:async()=>[],
   modifierTheme:async(...args)=>{calls.touch++;calls.writes.push(args);return {ok:true,actif:args[3]};},
   modifierAssociation:async(...args)=>{calls.touch++;calls.writes.push(args);return {ok:true,actif:args[3]};},
   listerSuivies:async()=>[],listerRepertoireBureau:async()=>[{id:11,nom:'Association fictive',statut:'NON_VERIFIEE'}],
   verifierAssociation:async x=>{calls.touch++;calls.writes.push(x);return {ok:true,statut:x.statut};}};
 creerRoutesOptinDiaspora({router,service});
 creerRoutesRepertoireDiaspora({router,service,trouverOrganisation:async()=>({id:40,type:orgType}),
   verifierPermission:async x=>{calls.grants.push(x.permissionCode);return {succes:true,autorise:permissions.includes(x.permissionCode),portee:'ORGANISATION'};}});
 function make(method,url,{origin=null,body={actif:true,statut:'VERIFIEE'},params={}}={}){
   const req={method,auth:auth?{personneId:auth}:null,query:{tenant},body,
     params:{organisationId:'40',associationId:'11',theme:'EVENEMENT',...params},get:()=>origin};
   const res={code:200,payload:null,headers:{},set(k,v){this.headers[k]=v;return this;},status(x){this.code=x;return this;},json(x){this.payload=x;return this;}};
   return {req,res,call:()=>handlers.get(method+' '+url)(req,res)};
 }
 return {make,calls};
}
test('themes fixes et limites; jamais une categorie publicitaire implicite',()=>{
 assert.deepEqual(THEMES,['EVENEMENT','FORMATION','EMPLOI','ENTREPRENEURIAT','CULTURE','COMMUNAUTE']);
 assert(!THEMES.includes('SPONSORISE'));
});
test('session obligatoire pour les preferences',async()=>{
 const f=fixture({auth:null}),x=f.make('GET','/subscriptions');await x.call();assert.equal(x.res.code,401);
});
test('isolation tenant, aucune lecture pour membre hors scope',async()=>{
 const f=fixture({member:false}),x=f.make('GET','/subscriptions');await x.call();assert.equal(x.res.code,403);
});
test('ne jamais exposer les ids de personnes abonnés',async()=>{
 const f=fixture(),x=f.make('GET','/subscriptions');await x.call();assert.equal(x.res.code,200);assert.equal(JSON.stringify(x.res.payload).includes('personneId'),false);
});
test('origine externe interdit la modification',async()=>{
 const f=fixture(),x=f.make('PUT','/subscriptions/theme/:theme',{origin:'https://malveillant.test'});
 await x.call();assert.equal(x.res.code,403);assert.equal(f.calls.touch,0);
});
test('choix actif doit etre booleen strict',async()=>{
 const f=fixture(),x=f.make('PUT','/subscriptions/theme/:theme',{body:{actif:'true'}});
 await x.call();assert.equal(x.res.code,400);assert.equal(f.calls.touch,0);
});
test('refus des themes inconnus',async()=>{
 const f=fixture(),x=f.make('PUT','/subscriptions/theme/:theme',{params:{theme:'PUBLICITE'}});
 await x.call();assert.equal(x.res.code,400);assert.equal(f.calls.touch,0);
});
test('enregistrement theme lié à la session',async()=>{
 const f=fixture(),x=f.make('PUT','/subscriptions/theme/:theme');await x.call();
 assert.equal(x.res.code,200);assert.deepEqual(f.calls.writes[0],[45,T,'EVENEMENT',true]);
});
test('unsubscribe volontaire et idem',async()=>{
 const f=fixture(),x=f.make('PUT','/subscriptions/theme/:theme',{body:{actif:false}});await x.call();
 assert.equal(x.res.code,200);assert.deepEqual(f.calls.writes[0],[45,T,'EVENEMENT',false]);
});
test('refus ID association non numerique',async()=>{
 const f=fixture(),x=f.make('PUT','/subscriptions/association/:associationId',{params:{associationId:'../../other'}});
 await x.call();assert.equal(x.res.code,400);assert.equal(f.calls.touch,0);
});
test('suivi association dans son scope session',async()=>{
 const f=fixture(),x=f.make('PUT','/subscriptions/association/:associationId');await x.call();
 assert.deepEqual(f.calls.writes[0],[45,T,11,true]);
});
test('repertoire protege par type organisation SATEER',async()=>{
 const f=fixture({orgType:'CONSULAT'}),x=f.make('GET','/:organisationId/diaspora/association-directory');
 await x.call();assert.equal(x.res.code,403);assert.equal(f.calls.grants.length,0);
});
test('repertoire protege par les deux permissions Core',async()=>{
 const f=fixture({permissions:['TARGET_COMMUNICATION']}),x=f.make('GET','/:organisationId/diaspora/association-directory');
 await x.call();assert.equal(x.res.code,403);
});
test('agent bureau peut lire la liste sans membres nominatifs',async()=>{
 const f=fixture(),x=f.make('GET','/:organisationId/diaspora/association-directory');
 await x.call();assert.equal(x.res.code,200);assert.equal(x.res.payload.associations[0].statut,'NON_VERIFIEE');
});
test('statut repertoire refuse tout etat hors catalogue',async()=>{
 const f=fixture(),x=f.make('POST','/:organisationId/diaspora/association-directory/:associationId',{body:{statut:'OFFICIELLE'}});
 await x.call();assert.equal(x.res.code,400);assert.equal(f.calls.touch,0);
});
test('repertoire: l identity vient du cookie de session et auditeur SATEER',async()=>{
 const f=fixture(),x=f.make('POST','/:organisationId/diaspora/association-directory/:associationId');
 await x.call();assert.equal(x.res.code,200);
 assert.deepEqual(f.calls.writes[0],{bureauId:40,associationId:11,acteurId:45,tenant:T,statut:'VERIFIEE'});
});
test('restriction XSRF sur validation association',async()=>{
 const f=fixture(),x=f.make('POST','/:organisationId/diaspora/association-directory/:associationId',{origin:'https://x.test'});
 await x.call();assert.equal(x.res.code,403);assert.equal(f.calls.touch,0);
});
test('connexion publique du fil suivi refuse sans tenant',async()=>{
 const f=fixture({tenant:'INVALID/../../'}),x=f.make('GET','/followed-feed');await x.call();assert.equal(x.res.code,400);
});
test('fanout refuse sans client ni publication',async()=>{
 await assert.rejects(notifierAbonnesDiaspora(null,10));
 await assert.rejects(notifierAbonnesDiaspora({query:async()=>({})},0));
});
test('fanout contient SQL idempotent, plafond et audience stricts',async()=>{
 const sql=[];const client={query:async(q,args)=>{sql.push({sql:q,args});return {rowCount:q.includes('pg_advisory')?1:0};}};
 assert.equal(await notifierAbonnesDiaspora(client,42),0);
 assert(sql[1].sql.includes("p.statut_diffusion_diaspora='DIFFUSEE'"));
 assert(sql[1].sql.includes("p.audience_type='TOUS'"));
 assert(sql[1].sql.includes("ON CONFLICT DO NOTHING"));
 assert(sql[1].sql.includes("INTERVAL '24 hours'"));
 assert(sql[1].sql.includes('SELECT DISTINCT'));
});
test('appels au fanout atomique, seulement a APPROVE',async()=>{
 const calls=[],client={query:async sql=>{calls.push(String(sql).trim());if(sql.startsWith('BEGIN')||sql.startsWith('COMMIT'))return {rowCount:0};
  if(sql.includes('SELECT p.id,p.organisation_id'))return {rowCount:1,rows:[{id:91,organisation_id:22,tenant_id:9,statut:'PUBLIEE',statut_diffusion_diaspora:'SOUMISE',audience_type:'TOUS',medias:[]}]};
  if(sql.includes('UPDATE publications'))return {rowCount:1,rows:[{id:91}]};return {rowCount:1};},release(){}};
 let deliveries=0;
 const svc=creerServiceBureauDiaspora({executerRequete:async()=>({rows:[]}),obtenirClientDatabase:async()=>client,notifierAbonnesDiaspora:async()=>{deliveries++;return 1;}});
 await svc.transition({mode:'APPROVE',publicationId:91,tenant:T,acteurId:4});
 assert.equal(deliveries,1);
 assert(calls.findIndex(x=>x.includes('INSERT INTO audit_trail'))>calls.findIndex(x=>x.includes('UPDATE publications')));
 assert.equal(calls.at(-1),'COMMIT');
});
test('rollback intégral si notification échoue',async()=>{
 const calls=[],client={query:async sql=>{calls.push(String(sql).trim());if(sql.includes('SELECT p.id,p.organisation_id'))return {rowCount:1,rows:[{id:91,organisation_id:22,tenant_id:9,statut:'PUBLIEE',statut_diffusion_diaspora:'SOUMISE',audience_type:'TOUS',medias:[]}]};
 if(sql.includes('UPDATE publications'))return {rowCount:1,rows:[{id:91}]};return {rowCount:0};},release(){}};
 const svc=creerServiceBureauDiaspora({executerRequete:async()=>({rows:[]}),obtenirClientDatabase:async()=>client,notifierAbonnesDiaspora:async()=>{throw Error('FANOUT_FAILED');}});
 await assert.rejects(svc.transition({mode:'APPROVE',publicationId:91,tenant:T,acteurId:4}),/FANOUT_FAILED/);
 assert(calls.includes('ROLLBACK'));assert(!calls.includes('COMMIT'));
});

// R2 : regression PostgreSQL 42P08 identifiee pendant la recette authentifiee.
// Le parametre $3 doit porter un type unique en INSERT comme en CASE.
const {test: testTypageD2B}=require('node:test');
const {readFileSync: lireTypageD2B}=require('node:fs');
const {join: joindreTypageD2B}=require('node:path');
testTypageD2B('Repertoire : statut $3 explicitement VARCHAR dans VALUES et CASE',()=>{
 const sql=lireTypageD2B(joindreTypageD2B(__dirname,'..','diaspora-optin-service.js'),'utf8');
 const statement=sql.match(/INSERT INTO diaspora_association_directory[\s\S]*?ON CONFLICT\(tenant_id,organisation_id\)/);
 require('node:assert/strict').ok(statement,'UPSERT registre association present');
 require('node:assert/strict').match(statement[0],/VALUES\(\$1::integer,\$2::integer,\$3::varchar\(16\),\$4::integer,/);
 require('node:assert/strict').match(statement[0],/CASE WHEN \$3::varchar\(16\)='VERIFIEE'/);
 require('node:assert/strict').doesNotMatch(statement[0],/\$3::text/);
});
