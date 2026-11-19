'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {creerEnergyScopeRouter}=require('../energy/energy-scope-http');
const U='e1a2ba79-3c4a-44c9-a6fd-7e44aa3754d8',T='ENERGY_MVP01D_RECETTE',ORIGIN='http://localhost:3477';
function setup({member=true,targetMember=true}={}){
 let calls=0;const routes=new Map(),mw=[];
 const router={use(f){mw.push(f);},get(p,f){routes.set('GET '+p,f);},post(p,f){routes.set('POST '+p,f);}};
 const store={
  initialise:async()=>{calls++;return {code:'OK',rootNodeId:U,sourceGrantId:U};},
  mine:async()=>({responsabilites:[]}),inbox:async()=>({invitations:[]}),
  accept:async()=>{calls++;return {code:'OK',grantId:U};},
  createNode:async()=>{calls++;return {code:'OK',id:U};},
  issue:async()=>{calls++;return {code:'OK',id:U};},
  tree:async()=>({unites:[],perimetre:'SITE'}),revoke:async()=>{calls++;return {code:'OK',nombreRevoquees:2};},
  revokeInvitation:async()=>{calls++;return {code:'OK'};},
  sentInvitations:async()=>({invitations:[]}),subordinates:async()=>({responsabilites:[]})
 };
 creerEnergyScopeRouter({router,store,listerOrganisations:async(personneId)=>member&&(personneId!==4||targetMember)?[{tenant_code:T}]:[],origineAutorisee:ORIGIN,tenantAutorise:T});
 async function send(method,path,{auth={personneId:1},tenant=T,origin=ORIGIN,body={},params={siteId:U,sourceGrantId:U,invitationId:U,targetGrantId:U},extra={},key=U}={}){
  const request={method,auth,query:{tenant,...extra},params,body,get:k=>k==='Origin'?origin:k==='Idempotency-Key'?key:null};
  let code=200,json=null,headers={};const res={set(k,v){headers[k]=v;return this;},status(x){code=x;return this;},json(x){json=x;return this;}};
  for(const fn of mw)await fn(request,res,()=>{});
  const f=routes.get(method+' '+path);assert.ok(f,'route '+method+' '+path);await f(request,res);
  return {code,json,headers};
 }
 return {send,get calls(){return calls}};
}
test('la requete sans Core retourne 401 avant store',async()=>{const f=setup();assert.equal((await f.send('POST','/sites/:siteId/initialiser',{auth:null})).code,401);assert.equal(f.calls,0);});
test('un autre tenant refuse initialiser',async()=>{const f=setup();assert.equal((await f.send('POST','/sites/:siteId/initialiser',{tenant:'AMBVIS_96C7FBBEA383DD'})).code,403);assert.equal(f.calls,0);});
test('non membre Core refuse',async()=>{const f=setup({member:false});assert.equal((await f.send('POST','/sites/:siteId/initialiser')).code,403);});
test('Origin tierce refuse invitations',async()=>{const f=setup();assert.equal((await f.send('POST','/sites/:siteId/invitations',{origin:'https://not-allowed.invalid'})).code,403);assert.equal(f.calls,0);});
test('champ extra ne peut créer unité',async()=>{const f=setup();const body={sourceGrantId:U,parentNodeId:U,typeNoeud:'BUREAU',nom:'Bureau',personneId:4};assert.equal((await f.send('POST','/sites/:siteId/unites',{body})).code,400);assert.equal(f.calls,0);});
test('Idempotency-Key obligatoire',async()=>{const f=setup();const body={sourceGrantId:U,parentNodeId:U,typeNoeud:'BUREAU',nom:'Bureau'};assert.equal((await f.send('POST','/sites/:siteId/unites',{body,key:null})).code,400);});
test('creation unite authentifiee',async()=>{const f=setup();const body={sourceGrantId:U,parentNodeId:U,typeNoeud:'BUREAU',nom:'Bureau'};const r=await f.send('POST','/sites/:siteId/unites',{body});assert.equal(r.code,201);assert.equal(f.calls,1);});
test('role coordinateur ne peut être invité',async()=>{const f=setup();const body={sourceGrantId:U,targetNodeId:U,targetPersonneId:4,role:'COORDINATEUR'};assert.equal((await f.send('POST','/sites/:siteId/invitations',{body})).code,400);});
test('invitation nominative autorisee',async()=>{const f=setup();const body={sourceGrantId:U,targetNodeId:U,targetPersonneId:4,role:'RESPONSABLE'};assert.equal((await f.send('POST','/sites/:siteId/invitations',{body})).code,201);});
test('inbox accessible uniquement apres controle Core',async()=>{const f=setup();const r=await f.send('GET','/mes-invitations');assert.equal(r.code,200);assert.equal(r.json.statut,'MES_INVITATIONS_CIBLEES');assert.equal(r.headers['Cache-Control'],'private, no-store');});
test('unité sans grantId ne divulgue pas arbre',async()=>{const f=setup();assert.equal((await f.send('GET','/sites/:siteId/arbre',{extra:{offset:0}})).code,400);});
test('pagination hors plage refusee',async()=>{const f=setup();assert.equal((await f.send('GET','/sites/:siteId/arbre',{extra:{grantId:U,offset:-1}})).code,400);});
test('revocation doit nommer délégant',async()=>{const f=setup();assert.equal((await f.send('POST','/sites/:siteId/responsabilites/:targetGrantId/revoquer',{body:{}})).code,400);});
test('revocation fournit uniquement grant source',async()=>{const f=setup();const r=await f.send('POST','/sites/:siteId/responsabilites/:targetGrantId/revoquer',{body:{sourceGrantId:U}});assert.equal(r.code,200);assert.equal(r.json.nombreRevoquees,2);});
test('invitation invalide ne s accepte pas',async()=>{const f=setup();const r=await f.send('POST','/invitations/:invitationId/accepter',{params:{invitationId:'../../etc'},body:{}});assert.equal(r.code,400);});

test('compte d un autre tenant ne peut recevoir une invitation',async()=>{const f=setup({targetMember:false});const body={sourceGrantId:U,targetNodeId:U,targetPersonneId:4,role:'RESPONSABLE'};assert.equal((await f.send('POST','/sites/:siteId/invitations',{body})).code,404);assert.equal(f.calls,0);});
