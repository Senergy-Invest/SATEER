"use strict";

// Read-only multi-tenant integrity preflight.
// Only metadata and aggregate anomaly counts are read; no business rows are exported.
process.env.PGDATABASE = "sateer_test";
process.env.PGHOST = process.env.PGHOST || "localhost";
process.env.PGPORT = process.env.PGPORT || "5432";
process.env.PGUSER = process.env.PGUSER || process.env.USER;

const fs = require("node:fs");
const path = require("node:path");
const { obtenirClientDatabase, fermerDatabase } = require("../database");

const EXPECTED_DB = "sateer_test";
const OUT = path.join(process.cwd(), "AUDIT");
const GLOBAL_IDENTITY = new Set(["personnes", "auth_accounts", "auth_sessions"]);
const TENANT_REGISTRY = new Set(["tenants"]);
const GLOBAL_CATALOG = new Set(["countries", "territories", "capabilities", "permissions", "metric_definitions", "experiences"]);
const SENSITIVE = /(email|mail|telephone|phone|adresse|address|nom|prenom|name|message|contenu|content|document|fichier|file|token|jeton|empreinte|hash|secret|password|mot_de_passe|identifiant|identity|passeport|passport|piece|numero|number|date_naissance|birth)/i;

const quote = value => '"' + String(value).replace(/"/g, '""') + '"';
const same = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);

function hasFk(fks, child, childCols, parent, parentCols) {
    return fks.some(fk => fk.child === child && fk.parent === parent &&
        same(fk.child_columns, childCols) && same(fk.parent_columns, parentCols));
}
function hasUnique(constraints, indexes, table, cols) {
    return constraints.some(item => item.table_name === table &&
        ["p", "u"].includes(item.type) && same(item.columns, cols)) ||
        indexes.some(item => item.table_name === table && item.is_unique && same(item.columns, cols));
}

async function main() {
    const client = await obtenirClientDatabase();
    let report;
    try {
        await client.query("BEGIN TRANSACTION READ ONLY");
        const identity = (await client.query(
            "SELECT current_database() AS db, current_user AS usr, current_setting('transaction_read_only') AS ro"
        )).rows[0];
        if (identity.db !== EXPECTED_DB) throw new Error("Base refusée : seule sateer_test est autorisée.");
        if (identity.ro !== "on") throw new Error("La transaction PostgreSQL n'est pas en lecture seule.");

        const tables = (await client.query(
            "SELECT c.relname AS name, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced, " +
            "GREATEST(c.reltuples,0)::bigint AS estimated_rows FROM pg_class c " +
            "JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' " +
            "AND c.relkind IN ('r','p') ORDER BY c.relname"
        )).rows;
        const columns = (await client.query(
            "SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default,ordinal_position " +
            "FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position"
        )).rows;
        const constraints = (await client.query(
            "SELECT r.relname AS table_name,c.conname AS name,c.contype AS type,c.convalidated AS validated," +
            "pg_get_constraintdef(c.oid,true) AS definition," +
            "ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(attnum,ord) " +
            "JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum ORDER BY k.ord) AS columns " +
            "FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid " +
            "JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public' ORDER BY r.relname,c.conname"
        )).rows;
        const fks = (await client.query(
            "SELECT ch.relname AS child,pa.relname AS parent,c.conname AS name,c.convalidated AS validated," +
            "pg_get_constraintdef(c.oid,true) AS definition," +
            "ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(attnum,ord) " +
            "JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum ORDER BY k.ord) AS child_columns," +
            "ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(attnum,ord) " +
            "JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.attnum ORDER BY k.ord) AS parent_columns " +
            "FROM pg_constraint c JOIN pg_class ch ON ch.oid=c.conrelid JOIN pg_namespace cn ON cn.oid=ch.relnamespace " +
            "JOIN pg_class pa ON pa.oid=c.confrelid JOIN pg_namespace pn ON pn.oid=pa.relnamespace " +
            "WHERE c.contype='f' AND cn.nspname='public' AND pn.nspname='public' ORDER BY ch.relname,c.conname"
        )).rows;
        const indexes = (await client.query(
            "SELECT t.relname AS table_name,i.relname AS index_name,x.indisunique AS is_unique," +
            "x.indisprimary AS is_primary,pg_get_indexdef(x.indexrelid) AS definition," +
            "ARRAY(SELECT a.attname::text FROM unnest(x.indkey) WITH ORDINALITY k(attnum,ord) " +
            "JOIN pg_attribute a ON a.attrelid=x.indrelid AND a.attnum=k.attnum " +
            "WHERE k.ord<=x.indnkeyatts ORDER BY k.ord) AS columns " +
            "FROM pg_index x JOIN pg_class t ON t.oid=x.indrelid JOIN pg_class i ON i.oid=x.indexrelid " +
            "JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' ORDER BY t.relname,i.relname"
        )).rows;
        const policies = (await client.query(
            "SELECT tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies " +
            "WHERE schemaname='public' ORDER BY tablename,policyname"
        )).rows;
        const triggers = (await client.query(
            "SELECT c.relname AS table_name,t.tgname AS trigger_name,pg_get_triggerdef(t.oid,true) AS definition " +
            "FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace " +
            "WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname"
        )).rows;

        const byTable = new Map();
        for (const column of columns) {
            if (!byTable.has(column.table_name)) byTable.set(column.table_name, []);
            byTable.get(column.table_name).push(column);
        }
        const tableNames = new Set(tables.map(table => table.name));
        const roots = new Set();
        for (const [name, cols] of byTable) {
            if (cols.some(c => ["tenant_id","tenant_code","organisation_id","organization_id","org_id"].includes(c.column_name))) roots.add(name);
        }
        const reachable = new Set(roots);
        let changed = true;
        while (changed) {
            changed = false;
            for (const fk of fks) if (reachable.has(fk.parent) && !reachable.has(fk.child)) {
                reachable.add(fk.child);
                changed = true;
            }
        }
        const policyCounts = new Map();
        for (const policy of policies) policyCounts.set(policy.tablename,(policyCounts.get(policy.tablename)||0)+1);

        const inventory = tables.map(table => {
            const cols = byTable.get(table.name) || [];
            const names = new Set(cols.map(c => c.column_name));
            let scope, reason;
            if (GLOBAL_IDENTITY.has(table.name)) {
                scope = "GLOBAL_IDENTITY"; reason = "identité/authentification canonique";
            } else if (TENANT_REGISTRY.has(table.name)) {
                scope = "TENANT_REGISTRY"; reason = "registre central des espaces tenant";
            } else if (GLOBAL_CATALOG.has(table.name)) {
                scope = "GLOBAL_CATALOG"; reason = "référentiel partagé explicite";
            } else if (names.has("tenant_id") || names.has("tenant_code")) {
                scope = "DIRECT_TENANT"; reason = "colonne tenant présente";
            } else if (names.has("organisation_id") || names.has("organization_id") || names.has("org_id")) {
                scope = "DIRECT_ORGANISATION"; reason = "colonne organisation présente";
            } else if (reachable.has(table.name)) {
                scope = "INHERITED_REFERENCE"; reason = "rattachement indirect par clé étrangère";
            } else {
                scope = "UNCLASSIFIED_REVIEW"; reason = "aucun rattachement ou type global déclaré";
            }
            return {
                table: table.name, estimated_rows: Number(table.estimated_rows), scope, reason,
                scope_columns: cols.filter(c => ["tenant_id","tenant_code","organisation_id","organization_id","org_id"].includes(c.column_name))
                    .map(c => ({name:c.column_name,nullable:c.is_nullable==="YES"})),
                sensitive_columns: cols.filter(c => SENSITIVE.test(c.column_name)).map(c => c.column_name),
                foreign_keys: fks.filter(fk => fk.child===table.name).map(fk => ({
                    parent:fk.parent,columns:fk.child_columns,references:fk.parent_columns,validated:fk.validated,name:fk.name
                })),
                rls_enabled:table.rls,rls_forced:table.forced,rls_policies:policyCounts.get(table.name)||0,
                review_required:scope==="UNCLASSIFIED_REVIEW"
            };
        });

        const structural = [];
        const addStructural = (key,severity,table,description,recommendation) =>
            structural.push({key,severity,table,description,recommendation});

        if (tableNames.has("organisations")) {
            const hasTenantColumn = (byTable.get("organisations")||[]).find(c=>c.column_name==="tenant_id");
            if (hasTenantColumn && hasTenantColumn.is_nullable==="YES") addStructural(
                "ORGANISATION_TENANT_NULLABLE","HIGH","organisations",
                "organisations.tenant_id accepte NULL.",
                "Après contrôle des données, décider du rattachement des éventuelles lignes orphelines puis envisager NOT NULL."
            );
        }
        if (tableNames.has("organisations") && tableNames.has("demandes") &&
            (!hasUnique(constraints,indexes,"organisations",["tenant_id","id"]) ||
             !hasFk(fks,"demandes",["tenant_id","organisation_id"],"organisations",["tenant_id","id"]))) addStructural(
            "DEMANDE_TENANT_ORGANISATION_COMPOSITE_FK","HIGH","demandes",
            "La cohérence entre demandes.tenant_id et le tenant de son organisation n'est pas garantie par une FK composite.",
            "Après préflight, ajouter la clé unique (tenant_id,id) côté organisations et la FK composite côté demandes."
        );
        if (tableNames.has("organisation_units") &&
            !hasFk(fks,"organisation_units",["organisation_id","parent_unit_id"],"organisation_units",["organisation_id","id"])) addStructural(
            "UNIT_PARENT_SAME_ORGANISATION","HIGH","organisation_units",
            "La FK parent_unit_id ne garantit pas que le parent appartient à la même organisation.",
            "Après préflight, ajouter une clé unique (organisation_id,id) et une FK composite (organisation_id,parent_unit_id)."
        );
        if (tableNames.has("demandes") &&
            !hasFk(fks,"demandes",["organisation_id","destination_unit_id"],"organisation_units",["organisation_id","id"])) addStructural(
            "DEMANDE_DESTINATION_SAME_ORGANISATION","HIGH","demandes",
            "La FK destination_unit_id ne garantit pas que l'unité cible appartient à l'organisation du dossier.",
            "Après préflight, ajouter une FK composite vers organisation_units (organisation_id,id)."
        );
        if (tableNames.has("relations_personne_organisation_unit") &&
            !triggers.some(t=>t.table_name==="relations_personne_organisation_unit" && /organisation|membership|affectation/i.test(t.definition+" "+t.trigger_name))) addStructural(
            "UNIT_MEMBERSHIP_ORGANISATION_GUARD","REVIEW","relations_personne_organisation_unit",
            "Aucun trigger SQL explicite ne vérifie l'appartenance de la personne à l'organisation propriétaire de l'unité.",
            "Vérifier le contrôle backend et envisager une garantie SQL avec organisation_id."
        );
        if (tableNames.has("demande_orientations") &&
            !triggers.some(t=>t.table_name==="demande_orientations" && /organisation|tenant|unit|demande/i.test(t.definition+" "+t.trigger_name))) addStructural(
            "DEMANDE_ORIENTATION_ORGANISATION_GUARD","REVIEW","demande_orientations",
            "Les dossiers et unités de l'historique d'orientation sont référencés séparément sans garde SQL explicite détectée.",
            "Contrôler les données puis ajouter une garantie composite ou un trigger adapté."
        );

        // A simple FK is covered when a matching composite FK also carries
        // tenant_id -> tenant_id. This avoids reporting legacy FKs as gaps
        // after the composite guard has been added.
        const isCoveredByTenantComposite = fk => fks.some(candidate => {
            if (candidate === fk || candidate.child !== fk.child || candidate.parent !== fk.parent) return false;
            const tenantChildIndex = candidate.child_columns.indexOf("tenant_id");
            const tenantParentIndex = candidate.parent_columns.indexOf("tenant_id");
            if (tenantChildIndex < 0 || tenantParentIndex < 0 || tenantChildIndex !== tenantParentIndex) return false;
            return fk.child_columns.every((column, index) => {
                const position = candidate.child_columns.indexOf(column);
                return position >= 0 && candidate.parent_columns[position] === fk.parent_columns[index];
            });
        });

        // These exact edges are intentionally allowed to reference another
        // tenant (or a global report template). Other gaps remain HIGH.
        const intentionalCrossTenantOrGlobalFks = new Set([
            "fk_lead_partner_org",
            "fk_introduction_partner",
            "fk_org_invitation_acceptee",
            "fk_org_join_cible",
            "fk_org_relationship_target",
            "fk_partner_agreement_partner",
            "fk_report_run_template"
        ]);

        const tenantFkGaps = fks.filter(fk => {
            const childNames = new Set((byTable.get(fk.child) || []).map(c => c.column_name));
            const parentNames = new Set((byTable.get(fk.parent) || []).map(c => c.column_name));
            if (!childNames.has("tenant_id") || !parentNames.has("tenant_id")) return false;
            const childIndex = fk.child_columns.indexOf("tenant_id");
            const parentIndex = fk.parent_columns.indexOf("tenant_id");
            if (childIndex >= 0 && childIndex === parentIndex) return false;
            return !isCoveredByTenantComposite(fk);
        });

        const tenantGapsByChild = new Map();
        for (const fk of tenantFkGaps) {
            if (!tenantGapsByChild.has(fk.child)) tenantGapsByChild.set(fk.child, []);
            tenantGapsByChild.get(fk.child).push(fk);
        }
        for (const [child, gaps] of tenantGapsByChild) {
            const intentional = gaps.filter(fk => intentionalCrossTenantOrGlobalFks.has(fk.name));
            const unresolved = gaps.filter(fk => !intentionalCrossTenantOrGlobalFks.has(fk.name));

            if (unresolved.length) {
                addStructural(
                    "TENANT_SCOPED_FK_GAPS:" + child, "HIGH", child,
                    "Références tenant-scoped sans garde composite tenant_id → tenant_id : " + unresolved.map(fk => fk.name).join(", ") + ".",
                    "Ajouter une FK composite tenant_id + identifiant parent, après contrôle des données."
                );
            }
            if (intentional.length) {
                addStructural(
                    "INTENTIONAL_EXTERNAL_REFERENCES:" + child, "REVIEW", child,
                    "Références globales ou inter-tenant explicitement autorisées : " + intentional.map(fk => fk.name).join(", ") + ".",
                    "Conserver uniquement les liens externes documentés. Les contrôles métier doivent vérifier l'invitation, le partenariat, le consentement ou le statut global du modèle avant tout accès."
                );
            }
        }

        const checks = [], dataFindings = [];
        async function countCheck(key,severity,description,sql,required) {
            if (required.some(name=>!tableNames.has(name))) {
                checks.push({key,severity,description,status:"SKIPPED_SCHEMA",count:null}); return;
            }
            const result = await client.query(sql);
            const count = Number(result.rows[0].count);
            const item = {key,severity,description,status:count===0?"PASS":"REVIEW",count};
            checks.push(item);
            if (count>0) dataFindings.push(item);
        }

        if (tableNames.has("organisations") && (byTable.get("organisations")||[]).some(c=>c.column_name==="tenant_id")) {
            await countCheck("ORGANISATIONS_WITHOUT_TENANT","HIGH","Organisations sans tenant_id.",
                "SELECT COUNT(*)::bigint AS count FROM organisations WHERE tenant_id IS NULL",["organisations"]);
        }

        // All current and future tables with both columns are checked automatically.
        for (const [name,cols] of byTable) {
            const names = new Set(cols.map(c=>c.column_name));
            if (name==="organisations" || !names.has("tenant_id") || !names.has("organisation_id")) continue;
            const table = quote(name);
            await countCheck("TENANT_ORGANISATION_MISMATCH:"+name,"HIGH",
                name+" : tenant différent de celui de l'organisation.",
                "SELECT COUNT(*)::bigint AS count FROM "+table+" child JOIN organisations org ON org.id=child.organisation_id "+
                "WHERE child.tenant_id IS NOT NULL AND child.tenant_id IS DISTINCT FROM org.tenant_id",[name,"organisations"]);
            await countCheck("ORGANISATION_WITHOUT_TENANT:"+name,"HIGH",
                name+" : organisation renseignée mais tenant_id NULL.",
                "SELECT COUNT(*)::bigint AS count FROM "+table+" WHERE organisation_id IS NOT NULL AND tenant_id IS NULL",[name]);
        }

        // Verify actual tenant mismatches for every FK gap. Only aggregate counts are returned.
        for (const fk of tenantFkGaps) {
            const join = fk.child_columns.map((column, index) =>
                "c." + quote(column) + " = p." + quote(fk.parent_columns[index])
            ).join(" AND ");
            const severity = intentionalCrossTenantOrGlobalFks.has(fk.name) ? "REVIEW" : "HIGH";
            await countCheck(
                "TENANT_FK_MISMATCH:" + fk.child + ":" + fk.name, severity,
                fk.child + "." + fk.name + " : référence vers une ligne d'un autre tenant.",
                "SELECT COUNT(*)::bigint AS count FROM " + quote(fk.child) + " c JOIN " + quote(fk.parent) + " p ON " + join +
                " WHERE c.tenant_id IS DISTINCT FROM p.tenant_id",
                [fk.child, fk.parent]
            );
        }

        await countCheck("UNIT_PARENT_CROSS_ORGANISATION","CRITICAL","Unités dont le parent appartient à une autre organisation.",
            "SELECT COUNT(*)::bigint AS count FROM organisation_units c JOIN organisation_units p ON p.id=c.parent_unit_id "+
            "WHERE c.organisation_id IS DISTINCT FROM p.organisation_id",["organisation_units"]);
        await countCheck("DEMANDE_DESTINATION_CROSS_ORGANISATION","CRITICAL","Demandes orientées vers une unité d'une autre organisation.",
            "SELECT COUNT(*)::bigint AS count FROM demandes d JOIN organisation_units u ON u.id=d.destination_unit_id "+
            "WHERE d.organisation_id IS DISTINCT FROM u.organisation_id",["demandes","organisation_units"]);
        await countCheck("DEMANDE_ORIENTATION_CROSS_ORGANISATION","CRITICAL","Historique d'orientation incohérent avec l'organisation du dossier.",
            "SELECT COUNT(*)::bigint AS count FROM demande_orientations h JOIN demandes d ON d.id=h.demande_id "+
            "LEFT JOIN organisation_units old_u ON old_u.id=h.ancienne_unit_id "+
            "LEFT JOIN organisation_units new_u ON new_u.id=h.nouvelle_unit_id "+
            "WHERE (old_u.id IS NOT NULL AND old_u.organisation_id IS DISTINCT FROM d.organisation_id) "+
            "OR (new_u.id IS NOT NULL AND new_u.organisation_id IS DISTINCT FROM d.organisation_id)",
            ["demande_orientations","demandes","organisation_units"]);
        await countCheck("UNIT_MEMBERSHIP_WITHOUT_ORGANISATION_MEMBERSHIP","HIGH","Affectations actives à une unité sans appartenance personne-organisation.",
            "SELECT COUNT(*)::bigint AS count FROM relations_personne_organisation_unit m "+
            "JOIN organisation_units u ON u.id=m.organisation_unit_id WHERE m.actif=TRUE AND NOT EXISTS "+
            "(SELECT 1 FROM relations_personne_organisation r WHERE r.personne_id=m.personne_id AND r.organisation_id=u.organisation_id)",
            ["relations_personne_organisation_unit","organisation_units","relations_personne_organisation"]);
        await countCheck("UNIT_MEMBERSHIP_ROLE_CROSS_ORGANISATION","HIGH","Rôle d'unité appartenant à une autre organisation.",
            "SELECT COUNT(*)::bigint AS count FROM relations_personne_organisation_unit m "+
            "JOIN organisation_units u ON u.id=m.organisation_unit_id JOIN organisation_roles r ON r.id=m.role_id "+
            "WHERE m.role_id IS NOT NULL AND r.organisation_id IS DISTINCT FROM u.organisation_id",
            ["relations_personne_organisation_unit","organisation_units","organisation_roles"]);
        await countCheck("ORGANISATION_ROLE_WITHOUT_MEMBERSHIP","HIGH","Rôle organisationnel actif sans appartenance personne-organisation.",
            "SELECT COUNT(*)::bigint AS count FROM relations_personne_organisation_roles a WHERE a.actif=TRUE AND NOT EXISTS "+
            "(SELECT 1 FROM relations_personne_organisation r WHERE r.personne_id=a.personne_id AND r.organisation_id=a.organisation_id)",
            ["relations_personne_organisation_roles","relations_personne_organisation"]);
        await countCheck("ORGANISATION_RELATION_TARGET_CROSS_TENANT_REVIEW","REVIEW","Relations dont l'organisation cible appartient à un autre tenant (lien externe volontaire à autoriser).",
            "SELECT COUNT(*)::bigint AS count FROM organisation_relationships r "+
            "JOIN organisations t ON t.id=r.target_organisation_id "+
            "WHERE r.tenant_id IS DISTINCT FROM t.tenant_id",
            ["organisation_relationships","organisations"]);
        await countCheck("PARTNER_AGREEMENT_PARTNER_CROSS_TENANT_REVIEW","REVIEW","Accords avec un partenaire situé dans un autre tenant.",
            "SELECT COUNT(*)::bigint AS count FROM partner_agreements a "+
            "JOIN organisations p ON p.id=a.partner_organisation_id "+
            "WHERE a.tenant_id IS DISTINCT FROM p.tenant_id",
            ["partner_agreements","organisations"]);
        await countCheck("LEAD_PARTNER_CROSS_TENANT_REVIEW","REVIEW","Leads destinés à une organisation partenaire d'un autre tenant.",
            "SELECT COUNT(*)::bigint AS count FROM leads l "+
            "JOIN organisations p ON p.id=l.partner_organisation_id "+
            "WHERE l.partner_organisation_id IS NOT NULL AND l.tenant_id IS DISTINCT FROM p.tenant_id",
            ["leads","organisations"]);
        await countCheck("INTRODUCTION_PARTNER_CROSS_TENANT_REVIEW","REVIEW","Mises en relation vers un partenaire d'un autre tenant.",
            "SELECT COUNT(*)::bigint AS count FROM introductions i "+
            "JOIN organisations p ON p.id=i.partner_organisation_id "+
            "WHERE i.tenant_id IS DISTINCT FROM p.tenant_id",
            ["introductions","organisations"]);
        await countCheck("INVITATION_ACCEPTED_ORG_CROSS_TENANT_REVIEW","REVIEW","Organisations acceptant une invitation depuis un autre tenant.",
            "SELECT COUNT(*)::bigint AS count FROM organisation_invitations i "+
            "JOIN organisations accepted ON accepted.id=i.organisation_acceptee_id "+
            "WHERE i.organisation_acceptee_id IS NOT NULL AND i.tenant_id IS DISTINCT FROM accepted.tenant_id",
            ["organisation_invitations","organisations"]);
        await countCheck("JOIN_REQUEST_TARGET_CROSS_TENANT_REVIEW","REVIEW","Demandes de rattachement vers une organisation cible d'un autre tenant.",
            "SELECT COUNT(*)::bigint AS count FROM organisation_join_requests j "+
            "JOIN organisations target ON target.id=j.organisation_cible_id "+
            "WHERE j.tenant_id IS DISTINCT FROM target.tenant_id",
            ["organisation_join_requests","organisations"]);
        await countCheck("REPORT_RUN_TEMPLATE_TENANT_MISMATCH","HIGH","Un modèle de rapport tenant-scoped ne peut être utilisé que dans son tenant ; un modèle global reste autorisé.",
            "SELECT COUNT(*)::bigint AS count FROM report_runs r "+
            "JOIN report_templates t ON t.id=r.report_template_id "+
            "WHERE t.tenant_id IS NOT NULL AND t.tenant_id IS DISTINCT FROM r.tenant_id",
            ["report_runs","report_templates"]);

        const summary = {
            tables:inventory.length,
            direct_tenant:inventory.filter(t=>t.scope==="DIRECT_TENANT").length,
            direct_organisation:inventory.filter(t=>t.scope==="DIRECT_ORGANISATION").length,
            inherited_reference:inventory.filter(t=>t.scope==="INHERITED_REFERENCE").length,
            tenant_registry:inventory.filter(t=>t.scope==="TENANT_REGISTRY").length,
            global_identity:inventory.filter(t=>t.scope==="GLOBAL_IDENTITY").length,
            global_catalog:inventory.filter(t=>t.scope==="GLOBAL_CATALOG").length,
            unclassified_review:inventory.filter(t=>t.scope==="UNCLASSIFIED_REVIEW").length,
            sensitive_columns:inventory.reduce((sum,t)=>sum+t.sensitive_columns.length,0),
            foreign_keys:fks.length,constraints:constraints.length,indexes:indexes.length,
            rls_enabled_tables:inventory.filter(t=>t.rls_enabled).length,
            rls_forced_tables:inventory.filter(t=>t.rls_forced).length,
            rls_policies:policies.length,triggers:triggers.length,
            structural_findings:structural.length,
            high_structural_findings:structural.filter(item=>item.severity==="HIGH").length,
            tenant_scoped_fk_gaps:tenantFkGaps.length,
            intentional_cross_tenant_or_global_fk_edges:tenantFkGaps.filter(fk=>intentionalCrossTenantOrGlobalFks.has(fk.name)).length,
            unresolved_tenant_fk_gaps:tenantFkGaps.filter(fk=>!intentionalCrossTenantOrGlobalFks.has(fk.name)).length,
            data_checks:checks.length,
            data_anomalies:dataFindings.length,
            critical_data_anomalies:dataFindings.filter(x=>x.severity==="CRITICAL").length,
            high_data_anomalies:dataFindings.filter(x=>x.severity==="HIGH").length
        };
        report = {
            generated_at:new Date().toISOString(),database:identity.db,database_user:identity.usr,
            read_only:identity.ro==="on",
            data_policy:"Métadonnées et comptages agrégés uniquement ; aucune ligne métier ni donnée personnelle exportée.",
            summary,tables:inventory,structural_findings:structural,data_checks:checks,data_findings:dataFindings,
            constraints,foreign_keys:fks,indexes,triggers,policies
        };
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK").catch(()=>{});
        throw error;
    } finally {
        client.release();
    }

    fs.mkdirSync(OUT,{recursive:true});
    fs.writeFileSync(path.join(OUT,"multitenant-integrity-preflight-latest.json"),JSON.stringify(report,null,2)+"\n");
    const md = [
        "# SATEER — Audit d'intégrité multi-tenant (préflight)","",
        "- Généré : "+report.generated_at,
        "- Base : "+report.database,
        "- Transaction : lecture seule",
        "- Données métier exportées : aucune",
        "- Périmètre : métadonnées PostgreSQL et comptages agrégés","",
        "## Synthèse","","| Indicateur | Valeur |","|---|---:|",
        ...Object.entries(report.summary).map(x=>"| "+x[0]+" | "+x[1]+" |"),
        "","## Classification des tables","","| Table | Portée | Colonnes de portée | Colonnes sensibles | RLS | Revue |",
        "|---|---|---|---|---|---|"
    ];
    for (const t of report.tables) md.push("| "+t.table+" | "+t.scope+" | "+
        (t.scope_columns.map(c=>c.name+(c.nullable?" (nullable)":"")).join(", ")||"—")+" | "+
        (t.sensitive_columns.join(", ")||"—")+" | "+(t.rls_enabled?"oui":"non")+" | "+
        (t.review_required?"OUI":"non")+" |");
    md.push("","## Écarts structurels à traiter","");
    if (!report.structural_findings.length) md.push("Aucun écart structurel détecté par les règles actuelles.");
    for (const f of report.structural_findings) md.push(
        "### ["+f.severity+"] "+f.key,"","- Table : "+f.table,
        "- Constat : "+f.description,"- Recommandation : "+f.recommendation,"");
    md.push("","## Préflight des données (comptages uniquement)","","| Contrôle | Sévérité | Résultat | Nombre |","|---|---|---|---:|");
    for (const c of report.data_checks) md.push("| "+c.key+" | "+c.severity+" | "+c.status+" | "+(c.count===null?"—":c.count)+" |");
    md.push("","## Interprétation","");
    md.push("- GLOBAL_IDENTITY : identité et authentification canoniques, non dupliquées par institution.");
    md.push("- TENANT_REGISTRY : registre central qui définit les espaces tenant ; il ne doit pas être confondu avec les données d’un tenant.");
    md.push("- GLOBAL_CATALOG : référentiels partagés ; leur portée reste un choix métier explicite.");
    md.push("- DIRECT_TENANT / DIRECT_ORGANISATION : rattachement structurel, sans preuve d'autorisation.");
    md.push("- INHERITED_REFERENCE : chemin de FK vers une table rattachée ; cela ne prouve pas l'isolation des requêtes.");
    md.push("- UNCLASSIFIED_REVIEW : classification humaine nécessaire.");
    md.push("- Un comptage supérieur à zéro indique un écart à analyser ; aucune correction n'est appliquée.");
    md.push("- Les relations inter-tenant sont signalées pour revue métier, pas déclarées invalides automatiquement.");
    md.push("- RLS absent signifie qu'aucune défense PostgreSQL supplémentaire n'est active ; cela ne prouve pas à lui seul une fuite.");
    md.push("","## Limites","");
    md.push("- Les contrôles portent sur le schéma réellement présent dans sateer_test.");
    md.push("- Les règles structurelles sont des préconisations, pas des migrations exécutées.");
    md.push("- Les routes HTTP, autorisations métier et connecteurs externes doivent également être testés.");
    md.push("- Aucune contrainte SQL n'est ajoutée automatiquement : un préflight sans anomalie est requis.");
    md.push("");
    fs.writeFileSync(path.join(OUT,"multitenant-integrity-preflight-latest.md"),md.join("\n"));
    console.log("PREFLIGHT MULTI-TENANT TERMINÉ — PostgreSQL en lecture seule.");
    console.log(JSON.stringify(report.summary,null,2));
    console.log("Rapports : AUDIT/multitenant-integrity-preflight-latest.md et .json");
    if (process.env.SATEER_AUDIT_STRICT==="1" &&
        (report.summary.critical_data_anomalies>0
            || report.summary.high_data_anomalies>0
            || report.summary.high_structural_findings>0
            || report.summary.unresolved_tenant_fk_gaps>0)) {
        throw new Error("Mode strict : anomalies de données ou écarts structurels tenant non résolus.");
    }
}

main().catch(error=>{
    console.error("ÉCHEC PREFLIGHT MULTI-TENANT :",error.stack||error.message);
    process.exitCode=1;
}).finally(async()=>{await fermerDatabase();});
