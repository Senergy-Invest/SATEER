"use strict";
/** A8 - tests purs du contrat de qualification, sans pg, Express ou base réelle. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root,"pilot-routing-rules.js"), "utf8");
const mockedDatabase = {executerRequete(){throw new Error("LECTURE_BD_INTERDITE");},
  obtenirClientDatabase(){throw new Error("TRANSACTION_INTERDITE");}};
const ctx = {module:{exports:{}},console,
  process:{env:{PGDATABASE:"sateer_test"}},
  require(name){if(name === "./database")return mockedDatabase;
    if(name === "./services-database")return {obtenirPermissionsEffectivesDatabase(){throw new Error("NON_UTILISE");}};
    throw new Error("DEPENDANCE_INATTENDUE:"+name);}};
vm.runInNewContext(source,ctx,{filename:"pilot-routing-rules.js"});
(async()=>{
  const f=ctx.module.exports.routeNewCitizenCase;
  const x=await f({canal:"MON_AMBASSADE",organisationId:1,tenantCode:"SN",demandeId:1,categorie:"PASSEPORT"});
  assert.equal(x.statut,"QUALIFICATION_MANUELLE_REQUISE");
  assert.equal(x.execution,false);
  assert.equal(x.motif,"INTENTION_AVANT_THEME");
  const unknown=await f({canal:"OTHER"});
  assert.equal(unknown.statut,"CANAL_NON_COUVERT");
  const server=fs.readFileSync(path.join(root,"server.js"),"utf8");
  assert.ok(server.includes('CANAL_AMBASSADE_INCOMPATIBLE'));
  assert.ok(server.includes('organisationAmbassade?.type !== "AMBASSADE"'));
  const form=fs.readFileSync(path.join(root,"public/demande.js"),"utf8");
  assert.ok(form.includes('"MON_AMBASSADE"'));
  assert.ok(form.includes('"AMBASSADE"'));
  const page=fs.readFileSync(path.join(root,"public/ambassade.html"),"utf8");
  assert.ok(page.includes('id="ambassadeDemandeLink"'));
  const embassy=fs.readFileSync(path.join(root,"public/ambassade.js"),"utf8");
  assert.ok(embassy.includes('"MON_AMBASSADE"'));
  console.log("A8_CONTRAT_CITOYEN_PASS=10");
})().catch(e=>{console.error(e);process.exitCode=1;});
