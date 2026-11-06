'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'public/demande-detail.html'),'utf8');
const css=fs.readFileSync(path.join(root,'public/sateer-demande-detail-ui.css'),'utf8');
const js=fs.readFileSync(path.join(root,'public/sateer-demande-detail-ui.js'),'utf8');
for(const id of ['detailTitle','demandeStatut','demandeCategorie','historiqueContainer','reponsesContainer','detailErreur']){
 assert.match(html,new RegExp(`id=["']${id}["']`),`ID manquant dans le HTML : ${id}`);
}
for (const f of ['sateer-demande-detail-ui.css','sateer-demande-detail-ui.js']){
 assert.equal(html.split(f).length-1,1,`Ressource chargée une seule fois : ${f}`);
}
assert.ok(html.indexOf('sateer-demande-detail-ui.css')<html.indexOf('</head>'), 'CSS doit charger dans head');
assert.ok(html.indexOf('sateer-demande-detail-ui.js')<html.indexOf('</body>'),'JS doit charger dans body');
assert.match(js,/MutationObserver/, 'Mise à jour dynamique des statuts');
assert.match(js,/aria-current/, 'Étape accessible');
assert.match(js,/responseSection\.parentElement === historySection\.parentElement/, 'Déplacement conditionnel sûr');
assert.match(css,/max-width:720px/, 'Responsive mobile');
assert.match(css,/prefers-reduced-motion/, 'Animation accessible');
assert.ok(!/\bfetch\s*\(/.test(js), 'Aucune nouvelle requête métier');
assert.ok(!/\b(?:localStorage|sessionStorage|XMLHttpRequest)\b/.test(js),'Aucun stockage ou autre transport');
console.log('DEMANDE_DETAIL_UI_PASS : structure, hiérarchie, statut, chronologie, mobile, permissions inchangées.');
