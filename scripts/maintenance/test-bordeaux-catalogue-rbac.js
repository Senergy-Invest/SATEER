'use strict';
// Tests déterministes sans PostgreSQL ni serveur. Node 18+.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(process.env.SATEER_RBAC_TEST_SOURCE || path.resolve(__dirname, '../../pilot-procedures-http.js'), 'utf8');
function extract(name) {
  const begin = source.indexOf(`async function ${name}(`);
  assert.ok(begin >= 0, `Fonction absente : ${name}`);
  const end = source.indexOf('\n}', begin);
  assert.ok(end > begin, `Fin de fonction absente : ${name}`);
  return source.slice(begin, end + 2);
}
test('edition exige MANAGE_PROCEDURES seul, sans privilege hérité', async () => {
  const calls = [];
  const fn = vm.runInNewContext(`${extract('catalogueEditRight')}; catalogueEditRight`, {
    droitOrganisation: async (_p, _o, _t, perm) => { calls.push(perm); return perm === 'MANAGE_PROCEDURES'; }
  });
  assert.equal(await fn(12, 70, 'TENANT_TEST'), true);
  assert.deepEqual(calls, ['MANAGE_PROCEDURES']);
});
test('CREATE_UNIT, MANAGE_PUBLICATIONS et supervision ne donnent pas le droit d édition', async () => {
  for (const allowed of ['CREATE_UNIT', 'MANAGE_PUBLICATIONS', 'VIEW_OPERATIONAL_DASHBOARD']) {
    const fn = vm.runInNewContext(`${extract('catalogueEditRight')}; catalogueEditRight`, {
      droitOrganisation: async (_p, _o, _t, perm) => perm === allowed
    });
    assert.equal(await fn(1,70,'TENANT_TEST'), false, allowed);
  }
});
test('droitOrganisation impose portée exacte ORGANISATION et succès explicite', async () => {
  const outcomes = [
    {succes:true, autorise:true, portee:'ORGANISATION', expected:true},
    {succes:true, autorise:true, portee:'TENANT', expected:false},
    {succes:true, autorise:false, portee:'ORGANISATION', expected:false},
    {succes:false, autorise:true, portee:'ORGANISATION', expected:false}
  ];
  for (const r of outcomes) {
    const fn = vm.runInNewContext(`${extract('droitOrganisation')}; droitOrganisation`, {
      verifierPermissionPersonneDatabase: async (ctx) => {
        assert.equal(ctx.personneId, 1);
        assert.equal(ctx.organisationId, 70);
        assert.equal(ctx.tenantCode, 'TENANT_TEST');
        assert.equal(ctx.permissionCode, 'MANAGE_PROCEDURES');
        return r;
      }
    });
    assert.equal(await fn(1,70,'TENANT_TEST','MANAGE_PROCEDURES'), r.expected);
  }
});
test('publication exige validation explicite et auteur de validation', () => {
  assert.match(source, /c\.actif=TRUE AND c\.validation_explicite=TRUE AND c\.valide_par IS NOT NULL/);
  assert.match(source, /req\.body\?\.actif===true/);
  assert.match(source, /validation_explicite=FALSE,date_validation=NULL,date_publication=NULL/);
});
test('validation et publication sont deux actions distinctes, avec confirmation, origine et révision', () => {
  for (const op of ['valider','publier','retirer']) {
    assert.ok(source.includes(`router.post('/administration/:code/${op}'`), `Action manquante ${op}`);
  }
  assert.match(source, /req\.body\?\.confirmation!==true/);
  assert.match(source, /if\(!sameOrigin\(req\)\)/);
  assert.match(source, /EXTRACT\(EPOCH FROM c\.mis_a_jour_le\)::numeric\(19,6\)/);
});
test('supervision non incluse dans le commit catalogue', () => {
  if (process.env.SATEER_RBAC_TEST_STAGED === '1') {
    assert.equal(source.includes('P3.3.5J — Journal Agent'), false);
    assert.equal(source.includes('router.get(\'/supervision/synthese\''), false);
  }
});
