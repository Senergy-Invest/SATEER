# SATEER — Readiness for PostgreSQL Row-Level Security

**Status:** RLS is not enabled. This document records the verified prerequisites before any RLS policy is deployed.

## 1. Current verified baseline

The draft hardening branch contains migration `027_tenant_integrity_constraints.sql`. Its CI run on PostgreSQL 16 successfully:

- applied migrations 001–027 to a disposable database;
- validated tenant/organisation composite foreign keys and SQL guards;
- ran the SQL boundary tests, HTTP integration tests, two-tenant isolation tests and the Bordeaux workflow E2E test;
- reported 7 structural findings, 0 high structural findings and 0 data anomalies;
- retained 0 RLS-enabled tables and 0 RLS policies.

The seven review findings concern partner/target references in `introductions`, `leads`, `organisation_invitations`, `organisation_join_requests`, `organisation_relationships`, `partner_agreements` and global report templates in `report_runs`. They must remain explicit cross-tenant/global use cases, not be blindly constrained to the source tenant.

## 2. Transaction-scoped database context — first increment implemented

`database.js` now provides:

- `executerTransactionDatabase(context, callback)`: acquires one pooled client, starts a transaction, sets transaction-local context and commits or rolls back;
- `AsyncLocalStorage`: isolates the active client/context per asynchronous call chain;
- automatic routing in `executerRequete()`: inside an active transaction, existing database service functions reuse the pinned client; outside one, the historical `pool.query()` behavior remains;
- explicit context types `USER` and `SYSTEM`;
- mandatory positive `personneId` for `USER`, and mandatory named `service` for `SYSTEM`;
- rejection of nested transactions that could silently replace the active security context.

The PostgreSQL settings use `set_config(..., TRUE)`, equivalent to transaction-local settings. Tenant/person/service values are reset by PostgreSQL at commit or rollback. The application context is marked inactive before the client is released.

The test `scripts/database-context-test.js` verifies concurrent tenant contexts, pinned backend connections, context isolation, post-commit cleanup, rollback, missing identity and nested-transaction rejection. CI runs it against the disposable PostgreSQL 16 database.

## 3. Authenticated HTTP context propagation — second increment implemented

The `exigerSession` middleware now starts a transaction after the session has been verified. The person identifier comes exclusively from the server-side session.

The new `database-request-context.js` module resolves the actual tenant only when a matching person–organisation relationship exists in PostgreSQL. A request may select a tenant, organisation or demand, but these values are selectors only: none grants access without a verified membership/requester relationship. If the user asks for another tenant, the request receives no tenant context.

The middleware keeps the transaction open for the protected HTTP handler and intercepts the final `res.end()` so that:

- successful responses commit before the final response is sent;
- 4xx/5xx responses roll back while preserving the original HTTP response;
- a disconnected client causes rollback;
- transaction/commit failures do not return a successful response;
- existing `executerRequete()` calls in the request reuse the pinned transaction client.

The resolved tenant is applied with transaction-local `set_config(..., TRUE)`. The two-tenant integration test now checks valid tenant resolution, rejection of cross-tenant context selection, and the authenticated HTTP isolation cases.

**Remaining boundary:** authenticated routes with no tenant/organisation/demand selector receive a person context but no tenant context. Global identity/catalogue endpoints can use that context; tenant-owned access must not rely on a browser-supplied identifier or an implicit tenant fallback.

## 4. Required architecture before RLS

1. Review tenantless authenticated routes and classify them as global identity/catalogue, tenant-scoped, public intake or system operation. Add explicit selectors where a tenant-scoped route currently relies on an implicit default.
2. Ensure every query in a protected request uses the same transaction client. Do not mix transactional and pool-level queries within one request.
3. Define explicit context classes for public intake, background jobs, scheduled jobs and controlled cross-tenant integrations. A system context must be narrow, authenticated, logged and never silently bypass tenant checks.
4. Classify every table as tenant-owned, organisation-owned, inherited through a validated parent, global identity, global catalogue or intentional cross-tenant relationship.
5. Add RLS policies with default-deny semantics. For organisation-owned rows, verify the organisation belongs to the current tenant. For inherited rows, use a safe parent-existence policy or denormalize a validated tenant key.
6. Treat global identity separately: authenticate globally, then expose only the minimum identity data needed for the current tenant and its verified relationships.
7. Add tests for missing context, forged context, pooled-connection reuse, rollback, parallel tenants, background/system contexts, intentional partner links and every table policy.
8. Enable RLS in stages, first on a small low-risk table, then expand after CI and restored-copy validation.

## 5. Non-negotiable safety rules

- Never use session-level tenant settings on pooled connections.
- Never infer tenant identity from URL/query/body parameters.
- Never grant broad `BYPASSRLS` to the application database role.
- Do not use `FORCE ROW LEVEL SECURITY` until table owners, migrations and maintenance paths are understood.
- Preserve legitimate partner and organisation-network links through explicit authorization checks.
- Do not run migration 027 against the working/local or production database until a verified backup/restore rehearsal and data preflight have passed.

## 6. Next implementation increment

Audit all authenticated route selectors, refactor implicit tenant defaults, and add explicit context handling for public/system workflows. Then design the first RLS policies with default-deny semantics and table-by-table tests.
