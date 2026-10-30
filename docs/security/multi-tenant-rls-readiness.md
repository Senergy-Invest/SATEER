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

The current `database.js` exposes:

- `executerRequete()`, implemented with `pool.query()`;
- `obtenirClientDatabase()`, which returns a pooled PostgreSQL client.

There is no request-scoped transaction wrapper that establishes tenant/person context with transaction-local PostgreSQL settings. Enabling RLS now would be unsafe:

- `SET LOCAL` values disappear at transaction end;
- session-level `SET` on a pooled connection can leak one request's context into another request;
- individual `pool.query()` calls do not share a transaction or a guaranteed connection;
- background jobs and public/system workflows need explicit service contexts;
- global identity tables (`personnes`, `auth_accounts`, `auth_sessions`) cannot be treated as ordinary tenant-owned tables.

**Therefore migration 027 must not enable RLS, and no RLS policy should be added until the request database-access layer is refactored.**

## 3. Required architecture before RLS

1. Add a transaction helper, e.g. `withTenantTransaction(context, callback)`, that obtains one client, begins a transaction, validates the authenticated context, uses `set_config('sateer.tenant_id', ..., true)` and `set_config('sateer.personne_id', ..., true)`, executes all queries through that same client, then commits or rolls back and releases it.
2. Derive tenant and person identifiers exclusively from the authenticated server-side session and verified organisation memberships. Never trust a tenant/person identifier supplied by the browser.
3. Migrate request-path database functions from implicit `pool.query()` calls to the transaction client. Do not mix transactional and pool-level queries within one protected request.
4. Define explicit context classes for normal user requests, public intake, background jobs, scheduled jobs and controlled cross-tenant integrations. A system context must be narrow, authenticated, logged and never silently bypass tenant checks.
5. Classify every table as tenant-owned, organisation-owned, inherited through a validated parent, global identity, global catalogue or intentional cross-tenant relationship.
6. Add RLS policies with default-deny semantics. For organisation-owned rows, verify the organisation belongs to the current tenant. For inherited rows, use a safe parent-existence policy or denormalize a validated tenant key.
7. Treat global identity separately: authenticate globally, then expose only the minimum identity data needed for the current tenant and its verified relationships.
8. Add tests for missing context, forged context, pooled-connection reuse, rollback, parallel tenants, background/system contexts, intentional partner links and every table policy.
9. Enable RLS in stages, first on a small low-risk table, then expand after CI and restored-copy validation.

## 4. Non-negotiable safety rules

- Never use session-level tenant settings on pooled connections.
- Never infer tenant identity from URL/query/body parameters.
- Never grant broad `BYPASSRLS` to the application database role.
- Do not use `FORCE ROW LEVEL SECURITY` until table owners, migrations and maintenance paths are understood.
- Preserve legitimate partner and organisation-network links through explicit authorization checks.
- Do not run migration 027 against the working/local or production database until a verified backup/restore rehearsal and data preflight have passed.

## 5. Next implementation increment

Implement and test the transaction-scoped database context layer first, without enabling RLS. Add an automated static check that rejects new request-path calls to the global pool where a tenant-scoped transaction is required. Only then design and apply the first RLS policies.
