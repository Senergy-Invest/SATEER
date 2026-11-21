'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict'),crypto=require('node:crypto'),os=require('node:os'),fs=require('node:fs'),path=require('node:path');
const {formatEvidence,sanitizeName,MAX_BYTES}=require('../energy/energy-billing-evidence-domain');
const {creerBillingEvidenceVault}=require('../energy/energy-billing-evidence-vault');
const {creerBillingEvidenceRouter}=require('../energy/energy-billing-evidence-http');
const {creerBillingEvidenceStore}=require('../energy/energy-billing-evidence-store');
const UUID=()=>crypto.randomUUID(),SITE=UUID(),DOC=UUID(),FILE=UUID(),TENANT='ENERGY_MVP01D_RECETTE';
const pdf=Buffer.from('%PDF-1.7\n'+ 'A'.repeat(90)+'\n%%EOF\n');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/5S8AAAAASUVORK5CYII=', 'base64');
test('format PDF version reconnue; ne parse jamais son contenu',()=>assert.equal(formatEvidence(pdf),'application/pdf'));
test('rejette PDF tronqué',()=>assert.equal(formatEvidence(pdf.subarray(0,55)),null));
test('rejette faux PDF',()=>assert.equal(formatEvidence(Buffer.from('E'.repeat(80))),null));
test('rejette PDF sans marqueur final',()=>assert.equal(formatEvidence(Buffer.from('%PDF-1.7\n'+'A'.repeat(100))),null));
test('rejette contenu trop grand',()=>assert.equal(formatEvidence(Buffer.alloc(MAX_BYTES+1)),null));
test('rejette valeurs non binaires',()=>assert.equal(formatEvidence('fake'),null));
test('refuse nom avec séquences dangereuses',()=>assert.equal(sanitizeName('../facture\\secret.pdf','application/pdf').includes('/'),false));
test('nom encodé URL est décodé avant affichage',()=>assert.equal(sanitizeName('facture%20fictive.pdf','application/pdf'),'facture fictive.pdf'));
test('nom normalisé extension PDF',()=>assert.equal(sanitizeName('A.PDF','application/pdf'),'A.PDF'));
test('nom vide remplacé',()=>assert.equal(sanitizeName('', 'application/pdf'),'justificatif.pdf'));
test('ne considère jamais document comme une mesure',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../energy/energy-billing-evidence-store.js'),'utf8');
 assert.doesNotMatch(source,/\b(?:calculerConsommation|calculerTarif|estimerKwh|economieKwh)\s*\(/);
});
test('interfaces d architecture : store, router, coffre',()=>{
 assert.equal(typeof creerBillingEvidenceRouter,'function');assert.equal(typeof creerBillingEvidenceStore,'function');assert.equal(typeof creerBillingEvidenceVault,'function');
});
test('migration : tables, clé composite, référence, append-only',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../database/063_energy_billing_evidence.sql'),'utf8');
 for(const q of ['energy_billing_attachments','energy_billing_attachment_events','declaration_id,site_id,tenant_id,owner_personne_id','energy_billing_append_only_guard','pg_control_system()'])assert.ok(s.includes(q),q);
});
test('download toujours pièce jointe et jamais rendu PDF inline',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../energy/energy-billing-evidence-http.js'),'utf8');assert.ok(s.includes('application/octet-stream'));assert.ok(s.includes('attachment; filename'));
});
test('point d entrée protège routes par exigerSession',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');assert.ok(s.includes("app.use('/api/energy/justificatifs/v1', exigerSession"));
});
test('vue lie explicitement une déclaration à une pièce',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../public/energie-factures.html'),'utf8');
 for(const k of ['declarationFichier','pieceFichier','listeFichiers'])assert.ok(s.includes(k));
});
test('API refuse dépendances absentes',()=>assert.throws(()=>creerBillingEvidenceRouter({}),/DEPENDANCES_HTTP_EVIDENCE/));
test('stockage refuse dépendances absentes',()=>assert.throws(()=>creerBillingEvidenceStore({}),/DEPENDANCES_EVIDENCE/));
test('coffre refuse dossier hors home',()=>assert.throws(()=>creerBillingEvidenceVault({root:'/tmp/no'}),/COFFRE_ENERGY_HORS_HOME/));
test('coffre roundtrip PDF avec AAD et confidentialité',async()=>{
 const folder=await fs.promises.mkdtemp(path.join(os.homedir(),'.sateer-emeter1b2-test-'));
 const v=creerBillingEvidenceVault({root:path.join(folder,'private'),loadMasterKey:()=>Buffer.alloc(32,41)});
 const a={fileId:FILE,site:33,owner:15,tenant:11,declarationId:DOC,mime:'application/pdf',bytes:pdf};
 try{await v.save(a);
  const raw=await fs.promises.readFile(path.join(folder,'private',FILE+'.enc'));
  assert.ok(!raw.includes(pdf));assert.notEqual(raw.toString('utf8'),pdf.toString('utf8'));
  assert.deepEqual(await v.read({...a,sha256:crypto.createHash('sha256').update(pdf).digest('hex'),size:pdf.length}),pdf);
  await assert.rejects(()=>v.read({...a,owner:16,sha256:crypto.createHash('sha256').update(pdf).digest('hex'),size:pdf.length}));
  await assert.rejects(()=>v.save(a),e=>e.code==='EEXIST');
  await v.erase(FILE);await assert.rejects(()=>v.read({...a,sha256:crypto.createHash('sha256').update(pdf).digest('hex'),size:pdf.length}));
 }finally{await fs.promises.rm(folder,{recursive:true,force:true});}
});
test('coffre refuse répertoire parent lisible par groupe',async()=>{
 const folder=await fs.promises.mkdtemp(path.join(os.homedir(),'.sateer-emeter1b2-test-'));
 try{const t=path.join(folder,'open');await fs.promises.mkdir(t,{mode:0o755});
  // Le lanceur impose umask 077 : mkdir(0755) seul donne 0700 sur macOS.
  // Forcer explicitement le dossier fictif a etre exposé pour éprouver le refus du coffre.
  await fs.promises.chmod(t,0o755);
  assert.equal((await fs.promises.lstat(t)).mode & 0o077,0o055,'PRECONDITION_DOSSIER_OUVERT_NON_REALISEE');
  const v=creerBillingEvidenceVault({root:path.join(t,'sub'),loadMasterKey:()=>Buffer.alloc(32,5)});
  await assert.rejects(()=>v.folder(),/COFFRE_NON_PRIVE/);
 }finally{await fs.promises.rm(folder,{recursive:true,force:true});}
});
function mockRouter(){const routes=[];return {routes,use(){},get(p,f){routes.push({method:'GET',p,f});},post(p,...f){routes.push({method:'POST',p,f});}};}
function mockReq({actor=4,tenant=TENANT,method='GET',siteId=SITE,declarationId=DOC,fileId=FILE,origin='http://localhost:3490',idempotency=UUID(),bytes=pdf,contentType='application/octet-stream'}={}){
 return {auth:actor?{personneId:actor}:null,method,query:{tenant},params:{siteId,declarationId,fileId},body:bytes,get(k){return {'Origin':origin,'Idempotency-Key':idempotency,'Content-Type':contentType}[k];}};
}
function mockRes(){return {statusCode:200,headers:{},body:null,status(n){this.statusCode=n;return this;},set(k,v){this.headers[k]=v;return this;},json(v){this.body=v;return this;},end(v){this.body=v;return this;}};}
async function invoke(f,req){const res=mockRes();await f(req,res);return res;}
function setup(){const router=mockRouter(), calls=[];const store={lister:async s=>{calls.push(s);return {fichiers:[]};},creer:async s=>{calls.push(s);return {code:'OK',nouveau:true,fichier:{id:FILE}};},telecharger:async s=>{calls.push(s);return {bytes:pdf,mime:'application/pdf'};}};
 creerBillingEvidenceRouter({router,listerOrganisations:async (actor,tenant)=>actor===4&&tenant===TENANT?[{tenant_code:TENANT}]:[],store,origineAutorisee:'http://localhost:3490',tenantAutorise:TENANT});return {routes:router.routes,calls};}
for(const [name,request,expected] of [
 ['sans session',{actor:null},401],['tenant interdit',{tenant:'AUTRE'},403],['compte sans organisation',{actor:8},403],
 ['site id invalide',{siteId:'bad'},400],['déclaration id invalide',{declarationId:'bad'},400]
])test('garde : '+name,async()=>{const {routes}=setup();const res=await invoke(routes.find(r=>r.method==='GET'&&!r.p.includes(':fileId')).f,mockReq(request));assert.equal(res.statusCode,expected);});
test('GET liste privée avec acteur et tenant serveur',async()=>{const {routes,calls}=setup();const res=await invoke(routes.find(r=>r.method==='GET'&&!r.p.includes(':fileId')).f,mockReq());assert.equal(res.statusCode,200);assert.equal(calls[0].actor,4);assert.equal(calls[0].tenant,TENANT);});
test('GET téléchargement produit pièce jointe et ID vérifié',async()=>{const {routes,calls}=setup();const res=await invoke(routes.find(r=>r.method==='GET'&&r.p.includes(':fileId')).f,mockReq());assert.equal(res.statusCode,200);assert.equal(res.headers['Content-Type'],'application/octet-stream');assert.match(res.headers['Content-Disposition'],/^attachment;/);assert.equal(calls[0].fileId,FILE);});
test('POST propriétaire avec PDF non vérifié, identifiants serveur seulement',async()=>{
 const {routes,calls}=setup();const route=routes.find(r=>r.method==='POST');assert.ok(route);
 const res=await invoke(route.f[1],mockReq({method:'POST'}));assert.equal(res.statusCode,201);
 assert.equal(calls[0].actor,4);assert.equal(calls[0].tenant,TENANT);assert.equal(calls[0].mime,'application/pdf');
});
test('POST refuse origine non autorisée',async()=>{
 const {routes,calls}=setup();const res=await invoke(routes.find(r=>r.method==='POST').f[1],mockReq({method:'POST',origin:'https://intrus.invalid'}));
 assert.equal(res.statusCode,403);assert.equal(calls.length,0);
});
test('POST refuse clé d idempotence invalide',async()=>{
 const {routes,calls}=setup();const res=await invoke(routes.find(r=>r.method==='POST').f[1],mockReq({method:'POST',idempotency:'fausse_cle'}));
 assert.equal(res.statusCode,400);assert.equal(calls.length,0);
});
test('POST refuse contenu non PDF/PNG',async()=>{
 const {routes,calls}=setup();const res=await invoke(routes.find(r=>r.method==='POST').f[1],mockReq({method:'POST',bytes:Buffer.from('X'.repeat(100))}));
 assert.equal(res.statusCode,415);assert.equal(calls.length,0);
});
test('POST refuse faux tenant sans toucher au stockage',async()=>{
 const {routes,calls}=setup();const res=await invoke(routes.find(r=>r.method==='POST').f[1],mockReq({method:'POST',tenant:'FAUX'}));
 assert.equal(res.statusCode,403);assert.equal(calls.length,0);
});
test('API interdit suppression implicite et ne propose que téléchargement',()=>{
 const {routes}=setup();assert.equal(routes.filter(x=>x.method==='POST').length,1);
 assert.equal(routes.filter(x=>x.method==='GET').length,2);
});
