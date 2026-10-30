# SATEER — Readiness for PostgreSQL Row-Level Security

**Status:** RLS is not enabled. This document records the verified prerequisites before any RLS policy is deployed.

## 1. Current verified baseline

The draft hardening branch contains migration `027_tenant_integrity_constraints.sql`. Its CI run on PostgreSQL 16 successfully:

- applied migrations 001–027 to a disposable database;
- validated tenant/organisation composite foreign keys and SQL guards;
- ran the SQL boundary tests, HTTP integration tests, two-tenant isolation tests and the Bordeaux workflow E2E test;
- reported 7 structural findings, all classified as intentional external/global references for review, 0 high structural findings and 0 data anomalies;
- retained 0 RLS-enabled tables and 0 RLS policies.

The seven review findings concern partner/target references in `introductions`, `leads`, `organisation_invitations`, `organisation_join_requests`, `organisation_relationships`, `partner_agreements` and global report templates in `report_runs`. They must remain explicit cross-tenant/global use cases, not be blindly constrained to the source tenant.

## 2. Critical implementation blocker

Before this increment, `database.js` exposed `executerRequete()` through `pool.query()` only. That meant separate queries could use different pooled connections and could not share a transaction-local tenant context.

Enabling RLS before fixing this would be unsafe:

- `SET LOCAL` values disappear at transaction end;
- session-level `SET` on a pooled connection can leak one request's context into another request;
- individual `pool.query()` calls do not share a transaction or a guaranteed connection;
- background jobs and public/system workflows need explicit service contexts;
- global identity tables (`personnes`, `auth_accounts`, `auth_sessions`) cannot be treated as ordinary tenant-owned tables.

**Migration 027 does not enable RLS. No RLS policy should be added until request-level context propagation and membership validation are implemented.**

## 3. Transaction-scoped database context — first increment implemented

`database.js` now provides:

- `executerTransactionDatabase(context, callback)`: acquires one pooled client, starts a transaction, sets transaction-local context and commits or rolls back;
- `AsyncLocalStorage`: isolates the active client/context per asynchronous call chain;
- automatic routing in `executerRequete()`: inside an active transaction, existing database service functions reuse the pinned client; outside one, the historical `pool.query()` behavior remains;
- explicit context types `USER` and `SYSTEM`;
- mandatory positive `personneId` for `USER`, and mandatory named `service` for `SYSTEM`;
- rejection of nested transactions that could silently replace the active security context.

The PostgreSQL settings are applied with `set_config(..., TRUE)`, equivalent to transaction-local settings. Tenant/person/service values are reset by PostgreSQL at commit or rollback. The application context is also marked inactive and discarded before the client is released.

**Important boundary:** this helper validates the shape of a server-created context; it does not prove that a person belongs to a tenant. The caller must derive `tenantId` from the authenticated session and a verified membership query. Do not pass raw browser-supplied identifiers as a trusted context.

The new test `scripts/database-context-test.js` checks concurrent tenant contexts, pinned backend connections, context isolation, post-commit cleanup, rollback, missing identity and nested-transaction rejection. CI runs it against the disposable PostgreSQL 16 database.

## 4. Required architecture before RLS

1. Integrate the transaction helper into authenticated HTTP request handling. Derive the person from the verified session and derive tenant context only after checking the person's active organisation membership. The browser may select a tenant/organisation but cannot establish trusted identity or access.
2. Ensure every query in a protected request uses the same transaction client. Do not mix transactional and pool-level queries within one request.
3. Define explicit context classes for normal user requests, public intake, background jobs, scheduled jobs and controlled cross-tenant integrations. A system context must be narrow, authenticated, logged and never silently bypass tenant checks.
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

Add a request-scoped authenticated middleware that resolves the tenant from verified person–organisation membership, keeps the transaction open for the complete HTTP handler, and commits/rolls back before the response is finalized. Then migrate special public/system workflows to explicit contexts and add end-to-end tests before designing the first RLS policies.
