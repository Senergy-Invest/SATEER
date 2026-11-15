"use strict";
/** Contrats UX1 : separation des roles et thematisation locale, sans DB ni E2E destructif. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const screens=['diaspora.html','diaspora-partenariats.html','diaspora-geographie.html',
  'diaspora-zones-professionnelles.html','diaspora-communication.html'];
test('theme Diaspora isolé des experiences institutionnelles',()=>{
 const css=read('public/diaspora-theme.css');
 for(const token of ['#523785','#D36C45','#F8F3E9','#187C70'])assert.ok(css.includes(token),token);
 assert.match(css,/body\.diaspora-experience\s*\{/);
 assert.doesNotMatch(css,/(^|\n)\s*body\s*\{/);
 assert.match(css,/focus-visible/);
 assert.match(css,/@media \(max-width:650px\)/);
 for(const page of screens){const html=read('public/'+page);
  assert.match(html,/class="diaspora-experience"/,page);
  assert.match(html,/diaspora-theme\.css\?v=ux1/,page);
 }
});
test('fil general : source lisible et publicite dans sa propre section',()=>{
 const html=read('public/diaspora.html'),js=read('public/diaspora.js');
 for(const id of ['diasporaFeed','diasporaSponsoredFeed','diasporaSponsoredTitle'])assert.ok(html.includes('id="'+id+'"'));
 assert.match(js,/item\.sponsorisee && sponsoredFeed \? sponsoredFeed : feed/);
 assert.match(js,/item\.organisationType/);
 assert.match(js,/diaspora-card--sponsor/);
});
test('consentement commercial : indicateur permanent et retrait conservé',()=>{
 const html=read('public/diaspora-partenariats.html'),js=read('public/diaspora-partenariats.js');
 assert.match(html,/id="sponsorEtat"/);
 assert.match(js,/Notifications commerciales autorisées/);
 assert.match(js,/Notifications commerciales désactivées/);
 assert.match(js,/showState\(choice.checked\)/);
 assert.match(js,/method:'PUT'|call\('PUT'/);
});
test('page citoyenne sans opération professionnelle',()=>{
 const html=read('public/diaspora-geographie.html'),js=read('public/diaspora-geographie.js');
 for(const name of ['geoOrga','geoProSection','geoPublications','geo-target','source-publications']){
  assert.ok(!html.includes(name),name+' absent du HTML');assert.ok(!js.includes(name),name+' absent du JS');
 }
 assert.match(js,/activeAreas\.has\(Number\(area\.id\)\)/);
 assert.match(js,/Déjà suivi/);
 assert.match(js,/btn\.disabled=followed/);
});
test('page professionnelle distincte, droits conservés au serveur',()=>{
 const html=read('public/diaspora-zones-professionnelles.html');
 const js=read('public/diaspora-zones-professionnelles.js');
 assert.match(html,/id="proOrga"/);assert.match(html,/TARGET_COMMUNICATION/);
 assert.match(js,/\/diaspora\/source-publications/);
 assert.match(js,/\/diaspora\/geo-target\//);
 assert.doesNotMatch(js,/geo-preferences\/|sponsor-consent\/|\/api\/auth\/register/);
 assert.match(js,/orgSelector\.value=String\(organisations\[0\]\.id\)/);
 assert.match(js,/p\.etatDiffusion==='NON_DEMANDEE'/);
});
test('espace professionnel charge automatiquement le contexte unique et masque les droits non acquis',()=>{
 const html=read('public/diaspora-communication.html'),js=read('public/diaspora-communication.js');
 assert.match(html,/id="dcGeoSection" hidden/);
 assert.match(html,/id="dcRoleText"/);
 assert.match(js,/organisations\.length===1/);
 assert.match(js,/find\('dcGeoSection'\)\.hidden=false/);
 assert.match(js,/diaspora-zones-professionnelles\.html/);
 assert.match(js,/find\('dcRoleText'\)\.hidden=true/);
});
test('préférences thèmes et associations lisibles',()=>{
 const js=read('public/diaspora-optin.js');
 assert.match(js,/themesActifs/);assert.match(js,/associationsActives/);
 assert.match(js,/setAttribute\('aria-label',label\)/);
});
