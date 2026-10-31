"use strict";

// Entry point for authenticated, organisation-scoped database operations.
// Tenant comes from an existing active organisation membership, never from HTTP input.
const {
    executerTransactionDatabase,
    executerRequete,
    definirTenantContexteDatabaseCourant
} = require("./database");

function positiveId(v, field) {
    const n = Number(v);
    if (!Number.isSafeInteger(n) || n <= 0) {
        throw new TypeError("INVALID_" + field);
    }
    return n;
}

async function transactionOrganisationAuthentifiee({
    personneId,
    organisationId,
    requestId = ""
}, callback) {
    if (typeof callback !== "function") throw new TypeError("CALLBACK_REQUIRED");
    const person = positiveId(personneId, "PERSON");
    const org = positiveId(organisationId, "ORGANISATION");

    return executerTransactionDatabase({
        type: "USER",
        personneId: person,
        requestId
    }, async () => {
        const resolved = await executerRequete(
            `SELECT o.tenant_id
             FROM organisations o
             WHERE o.id = $1 AND o.tenant_id IS NOT NULL
               AND EXISTS (
                   SELECT 1
                   FROM relations_personne_organisation m
                   WHERE m.organisation_id = o.id
                     AND m.personne_id = $2
               )`,
            [org, person]
        );
        if (resolved.rows.length !== 1) {
            const error = new Error("ORGANISATION_ACCESS_DENIED");
            error.code = "ORGANISATION_ACCESS_DENIED";
            throw error;
        }

        const tenantId = positiveId(resolved.rows[0].tenant_id, "TENANT");
        await definirTenantContexteDatabaseCourant(tenantId);
        return callback(Object.freeze({personneId: person, organisationId: org, tenantId}));
    });
}

module.exports = {transactionOrganisationAuthentifiee};
