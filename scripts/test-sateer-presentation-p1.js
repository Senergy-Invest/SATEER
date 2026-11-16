'use strict';
/** Contrats statiques P1 — aucun accès DB, aucun mot de passe, aucune écriture métier. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('page publique SATEER versionnée avec moteur et trois expériences',()=>{
 const h=read('public/accueil-sateer.html');
 for(const s of ['Une plateforme','Mon Consulat','Mon Ambassade','Diaspora','SATEER Energy','En préparation','/index.html'])assert.ok(h.includes(s),s);
 assert.ok(h.indexOf('id="plateforme"')<h.indexOf('id="energy"'),'Energy après plateforme');
 assert.ok(h.indexOf('id="experiences"')<h.indexOf('id="energy"'),'Energy après pilotes');
 assert.match(h,/La transversalité n.est pas un partage automatique/);
 assert.doesNotMatch(h,/<script\b|http:\/\/localhost|https:\/\/localhost/);
});
test('page publique sans fausses références opérationnelles',()=>{
 const h=read('public/accueil-sateer.html');
 assert.doesNotMatch(h,/résultats officiels|partenariats signés|déjà déployé|économies mesurées/i);
 assert.match(h,/données de recette fictives/);
 assert.match(h,/n.est pas présenté ici comme un service opérationnel/i);
});
test('groupes Mon SATEER en conservant les identifiants et scripts existants',()=>{
 const h=read('public/index.html');
 for(const id of ['experiencesContainer','communityExperiencesContainer','professionnelsContainer','notificationsContainer','identitySummary','associationRelaysContainer']){
   assert.equal((h.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 for(const s of ['Institutions &amp; services publics','Communautés &amp; territoires','Services spécialisés','SATEER Energy','En préparation'])assert.ok(h.includes(s),s);
 for(const src of ['/app.js','/auth-client.js','/institution-experience-entry.js','/ministry-experience-entry.js'])assert.ok(h.includes(src),src);
 assert.match(h,/mon-sateer-groupes\.css/);
});
test('le DOM des institutions demeure Core; Diaspora est placée dans Communautés',()=>{
 const js=read('public/app.js');
 assert.match(js,/const communityContainer = document\.getElementById\("communityExperiencesContainer"\)/);
 assert.match(js,/const consulats = organisations\.filter\(org => org\.type === "CONSULAT"/);
 assert.match(js,/const ambassades = organisations\.filter\(org => org\.type === "AMBASSADE"/);
 assert.match(js,/const diasporaTenants = \[\.\.\.new Set/);
 assert.match(js,/communityContainer\.append\(carte\)/);
 assert.match(js,/const ministeres = organisations\.filter/);
 assert.match(js,/afficherNotifications\(/);
 const d=js.slice(js.indexOf('const diasporaTenants = '),js.indexOf('// Ministère :'));
 assert.doesNotMatch(d,/experiencesContainer\.append\(carte\)/);
 assert.match(d,/communityContainer\.append\(carte\)/);
});
test('aucun lien actif fictif Energy depuis Mon SATEER',()=>{
 const h=read('public/index.html');
 const block=h.slice(h.indexOf('sx-group-future'),h.indexOf('id="professionnelsSection"'));
 assert.match(block,/Sans accès actif/);
 assert.doesNotMatch(block,/<a\s/);
});
test('les CSS restent scindés entre accueil public et espace privé',()=>{
 const publicCSS=read('public/sateer-platform-home.css');
 const privateCSS=read('public/mon-sateer-groupes.css');
 assert.match(publicCSS,/\.sp-page/);
 assert.match(privateCSS,/body\.sateer-home/);
 assert.match(publicCSS,/@media\(max-width:450px\)/);
 assert.match(privateCSS,/@media\(max-width:650px\)/);
});
