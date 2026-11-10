"use strict";
/** Tests de composition : aucune connexion DB / HTTP, aucun test métier. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createPilotModuleRegistry } = require('../pilot-module-registry');

function harness(database, extraEnv = {}) {
  const calls = [];
  const auth = function exigerSession() {};
  const app = { use(route, guard, router) { calls.push(['email', route, guard, router]); } };
  const routeNewCitizenCase = async () => ({ statut: 'TEST' });
  const modules = {
    './bordeaux-email-demo-http': { createEmailDemoRouter: () => ({ marker: 'demo' }) },
    './pilot-routing-rules': { installRoutingRoutes: (a, g) => {
      assert.equal(a, app); assert.equal(g, auth); calls.push(['routing']);
    }, routeNewCitizenCase },
    './pilot-procedures-http': { setup: (a, g) => {
      assert.equal(a, app); assert.equal(g, auth); calls.push(['procedures']);
    } },
    './pilot-procedures-recette-http': { createRouter: () => ({ marker: 'recette' }) },
    './pilot-office-agent-directory': { installOfficeAgentDirectory: a => {
      assert.equal(a, app); calls.push(['agents']);
    } },
    './pilot-staff-invitations': { installStaffInvitations: a => {
      assert.equal(a, app); calls.push(['invitations']);
    } }
  };
  const registry = createPilotModuleRegistry({
    env: { PGDATABASE: database, ...extraEnv },
    load: name => { assert.ok(modules[name], 'Module inattendu: ' + name); return modules[name]; }
  });
  return { calls, registry, app, auth, routeNewCitizenCase };
}

{
 const {calls,registry,app,auth,routeNewCitizenCase}=harness('sateer_test');
 assert.equal(registry.installEmailDemo(app,auth), true);
 const contract=registry.installCitizenIntake(app,auth);
 registry.installStaffAdministration(app);
 assert.equal(contract.routeNewCitizenCase,routeNewCitizenCase);
 assert.deepEqual(calls.map(x=>x[0]), ['email','routing','procedures','agents','invitations']);
 assert.equal(calls[0][1], '/api/bordeaux-email-demo');
 assert.equal(calls[0][2], auth);
 assert.deepEqual(calls[0][3], {marker:'demo'});
}
{
 const {calls,registry,app,auth}=harness('sateer');
 assert.equal(registry.installEmailDemo(app,auth), false);
 registry.installCitizenIntake(app,auth);
 registry.installStaffAdministration(app);
 assert.deepEqual(calls.map(x=>x[0]),['routing','procedures','agents','invitations']);
}
// La simulation doit être strictement désactivée sauf double garde explicite.
for (const [database, flag] of [
  ['sateer_test', undefined], ['sateer_test', '0'], ['sateer_test', 'true'],
  ['sateer', '1']
]) {
  const { calls, registry, app, auth } = harness(database, { SATEER_ENABLE_BORDEAUX_PROCEDURE_RECETTE: flag });
  registry.installCitizenIntake(app,auth);
  assert.deepEqual(calls.map(x => x[0]), ['routing','procedures']);
}
// En recette et uniquement avec le drapeau exact, enregistrer UNE route protégée.
{
  const { calls, registry, app, auth } = harness('sateer_test', { SATEER_ENABLE_BORDEAUX_PROCEDURE_RECETTE: '1' });
  registry.installCitizenIntake(app,auth);
  assert.deepEqual(calls.map(x => x[0]), ['routing','procedures','email']);
  assert.equal(calls[2][1], '/api/bordeaux-procedures-recette');
  assert.equal(calls[2][2], auth);
  assert.deepEqual(calls[2][3], { marker: 'recette' });
}
const source=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
for(const name of ['bordeaux-email-demo-http','pilot-routing-rules','pilot-procedures-http','pilot-office-agent-directory','pilot-staff-invitations']) {
 assert.equal(source.includes(`require("./${name}")`) || source.includes(`require('./${name}')`),false, `server.js importe encore ${name}`);
}
assert.equal((source.match(/pilotModuleRegistry\.installEmailDemo\(/g)||[]).length,1);
assert.equal((source.match(/pilotModuleRegistry\.installCitizenIntake\(/g)||[]).length,1);
assert.equal((source.match(/pilotModuleRegistry\.installStaffAdministration\(/g)||[]).length,1);
console.log('PASS frontiere-composition : 3 groupes / 5 modules / ordre historique et guard DB conserves');
