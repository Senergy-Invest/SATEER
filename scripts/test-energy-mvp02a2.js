'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {FIELDS,UUID,normalizeValue,candidatesFromLines,validateFields}=require('../energy/equipment-label-domain');
const {createMacVisionOCR}=require('../energy/equipment-label-vision');
const {creerEquipmentLabelRouter}=require('../energy/equipment-label-http');
const P='11111111-1111-4111-8111-111111111111';
function makeRouter(store,ocr){
 const routes={},middleware=[],router={use(fn){middleware.push(fn);},get(path,fn){routes['GET '+path]=fn;},post(path,fn){routes['POST '+path]=fn;}};
 creerEquipmentLabelRouter({router,listerOrganisations:async()=>[{tenant_code:'ENERGY_MVP01D_RECETTE'}],store,ocr,
 origineAutorisee:'http://localhost:3475',tenantAutorise:'ENERGY_MVP01D_RECETTE'});for(const [k,fn] of Object.entries(routes)){routes[k]=async(req,res)=>{for(const m of middleware)m(req,res,()=>{});return fn(req,res);};}return routes;
}
function response(){const r={statusCode:200,body:null,headers:{},status(n){this.statusCode=n;return this;},json(data){this.body=data;return this;},set(k,v){this.headers[k]=v;return this;}};return r;}
function request({owner=12,tenant='ENERGY_MVP01D_RECETTE',body={},origin='http://localhost:3475'}={}){
 return {auth:owner?{personneId:owner}:null,query:{tenant},body,params:{passportId:P},get(k){return k==='Origin'?origin:null;}};
}
test('Champs contractuels bornés',()=>assert.deepEqual(FIELDS,['MARQUE','MODELE','PUISSANCE_W','TENSION_V']));
test('UUID valide',()=>assert.equal(UUID.test(P),true));
test('UUID rejeté',()=>assert.equal(UUID.test('../../secret'),false));
test('Puissance 120 normalisée',()=>assert.equal(normalizeValue('PUISSANCE_W','120'), '120'));
test('Puissance virgule française',()=>assert.equal(normalizeValue('PUISSANCE_W','120,5'), '120.5'));
test('Puissance nulle refusée',()=>assert.equal(normalizeValue('PUISSANCE_W','0'),null));
test('Texte malveillant refusé',()=>assert.equal(normalizeValue('MARQUE','<script>'),null));
test('Modèle Unicode accepté',()=>assert.equal(normalizeValue('MODELE','Réf-42'), 'Réf-42'));
test('Nombre gigantesque refusé',()=>assert.equal(normalizeValue('PUISSANCE_W','999999999'),null));
test('Plaque synthétique classique',()=>assert.deepEqual(candidatesFromLines(['MARQUE: TESTLAB','MODELE: REF123','PUISSANCE: 120 W','TENSION: 230 V']),{MARQUE:'TESTLAB',MODELE:'REF123',PUISSANCE_W:'120',TENSION_V:'230'}));
test('kWh annuel jamais puissance',()=>assert.equal(candidatesFromLines(['Consumption: 234 kWh/year']).PUISSANCE_W,undefined));
test('kW converti quand unité explicite',()=>assert.equal(candidatesFromLines(['Rated power: 1.5 kW']).PUISSANCE_W,'1500'));
test('Plage de tension non transformée en point unique',()=>assert.equal(candidatesFromLines(['220-240 V']).TENSION_V,undefined));
test('Pas de puissance sans unité',()=>assert.equal(candidatesFromLines(['POWER: 150']).PUISSANCE_W,undefined));
test('Liste OCR malformée ignorée',()=>assert.deepEqual(candidatesFromLines({foo:'bar'}),{}));
test('Trop de lignes OCR ignorées',()=>assert.deepEqual(candidatesFromLines(Array(120).fill('MODEL: X')),{}));
test('Sélection manuelle valide',()=>assert.deepEqual(validateFields([{champ:'MARQUE',valeur:'Test'}]),[{champ:'MARQUE',valeur:'Test'}]));
test('Double champ interdit',()=>assert.equal(validateFields([{champ:'MARQUE',valeur:'Test'},{champ:'MARQUE',valeur:'X'}]),null));
test('Champ inattendu interdit',()=>assert.equal(validateFields([{champ:'SERIAL',valeur:'A'}]),null));
test('Injection de propriété interdite',()=>assert.equal(validateFields([{champ:'MODELE',valeur:'A',role:'admin'}]),null));
test('Photo non reconnue hors plateforme Mac',async()=>{if(process.platform!=='darwin')await assert.rejects(createMacVisionOCR().recognize(Buffer.alloc(70),'image/png'),/MOTEUR_REQUIERT_MACOS/);});
test('API GET sans identité 401',async()=>{const routes=makeRouter({latest(){throw Error('UNEXPECTED');}},{});const res=response();await routes['GET /:passportId'](request({owner:0}),res);assert.equal(res.statusCode,401);});
test('API GET refus autre tenant 403',async()=>{const routes=makeRouter({latest(){throw Error('UNEXPECTED');}},{});const res=response();await routes['GET /:passportId'](request({tenant:'AMBVIS_96C7FBBEA383DD'}),res);assert.equal(res.statusCode,403);});
test('API POST refus origine malveillante',async()=>{const routes=makeRouter({},{});const res=response();await routes['POST /:passportId/analyser'](request({origin:'https://attacker.example',body:{photoId:P}}),res);assert.equal(res.statusCode,403);});
test('API POST refus photo id invalide',async()=>{const routes=makeRouter({},{});const res=response();await routes['POST /:passportId/analyser'](request({body:{photoId:'../'}}),res);assert.equal(res.statusCode,400);});
test('API refus une requête de confirmation sans champs',async()=>{const routes=makeRouter({},{});const res=response();await routes['POST /:passportId/confirmer'](request({body:{analyseId:null,valeurs:[]}}),res);assert.equal(res.statusCode,400);});
test('API refus champ technique non connu',async()=>{const routes=makeRouter({},{});const res=response();await routes['POST /:passportId/confirmer'](request({body:{analyseId:null,valeurs:[{champ:'SERIAL',valeur:'A'}]}}),res);assert.equal(res.statusCode,400);});
test('API GET réponse privée sans cache',async()=>{const routes=makeRouter({latest:async()=>[{champ:'MARQUE',valeur:'TEST'}]},{});const res=response();await routes['GET /:passportId'](request(),res);assert.equal(res.statusCode,200);assert.equal(res.headers['Cache-Control'],'private, no-store');assert.equal(res.body.valeurs[0].valeur,'TEST');});
test('API OCR aucune proposition : pas de persist',async()=>{const routes=makeRouter({photoForAnalysis:async()=>({bytes:Buffer.alloc(65),mime:'image/png'}),saveProposal:async()=>{throw Error('UNEXPECTED');}},{recognize:async()=>['texte indistinct']});const res=response();await routes['POST /:passportId/analyser'](request({body:{photoId:P}}),res);assert.equal(res.body.statut,'AUCUNE_CARACTERISTIQUE_LISIBLE');assert.equal(res.body.analyseId,null);});
test('API OCR propriétaire absent : pas de traitement',async()=>{const routes=makeRouter({photoForAnalysis:async()=>null},{recognize:async()=>{throw Error('UNEXPECTED');}});const res=response();await routes['POST /:passportId/analyser'](request({body:{photoId:P}}),res);assert.equal(res.statusCode,404);});
test('API OCR proposition persistée avec champ identifié',async()=>{const routes=makeRouter({photoForAnalysis:async()=>({bytes:Buffer.alloc(65),mime:'image/png'}),saveProposal:async()=>({code:'OK',analyseId:P})},{recognize:async()=>['MARQUE: TESTLAB']});const res=response();await routes['POST /:passportId/analyser'](request({body:{photoId:P}}),res);assert.equal(res.body.propositions.MARQUE,'TESTLAB');assert.equal(res.body.analyseId,P);});
test('API confirmation manuelle (provenance côté serveur)',async()=>{let received;const routes=makeRouter({confirm:async args=>{received=args;return {code:'OK',champs:[]};}},{});const res=response();await routes['POST /:passportId/confirmer'](request({body:{analyseId:null,valeurs:[{champ:'MARQUE',valeur:'TEST'}]}}),res);assert.equal(res.statusCode,200);assert.equal(received.owner,12);assert.equal(res.body.verification,'NON_CERTIFIE');});

// R3 : le texte affiché doit refléter les fonctionnalités effectivement installées.
const fs=require('node:fs');
const path=require('node:path');
const htmlFile=(name)=>fs.readFileSync(path.join(__dirname,'../public',name),'utf8');
test('Accueil SUNU Courant : passeport photo QR annoncé disponible, sans certification',()=>{
  const h=htmlFile('sunu-courant.html');
  assert.match(h,/Fiches individuelles, photos et QR SATEER/);
  assert.match(h,/lecture est assistée, sans certification automatique/);
  assert.doesNotMatch(h,/Photos et QR au prochain lot|Ce service n.est pas encore actif/i);
});
test('Inventaire : pas de promesse prochainement pour une fiche déjà active',()=>{
  const h=htmlFile('inventaire-energie.html');
  assert.match(h,/À RETROUVER DANS LA FICHE INDIVIDUELLE/);
  assert.match(h,/Les valeurs proposées doivent être confirmées/);
  assert.doesNotMatch(h,/PROCHAINEMENT · PAS ENCORE DISPONIBLE|Rien n.est scanné ni envoyé aujourd.hui/i);
});
