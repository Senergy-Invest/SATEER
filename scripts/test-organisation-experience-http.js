"use strict";
// Tests synthetiques sans serveur, session reelle, PostgreSQL ou reseau.
const assert = require("node:assert/strict");
const { creerRoutesExperiencesOrganisation } = require("../organisation-experience-http");

function reponse() {
  return {
    statusCode: 200, payload: null, headers: {},
    set(k,v){this.headers[k]=v;return this},
    status(n){this.statusCode=n;return this},
    json(x){this.payload=x;return this}
  };
}
async function main() {
  const handlers = {};
  const router = {
    get(p,fn){handlers[`GET ${p}`]=fn;},
    put(p,fn){handlers[`PUT ${p}`]=fn;}
  };
  const appels = [];
  const permissions = new Set(["VIEW_ORGANISATION_EXPERIENCES", "MANAGE_ORGANISATION_EXPERIENCES"]);
  const requete = async (sql,args) => {
    appels.push({sql,args});
    if (sql.startsWith("SELECT id FROM tenants")) return {rows:[{id:20}]};
    if (sql.includes("ORDER BY e.ordre")) return {rows:[{code:"EXPERIENCE_TEST",statut:"INACTIVE"}]};
    if (sql.includes("RETURNING id")) return {rows:[{statut:args[3], organisation_id:args[1]}]};
    throw Error("SQL inattendu");
  };
  const autorisations = [];
  const verifierPermission = async x => {
    autorisations.push(x);
    const yes = x.personneId===123 && x.organisationId===70 && x.tenantCode==='SN'
      && permissions.has(x.permissionCode);
    return {succes:true, autorise:yes, portee:yes?'ORGANISATION':null};
  };
  creerRoutesExperiencesOrganisation({router,requete,verifierPermission,origineAutorisee:'http://localhost:3100'});
  const req = (params={},query={tenant:'SN'},body,auth={personneId:123},origin='http://localhost:3100') =>
    ({params:{organisationId:'70',...params},query,body,auth,get:k=>k==='origin'?origin:null});
  const get = handlers['GET /:organisationId'];
  const put = handlers['PUT /:organisationId/:codeExperience'];
  assert.equal(typeof get,'function');assert.equal(typeof put,'function');

  let r=reponse();await get(req({},undefined,undefined,null),r);assert.equal(r.statusCode,401);
  r=reponse();await get(req({organisationId:'70; DROP TABLE'}),r);assert.equal(r.statusCode,400);
  r=reponse();await get(req({}, {tenant:'sn'}),r);assert.equal(r.statusCode,400);
  r=reponse();await get(req(),r);assert.equal(r.statusCode,200);
  assert.equal(r.payload.experiences[0].statut,'INACTIVE');
  assert.equal(autorisations.at(-1).permissionCode,'VIEW_ORGANISATION_EXPERIENCES');
  assert.equal(autorisations.at(-1).uniteId,null);

  r=reponse();await get(req({organisationId:'71'}),r);assert.equal(r.statusCode,403);
  assert.equal(autorisations.at(-1).organisationId,71);
  r=reponse();await get(req({}, {tenant:'FR'}),r);assert.equal(r.statusCode,403);
  r=reponse();await get(req({}, {tenant:'FR'}, undefined,{personneId:987}),r);assert.equal(r.statusCode,403);

  const args = {codeExperience:'EXPERIENCE_TEST'};
  const count=appels.length;
  r=reponse();await put(req(args,undefined,{statut:'ACTIVE'},undefined,'https://evil.example'),r);
  assert.equal(r.statusCode,403);assert.equal(appels.length,count);
  r=reponse();await put(req(args,undefined,{statut:'ACTIVE',personneId:999}),r);
  assert.equal(r.statusCode,400);
  r=reponse();await put(req(args,undefined,{statut:'ENABLED'}),r);assert.equal(r.statusCode,400);
  r=reponse();await put(req({codeExperience:'../foo'},undefined,{statut:'ACTIVE'}),r);assert.equal(r.statusCode,400);
  permissions.delete('MANAGE_ORGANISATION_EXPERIENCES');
  const before=appels.length;
  r=reponse();await put(req(args,undefined,{statut:'ACTIVE'}),r);assert.equal(r.statusCode,403);
  assert.equal(appels.length,before+1,'Lookup tenant uniquement : aucune ecriture sans habilitation');
  permissions.add('MANAGE_ORGANISATION_EXPERIENCES');
  r=reponse();await put(req(args,undefined,{statut:'ACTIVE'}),r);assert.equal(r.statusCode,200);
  assert.equal(r.payload.activation.statut,'ACTIVE');
  assert.deepEqual(appels.at(-1).args,[20,70,'EXPERIENCE_TEST','ACTIVE',123]);
  r=reponse();await put(req(args,undefined,{statut:'INACTIVE'}),r);assert.equal(r.statusCode,200);
  assert.equal(r.payload.activation.statut,'INACTIVE');
  r=reponse();await put(req({...args,organisationId:'71'},undefined,{statut:'ACTIVE'}),r);assert.equal(r.statusCode,403);
  console.log('P3_3_3A_API_CONTRATS_PASS : session, tenant, org, permissions, origine, statut, SQL et refus croises');
  console.log('Tests locaux uniquement : aucun reseau et aucune base modifies.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
