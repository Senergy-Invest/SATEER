"use strict";
const {test}=require('node:test');const assert=require('node:assert/strict');
const {creerRoutesBureauDiaspora}=require('../diaspora-bureau-http');
const {creerServiceBureauDiaspora}=require('../diaspora-bureau-service');
const tenant='AMBVIS_96C7FBBEA383DD';
function fixture({orgType='AMBASSADE',auth=42,allowed=['TARGET_COMMUNICATION'],tenantCode=tenant,publicationState='NON_DEMANDEE',audience='TOUS',media=[],orgExists=true}={}){
 const endpoints=new Map(),calls={perms:[],source:0,queue:0,transitions:[]};
 const router={get:(p,fn)=>endpoints.set('GET '+p,fn),post:(p,fn)=>endpoints.set('POST '+p,fn)};
 const service={listSource:async()=>{calls.source++;return[{id:10,titre:'Publication fictive',categorie:'INFORMATION',audience_type:'TOUS',statut_diffusion_diaspora:'NON_DEMANDEE',media_count:0}]},
 listQueue:async()=>{calls.queue++;return[{id:10,titre:'Visite fictive',contenu:'Contenu fictif',organisation:'Agence fictive',organisation_type:'AGENCE',audience_type:'TOUS'}]},
 transition:async x=>{calls.transitions.push(x);return {ok:true,id:x.publicationId,statut:'SOUMISE'}}};
 creerRoutesBureauDiaspora({router,verifierPermission:async x=>{calls.perms.push(x);return {succes:true,autorise:allowed.includes(x.permissionCode),portee:'ORGANISATION'}},
   trouverOrganisation:async()=>orgExists?{id:333,type:orgType}:null,service});
 const make=(method,path,extras={})=>{
   const req={method,params:{organisationId:'333',publicationId:'10'},query:{tenant:tenantCode},body:{tenantCode,motif:'Motif de rejet suffisant'},auth:auth?{personneId:auth}:null,get:()=>null,...extras};
   const res={statusCode:200,data:null,headers:{},set(k,v){this.headers[k]=v;return this;},status(n){this.statusCode=n;return this;},json(data){this.data=data;return this;}};
   return {req,res,invoke:()=>endpoints.get(method+' '+path)(req,res)};
 };
 return {make,calls};
}
const paths={source:'/:organisationId/diaspora/source-publications',submit:'/:organisationId/diaspora/submit/:publicationId',queue:'/:organisationId/diaspora/review-queue',approve:'/:organisationId/diaspora/approve/:publicationId',reject:'/:organisationId/diaspora/reject/:publicationId'};
test('refus 401 sans session',async()=>{const f=fixture({auth:null}),x=f.make('GET',paths.source);await x.invoke();assert.equal(x.res.statusCode,401);assert.equal(f.calls.source,0)});
test('refus tenant malformé',async()=>{const f=fixture({tenantCode:'../../autre'}),x=f.make('GET',paths.source);await x.invoke();assert.equal(x.res.statusCode,400);assert.equal(f.calls.perms.length,0)});
test('organisation absente du tenant, refus avant permission',async()=>{const f=fixture({orgExists:false}),x=f.make('GET',paths.source);await x.invoke();assert.equal(x.res.statusCode,404);assert.equal(f.calls.perms.length,0)});
test('source sans TARGET_COMMUNICATION refusée',async()=>{const f=fixture({allowed:[]}),x=f.make('POST',paths.submit);await x.invoke();assert.equal(x.res.statusCode,403);assert.equal(f.calls.transitions.length,0)});
test('source autorisée, soumission avec organisation source et session',async()=>{const f=fixture(),x=f.make('POST',paths.submit);await x.invoke();assert.equal(x.res.data.statut,'PUBLICATION_SOUMISE');assert.deepEqual(f.calls.transitions[0],{mode:'SUBMIT',publicationId:10,sourceOrgId:333,tenant,acteurId:42})});
test('source JSON réduit sans détail personnel',async()=>{const f=fixture(),x=f.make('GET',paths.source);await x.invoke();assert.equal(x.res.statusCode,200);assert.equal(x.res.data.publications[0].mediaCount,0);assert.equal(x.res.headers['Cache-Control'],'private, no-store');});
test('organisation non SATEER ne peut voir la file',async()=>{const f=fixture({allowed:['TARGET_COMMUNICATION','MANAGE_PUBLICATIONS']}),x=f.make('GET',paths.queue);await x.invoke();assert.equal(x.res.statusCode,403);assert.equal(f.calls.perms.length,0);});
test('SATEER sans MANAGE_PUBLICATIONS ne peut voir la file',async()=>{const f=fixture({orgType:'SATEER'}),x=f.make('GET',paths.queue);await x.invoke();assert.equal(x.res.statusCode,403);assert.equal(f.calls.queue,0);});
test('bureau SATEER avec deux droits lit la file',async()=>{const f=fixture({orgType:'SATEER',allowed:['TARGET_COMMUNICATION','MANAGE_PUBLICATIONS']}),x=f.make('GET',paths.queue);await x.invoke();assert.equal(x.res.statusCode,200);assert.equal(x.res.data.publications[0].organisation,'Agence fictive');});
test('SATEER approuve une publication du tenant, sans organisation source client',async()=>{const f=fixture({orgType:'SATEER',allowed:['TARGET_COMMUNICATION','MANAGE_PUBLICATIONS']}),x=f.make('POST',paths.approve);await x.invoke();assert.equal(x.res.statusCode,200);assert.equal(f.calls.transitions[0].sourceOrgId,null);assert.equal(f.calls.transitions[0].mode,'APPROVE');});
test('rejet doit être motivé',async()=>{const f=fixture({orgType:'SATEER',allowed:['TARGET_COMMUNICATION','MANAGE_PUBLICATIONS']}),x=f.make('POST',paths.reject,{body:{tenantCode:tenant,motif:'court'}});await x.invoke();assert.equal(x.res.statusCode,400);assert.equal(f.calls.transitions.length,0);});
test('rejet avec motif, trace acteurs',async()=>{const f=fixture({orgType:'SATEER',allowed:['TARGET_COMMUNICATION','MANAGE_PUBLICATIONS']}),x=f.make('POST',paths.reject);await x.invoke();assert.equal(x.res.statusCode,200);assert.equal(f.calls.transitions[0].mode,'REJECT');assert.equal(f.calls.transitions[0].motif,'Motif de rejet suffisant');});
test('origin cross-site refusée',async()=>{const f=fixture(),x=f.make('POST',paths.submit,{get:()=> 'https://site-externe.test'});await x.invoke();assert.equal(x.res.statusCode,403);assert.equal(f.calls.transitions.length,0);});
test('id publication invalide refusé avant toute transition',async()=>{const f=fixture(),x=f.make('POST',paths.submit,{params:{organisationId:'333',publicationId:'abc'}});await x.invoke();assert.equal(x.res.statusCode,400);assert.equal(f.calls.transitions.length,0);});
function baseService({state='NON_DEMANDEE',audience='TOUS',medias=[],auditFail=false}={}){
 const calls=[],p={id:10,organisation_id:333,tenant_id:9,statut:'PUBLIEE',statut_diffusion_diaspora:state,audience_type:audience,medias};
 const client={async query(sql,args){calls.push(sql.trim().slice(0,65));if(sql.trim().startsWith('SELECT p.id'))return {rowCount:1,rows:[p]};
 if(sql.includes('UPDATE publications'))return {rowCount:1,rows:[{id:10}]};
 if(sql.includes('INSERT INTO audit_trail')){if(auditFail)throw Error('audit failed');return {rowCount:1}};
 return {rowCount:0,rows:[]}},release(){calls.push('release')}};
 return {service:creerServiceBureauDiaspora({executerRequete:async()=>({rows:[]}),obtenirClientDatabase:async()=>client}),calls};
}
test('service : soumission auditee et commit atomique',async()=>{const f=baseService();const o=await f.service.transition({mode:'SUBMIT',publicationId:10,sourceOrgId:333,tenant,acteurId:42});assert.equal(o.ok,true);assert.equal(o.statut,'SOUMISE');assert.ok(f.calls.includes('COMMIT'));assert.ok(f.calls.some(x=>x.includes('INSERT INTO audit_trail')));});
test('service : ne diffuse jamais une audience restreinte',async()=>{const f=baseService({state:'SOUMISE',audience:'ASSOCIATION'}),o=await f.service.transition({mode:'APPROVE',publicationId:10,tenant,acteurId:43});assert.equal(o.code,'AUDIENCE_OU_MEDIAS_HORS_PERIMETRE_D2A');assert.ok(f.calls.includes('ROLLBACK'));assert.equal(f.calls.some(x=>x.includes('UPDATE publications')),false);});
test('service : refuse les médias non vérifiés',async()=>{const f=baseService({state:'SOUMISE',medias:[{type:'IMAGE'}]}),o=await f.service.transition({mode:'APPROVE',publicationId:10,tenant,acteurId:43});assert.equal(o.ok,false);assert.ok(f.calls.includes('ROLLBACK'));});
test('service : refuse état de diffusion incohérent',async()=>{const f=baseService({state:'DIFFUSEE'}),o=await f.service.transition({mode:'SUBMIT',publicationId:10,sourceOrgId:333,tenant,acteurId:42});assert.equal(o.code,'TRANSITION_INTERDITE');});
test('service : rollback si audit échoue',async()=>{const f=baseService({auditFail:true});await assert.rejects(f.service.transition({mode:'SUBMIT',publicationId:10,sourceOrgId:333,tenant,acteurId:42}));assert.ok(f.calls.includes('ROLLBACK'));assert.equal(f.calls.includes('COMMIT'),false);});

test('service : rejet d’une soumission restreinte autorisé avec audit',async()=>{const f=baseService({state:'SOUMISE',audience:'ASSOCIATION',medias:[{type:'IMAGE'}]});const o=await f.service.transition({mode:'REJECT',publicationId:10,tenant,acteurId:43,motif:'Audience non autorisée D2A'});assert.equal(o.ok,true);assert.equal(o.statut,'REJETEE');assert.ok(f.calls.includes('COMMIT'));});
