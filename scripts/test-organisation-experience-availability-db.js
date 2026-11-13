"use strict";
/**
 * P3.3.4B — Test PostgreSQL reel du garde interne de disponibilite.
 * Donnees fictives et identifiants explicites, strictement sous ROLLBACK.
 * Aucune route, compte, migration, permission, ni donnees Bordeaux touchee.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { Pool } = require("pg");
const { creerDisponibiliteExperienceOrganisation } = require("../organisation-experience-availability");

const ROOT = path.resolve(__dirname, "..");
const CLUSTER = "7699611241381229531"; // meme system_identifier que P6/P3.3.3C
const EXPECTED = {
  "organisation-experience-availability.js": "69c5c5ae41c921fab63a5e001a1bd7d386f983496d07f8d0476abdd8bb1bb772",
  "database/040_organisation_experience_activations.sql": "f847069b446db56f38555cd70cb66cca5e44eec8904cd66e837f4cc2c687b644",
  "scripts/test-organisation-experience-availability.js": "d314732c390c2371204a008269d63b6c1aa7d47fcb144107ec1ab0d5136baa44"
};

function pass(message) { console.log("PASS " + message); }
function digest(filename) { return crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex"); }
function check(value, message) { assert.ok(value, message); pass(message); }
function git(...args) { return execFileSync("git", ["-C", ROOT, ...args], {encoding:"utf8", timeout:8000}).trim(); }
function positive(value) { const n = Number(value); assert.ok(Number.isSafeInteger(n) && n>0); return n; }

async function main() {
  // Refus avant toute connexion réseau : ne jamais prendre les valeurs implicites de libpq.
  check(process.env.PGHOST === "::1", "PGHOST epingle a ::1");
  check(process.env.PGPORT === "5432", "PGPORT epingle a 5432");
  check(process.env.PGDATABASE === "sateer_test", "PGDATABASE epingle a sateer_test");
  check(process.env.NODE_ENV !== "production", "Mode production interdit");
  check(fs.existsSync(path.join(ROOT,".git")), "Depot Git present");
  check(git("branch","--show-current") === "work/bordeaux-pilot", "Branche Bordeaux conservee");
  for (const [file, hash] of Object.entries(EXPECTED)) {
    check(digest(path.join(ROOT,file)) === hash, `${file} conforme a la version validee`);
  }

  const pool = new Pool({
    host:"::1", port:5432, database:"sateer_test",
    user:process.env.PGUSER || process.env.USER,
    ...(process.env.PGPASSWORD ? {password:process.env.PGPASSWORD} : {}),
    max:2, connectionTimeoutMillis:7000, query_timeout:20000,
    statement_timeout:18000, application_name:"sateer_p334b_rollback"
  });
  const tag = crypto.randomBytes(7).toString("hex").toUpperCase();
  const tenantCodeA = `P334B_A_${tag}`;
  const tenantCodeC = `P334B_C_${tag}`;
  const expCode = `EXP_P334B_${tag}`;
  const expOther = `AUTRE_P334B_${tag}`;
  let client = null;
  let transactionOpen = false;
  let validated = false;
  const ids = {};
  const auditIssues = [];
  try {
    client = await pool.connect();
    const identity = await client.query(`SELECT current_database() AS db,
      (SELECT system_identifier::text FROM pg_control_system()) AS system_id,
      inet_server_addr()::text AS server_address`);
    check(identity.rows.length===1 && identity.rows[0].db==="sateer_test"
       && identity.rows[0].system_id===CLUSTER,
       "Identite physique du cluster PostgreSQL de recette confirmee AVANT toute ecriture");
    const schema = await client.query("SELECT to_regclass('public.organisation_experience_activations') IS NOT NULL AS present");
    check(schema.rows[0].present===true, "Registre de migration 040 present dans sateer_test");

    // Eviter de faire avancer les sequences en attribuant des ID fictifs explicites.
    for (const [table, count] of Object.entries({tenants:2, organisations:3, experiences:2,
                                                   organisation_experience_activations:3})) {
      let allocated = false;
      for (let attempt=0; attempt<12; attempt++) {
        const start = crypto.randomInt(1500000000,1900000000);
        const candidates = Array.from({length:count}, (_, i)=>start+i);
        const result = await client.query(`SELECT id FROM public.${table} WHERE id = ANY($1::bigint[])`,[candidates]);
        if (result.rows.length===0) { ids[table]=candidates; allocated=true; break; }
      }
      check(allocated, `IDs synthetiques libres pour ${table}`);
    }

    await client.query("BEGIN"); transactionOpen = true;
    await client.query("SET LOCAL search_path = public, pg_catalog");
    await client.query("SET LOCAL lock_timeout = '1500ms'");
    await client.query("SET LOCAL statement_timeout = '18000ms'");
    const lock = await client.query("SELECT pg_try_advisory_xact_lock(334, 334) AS ok");
    check(lock.rows[0]?.ok===true, "Verrou anti-concurrence transactionnel acquis");

    const [tenantA,tenantC]=ids.tenants;
    const [orgA,orgB,orgC]=ids.organisations;
    const [experienceId,otherExperienceId]=ids.experiences;
    const [actA,actB,actC]=ids.organisation_experience_activations;
    await client.query(`INSERT INTO tenants(id,code,nom,type,actif) VALUES
      ($1,$2,$3,'TEST_SYNTHETIQUE',TRUE),($4,$5,$6,'TEST_SYNTHETIQUE',TRUE)`,
      [tenantA,tenantCodeA,`P334B tenant A ${tag}`,tenantC,tenantCodeC,`P334B tenant C ${tag}`]);
    await client.query(`INSERT INTO organisations(id,nom,type,tenant_id) VALUES
      ($1,$2,'TEST_SYNTHETIQUE',$3),($4,$5,'TEST_SYNTHETIQUE',$3),
      ($6,$7,'TEST_SYNTHETIQUE',$8)`,
      [orgA,`P334B_${tag}_A`,tenantA,orgB,`P334B_${tag}_B`,orgC,`P334B_${tag}_C`,tenantC]);
    await client.query(`INSERT INTO experiences(id,code,nom,type,actif,ordre) VALUES
      ($1,$2,$3,'INSTITUTIONNELLE',TRUE,90),
      ($4,$5,$6,'INSTITUTIONNELLE',TRUE,91)`,
      [experienceId,expCode,`P334B experimentale ${tag}`,
       otherExperienceId,expOther,`P334B autre ${tag}`]);
    pass("Deux tenants, trois organisations et deux experiences exclusivement synthetiques prepares");

    let requestCount = 0;
    const service = creerDisponibiliteExperienceOrganisation({
      requete: async (sql, params)=> { requestCount++; return client.query(sql,params); }
    });
    const A={tenantId:tenantA,organisationId:orgA,codeExperience:expCode};
    const B={tenantId:tenantA,organisationId:orgB,codeExperience:expCode};
    const C={tenantId:tenantC,organisationId:orgC,codeExperience:expCode};
    async function expects(ctx, expected, label) {
      const actual = await service.estDisponible(ctx);
      check(actual === expected, label + ` (${String(expected).toUpperCase()})`);
    }
    await expects(A,false,"A indisponible par defaut");
    await expects(B,false,"B indisponible par defaut");
    await expects(C,false,"C indisponible par defaut dans autre tenant");
    await expects({...A, tenantId:tenantC},false,"Mauvais tenant sur organisation A refuse");
    await expects({...A,codeExperience:expOther},false,"Autre experience non active reste indisponible");

    await client.query(`INSERT INTO organisation_experience_activations
      (id,tenant_id,organisation_id,experience_id,statut) VALUES ($1,$2,$3,$4,'ACTIVE')`,
      [actA,tenantA,orgA,experienceId]);
    await expects(A,true,"Activation A visible par le service interne");
    await expects(B,false,"B reste indisponible malgre activation A");
    await expects(C,false,"Autre tenant demeure indisponible");
    await expects({...A,tenantId:tenantC},false,"Mauvais tenant ne herite pas de A");

    await client.query(`INSERT INTO organisation_experience_activations
      (id,tenant_id,organisation_id,experience_id,statut) VALUES ($1,$2,$3,$4,'ACTIVE')`,
      [actB,tenantA,orgB,experienceId]);
    await expects(B,true,"Activation B independante");
    await client.query(`UPDATE organisation_experience_activations SET statut='INACTIVE'
      WHERE tenant_id=$1 AND organisation_id=$2 AND experience_id=$3`,
      [tenantA,orgA,experienceId]);
    await expects(A,false,"Desactivation A disponible immediatement");
    await expects(B,true,"Desactivation A sans impact sur B");

    // Le catalogue d'experiences et celui des tenants sont des conditions supplementaires.
    await client.query("UPDATE experiences SET actif=FALSE WHERE id=$1",[experienceId]);
    await expects(B,false,"Experience inactive au catalogue : B refusee meme si statut ACTIVE");
    await client.query("UPDATE experiences SET actif=TRUE WHERE id=$1",[experienceId]);
    await expects(B,true,"Experience reactivee au catalogue : B retrouve son activation explicite");
    await client.query("UPDATE tenants SET actif=FALSE WHERE id=$1",[tenantA]);
    await expects(B,false,"Tenant inactif : B refusee meme si statut ACTIVE");
    await client.query("UPDATE tenants SET actif=TRUE WHERE id=$1",[tenantA]);
    await expects(B,true,"Tenant reactive : B reste independante de A");
    await expects(C,false,"C sans activation reste indisponible");

    // Tester egalement C : aucune transmission d'activation entre tenants.
    await client.query(`INSERT INTO organisation_experience_activations
      (id,tenant_id,organisation_id,experience_id,statut) VALUES ($1,$2,$3,$4,'ACTIVE')`,
      [actC,tenantC,orgC,experienceId]);
    await expects(C,true,"C activable explicitement dans son propre tenant");
    await expects(A,false,"Activer C ne reactive pas A");
    await expects(B,true,"Activer C ne perturbe pas B");

    const before=requestCount;
    for (const invalid of [
      {...A, tenantId:String(tenantA)},
      {...A, organisationId:0},
      {...A, codeExperience:"exp_p334b"},
      {...A, codeExperience:"EXP_X' OR TRUE --"}
    ]) await assert.rejects(service.estDisponible(invalid),TypeError);
    check(requestCount===before,"Entrees malformees refusees avant toute requete SQL");
    const count=await client.query("SELECT count(*)::int AS n FROM organisation_experience_activations WHERE experience_id=$1",[experienceId]);
    check(count.rows[0].n===3,"Trois activations synthetiques uniquement visibles dans la transaction");
    check(requestCount>=20,`${requestCount} requetes reelles de disponibilite executees dans la transaction`);
    validated = true;
  } finally {
    if (client) {
      if (transactionOpen) {
        try {await client.query("ROLLBACK"); transactionOpen=false;pass("ROLLBACK explicite de tous les INSERT/UPDATE synthetiques");}
        catch (e) { auditIssues.push("ROLLBACK non confirme : "+e.message); }
      }
      try {client.release();} catch (e) {auditIssues.push("Liberation client : "+e.message);}
    }
    // Controle independant sur une connexion neuve, PAS sur la transaction annulee.
    if (Object.keys(ids).length===4 && !auditIssues.some(x=>x.startsWith("ROLLBACK non confirme"))) {
      try {
        const result=await pool.query(`SELECT
          (SELECT count(*)::int FROM tenants WHERE code=ANY($1::text[]) OR id=ANY($2::integer[])) AS t,
          (SELECT count(*)::int FROM organisations WHERE id=ANY($3::integer[])) AS o,
          (SELECT count(*)::int FROM experiences WHERE code=ANY($4::text[]) OR id=ANY($5::integer[])) AS e,
          (SELECT count(*)::int FROM organisation_experience_activations WHERE id=ANY($6::bigint[])) AS a`,
          [[tenantCodeA,tenantCodeC],ids.tenants,ids.organisations,[expCode,expOther],ids.experiences,ids.organisation_experience_activations]);
        check(Object.values(result.rows[0]).every(v=>v===0),"Controle independant : aucun residu synthetique apres ROLLBACK");
      } catch (e) {auditIssues.push("Controle des residus : "+e.message);}
    }
    try {await pool.end();} catch (e){auditIssues.push("Fermeture pool : "+e.message);}
  }
  if (auditIssues.length) throw new Error(auditIssues.join(" | "));
  if (validated) console.log("P3_3_4B_DISPONIBILITE_DB_TRANSACTIONNEL_PASS");
}
main().catch(e=>{console.error("P3_3_4B_ECHEC :",e.stack||e.message);process.exitCode=1;});
