#!/usr/bin/env node
'use strict';
/**
 * Smoke test read-only du pilote Bordeaux.
 * Dépendances : Node.js >= 18, Python 3 pour les tests statiques existants.
 * Aucun cookie, aucune authentification, aucun POST, aucune écriture en base.
 * Usage : node scripts/maintenance/verifier-bordeaux-http-readonly.js
 *        SATEER_SMOKE_BASE_URL=http://127.0.0.1:3200 node scripts/maintenance/verifier-bordeaux-http-readonly.js
 */
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const url = require('node:url');
const project = path.resolve(__dirname, '..', '..');
const base = process.env.SATEER_SMOKE_BASE_URL || 'http://127.0.0.1:3200';
const tests = [];
let errors = 0;
function record(label, passed, info='') {
  tests.push({label, passed, info});
  console.log(`${passed ? 'PASS' : 'FAIL'} ${label}${info ? ': ' + info : ''}`);
  if (!passed) errors++;
}
function run(cmd, args, cwd=project) {
  return cp.spawnSync(cmd, args, {cwd, encoding:'utf8', timeout:20000, env:process.env});
}
function checkCommand(label, cmd, args) {
  const r = run(cmd, args);
  const detail = r.error ? r.error.message : (r.status === 0 ? '' : (r.stderr || r.stdout || `exit=${r.status}`).trim().slice(0,400));
  record(label, r.status === 0 && !r.error, detail);
}
function expectedCode(httpStatus, allowed) {
  return allowed.includes(httpStatus);
}
async function get(p) {
  const endpoint = new url.URL(p, base);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    // Explicitly no credentials and no cookies in the HTTP client.
    const r = await fetch(endpoint, {method:'GET',redirect:'manual',signal:controller.signal,headers:{Accept:'text/html,application/json'}});
    await r.arrayBuffer();
    return r.status;
  } finally { clearTimeout(timeout); }
}
(async function main() {
  console.log('=== SATEER | SMOKE HTTP BORDEAUX | LECTURE SEULE ===');
  record('Racine du projet', fs.existsSync(path.join(project,'server.js')) && fs.existsSync(path.join(project,'.git')));
  const branch = run('git',['branch','--show-current']);
  record('Branche Bordeaux', branch.status===0 && branch.stdout.trim()==='work/bordeaux-pilot', branch.stdout.trim());
  const head = run('git',['log','-1','--format=%h %s']);
  if(head.status===0) console.log('HEAD:',head.stdout.trim());
  const js = [
    'server.js','services-database.js','pilot-procedures-http.js','bordeaux-email-demo-http.js',
    'sateer-mail-guidance-core.js','public/unit-workspace.js','public/p7-admin.js',
    'public/email-secretariat-demo.js','public/sateer-vice-cases.js','public/sateer-vice-layout.js',
    'public/sateer-mail-intent-core.js','public/sateer-document-status.js',
    'public/consulat.js','public/sateer-p2.js','public/p6-routing-ui.js',
  ];
  for (const file of js) {
    if (!fs.existsSync(path.join(project,file))) {
      record('Fichier requis '+file, false, 'absent');
      continue;
    }
    checkCommand('Syntaxe '+file, 'node', ['--check',file]);
  }
  checkCommand('Test frontières modules', 'node', ['scripts/test-pilot-module-registry.js']);
  checkCommand('Contrôle statique migrations', 'node', ['scripts/maintenance/test-migrations-catalogue-static.js']);
  checkCommand('Contrats statiques Bordeaux', 'python3', ['scripts/maintenance/verifier-pilote-bordeaux.py','--root',project]);
  checkCommand('Git diff --check', 'git', ['diff','--check']);
  const staged=run('git',['diff','--cached','--name-only']);
  if (staged.status===0) console.log('INDEX_GIT:', staged.stdout.trim() ? 'NON_VIDE (aucun ajout automatique)' : 'VIDE');
  let httpOk=0;
  const publicPaths = [
    '/dashboard-vice-consul.html', '/registre-demandes-vice-consul.html',
    '/email-secretariat-demo.html', '/catalogue-demarches.html', '/unit-workspace.html',
    '/demande-detail.html',
  ];
  for (const p of publicPaths) {
    try {
      const status=await get(p);
      record('HTTP GET '+p, expectedCode(status,[200]), 'HTTP '+status);
      httpOk++;
    } catch(e) {record('HTTP GET '+p,false, String(e.cause?.code||e.message));}
  }
  // Test only that endpoints do not expose protected data without credentials.
  const restricted = [
    '/api/auth/me',
    '/api/pilot-procedures/administration?organisationId=70&tenant=P6V_3B5AC5AB9DB04657',
  ];
  for (const p of restricted) {
    try {
      const status=await get(p);
      record('Accès anonyme refusé '+p.split('?')[0], expectedCode(status,[401,403]), 'HTTP '+status);
    } catch(e) {record('Accès anonyme refusé '+p.split('?')[0],false,String(e.cause?.code||e.message));}
  }
  const diff=run('git',['status','--porcelain','--untracked-files=normal']);
  if(diff.status===0) {
    const list=diff.stdout.split('\n').filter(Boolean);
    console.log('GIT_ENTREES_RESTANTES:',list.length);
  }
  console.log('CONTROLES_NON_COUVERTS: auth multi-rôles connectés, données métier SQL, tests de charge');
  console.log('ECRITURES_METIER: AUCUNE | REDEMARRAGE: NON | COMMIT: NON');
  console.log('SATEER_SMOKE_RESULTAT:',errors===0?'PASS':'FAIL',`(${tests.length-errors}/${tests.length})`);
  if (errors) process.exitCode=1;
})().catch(e => {console.error('SATEER_SMOKE_ERREUR:',e.message);process.exitCode=1;});
