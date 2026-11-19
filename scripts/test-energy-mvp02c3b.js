'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {submit,correct,decide,identity,cheminValide}=require('../energy/energy-catalogue-collab-domain');
const {creerEnergyCatalogueCollabRouter}=require('../energy/energy-catalogue-collab-http');
const uuid=()=>crypto.randomUUID();const X=uuid(),Y=uuid(),Z=uuid();
const BASE={sourceGrantId:X,c2ProposalId:Y,famille:'FROID',sousFamille:'Compresseur frigorifique',designation:'Compresseur chambre froide',
 marque:'Fabricant test',modele:'A1',puissanceNominaleW:2700,tensionV:230};
function makeRouter({store={},orgs=async()=>[{tenant_code:'ENERGY_MVP01D_RECETTE'}]}={}){
 const routes=[];const router={use:()=>{},get:(path,fn)=>routes.push({method:'GET',path,fn}),post:(path,fn)=>routes.push({method:'POST',path,fn})};
 const full=Object.fromEntries(['integrated','submit','my','queue','review','correct','history'].map(k=>[k,async()=>({code:'OK',propositions:[],equipements:[]})]));
 creerEnergyCatalogueCollabRouter({router,store:{...full,...store},listerOrganisations:orgs,
  origineAutorisee:'http://localhost:3481',tenantAutorise:'ENERGY_MVP01D_RECETTE'});
 async function call(method,path,{auth={personneId:708},tenant='ENERGY_MVP01D_RECETTE',origin='http://localhost:3481',body={},key}={}){
  const entry=routes.find(r=>r.method===method&&r.path===path);assert.ok(entry,path);
  const p=Object.fromEntries([...path.matchAll(/:(\w+)/g)].map(x=>[x[1],Z]));
  const headers={Origin:origin,'Idempotency-Key':key||X};
  const req={method,params:p,query:{tenant},auth,body,get:k=>headers[k]};
  const res={statusCode:200,headers:{},set(k,v){this.headers[k]=v;return this;},status(n){this.statusCode=n;return this;},json(o){this.payload=o;return this;}};
  await entry.fn(req,res);return res;
 }
 return {routes,call};
}
test('C3B valide une fiche libre et refuse les champs de privilege',()=>{
 assert.deepEqual(submit(BASE),BASE);assert.equal(submit({...BASE,owner_personne_id:1}),null);
 assert.equal(submit({...BASE,c2ProposalId:'nope'}),null);assert.equal(submit({...BASE,sourceGrantId:'bad'}),null);
 assert.equal(submit({...BASE,famille:'BIDON'}),null);
 assert.equal(submit({...BASE,designation:''}),null);assert.equal(submit({...BASE,sousFamille:' '.repeat(8)}),null);
 assert.equal(submit({...BASE,marque:'<script>'}),null);assert.equal(submit({...BASE,puissanceNominaleW:0}),null);
 assert.equal(submit({...BASE,tensionV:1000001}),null);assert.ok(submit({...BASE,tensionV:null,modele:null,marque:null}));
});
test('C3B permet des champs techniques facultatifs',()=>{
 const v=submit({...BASE,marque:null,modele:null,puissanceNominaleW:null,tensionV:null});
 assert.ok(v);assert.equal(v.marque,null);assert.equal(v.modele,null);assert.equal(v.puissanceNominaleW,null);
 assert.equal(identity(v),null);
});
test('Corrections versionnees et decisions explicites',()=>{
 const {sourceGrantId,c2ProposalId,...d}=BASE;
 assert.deepEqual(correct({version:2,...d}),{version:2,...d});
 assert.equal(correct({version:0,...d}),null);assert.equal(correct({version:2,...d,scopeNodeId:X}),null);
 for(const action of ['APPROUVER','REFUSER','A_CORRIGER']){
  assert.deepEqual(decide({reviewerGrantId:X,version:1,decision:action,referenceId:null}),{reviewerGrantId:X,version:1,decision:action,referenceId:null});}
 assert.ok(decide({reviewerGrantId:X,version:1,decision:'RAPPROCHER',referenceId:Y}));
 assert.equal(decide({reviewerGrantId:X,version:1,decision:'RAPPROCHER',referenceId:null}),null);
 assert.equal(decide({reviewerGrantId:X,version:1,decision:'APPROUVER',referenceId:Y}),null);
 assert.equal(decide({reviewerGrantId:X,version:-1,decision:'REFUSER',referenceId:null}),null);
 assert.equal(decide({reviewerGrantId:X,version:1,decision:'CERTIFIER',referenceId:null}),null);
});
test('Identite technique est insensible a casse et accents, sans fusion de passeports',()=>{
 const a=identity(BASE),b=identity({...BASE,marque:'FABRICANT TEST',modele:'A1'});
 assert.equal(a,b);assert.notEqual(a,identity({...BASE,modele:'A2'}));
});
test('Chaîne de delegations : 4 niveaux autorises, boucle ou revocation refusées',()=>{
 const G=['a','b','c','d'].map(()=>uuid());
 const cs=G.map((id,i)=>({id,parent_grant_id:G[i+1]||null,personne_id:i+100,
  role_scope:i===3?'COORDINATEUR':i===0?'OCCUPANT':'RESPONSABLE',statut:'ACTIF'}));
 assert.ok(cheminValide(cs,100));
 assert.equal(cheminValide(cs.map((g,i)=>i===2?{...g,statut:'REVOQUE'}:g),100),false);
 assert.equal(cheminValide(cs.map((g,i)=>i===2?{...g,personne_id:100}:g),100),false);
 assert.equal(cheminValide(cs.map((g,i)=>i===2?{...g,parent_grant_id:cs[0].id}:g),100),false);
});
test('Facade n expose aucune action publique de passeport ou photo',()=>{
 const r=makeRouter().routes.map(x=>x.path);
 assert.equal(r.length,7);assert.ok(r.every(p=>!p.includes('photos')&&!p.includes('passports')&&!p.includes('qr')));
});
test('Core Auth obligatoire',async()=>{
 const r=await makeRouter().call('GET','/mes-propositions',{auth:null});assert.equal(r.statusCode,401);
});
test('Tenant et origine sont contrôlés pour toute écriture',async()=>{
 const r=makeRouter();
 assert.equal((await r.call('POST','/sites/:siteId/propositions',{tenant:'AUTRE',body:BASE})).statusCode,403);
 assert.equal((await r.call('POST','/sites/:siteId/propositions',{origin:'https://evil.invalid',body:BASE})).statusCode,403);
});
test('Tenant non rattache refuse',async()=>{
 assert.equal((await makeRouter({orgs:async()=>[]}).call('GET','/mes-propositions')).statusCode,403);
});
test('Identifiants invalides rejetes avant store',async()=>{
 const r=makeRouter();const q=await r.call('POST','/sites/:siteId/propositions',{body:BASE,key:'bad'});
 assert.equal(q.statusCode,400);assert.equal(q.payload.statut,'CLE_IDEMPOTENCE_REQUISE');
});
test('Injection de champs ne passe pas la facade',async()=>{
 const r=await makeRouter().call('POST','/sites/:siteId/propositions',{body:{...BASE,actor:708}});
 assert.equal(r.statusCode,400);
});
test('Le status du store ne devient pas un privilège HTTP',async()=>{
 const r=await makeRouter({store:{submit:async()=>({code:'SOURCE_C2_NON_AUTORISEE'})}}).call('POST','/sites/:siteId/propositions',{body:BASE});
 assert.equal(r.statusCode,404);
});
test('La decision ne peut forcer une certification ou un passeport',async()=>{
 const r=await makeRouter().call('POST','/sites/:siteId/propositions/:proposalId/decision',{
  body:{reviewerGrantId:X,version:1,decision:'CERTIFIER',referenceId:null}});
 assert.equal(r.statusCode,400);
});
test('Rapprochement exige une référence UUID explicite',async()=>{
 const r=await makeRouter().call('POST','/sites/:siteId/propositions/:proposalId/decision',{
  body:{reviewerGrantId:X,version:1,decision:'RAPPROCHER',referenceId:null}});
 assert.equal(r.statusCode,400);
});
test('Lecture des equipements intégrés renvoie seulement ceux fournis par le store autorisé',async()=>{
 const r=await makeRouter({store:{integrated:async()=>({equipements:[{nom:'Pompe test'}]})}}).call('GET','/mes-equipements-c2');
 assert.equal(r.statusCode,200);assert.equal(r.payload.equipements[0].nom,'Pompe test');
});
test('Erreur SQL côté facade ne fuit pas les secrets du serveur',async()=>{
 const r=await makeRouter({store:{my:async()=>{const e=new Error('confidential');e.code='XX001';throw e;}}}).call('GET','/mes-propositions');
 assert.equal(r.statusCode,503);assert.equal(JSON.stringify(r.payload).includes('confidential'),false);
});
