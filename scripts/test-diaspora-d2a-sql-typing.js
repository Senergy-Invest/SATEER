"use strict";
/** Regression SQL 42804: typing PostgreSQL parameters used in CASE branches.
 * This test checks the actual SQL produced by the D2A service, not a duplicate
 * implementation of the transition. The E2E recipe verifies PostgreSQL itself.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { creerServiceBureauDiaspora } = require("../diaspora-bureau-service");

for (const [mode, initial, expected] of [
  ["SUBMIT", "NON_DEMANDEE", "SOUMISE"],
  ["APPROVE", "SOUMISE", "DIFFUSEE"],
  ["REJECT", "SOUMISE", "REJETEE"]
]) {
  test(`transition ${mode}: paramètres CASE typés explicitement`, async () => {
    let updateSql = null;
    let committed = false;
    const publication = {
      id: 456, organisation_id: 374, tenant_id: 143,
      statut: "PUBLIEE", statut_diffusion_diaspora: initial,
      audience_type: "TOUS", medias: []
    };
    const client = {
      async query(sql, values) {
        const statement = String(sql).trim();
        if (statement === "BEGIN" || statement === "ROLLBACK") return { rowCount: 0, rows: [] };
        if (statement === "COMMIT") { committed = true; return { rowCount: 0, rows: [] }; }
        if (statement.startsWith("SELECT p.id")) return { rowCount: 1, rows: [publication] };
        if (statement.startsWith("UPDATE publications")) {
          updateSql = statement;
          assert.deepEqual(values, [expected, mode, 705, mode === "REJECT" ? "Motif de recette suffisant" : null, 456, 143]);
          return { rowCount: 1, rows: [{ id: 456 }] };
        }
        if (statement.startsWith("INSERT INTO audit_trail")) return { rowCount: 1, rows: [] };
        throw new Error("REQUETE_SQL_INATTENDUE");
      },
      release() {}
    };
    const service = creerServiceBureauDiaspora({
      executerRequete: async () => ({ rows: [] }),
      obtenirClientDatabase: async () => client
    });
    const result = await service.transition({
      mode, publicationId: 456, sourceOrgId: mode === "SUBMIT" ? 374 : null,
      tenant: "AMBVIS_96C7FBBEA383DD", acteurId: 705,
      motif: mode === "REJECT" ? "Motif de recette suffisant" : null
    });
    assert.equal(result.ok, true);
    assert.equal(result.statut, expected);
    assert.equal(committed, true);
    assert.ok(updateSql, "L'UPDATE doit avoir été exécuté");
    assert.match(updateSql, /validee_par_sateer\s*=\s*CASE\s+WHEN\s+\$2::text='APPROVE'\s+THEN\s+\$3::integer\s+ELSE\s+NULL\s+END/i);
    assert.match(updateSql, /rejetee_par_sateer\s*=\s*CASE\s+WHEN\s+\$2::text='REJECT'\s+THEN\s+\$3::integer\s+ELSE\s+NULL\s+END/i);
    assert.match(updateSql, /motif_rejet_diaspora\s*=\s*CASE\s+WHEN\s+\$2::text='REJECT'\s+THEN\s+\$4::text\s+ELSE\s+NULL\s+END/i);
    assert.match(updateSql, /WHERE\s+id=\$5::integer\s+AND\s+tenant_id=\$6::integer/i);
  });
}
