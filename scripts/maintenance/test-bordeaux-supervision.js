'use strict';
/** P335BC — Contrats de supervision. Aucun accès DB/réseau et aucune écriture. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=process.env.SATEER_TEST_ROOT || process.cwd();
const source=fs.readFileSync(process.env.SATEER_SUPERVISION_SOURCE||path.join(root,'pilot-procedures-http.js'),'utf8');
const first=source.indexOf('async function pilotSupervisionPermise(');
const last=source.indexOf(' const supervisionScope=',first);
const end=source.indexOf(" router.get('/dossiers/:id/journal-agent'",last);
const chunk=source.slice(first,end<0?undefined:end);
const functionText=source.slice(first,last);
function permissionWith(result){
  let call;
  const build=new Function('verifierPermissionPersonneDatabase',functionText+'\nreturn pilotSupervisionPermise;');
  const permission=build(async args=>{call=args;return result;});
  return {permission,invoked:()=>call};
}
test('permission de supervision : décision serveur, portée organisationnelle stricte',async()=>{
  assert.ok(first>=0 && last>first);
  const cases=[[{succes:true,autorise:true,portee:'ORGANISATION'},true],
    [{succes:true,autorise:true,portee:'UNITE'},false],
    [{succes:false,autorise:true,portee:'ORGANISATION'},false],
    [{succes:true,autorise:false,portee:'ORGANISATION'},false],
    [{succes:true,autorise:true,portee:'TENANT'},false]];
  for(const [result,expected] of cases){
    const x=permissionWith(result);
    assert.equal(await x.permission({auth:{personneId:42}},70,'P6V_TEST'),expected);
    assert.deepEqual(x.invoked(),{personneId:42,organisationId:70,tenantCode:'P6V_TEST',permissionCode:'VIEW_OPERATIONAL_DASHBOARD'});
  }
});
test('quatre routes de lecture protégées, pas d API mutatrice ajoutée',()=>{
  for(const route of ['/supervision/synthese','/supervision/filtres','/supervision/dossiers','/supervision/dossiers/:id']){
    assert.ok(chunk.includes(`router.get('${route}'`),'route manquante: '+route);
  }
  assert.equal((chunk.match(/router\.get\('\/supervision\//g)||[]).length,4);
  assert.equal((chunk.match(/router\.(post|put|delete|patch)\(/g)||[]).length,0);
  assert.ok((chunk.match(/pilotSupervisionPermise\(req,ctx\.org,ctx\.tenant\)/g)||[]).length>=4);
  assert.ok(chunk.includes('ACCES_REFUSE'));
  assert.ok(chunk.includes('lectureSeule:true'));
});
test('filtrage organisation + tenant et pagination bornée',()=>{
  assert.ok(chunk.includes('d.organisation_id=$1 AND t.code=$2'));
  assert.ok(chunk.includes('o.id=d.organisation_id AND o.tenant_id=d.tenant_id'));
  assert.ok(chunk.includes('JOIN tenants t ON t.id=d.tenant_id'));
  assert.ok(chunk.includes('const page=Number(pageRaw),pageSize=20'));
  assert.ok(chunk.includes('LIMIT $${args.length+1} OFFSET $${args.length+2}'));
  assert.ok(chunk.includes('LIMIT 5')&&chunk.includes('LIMIT 6'));
  assert.ok(chunk.includes('DOSSIER_ABSENT_DU_PERIMETRE'));
});
test('aucune pièce privée et aucune donnée affichée via innerHTML',()=>{
  assert.ok(!chunk.includes('citizen_private_files'));
  assert.ok(!chunk.includes('pieces_jointes'));
  const cases=fs.readFileSync(path.join(root,'public/sateer-vice-cases.js'),'utf8');
  const layout=fs.readFileSync(path.join(root,'public/sateer-vice-layout.js'),'utf8');
  assert.ok(cases.includes("credentials:'same-origin'"));
  assert.ok(layout.includes("credentials:'same-origin'"));
  assert.ok(!cases.includes('.innerHTML =')&&!layout.includes('.innerHTML ='));
  assert.ok(cases.includes("'/api/pilot-procedures/supervision'"));
});
test('registre rattaché au même module, pas de route d écriture',()=>{
  const html=fs.readFileSync(path.join(root,'public/registre-demandes-vice-consul.html'),'utf8');
  assert.ok(html.includes('/auth-client.js'));
  assert.ok(html.includes('/sateer-vice-cases.js'));
  assert.ok(html.includes('sateer-vice-registre'));
});
