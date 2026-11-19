'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {UUID,FAMILLES,ref,identity,canonical,contentHash}=require('../energy/energy-catalogue-domain');
const {creerEnergyCatalogueRouter}=require('../energy/energy-catalogue-http');
const root=path.join(__dirname,'..');const P='e1a2ba79-3c4a-44c9-a6fd-7e44aa3754d8', S='02bf44e7-5a83-4be2-a8bb-0d0cf4960f2a';
const data={famille:'FROID',sousFamille:'Compresseur frigorifique',designation:'Compresseur test',marque:'Test Fab',modele:'Modèle R1',puissanceNominaleW:1200,tensionV:230,sourcePassportId:P};
const tests=[
 ['famille FROID autorisée',()=>assert.ok(FAMILLES.includes('FROID'))],
 ['familles C2 autorisées',()=>assert.ok(FAMILLES.includes('MOTEUR'))],
 ['fiche complète',()=>assert.ok(ref(data))],
 ['UUID valide',()=>assert.ok(UUID.test(P))],
 ['UUID chemin malveillant rejeté',()=>assert.ok(!UUID.test('../secrets'))],
 ['champ arbitraire refusé',()=>assert.equal(ref({...data,owner_personne_id:1}),null)],
 ['famille arbitraire refusée',()=>assert.equal(ref({...data,famille:'POISON'}),null)],
 ['nom de sous famille vide interdit',()=>assert.equal(ref({...data,sousFamille:' '}),null)],
 ['désignation vide interdit',()=>assert.equal(ref({...data,designation:''}),null)],
 ['texte HTML interdit dans nom',()=>assert.equal(ref({...data,designation:'<script>alert(1)</script>'}),null)],
 ['puissance négative refusée',()=>assert.equal(ref({...data,puissanceNominaleW:-1}),null)],
 ['tension négative refusée',()=>assert.equal(ref({...data,tensionV:-1}),null)],
 ['puissance infinie refusée',()=>assert.equal(ref({...data,puissanceNominaleW:Infinity}),null)],
 ['tension flottante refusée',()=>assert.equal(ref({...data,tensionV:12.5}),null)],
 ['plaque étrangère refusée',()=>assert.equal(ref({...data,sourcePassportId:'abc'}),null)],
 ['référence sans photo autorisée',()=>assert.ok(ref({...data,sourcePassportId:null}))],
 ['marque inconnue autorisée en candidate',()=>assert.ok(ref({...data,marque:null}))],
 ['identité modèle incomplète',()=>assert.equal(identity({...data,modele:null}),null)],
 ['empreinte modèle de taille attendue',()=>assert.match(identity(data),/^[0-9a-f]{64}$/)],
 ['accents équivalents',()=>assert.equal(canonical('MôDÈLE  R1'),canonical('modele r1'))],
 ['espaces équivalents',()=>assert.equal(canonical('  TEST  FAB '),canonical('test fab'))],
 ['empreintes de marque identique',()=>assert.equal(identity(data),identity({...data,marque:'  test   fab '}))],
 ['empreintes de modèle différentes',()=>assert.notEqual(identity(data),identity({...data,modele:'MODÈLE R2'}))],
 ['même marque autre sous-famille différente',()=>assert.notEqual(identity(data),identity({...data,sousFamille:'Pompe à chaleur'}))],
 ['hash stable',()=>assert.equal(contentHash(data),contentHash({...data}))],
 ['hash change si puissance change',()=>assert.notEqual(contentHash(data),contentHash({...data,puissanceNominaleW:1300}))],
];
for(const [name,fn] of tests)test(name,fn);
function routerMock(){const routes={},middleware=[];const r={use(fn){middleware.push(fn);},get(p,fn){routes['GET '+p]=fn;},post(p,fn){routes['POST '+p]=fn;}};return {routes,middleware,r};}
function setup(){const {routes,middleware,r}=routerMock();const calls=[];
 const store={list:async x=>{calls.push(['list',x]);return {references:[]};},source:async x=>{calls.push(['source',x]);return {passportId:x.passportId};},
 create:async x=>{calls.push(['create',x]);return {code:'OK',id:P,nouvelle:true};},decide:async x=>{calls.push(['decide',x]);return {code:'OK',id:x.refId};},
 link:async x=>{calls.push(['link',x]);return {code:'OK',nouveau:true};}};
 creerEnergyCatalogueRouter({router:r,store,listerOrganisations:async(actor,tenant)=>actor===7?[{tenant_code:tenant}]:[],
 origineAutorisee:'http://localhost:3480',tenantAutorise:'ENERGY_MVP01D_RECETTE'});
 async function req(method,p,{params={},query={tenant:'ENERGY_MVP01D_RECETTE'},auth={personneId:7},origin='http://localhost:3480',body,key}={}){
  const req={method,params,query,auth,body,get:n=>n==='Origin'?origin:n==='Idempotency-Key'?key:null};
  const out={status:200,body:null,headers:{}};const res={set(n,v){out.headers[n]=v;return this;},status(n){out.status=n;return this;},json(x){out.body=x;return this;}};
  for(const f of middleware)f(req,res,()=>{});
  assert.ok(routes[method+' '+p],p);
  await routes[method+' '+p](req,res);return out;
 }
 return {req,calls,store};
}
const rp='/sites/:siteId/references';
test('router lit sans cookie exposé',async()=>{const x=setup(),r=await x.req('GET',rp,{params:{siteId:S}});assert.equal(r.status,200);assert.equal(r.headers['Cache-Control'],'private, no-store');});
test('Core Auth obligatoire',async()=>{const r=await setup().req('GET',rp,{params:{siteId:S},auth:null});assert.equal(r.status,401);});
test('membre non autorisé rejeté',async()=>{const r=await setup().req('GET',rp,{params:{siteId:S},auth:{personneId:8}});assert.equal(r.status,403);});
test('tenant incorrect rejeté',async()=>{const r=await setup().req('GET',rp,{params:{siteId:S},query:{tenant:'OTHER'}});assert.equal(r.status,403);});
test('identifiant site mal formé rejeté',async()=>{const r=await setup().req('GET',rp,{params:{siteId:'x'}});assert.equal(r.status,400);});
test('origine tierce bloquée à la création',async()=>{const r=await setup().req('POST',rp,{params:{siteId:S},origin:'https://evil.invalid',body:data,key:S});assert.equal(r.status,403);});
test('idempotence requise',async()=>{const r=await setup().req('POST',rp,{params:{siteId:S},body:data});assert.equal(r.status,400);});
test('champs propriétaires interdits',async()=>{const r=await setup().req('POST',rp,{params:{siteId:S},body:{...data,personneId:999},key:S});assert.equal(r.status,400);});
test('création candidate sous scope serveur',async()=>{const x=setup(),r=await x.req('POST',rp,{params:{siteId:S},body:data,key:S});assert.equal(r.status,201);assert.equal(x.calls[0][1].actor,7);assert.equal(x.calls[0][1].siteId,S);});
test('refus de décision arbitraire',async()=>{const r=await setup().req('POST','/sites/:siteId/references/:refId/decision',{params:{siteId:S,refId:P},body:{decision:'CERTIFIER'}});assert.equal(r.status,400);});
test('référencement humain exact',async()=>{const x=setup(),r=await x.req('POST','/sites/:siteId/references/:refId/decision',{params:{siteId:S,refId:P},body:{decision:'REFERENCER'}});assert.equal(r.status,200);assert.equal(x.calls[0][1].decision,'REFERENCER');});
test('association ne peut pas viser une URL',async()=>{const r=await setup().req('POST','/sites/:siteId/references/:refId/associer',{params:{siteId:S,refId:P},body:{passportId:'../../'}});assert.equal(r.status,400);});
test('lien appareil validé exact',async()=>{const x=setup(),r=await x.req('POST','/sites/:siteId/references/:refId/associer',{params:{siteId:S,refId:P},body:{passportId:P}});assert.equal(r.status,200);assert.equal(x.calls[0][1].passportId,P);});
test('source OCR soumise à Core',async()=>{const x=setup(),r=await x.req('GET','/sites/:siteId/sources/:passportId',{params:{siteId:S,passportId:P}});assert.equal(r.status,200);});
test('liste de refus masquée',async()=>{const x=setup();x.store.list=async()=>null;const r=await x.req('GET',rp,{params:{siteId:S}});assert.equal(r.status,404);});
test('page ne contient pas de partage externe ni télémétrie',()=>{const html=fs.readFileSync(path.join(root,'public/energie-catalogue.html'),'utf8');const js=fs.readFileSync(path.join(root,'public/energie-catalogue.js'),'utf8');
 for(const id of ['id="source"','id="famille"','id="marque"','id="modele"','id="references"','id="formLier"'])assert.ok(html.includes(id));
 assert.match(js,/SATEER_CONTEXT_READY/);assert.match(js,/credentials:'same-origin'/);assert.doesNotMatch(js,/localStorage|sessionStorage|sendBeacon|FileReader|getUserMedia/);
});
