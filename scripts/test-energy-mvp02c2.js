'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {data,revise,decision,cheminValide}=require('../energy/energy-collection-domain');
const {creerEnergyCollectionRouter}=require('../energy/energy-collection-http');
const root=path.resolve(__dirname,'..'),ID=crypto.randomUUID(),ID2=crypto.randomUUID();
const valid={sourceGrantId:ID,scopeNodeId:ID2,nom:'Compresseur frigorifique',famille:'MOTEUR',quantite:1,puissanceUnitaireW:2500};
test('C2 : déclaration d un compresseur industriel en famille canonique',()=>assert.deepEqual(data(valid),valid));
test('C2 : un ventilateur de bureau peut être déclaré sans puissance',()=>assert.equal(data({...valid,nom:'Ventilateur du bureau',famille:'AUTRE',puissanceUnitaireW:null}).puissanceUnitaireW,null));
for(const [name,mod] of [
 ['UUID suspect',{sourceGrantId:'../../test'}],['scope non UUID',{scopeNodeId:'xxx'}],['famille inconnue',{famille:'FICTION'}],
 ['quantité nulle',{quantite:0}],['quantité décimale',{quantite:1.2}],['nom vide',{nom:' '}],
 ['nom trop long',{nom:'a'.repeat(121)}],['contrôle injection',{nom:'hello\nworld'}],
 ['puissance négative',{puissanceUnitaireW:-4}],['puissance fraction',{puissanceUnitaireW:3.14}],
 ['trop grand lot',{quantite:10001}],['puissance non autorisée',{puissanceUnitaireW:'12'}],['champ propriétaire',{ownerPersonneId:1}]
])test('C2 : refuse '+name,()=>assert.equal(data({...valid,...mod}),null));
test('C2 : correction versionnée autorisée',()=>assert.equal(revise({...valid,version:3}).version,3));
test('C2 : correction sans version interdite',()=>assert.equal(revise(valid),null));
test('C2 : correction version négative interdite',()=>assert.equal(revise({...valid,version:-1}),null));
test('C2 : décision de revoir vers supérieur',()=>assert.equal(decision({reviewerGrantId:ID,version:1,decision:'APPROUVER'}).decision,'APPROUVER'));
for(const bad of ['CERTIFIER','SUPPRIMER','ACCEPTER'])test('C2 : décision '+bad+' non permise',()=>assert.equal(decision({reviewerGrantId:ID,version:1,decision:bad}),null));
test('C2 : refus et demande correction autorisés',()=>{assert.ok(decision({reviewerGrantId:ID,version:2,decision:'A_CORRIGER'}));assert.ok(decision({reviewerGrantId:ID,version:2,decision:'REFUSER'}));});
test('C2 : chaîne à 4 personnes A/B/C/D et 3 niveaux validable',()=>{
 const grants=[3,2,1,0].map((x,i)=>({id:String(i),parent_grant_id:i<3?String(i+1):null,personne_id:100+i,role_scope:i===0?'OCCUPANT':i===3?'COORDINATEUR':'RESPONSABLE',statut:'ACTIF'}));
 assert.equal(cheminValide(grants,100),true);
});
test('C2 : une affectation révoquée bloque toute la chaîne',()=>{
 const ch=[{id:'a',parent_grant_id:'b',personne_id:2,statut:'ACTIF',role_scope:'OCCUPANT'},
 {id:'b',parent_grant_id:'c',personne_id:3,statut:'REVOQUE',role_scope:'RESPONSABLE'},
 {id:'c',parent_grant_id:null,personne_id:1,statut:'ACTIF',role_scope:'COORDINATEUR'}];
 assert.equal(cheminValide(ch,2),false);
});
test('C2 : un cycle de délégation est refusé',()=>{
 const ch=[{id:'a',parent_grant_id:'b',personne_id:2,statut:'ACTIF',role_scope:'OCCUPANT'},
 {id:'b',parent_grant_id:'a',personne_id:3,statut:'ACTIF',role_scope:'RESPONSABLE'}];
 assert.equal(cheminValide(ch,2),false);
});
test('C2 : double rôle du déclarant dans les superviseurs est refusé',()=>{
 const ch=[{id:'a',parent_grant_id:'b',personne_id:2,statut:'ACTIF',role_scope:'OCCUPANT'},
 {id:'b',parent_grant_id:null,personne_id:2,statut:'ACTIF',role_scope:'COORDINATEUR'}];
 assert.equal(cheminValide(ch,2),false);
});
function router(){const handlers={};const middleware=[];return {handlers,use:fn=>middleware.push(fn),
 post:(p,fn)=>handlers['POST '+p]=fn,get:(p,fn)=>handlers['GET '+p]=fn};}
function mk(){let called=0;const st={};for(const op of ['submit','my','queue','review','correct','history']){
 st[op]=async arg=>{called++;return op==='my'?{propositions:[]}:op==='history'?{code:'OK',evenements:[]}:op==='queue'?{code:'OK',propositions:[]}: {code:'OK',id:ID};};}
 const r=router(),base=creerEnergyCollectionRouter({router:r,listerOrganisations:async(a,t)=>a===10?[{tenant_code:t}]:[],store:st,origineAutorisee:'http://localhost:3478',tenantAutorise:'ENERGY_MVP01D_RECETTE'});
 return {handlers:base.handlers,get called(){return called}};}
async function request(r,method,route,{actor=10,origin='http://localhost:3478',tenant='ENERGY_MVP01D_RECETTE',params={},body={},key=ID}={}){
 const values={};const res={set:(k,v)=>{values[k]=v;return res;},status:n=>{res.statusCode=n;return res;},json:o=>{res.body=o;return res;}};
 const req={method,auth:actor?{personneId:actor}:null,params,query:{tenant},body,get:k=>k==='Origin'?origin:k==='Idempotency-Key'?key:null};
 await r.handlers[method+' '+route](req,res);return res;
}
test('C2 : aucune route inventée de lecture photo, QR, compte ou certification',()=>{
 const routes=Object.keys(mk().handlers).join('\n');assert.doesNotMatch(routes,/photo|qr|compteur|certifier|login|energie\/cases/);
});
test('C2 : l anonyme est refusé avant store',async()=>{const r=mk();const q=await request(r,'GET','/mes-propositions',{actor:0});assert.equal(q.statusCode,401);assert.equal(r.called,0);});
test('C2 : le mauvais tenant est refusé avant store',async()=>{const r=mk();const q=await request(r,'GET','/mes-propositions',{tenant:'OTHER_TENANT'});assert.equal(q.statusCode,403);assert.equal(r.called,0);});
test('C2 : un acteur étranger est refusé avant store',async()=>{const r=mk();const q=await request(r,'GET','/mes-propositions',{actor:999});assert.equal(q.statusCode,403);assert.equal(r.called,0);});
test('C2 : une origine tierce est refusée avant toute écriture',async()=>{const r=mk();const q=await request(r,'POST','/sites/:siteId/propositions',{origin:'https://evil.invalid',params:{siteId:ID},body:valid});assert.equal(q.statusCode,403);assert.equal(r.called,0);});
test('C2 : le serveur refuse un id site suspect',async()=>{const r=mk();const q=await request(r,'POST','/sites/:siteId/propositions',{params:{siteId:'../../../x'},body:valid});assert.equal(q.statusCode,400);assert.equal(r.called,0);});
test('C2 : la clé idempotente est obligatoire',async()=>{const r=mk();const q=await request(r,'POST','/sites/:siteId/propositions',{params:{siteId:ID},body:valid,key:'invalid'});assert.equal(q.statusCode,400);assert.equal(r.called,0);});
test('C2 : les attributs non déclarés sont refusés',async()=>{const r=mk();const q=await request(r,'POST','/sites/:siteId/propositions',{params:{siteId:ID},body:{...valid,tenantId:1}});assert.equal(q.statusCode,400);assert.equal(r.called,0);});
test('C2 : la proposition valide arrive au seul store autorisé',async()=>{const r=mk();const q=await request(r,'POST','/sites/:siteId/propositions',{params:{siteId:ID},body:valid});assert.equal(q.statusCode,201);assert.equal(r.called,1);});
test('C2 : révision correcte et versionnée',async()=>{const r=mk();const q=await request(r,'POST','/sites/:siteId/propositions/:proposalId/corriger',{params:{siteId:ID,proposalId:ID2},body:{...valid,version:1}});assert.equal(q.statusCode,200);});
test('C2 : correction sans version est rejetée',async()=>{const r=mk();const q=await request(r,'POST','/sites/:siteId/propositions/:proposalId/corriger',{params:{siteId:ID,proposalId:ID2},body:valid});assert.equal(q.statusCode,400);});
test('C2 : revue par grant id obligatoire',async()=>{const r=mk();const q=await request(r,'POST','/sites/:siteId/propositions/:proposalId/decision',{params:{siteId:ID,proposalId:ID2},body:{reviewerGrantId:ID,version:1,decision:'APPROUVER'}});assert.equal(q.statusCode,200);});
test('C2 : aucune lecture de file sans grant id',async()=>{const r=mk();const q=await request(r,'GET','/sites/:siteId/a-verifier',{params:{siteId:ID}});assert.equal(q.statusCode,400);});
test('C2 : interface contient le circuit d aide et les statuts sans chiffres inventés',()=>{
 const html=fs.readFileSync(path.join(root,'public/energie-collecte.html'),'utf8');const js=fs.readFileSync(path.join(root,'public/energie-collecte.js'),'utf8');
 for(const term of ['energie-collecte.js','auth-client.js','mon inventaire','formProposer','mesPropositions','fileRevue','A_CORRIGER',''])assert.ok(html.toLowerCase().includes(term.toLowerCase())||js.includes(term),term);
 assert.match(js,/SATEER_CONTEXT_READY/);assert.match(js,/credentials:'same-origin'/);
 assert.doesNotMatch(html,/économies garanties|réductions certifiées/i);
});
