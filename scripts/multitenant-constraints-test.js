"use strict";

// Tests de contraintes SQL multi-tenant.
// Toutes les écritures sont transactionnelles et annulées à la fin.
// Le script refuse toute base autre que sateer_test.
process.env.PGDATABASE = "sateer_test";
process.env.PGHOST = process.env.PGHOST || "localhost";
process.env.PGPORT = process.env.PGPORT || "5432";
process.env.PGUSER = process.env.PGUSER || process.env.USER;

const { randomBytes } = require("node:crypto");
const { obtenirClientDatabase, fermerDatabase } = require("../database");

const RUN = randomBytes(5).toString("hex").toUpperCase();
const A = "027_A_" + RUN;
const B = "027_B_" + RUN;

function check(condition, message) {
    if (!condition) throw new Error("ECHEC - " + message);
    console.log("PASS " + message);
}

async function mustReject(client, label, sql, params = []) {
    await client.query("SAVEPOINT sateer_027_expected_failure");
    let error = null;
    try {
        await client.query(sql, params);
    } catch (caught) {
        error = caught;
    }
    await client.query("ROLLBACK TO SAVEPOINT sateer_027_expected_failure");
    await client.query("RELEASE SAVEPOINT sateer_027_expected_failure");
    check(Boolean(error), label + (error ? " (" + error.code + ")" : ""));
}

async function main() {
    const client = await obtenirClientDatabase();
    let transaction = false;
    try {
        const identity = await client.query(
            "SELECT current_database() AS name, current_setting('transaction_read_only') AS read_only"
        );
        check(identity.rows[0].name === "sateer_test",
            "La cible PostgreSQL est exclusivement sateer_test");

        await client.query("BEGIN");
        transaction = true;

        const tenantA = Number((await client.query(
            "INSERT INTO tenants (code, nom, type) VALUES ($1, $2, 'MIGRATION_027_TEST') RETURNING id",
            [A, A]
        )).rows[0].id);
        const tenantB = Number((await client.query(
            "INSERT INTO tenants (code, nom, type) VALUES ($1, $2, 'MIGRATION_027_TEST') RETURNING id",
            [B, B]
        )).rows[0].id);

        const orgA = Number((await client.query(
            "INSERT INTO organisations (nom, type, tenant_id) VALUES ($1, 'TEST', $2) RETURNING id",
            ["Organisation A " + RUN, tenantA]
        )).rows[0].id);
        const orgB = Number((await client.query(
            "INSERT INTO organisations (nom, type, tenant_id) VALUES ($1, 'TEST', $2) RETURNING id",
            ["Organisation B " + RUN, tenantB]
        )).rows[0].id);

        const personA = Number((await client.query(
            "INSERT INTO personnes (prenom, nom, profil) VALUES ('Test', $1, 'TEST') RETURNING id",
            ["A_" + RUN]
        )).rows[0].id);
        const personB = Number((await client.query(
            "INSERT INTO personnes (prenom, nom, profil) VALUES ('Test', $1, 'TEST') RETURNING id",
            ["B_" + RUN]
        )).rows[0].id);

        await client.query(
            "INSERT INTO relations_personne_organisation (personne_id, organisation_id, type) VALUES ($1, $2, 'TEST'), ($3, $4, 'TEST')",
            [personA, orgA, personB, orgB]
        );

        const roleA = Number((await client.query(
            "INSERT INTO organisation_roles (organisation_id, code, nom, scope) VALUES ($1, $2, 'Role A', 'UNIT') RETURNING id",
            [orgA, "027_ROLE_A_" + RUN]
        )).rows[0].id);
        const roleB = Number((await client.query(
            "INSERT INTO organisation_roles (organisation_id, code, nom, scope) VALUES ($1, $2, 'Role B', 'UNIT') RETURNING id",
            [orgB, "027_ROLE_B_" + RUN]
        )).rows[0].id);

        const unitA = Number((await client.query(
            "INSERT INTO organisation_units (organisation_id, code, nom, type) VALUES ($1, $2, 'Unit A', 'TEST') RETURNING id",
            [orgA, "027_UNIT_A_" + RUN]
        )).rows[0].id);
        const childUnitA = Number((await client.query(
            "INSERT INTO organisation_units (organisation_id, parent_unit_id, code, nom, type) VALUES ($1, $2, $3, 'Child A', 'TEST') RETURNING id",
            [orgA, unitA, "027_CHILD_A_" + RUN]
        )).rows[0].id);
        const unitB = Number((await client.query(
            "INSERT INTO organisation_units (organisation_id, code, nom, type) VALUES ($1, $2, 'Unit B', 'TEST') RETURNING id",
            [orgB, "027_UNIT_B_" + RUN]
        )).rows[0].id);

        await client.query(
            "INSERT INTO relations_personne_organisation_unit (personne_id, organisation_unit_id, role_id, principal, actif) VALUES ($1, $2, $3, TRUE, TRUE)",
            [personA, unitA, roleA]
        );
        const membership = await client.query(
            "SELECT organisation_id FROM relations_personne_organisation_unit WHERE personne_id=$1 AND organisation_unit_id=$2",
            [personA, unitA]
        );
        check(Number(membership.rows[0].organisation_id) === orgA,
            "Le contexte organisationnel d'une affectation est rempli automatiquement");

        await mustReject(client,
            "Une personne ne peut pas être affectée à l'unité d'une autre organisation",
            "INSERT INTO relations_personne_organisation_unit (personne_id, organisation_unit_id, role_id, actif) VALUES ($1, $2, $3, TRUE)",
            [personA, unitB, roleB]
        );
        await mustReject(client,
            "Une affectation ne peut pas utiliser le rôle d'une autre organisation",
            "INSERT INTO relations_personne_organisation_unit (personne_id, organisation_unit_id, role_id, actif) VALUES ($1, $2, $3, TRUE)",
            [personA, unitA, roleB]
        );
        await mustReject(client,
            "Une unité ne peut pas avoir un parent appartenant à une autre organisation",
            "INSERT INTO organisation_units (organisation_id, parent_unit_id, code, nom, type) VALUES ($1, $2, $3, 'Invalid child', 'TEST')",
            [orgA, unitB, "027_INVALID_CHILD_" + RUN]
        );

        const demandA = Number((await client.query(
            "INSERT INTO demandes (tenant_id, organisation_id, personne_id, categorie, objet, description, destination_unit_id) VALUES ($1, $2, $3, 'TEST', $4, 'Test migration 027', $5) RETURNING id",
            [tenantA, orgA, personA, "Demande A " + RUN, unitA]
        )).rows[0].id);

        await mustReject(client,
            "Une demande ne peut pas appartenir au tenant A et à l'organisation du tenant B",
            "INSERT INTO demandes (tenant_id, organisation_id, personne_id, categorie, objet, description) VALUES ($1, $2, $3, 'TEST', $4, 'Invalid tenant/org')",
            [tenantA, orgB, personA, "Invalid demand " + RUN]
        );
        await mustReject(client,
            "Une demande ne peut pas être orientée vers une unité d'une autre organisation",
            "UPDATE demandes SET destination_unit_id=$1 WHERE id=$2",
            [unitB, demandA]
        );

        await client.query(
            "INSERT INTO demande_history (tenant_id, demande_id, action) VALUES ($1, $2, 'TEST_VALID')",
            [tenantA, demandA]
        );
        await mustReject(client,
            "L'historique d'une demande ne peut pas déclarer un autre tenant",
            "INSERT INTO demande_history (tenant_id, demande_id, action) VALUES ($1, $2, 'TEST_INVALID')",
            [tenantB, demandA]
        );

        await client.query(
            "INSERT INTO demande_reponses (tenant_id, demande_id, auteur_personne_id, contenu) VALUES ($1, $2, $3, 'Réponse de test')",
            [tenantA, demandA, personA]
        );
        await mustReject(client,
            "Une réponse ne peut pas être rattachée au tenant d'une autre demande",
            "INSERT INTO demande_reponses (tenant_id, demande_id, auteur_personne_id, contenu) VALUES ($1, $2, $3, 'Réponse invalide')",
            [tenantB, demandA, personB]
        );

        await client.query(
            "INSERT INTO demande_orientations (demande_id, nouvelle_unit_id, orientee_par, motif) VALUES ($1, $2, $3, 'Orientation valide')",
            [demandA, childUnitA, personA]
        );
        const orientation = await client.query(
            "SELECT tenant_id, organisation_id FROM demande_orientations WHERE demande_id=$1",
            [demandA]
        );
        check(Number(orientation.rows[0].tenant_id) === tenantA
            && Number(orientation.rows[0].organisation_id) === orgA,
            "Le contexte tenant/organisation de l'historique d'orientation est dérivé de la demande");
        await mustReject(client,
            "L'historique d'orientation refuse une unité d'une autre organisation",
            "INSERT INTO demande_orientations (demande_id, nouvelle_unit_id, orientee_par) VALUES ($1, $2, $3)",
            [demandA, unitB, personA]
        );

        const publicationA = Number((await client.query(
            "INSERT INTO publications (tenant_id, organisation_id, publie_par, titre, contenu, categorie) VALUES ($1, $2, $3, $4, 'Contenu A', 'TEST') RETURNING id",
            [tenantA, orgA, personA, "Publication A " + RUN]
        )).rows[0].id);
        const publicationB = Number((await client.query(
            "INSERT INTO publications (tenant_id, organisation_id, publie_par, titre, contenu, categorie) VALUES ($1, $2, $3, $4, 'Contenu B', 'TEST') RETURNING id",
            [tenantB, orgB, personB, "Publication B " + RUN]
        )).rows[0].id);

        await client.query(
            "INSERT INTO analytics_events (tenant_id, organisation_id, publication_id, event_type) VALUES ($1, $2, $3, 'VIEW')",
            [tenantA, orgA, publicationA]
        );
        await mustReject(client,
            "Un événement analytics ne peut pas référencer la publication d'une autre organisation",
            "INSERT INTO analytics_events (tenant_id, organisation_id, publication_id, event_type) VALUES ($1, $2, $3, 'VIEW')",
            [tenantA, orgA, publicationB]
        );

        const configA = Number((await client.query(
            "INSERT INTO ai_configurations (tenant_id, organisation_id, code, nom, use_case) VALUES ($1, $2, $3, 'Config A', 'TEST') RETURNING id",
            [tenantA, orgA, "027_AI_A_" + RUN]
        )).rows[0].id);
        const configB = Number((await client.query(
            "INSERT INTO ai_configurations (tenant_id, organisation_id, code, nom, use_case) VALUES ($1, $2, $3, 'Config B', 'TEST') RETURNING id",
            [tenantB, orgB, "027_AI_B_" + RUN]
        )).rows[0].id);
        await client.query(
            "INSERT INTO ai_conversations (tenant_id, organisation_id, ai_configuration_id) VALUES ($1, $2, $3)",
            [tenantA, orgA, configA]
        );
        await mustReject(client,
            "Une conversation IA ne peut pas utiliser la configuration d'un autre tenant",
            "INSERT INTO ai_conversations (tenant_id, organisation_id, ai_configuration_id) VALUES ($1, $2, $3)",
            [tenantA, orgA, configB]
        );

        const globalTemplate = Number((await client.query(
            "INSERT INTO report_templates (tenant_id, organisation_id, code, nom) VALUES (NULL, NULL, $1, 'Modèle global') RETURNING id",
            ["027_GLOBAL_" + RUN]
        )).rows[0].id);
        const tenantTemplateB = Number((await client.query(
            "INSERT INTO report_templates (tenant_id, organisation_id, code, nom) VALUES ($1, $2, $3, 'Modèle B') RETURNING id",
            [tenantB, orgB, "027_TEMPLATE_B_" + RUN]
        )).rows[0].id);
        await client.query(
            "INSERT INTO report_runs (tenant_id, report_template_id, organisation_source_id, titre) VALUES ($1, $2, $3, 'Rapport avec modèle global')",
            [tenantA, globalTemplate, orgA]
        );
        await mustReject(client,
            "Un modèle de rapport d'un autre tenant est refusé",
            "INSERT INTO report_runs (tenant_id, report_template_id, organisation_source_id, titre) VALUES ($1, $2, $3, 'Rapport invalide')",
            [tenantA, tenantTemplateB, orgA]
        );

        // Les liens externes sont intentionnels : ils restent possibles,
        // mais leur accès doit être autorisé par les règles métier.
        await client.query(
            "INSERT INTO organisation_relationships (tenant_id, source_organisation_id, target_organisation_id, type) VALUES ($1, $2, $3, 'TEST_EXTERNAL')",
            [tenantA, orgA, orgB]
        );
        const agreementA = Number((await client.query(
            "INSERT INTO partner_agreements (tenant_id, sateer_organisation_id, partner_organisation_id, code, type) VALUES ($1, $2, $3, $4, 'TEST') RETURNING id",
            [tenantA, orgA, orgB, "027_AGREEMENT_" + RUN]
        )).rows[0].id);
        const leadA = Number((await client.query(
            "INSERT INTO leads (tenant_id, personne_id, source_organisation_id, partner_organisation_id) VALUES ($1, $2, $3, $4) RETURNING id",
            [tenantA, personA, orgA, orgB]
        )).rows[0].id);
        await client.query(
            "INSERT INTO introductions (tenant_id, lead_id, sateer_organisation_id, partner_organisation_id) VALUES ($1, $2, $3, $4)",
            [tenantA, leadA, orgA, orgB]
        );
        await client.query(
            "INSERT INTO organisation_invitations (tenant_id, organisation_source_id, organisation_acceptee_id, email, type_relation, token) VALUES ($1, $2, $3, $4, 'TEST', $5)",
            [tenantA, orgA, orgB, "external-" + RUN + "@sateer.test", "027_TOKEN_" + RUN]
        );
        await client.query(
            "INSERT INTO organisation_join_requests (tenant_id, organisation_demandeuse_id, organisation_cible_id, type_relation) VALUES ($1, $2, $3, 'TEST')",
            [tenantA, orgA, orgB]
        );
        check(agreementA > 0,
            "Les accords et relations partenaires peuvent viser explicitement une organisation d'un autre tenant");
        check(true,
            "Les invitations, demandes de rattachement et mises en relation inter-tenant restent possibles");

        await mustReject(client,
            "Un accord ne peut pas déclarer une organisation SATEER d'un autre tenant",
            "INSERT INTO partner_agreements (tenant_id, sateer_organisation_id, partner_organisation_id, code, type) VALUES ($1, $2, $3, $4, 'TEST')",
            [tenantA, orgB, orgA, "027_INVALID_AGREEMENT_" + RUN]
        );
        await mustReject(client,
            "Une relation inter-organisationnelle ne peut pas déclarer une source d'un autre tenant",
            "INSERT INTO organisation_relationships (tenant_id, source_organisation_id, target_organisation_id, type) VALUES ($1, $2, $3, 'TEST_INVALID')",
            [tenantA, orgB, orgA]
        );

        console.log("\nSUCCES - contraintes composites, déclencheurs et liens externes vérifiés.");
    } finally {
        if (transaction) await client.query("ROLLBACK").catch(() => {});
        client.release();
        await fermerDatabase();
    }
}

main().catch(error => {
    console.error("\nECHEC - " + (error.stack || error.message));
    process.exitCode = 1;
});
