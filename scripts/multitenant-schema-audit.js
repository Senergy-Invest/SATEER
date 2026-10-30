"use strict";

// Read-only PostgreSQL schema audit. Refuses to run outside sateer_test.
// Reads metadata only: no business rows, no INSERT/UPDATE/DELETE/DDL.

process.env.PGDATABASE = "sateer_test";
process.env.PGHOST = process.env.PGHOST || "localhost";
process.env.PGPORT = process.env.PGPORT || "5432";
process.env.PGUSER = process.env.PGUSER || process.env.USER;

const fs = require("node:fs");
const path = require("node:path");
const { obtenirClientDatabase, fermerDatabase } = require("../database");

const EXPECTED_DATABASE = "sateer_test";
const OUT = path.join(process.cwd(), "AUDIT");
const GLOBAL = new Set([
    "tenants", "countries", "territories", "capabilities", "permissions",
    "metric_definitions", "language_configurations"
]);
const SENSITIVE = /(email|mail|telephone|phone|adresse|address|nom|prenom|name|message|contenu|content|document|fichier|file|token|secret|password|mot_de_passe|identifiant|identity|passeport|passport|piece|numero|number|date_naissance|birth)/i;

function scopeOf(table, columns, inherited) {
    const names = new Set(columns.map(c => c.column_name));
    if (names.has("tenant_id") || names.has("tenant_code")) return ["DIRECT_TENANT", "tenant_id/tenant_code présent"];
    if (names.has("organisation_id") || names.has("organization_id") || names.has("org_id")) return ["DIRECT_ORGANISATION", "organisation_id présent"];
    if (inherited) return ["INDIRECT_ORGANISATION", "rattachée par clé étrangère à une table cloisonnée"];
    if (GLOBAL.has(table)) return ["GLOBAL_REFERENCE", "référentiel global candidat"];
    return ["UNSCOPED_REVIEW", "aucun rattachement tenant/organisation détecté"];
}

async function main() {
    const client = await obtenirClientDatabase();
    let report;
    try {
        await client.query("BEGIN TRANSACTION READ ONLY");
        const identity = (await client.query(
            "SELECT current_database() AS db, current_user AS usr, current_setting('transaction_read_only') AS ro"
        )).rows[0];

        if (identity.db !== EXPECTED_DATABASE) {
            throw new Error("Base refusée : " + identity.db + ". Seule sateer_test est autorisée.");
        }
        if (identity.ro !== "on") throw new Error("Transaction PostgreSQL non read-only.");

        const tables = (await client.query(
            "SELECT c.relname AS name, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced, GREATEST(c.reltuples,0)::bigint AS estimated_rows FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname"
        )).rows;

        const columns = (await client.query(
            "SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position"
        )).rows;

        const fks = (await client.query(
            "SELECT child.relname AS child, parent.relname AS parent, con.conname AS name, pg_get_constraintdef(con.oid) AS definition, array_agg(ca.attname ORDER BY ck.ordinality) AS child_columns, array_agg(pa.attname ORDER BY ck.ordinality) AS parent_columns FROM pg_constraint con JOIN pg_class child ON child.oid=con.conrelid JOIN pg_namespace cn ON cn.oid=child.relnamespace JOIN pg_class parent ON parent.oid=con.confrelid JOIN pg_namespace pn ON pn.oid=parent.relnamespace CROSS JOIN LATERAL unnest(con.conkey) WITH ORDINALITY ck(attnum,ordinality) JOIN LATERAL unnest(con.confkey) WITH ORDINALITY pk(attnum,ordinality) ON pk.ordinality=ck.ordinality JOIN pg_attribute ca ON ca.attrelid=child.oid AND ca.attnum=ck.attnum JOIN pg_attribute pa ON pa.attrelid=parent.oid AND pa.attnum=pk.attnum WHERE con.contype='f' AND cn.nspname='public' AND pn.nspname='public' GROUP BY child.relname,parent.relname,con.conname,con.oid ORDER BY child.relname,con.conname"
        )).rows;

        const policies = (await client.query(
            "SELECT tablename, policyname, permissive, roles, cmd, qual, with_check FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname"
        )).rows;

        const indexes = (await client.query(
            "SELECT t.relname AS table_name, i.relname AS index_name, ix.indisunique AS is_unique, ix.indisprimary AS is_primary, pg_get_indexdef(ix.indexrelid) AS definition FROM pg_index ix JOIN pg_class t ON t.oid=ix.indrelid JOIN pg_class i ON i.oid=ix.indexrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' ORDER BY t.relname,i.relname"
        )).rows;

        const byTable = new Map();
        for (const col of columns) {
            if (!byTable.has(col.table_name)) byTable.set(col.table_name, []);
            byTable.get(col.table_name).push(col);
        }
        const direct = new Set();
        for (const [name, cols] of byTable) {
            if (cols.some(c => ["tenant_id","tenant_code","organisation_id","organization_id","org_id"].includes(c.column_name))) direct.add(name);
        }
        const scoped = new Set(direct);
        let changed = true;
        while (changed) {
            changed = false;
            for (const fk of fks) {
                if (scoped.has(fk.parent) && !scoped.has(fk.child)) {
                    scoped.add(fk.child);
                    changed = true;
                }
            }
        }

        const policyCount = new Map();
        for (const p of policies) policyCount.set(p.tablename, (policyCount.get(p.tablename) || 0) + 1);

        const inventory = tables.map(t => {
            const cols = byTable.get(t.name) || [];
            const [scope, reason] = scopeOf(t.name, cols, scoped.has(t.name) && !direct.has(t.name));
            const sensitive = cols.filter(c => SENSITIVE.test(c.column_name)).map(c => c.column_name);
            const review = scope === "UNSCOPED_REVIEW";
            return {
                table: t.name,
                estimated_rows: Number(t.estimated_rows),
                scope,
                reason,
                scope_columns: cols.filter(c => ["tenant_id","tenant_code","organisation_id","organization_id","org_id"].includes(c.column_name)).map(c => c.column_name),
                sensitive_columns: sensitive,
                foreign_keys: fks.filter(f => f.child === t.name).map(f => ({
                    parent: f.parent, columns: f.child_columns, references: f.parent_columns, constraint: f.name
                })),
                rls_enabled: t.rls,
                rls_forced: t.forced,
                rls_policies: policyCount.get(t.name) || 0,
                review_required: review
            };
        });

        const summary = {
            tables: inventory.length,
            direct_scope: inventory.filter(t => t.scope === "DIRECT_TENANT" || t.scope === "DIRECT_ORGANISATION").length,
            indirect_scope: inventory.filter(t => t.scope === "INDIRECT_ORGANISATION").length,
            global_reference_candidates: inventory.filter(t => t.scope === "GLOBAL_REFERENCE").length,
            unscoped_review: inventory.filter(t => t.scope === "UNSCOPED_REVIEW").length,
            unscoped_with_sensitive_columns: inventory.filter(t => t.review_required && t.sensitive_columns.length).length,
            rls_enabled: inventory.filter(t => t.rls_enabled).length,
            rls_forced: inventory.filter(t => t.rls_forced).length,
            rls_policies: policies.length,
            foreign_keys: fks.length
        };

        report = {
            generated_at: new Date().toISOString(),
            database: identity.db,
            database_user: identity.usr,
            read_only: identity.ro === "on",
            summary,
            tables: inventory,
            foreign_keys: fks,
            policies,
            indexes
        };
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
    } finally {
        client.release();
    }

    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, "multitenant-schema-audit-latest.json"), JSON.stringify(report, null, 2) + "\n");

    const md = [
        "# SATEER — Audit automatique du schéma multi-tenant",
        "",
        "- Date : " + report.generated_at,
        "- Base : " + report.database,
        "- Transaction en lecture seule : oui",
        "- Données métier consultées : aucune",
        "",
        "## Synthèse",
        "",
        "| Indicateur | Nombre |",
        "|---|---:|",
        "| Tables | " + report.summary.tables + " |",
        "| Portée tenant/organisation directe | " + report.summary.direct_scope + " |",
        "| Portée héritée par clé étrangère | " + report.summary.indirect_scope + " |",
        "| Référentiels globaux candidats | " + report.summary.global_reference_candidates + " |",
        "| Tables sans rattachement détecté à examiner | " + report.summary.unscoped_review + " |",
        "| Tables non rattachées avec colonnes sensibles | " + report.summary.unscoped_with_sensitive_columns + " |",
        "| Tables avec RLS | " + report.summary.rls_enabled + " |",
        "| Politiques RLS | " + report.summary.rls_policies + " |",
        "| Clés étrangères | " + report.summary.foreign_keys + " |",
        "",
        "> L'absence de RLS n'est pas automatiquement une vulnérabilité : l'application peut contrôler les accès. Elle signifie néanmoins que PostgreSQL n'ajoute pas cette défense en profondeur.",
        "> Le rattachement par clé étrangère est un indice structurel, pas une preuve que toutes les routes HTTP appliquent correctement le cloisonnement.",
        "",
        "## Inventaire des tables",
        "",
        "| Table | Portée détectée | Colonnes de portée | Colonnes sensibles | RLS | Revue |",
        "|---|---|---|---|---|---|"
    ];

    for (const t of report.tables) {
        md.push("| " + t.table + " | " + t.scope + " | " + (t.scope_columns.join(", ") || "—")
            + " | " + (t.sensitive_columns.join(", ") || "—") + " | " + (t.rls_enabled ? "oui" : "non")
            + " | " + (t.review_required ? "OUI" : "non") + " |");
    }

    md.push("", "## Relations par clés étrangères", "");
    for (const fk of report.foreign_keys) md.push("- " + fk.child + " (" + fk.child_columns.join(", ") + ") → " + fk.parent + " (" + fk.parent_columns.join(", ") + ")");

    md.push("", "## Tables à examiner", "");
    const review = report.tables.filter(t => t.review_required);
    if (!review.length) md.push("Aucune table non rattachée détectée automatiquement ; une validation métier reste requise.");
    for (const t of review) md.push("- " + t.table + " : " + t.reason + ". Colonnes potentiellement sensibles : " + (t.sensitive_columns.join(", ") || "aucune détectée") + ".");

    md.push(
        "",
        "## Limites",
        "",
        "- Les estimations de lignes sont issues des statistiques PostgreSQL et ne sont pas des comptages exacts.",
        "- Les référentiels globaux sont des candidats déclarés dans le script ; leur portée doit être confirmée.",
        "- Les vues, fonctions SECURITY DEFINER, triggers, requêtes applicatives et chemins d'accès indirects nécessitent un audit complémentaire.",
        "- Ce rapport n'affirme pas qu'une table est sûre sur la seule base de ses clés étrangères.",
        ""
    );
    fs.writeFileSync(path.join(OUT, "multitenant-schema-audit-latest.md"), md.join("\n"));

    console.log("AUDIT TERMINE — PostgreSQL en lecture seule.");
    console.log(JSON.stringify(report.summary, null, 2));
    console.log("Rapports : AUDIT/multitenant-schema-audit-latest.md et .json");
}

main()
    .catch(error => {
        console.error("ECHEC AUDIT MULTI-TENANT :", error.stack || error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await fermerDatabase();
    });
