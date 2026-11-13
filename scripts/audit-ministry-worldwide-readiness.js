"use strict";
/** A4c+d : état du socle ministériel sur la seule base de RECETTE, lecture seule. */
const assert = require("node:assert/strict");
if (process.env.PGDATABASE !== "sateer_test") {
  console.error("MINISTRY_AUDIT_REFUS_BASE"); process.exit(40);
}
const { obtenirClientDatabase, fermerDatabase } = require("../database");
async function main() {
  const client = await obtenirClientDatabase();
  let ouverte = false;
  try {
    const instance = await client.query("SELECT current_database() AS db, (SELECT system_identifier::text FROM pg_control_system()) AS system_identifier");
    assert.equal(instance.rows?.[0]?.db, "sateer_test", "MINISTRY_AUDIT_REFUS_BASE");
    assert.equal(instance.rows?.[0]?.system_identifier, "7699611241381229531", "MINISTRY_AUDIT_REFUS_CLUSTER");
    await client.query("BEGIN READ ONLY"); ouverte = true;
    const schema = await client.query(`SELECT to_regclass('public.organisations') IS NOT NULL AS organisations,
      to_regclass('public.organisation_relationships') IS NOT NULL AS relations,
      to_regclass('public.permissions') IS NOT NULL AS permissions`);
    assert.ok(schema.rows?.[0]?.organisations && schema.rows?.[0]?.relations && schema.rows?.[0]?.permissions,
      "MINISTRY_AUDIT_SCHEMA_INCOMPLET");
    const r = await client.query(`SELECT
      (SELECT count(*)::int FROM organisations WHERE type='MINISTERE') AS ministeres,
      (SELECT count(*)::int FROM organisations WHERE type='AMBASSADE') AS ambassades,
      (SELECT count(*)::int FROM organisations WHERE type='CONSULAT') AS consulats,
      (SELECT count(*)::int FROM organisation_relationships
        WHERE type IN ('SUPERVISION','ADMINISTRATIVE_TUTELLE') AND actif=TRUE AND statut='ACTIVE') AS tutelles_actives,
      (SELECT count(*)::int FROM permissions WHERE code='VIEW_MINISTRY_WORLDWIDE' AND actif=TRUE) AS droit_mondial_catalogue,
      (SELECT count(*)::int FROM permissions WHERE code='VIEW_INSTITUTION_NETWORK' AND actif=TRUE) AS droit_reseau_catalogue`);
    const x = r.rows?.[0];
    assert.ok(x && Object.values(x).every(v=>Number.isSafeInteger(v)&&v>=0));
    // Ni nom de personne ni ID d'une organisation n'est journalisé.
    for (const [key,valeur] of Object.entries(x))console.log(`A4CD_ETAT_${key.toUpperCase()}=${valeur}`);
    console.log("A4CD_SOURCE_REPORTING_OFFICIELLE=NON_CONFIGUREE_DANS_A4B");
    await client.query("ROLLBACK"); ouverte = false;
    console.log("A4CD_AUDIT_SATEER_TEST_READ_ONLY_PASS");
  } finally {
    if (ouverte)await client.query("ROLLBACK").catch(()=>{});
    client.release(); await fermerDatabase();
  }
}
main().catch(e=>{console.error("A4CD_AUDIT_BLOQUE",e.message);process.exitCode=1;});
