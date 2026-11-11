'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const api=fs.readFileSync(process.env.SATEER_P335BF_API,'utf8');
const ui=fs.readFileSync(process.env.SATEER_P335BF_UI,'utf8');
const link=fs.readFileSync(process.env.SATEER_P335BF_LINK,'utf8');
const route=api.slice(api.indexOf("router.get('/dossiers/:id/journal-agent'"),api.indexOf("router.get('/dossiers/:id/suivi'"));
const render=ui.slice(ui.indexOf('async function renderAgentJournal('),ui.indexOf('function renderCaseActions('));
test('agent: endpoint GET seulement, sans mutation ni contenu des pièces privées',()=>{
  assert.match(route,/router\.get\('\/dossiers\/:id\/journal-agent'/);
  assert.doesNotMatch(route,/router\.(?:post|put|patch|delete)\(/);
  assert.doesNotMatch(route,/citizen_private_files|piece_jointe|\bUPDATE\b|\bINSERT\b|\bDELETE\b/i);
});
test('agent: accès via caseAccess, unité réelle et interdiction propriétaire',()=>{
  assert.match(route,/caseAccess\(req,id,org,tenant\)/);
  assert.match(route,/Number\(dossier\.destination_unit_id\)!==unitId/);
  assert.match(route,/Number\(dossier\.personne_id\)===Number\(req\.auth\.personneId\)/);
});
test('agent: filtrage organisation, tenant, unité et réponse visible au citoyen',()=>{
  assert.match(route,/d\.organisation_id=\$2/);
  assert.match(route,/t\.code=\$3/);
  assert.match(route,/d\.destination_unit_id=\$4/);
  assert.match(route,/r\.visible_citoyen=TRUE/);
});
test('agent: requêtes paginées ou bornées et aucune requête cross tenant',()=>{
  assert.equal((route.match(/LIMIT 100/g)||[]).length,2);
  assert.match(route,/JOIN organisations o ON o\.id=d\.organisation_id AND o\.tenant_id=d\.tenant_id/);
  assert.match(route,/JOIN tenants t ON t\.id=d\.tenant_id/);
});
test('interface: affichage texte sans insertion HTML dynamique',()=>{
  assert.match(render,/textContent/);
  assert.doesNotMatch(render,/innerHTML|outerHTML|insertAdjacentHTML/);
  assert.match(render,/credentials:'same-origin'/);
  assert.match(render,/unitId:String\(unitId\)/);
});
test('interface: journal ne peut pas déclencher une action documentaire',()=>{
  assert.doesNotMatch(render,/fetch\([^)]*method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(render,/document-workflow\/capabilities|\/respond/);
  assert.match(ui,/renderAgentJournal\(detail, demande\.id\)/);
});
test('navigation: lien catalogue activé seulement avec contexte org+tenant',()=>{
  assert.match(link,/catalogueLink\.removeAttribute\('href'\)/);
  assert.match(link,/SATEER_CONTEXT_READY/);
  assert.match(link,/new URLSearchParams\(\{organisation:String\(org\),tenant\}\)/);
});
