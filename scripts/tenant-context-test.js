"use strict";
process.env.PGDATABASE = "sateer_test";
process.env.PGHOST = process.env.PGHOST || "localhost";
process.env.PGPORT = process.env.PGPORT || "5432";
process.env.PGUSER = process.env.PGUSER || process.env.USER;
const { randomBytes } = require("node:crypto");
const { transactionOrganisationAuthentifiee } = require("../tenant-context");
const { executerRequete, fermerDatabase, obtenirContexteDatabaseCourant } = require("../database");
const tag = randomBytes(5).toString("hex");
function assert(ok, message) {if (!ok) throw Error(message);console.log("PASS "+message);}
async function main() {
 const check=await executerRequete("SELECT current_database() AS db");
 assert(check.rows[0].db==="sateer_test","DB jetable uniquement");
 const t=[];
 try {
  const r=await executerRequete("INSERT INTO tenants(code,nom,type) VALUES($1,$1,'TEST') RETURNING id",["CTX_"+tag]);
  t[0]=Number(r.rows[0].id);
  const r2=await executerRequete("INSERT INTO organisations(nom,type,tenant_id) VALUES($1,'TEST',$2) RETURNING id",["Org "+tag,t[0]]);
  t[1]=Number(r2.rows[0].id);
  const p=await executerRequete("INSERT INTO personnes(prenom,nom,profil) VALUES('CTX',$1,'TEST') RETURNING id",[tag]);
  t[2]=Number(p.rows[0].id);
  const q=await executerRequete("INSERT INTO personnes(prenom,nom,profil) VALUES('OUT',$1,'TEST') RETURNING id",[tag]);
  t[3]=Number(q.rows[0].id);
  await executerRequete("INSERT INTO relations_personne_organisation(personne_id,organisation_id,type) VALUES($1,$2,'TEST')",[t[2],t[1]]);
  await transactionOrganisationAuthentifiee({personneId:t[2],organisationId:t[1]},async ctx=>{
   assert(ctx.tenantId===t[0],"Tenant résolu côté serveur");
   const db=await executerRequete("SELECT current_setting('sateer.tenant_id',true) AS tenant,current_setting('sateer.personne_id',true) AS person");
   assert(db.rows[0].tenant===String(t[0])&&db.rows[0].person===String(t[2]),"Contexte PostgreSQL lié à la session vérifiée");
  });
  let rejected=false;
  try {await transactionOrganisationAuthentifiee({personneId:t[3],organisationId:t[1]},async()=>{});}
  catch(e){rejected=e.code==="ORGANISATION_ACCESS_DENIED";}
  assert(rejected,"Utilisateur extérieur refusé");
  assert(obtenirContexteDatabaseCourant()===null,"Aucun contexte résiduel");
  console.log("SUCCÈS - Résolution tenant authentifiée.");
 } finally {
  if(t[1])await executerRequete("DELETE FROM relations_personne_organisation WHERE organisation_id=$1",[t[1]]);
  if(t[1])await executerRequete("DELETE FROM organisations WHERE id=$1",[t[1]]);
  if(t[2]||t[3])await executerRequete("DELETE FROM personnes WHERE id=ANY($1::int[])",[[t[2],t[3]].filter(Boolean)]);
  if(t[0])await executerRequete("DELETE FROM tenants WHERE id=$1",[t[0]]);
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>fermerDatabase());
