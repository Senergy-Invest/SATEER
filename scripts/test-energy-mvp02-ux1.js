'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const model=require('../public/sunu-inventory-ux-model.js');
const ROOT=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(ROOT,'public/inventaire-energie.html'),'utf8');
const js=fs.readFileSync(path.join(ROOT,'public/inventaire-energie.js'),'utf8');
const css=fs.readFileSync(path.join(ROOT,'public/inventaire-energie.css'),'utf8');
const home=fs.readFileSync(path.join(ROOT,'public/sunu-courant.html'),'utf8');
const homecss=fs.readFileSync(path.join(ROOT,'public/sunu-courant.css'),'utf8');
const ID='02bf44e7-5a83-4be2-a8bb-0d0cf4960f2a';

test('ménage: catégories familières et pas de machine imposée',()=>{
 const ids=model.selection('LOGEMENT').map(x=>x.id);
 for(const x of ['FRIGO','LAMPE','CLIM','VENTILO','TV','POMPE','AUTRE'])assert.ok(ids.includes(x));
 assert.ok(!ids.includes('MACHINE'));assert.equal(model.profil('LOGEMENT'),'MENAGE');
});
test('industrie: entrée adaptée sans deuxième registre',()=>{
 const ids=model.selection('INDUSTRIE').map(x=>x.id);
 for(const x of ['MACHINE','POMPE','BATTERIE','SOLAIRE'])assert.ok(ids.includes(x));
 assert.equal(model.categorie('MACHINE').famille,'MOTEUR');
});
test('objectif pompage du dossier existant priorise les pompes sans autre questionnaire',()=>{
 assert.equal(model.selection('LOGEMENT',['POMPAGE'])[0].id,'POMPE');
 assert.equal(model.selection('LOGEMENT',['CONFORT'])[0].id,'CLIM');
});
test('agriculture: pompage en premier',()=>{
 assert.equal(model.selection('EXPLOITATION_AGRICOLE')[0].id,'POMPE');
 assert.equal(model.zoneInitiale('EXPLOITATION_AGRICOLE').typeZone,'EXTERIEUR');
});
test('bâtiment public: familles pertinentes',()=>{
 const ids=model.selection('BATIMENT_PUBLIC').map(x=>x.id);
 assert.ok(ids.includes('CLIM')&&ids.includes('LAMPE'));
});
test('zone par défaut privilégie un bâtiment existant',()=>{
 assert.equal(model.zoneParDefaut([{id:'a',typeZone:'EXTERIEUR',parentId:null},{id:'b',typeZone:'BATIMENT',parentId:null}], 'LOGEMENT').id,'b');
});
test('en absence de zone, le logement crée une racine sans étage',()=>{
 assert.equal(model.zoneParDefaut([], 'LOGEMENT'),null);
 assert.deepEqual(model.zoneInitiale('LOGEMENT'),{typeZone:'BATIMENT',nom:'Mon logement',parentId:null});
});
test('une catégorie visuelle garde la famille contractuelle du moteur',()=>{
 assert.equal(model.categorie('FRIGO').famille,'FROID');
 assert.equal(model.categorie('VENTILO').famille,'AUTRE');
 assert.equal(model.categorie('TV').famille,'AUTRE');
});
test('équipement: puissance optionnelle, données déclarées sans profil, tenant ou propriétaire',()=>{
 const x=model.saisieEquipement({categorieId:'FRIGO',nom:'  Mon frigo  ',quantite:1,zoneId:ID,puissance:''});
 assert.deepEqual(x,{zoneId:ID,nom:'Mon frigo',famille:'FROID',quantite:1,puissanceUnitaireW:null});
 assert.ok(!('personneId' in x) && !('tenant' in x));
});
test('groupe de lampes: une seule ligne quantité trois, sans faux passeports',()=>{
 const x=model.saisieEquipement({categorieId:'LAMPE',nom:'Mes lampes du salon',quantite:'3',zoneId:ID,puissance:null});
 assert.equal(x.quantite,3);assert.equal(x.famille,'ECLAIRAGE');
});
test('valeurs mal formées bloquées avant tout POST',()=>{
 const base={categorieId:'FRIGO',nom:'Frigo',quantite:1,zoneId:ID,puissance:''};
 assert.equal(model.saisieEquipement({...base,nom:'\n'},),null);
 assert.equal(model.saisieEquipement({...base,puissance:'0'}),null);
 assert.equal(model.saisieEquipement({...base,quantite:1.5}),null);
 assert.equal(model.saisieEquipement({...base,zoneId:'pas-un-uuid'}),null);
});
test('page: session Core, modèle UX, emplacement facultatif et détails avancés',()=>{
 for(const t of ['auth-client.js','sunu-inventory-ux-model.js','inventaire-energie.js','id="categories"','id="listeEquipements"',
  'id="formZone"','id="formEquipement"','id="optionsAvancees"','Peu importe pour le moment','Données <strong>déclarées</strong>'])assert.ok(html.includes(t),t);
 assert.match(html,/Aucun calcul/);
});
test('page: la fiche individuelle porte les photos et QR, sans téléchargement direct depuis l’inventaire',()=>{
 assert.match(html,/À RETROUVER DANS LA FICHE INDIVIDUELLE/);
 assert.match(html,/Mes photos, mon passeport, mon QR/);
 assert.match(html,/Les valeurs proposées doivent être confirmées/);
 assert.doesNotMatch(html,/PROCHAINEMENT · PAS ENCORE DISPONIBLE/);
 assert.doesNotMatch(html,/<input[^>]+type="file"/i);
 assert.doesNotMatch(js,/getUserMedia|BarcodeDetector|FileReader/);
});
test('script: l’identification vient du Core, puis appels à l’API protégée',()=>{
 assert.match(js,/window\.SATEER_CONTEXT_READY/);
 assert.match(js,/\/api\/energy\/inventory/);
 assert.match(js,/credentials:'same-origin'/);
 assert.match(js,/URLSearchParams\(window\.location\.search\)/);
 assert.match(js,/ctx\.organisations/);
 assert.match(js,/\/api\/energy\/cases\//);
});
test('script: sauvegarde progressive et idempotence du POST',()=>{
 assert.match(js,/crypto\.randomUUID\(\)/);
 assert.match(js,/Idempotency-Key/);
 assert.match(js,/await reload\(\)/);
 assert.match(js,/await ensurePlace\(zone\)/);
});
test('CSS: responsive, accessibilité et mouvement réduit',()=>{
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(css, /:focus-visible/);
 assert.match(css, /prefers-reduced-motion:reduce/);
});
test('pas d’API photo, IA, QR, contribution ou accès institutionnel inventée',()=>{
 assert.doesNotMatch(js,/fetch\(['"]\/api\/(equipment|qr|photos|ai)/);
 assert.doesNotMatch(js,/localStorage|sessionStorage/);
 assert.doesNotMatch(html,/consommation certifiée|éligibilité confirmée/);
});

test('accueil SUNU: champs historiques préservés pour MVP01, mais collecte progressive',()=>{
 for(const f of ['name="profil"','name="typeSite"','name="nomSite"','name="pays"','name="alimentation"','name="compteur"',
 'name="description"','name="consentement"','name="besoins"','id="energyCaseForm"','id="sendCase"','id="cases"','id="listeStatut"','id="contexte"'])
  assert.ok(home.includes(f),f);
 assert.match(home,/sans calcul, diagnostic ou promesse/i);
 assert.match(home,/<details class="advanced">/);
 assert.match(home,/value="INCONNUE" selected/);
 assert.match(home, /Aucune facture obligatoire/);
});
test('accueil SUNU: neuf besoins fonctionnels sans modifier leurs valeurs Core',()=>{
 const values=[...home.matchAll(/name="besoins" value="([A-Z_]+)"/g)].map(x=>x[1]);
 assert.deepEqual(values,['FACTURE','COUPURES','CONFORT','FROID','POMPAGE','EFFICACITE','NOUVELLE_INSTALLATION','SOLAIRE','AUTRE']);
 assert.match(homecss,/max-width:620px/);
 assert.match(homecss,/:focus-visible/);
});
