# StackLyra ERP (`v0.7.0`) — Production-Readiness & Multi-Tenant SaaS Audit

- **Repository:** `albarka-pos` (`StackLyra ERP v0.7.0`, targeting `erp.stacklyra.com`)
- **Audit Date:** 2026-11-27
- **Auditor / Model Used:** Antigravity — Google Gemini (High reasoning effort selected in settings)
- **Audit Scope:** Read-only code & architecture review of `src/lib/`, `src/core/`, `src/modules/`, `src/app/api/`, `src/components/`, and `src/middleware.ts`
- **Overall Verdict:** **NOT PRODUCTION-READY for live Multi-Tenant SaaS** (currently at **Pre-Alpha / Working SaaS Prototype** stage; contains 6 P0 production blockers that will cause data loss, broken serverless logins, or billing bypasses under live traffic).

---

## Quick Note on `/platform-admin`

- There is currently **no `/platform-admin` route** (visiting `/platform-admin` returns `404`).
- The Platform Super-Admin Control Plane table is currently embedded inside **Settings → SaaS Plan & Billing** (`src/components/shell/AlbarkaMaterial3ERP.tsx`) when logged in as `saad` (`isPlatformAdmin: true`).

---

## P0 — Critical Production Blockers (Must Fix Before Onboarding Paying Customers)

### 1. Tenant Registry Reads Only Local Disk — Fails Across Vercel Serverless Instances
- **Files:** `src/lib/db.ts` (lines 194–246: `listTenantsRegistry`, `getTenantByIdOrSlug`, `findTenantStrict`)
- **Finding:** Login resolution (`findUserAcrossTenantsAsync`), workspace staff lookup (`GET /api/state?workspace=<slug>`), and billing webhooks (`POST /api/saas/webhooks/billing`) read tenants synchronously from `/tmp/stacklyra-data/saas-tenants.json` on Vercel — **they never query `stacklyra_tenants` in Supabase PostgreSQL**.
- **Impact:** On Vercel serverless, `/tmp` is ephemeral and isolated per container. A tenant registered on Container A will not exist in Container B's `/tmp`, causing `401 Invalid credentials` on login and `404 Tenant not found` on billing webhooks.

### 2. Full-Table `DELETE` + Sequential Row-by-Row `INSERT` Loop & Lost-Update Race Conditions
- **Files:** `src/lib/postgres.ts` (lines 294–374: `replaceTenantRows`), `src/core/db/index.ts` (lines 15–27: `withTransaction`)
- **Finding:** Every mutation (including a single POS sale) loads the tenant's entire dataset into memory, deep-clones it via `JSON.parse(JSON.stringify(...))`, and executes `DELETE FROM <table> WHERE tenant_id = $1` followed by a sequential `for` loop of `N` individual `INSERT` round-trips over TCP to Supabase (`ap-northeast-1`).
- **Impact:**
  1. **Concurrency Data Loss:** Two cashiers in the same organization checking out concurrently (or within the 15-second `WARM_CACHE_TTL_MS` across two serverless containers) overwrite each other's entire tables—silently deleting completed sales and producing duplicate invoice numbers.
  2. **Scaling Timeout:** Once a tenant reaches ~1,500–2,000 orders or ledger entries, every checkout runs thousands of sequential `INSERT` queries and hits Vercel function timeouts.

### 3. Drizzle Schema Mismatch & Dead ORM Layer
- **Files:** `src/lib/drizzle/schema.ts` vs. `src/lib/postgres.ts` (lines 80–240)
- **Finding:** `src/lib/drizzle/schema.ts` declares normalized relational columns (`name`, `variants`, `discount_amount`, `debit_minor`, etc.), whereas `src/lib/postgres.ts` actually creates `(tenant_id, id, payload JSONB)` tables using `sql.unsafe(...)` and **never executes a single Drizzle query** (`getDrizzleDb()` is unused).

### 4. Silent Database Write Failures (`200 OK` Returned on Postgres Errors)
- **Files:** `src/lib/postgres.ts` (lines 502–504), `src/lib/db.ts` (lines 453–460)
- **Finding:** `syncTenantToPostgresIfAvailable()` swallows all PostgreSQL exceptions via `catch { return false; }` without logging, and `writeDbAsync()` ignores the return boolean.
- **Impact:** If Supabase rejects a write or drops a connection in production, the API writes only to ephemeral `/tmp` and returns `200 OK` to the client, silently losing financial transactions.

### 5. Self-Upgrade & Self-Unsuspend Free Billing Bypass
- **Files:** `src/app/api/saas/onboarding/route.ts` (lines 106–163: `action: "UPDATE_SUBSCRIPTION"`)
- **Finding:** Any tenant `ADMIN` (e.g., on the Starter tier or even on a `SUSPENDED` account) can POST `{ action: "UPDATE_SUBSCRIPTION", planId: "enterprise" }` and the server immediately sets `planId = "enterprise"` and `status = "ACTIVE"` with zero payment verification.

### 6. PostgreSQL Row-Level Security (RLS) Is Not Enabled
- **Files:** `src/lib/postgres.ts` (lines 80–240, 397–399)
- **Finding:** Although `syncTenantToPostgresIfAvailable()` calls `SELECT set_config('app.current_tenant', $1, true)`, `ensurePostgresSchema()` never runs `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` or `CREATE POLICY ...`. Furthermore, the Supabase `postgres` superuser role bypasses RLS unless `FORCE ROW LEVEL SECURITY` / a non-superuser app role is used. Tenant isolation currently relies 100% on application `WHERE` clauses.

---

## P1 — High-Risk Security & Financial Integrity Findings

1. **Hardcoded Production Billing Webhook Secret Fallback:**
   - `src/lib/config.ts` (line 17) falls back to `"whsec_stacklyra_saas_2026"` if `BILLING_WEBHOOK_SECRET` is unset, allowing forged webhooks against `/api/saas/webhooks/billing`.
   - `/api/saas/webhooks/billing` also lacks an idempotency/processed-events table (`billing_webhook_events`) and timestamp replay protection.
2. **Ephemeral `JWT_SECRET` in Production:**
   - `src/lib/auth-jwt.ts` (lines 13–23) generates a random per-process HMAC key if `JWT_SECRET` is missing in production, causing random cross-container logouts on Vercel instead of failing fast.
3. **Plaintext Staff PIN Storage & Exposure:**
   - `src/lib/password.ts` (lines 37–72) already implements `hashPin` / `verifyPin`, **but they are not wired up**. `src/app/api/users/route.ts` (line 194) stores raw plaintext `pin`, `src/app/api/auth/route.ts` (line 316) compares plaintext `pin`, and `src/core/auth/index.ts` (line 118) returns plaintext PINs to admin browsers.
4. **Unauthenticated Staff Directory Enumeration:**
   - `src/app/api/state/route.ts` (lines 45–59): Any unauthenticated caller can query `GET /api/state?workspace=<slug>` and harvest staff names, roles, emails, titles, and user IDs for any tenant.
5. **In-Memory Login Rate Limiter Ineffective on Serverless:**
   - `src/app/api/auth/route.ts` (line 22): `failedLoginStore = new Map()` resets on cold starts and is not shared across Vercel lambdas, leaving 4-digit staff PINs (10,000 combinations) exposed to distributed brute-force attacks.
6. **Flagship Tenant Privilege Escalation:**
   - `src/app/api/saas/onboarding/route.ts` (line 88) grants Platform Super-Admin privileges when `callerDb.tenant.id === "ten-stacklyra" && caller.role === "ADMIN"`. Adding a second co-admin to the flagship tenant would inadvertently grant them full Platform Admin access over all SaaS tenants.
7. **Simulated PRA e-IMS Fiscalization & Unvalidated B2B Invoices:**
   - `src/lib/pra-client.ts` (lines 109–125): `generatePRAInvoiceResponse()` fabricates a deterministic PRA invoice number and marks `praSyncStatus: "SYNCED"` without ever sending an HTTP request to PRA's live IMS API.
   - `src/app/api/invoices/route.ts` (lines 62–74): Accepts client-supplied `invoice` totals and numbers directly without server-side recalculation, sequential counter assignment, fiscal period lock validation, or ledger posting.

---

## P2 — Architecture, Maintainability & Operational Debt

1. **Monolithic UI Shell (~4,800+ lines):** `src/components/shell/AlbarkaMaterial3ERP.tsx` combines 10 ERP modules and 80+ `useState` hooks in a single client component.
2. **Legacy Code & Next.js 16 Deprecations:**
   - Unused `mongodb` dependency and `src/lib/mongodb.ts` remain in the repo.
   - `src/app/layout.tsx` (lines 22, 39) still references `"TypeScript & MongoDB"` in metadata and `"albarka-theme"` in `localStorage`.
   - `src/middleware.ts` triggers Next.js 16's deprecation warning (`proxy.ts`) and does not yet parse `<slug>.erp.stacklyra.com` subdomain hosts.
3. **Zero Automated Test Suite & Missing Observability:**
   - No unit or integration tests proving cross-tenant isolation, concurrent POS checkout integrity, or double-entry balance invariants.
   - No structured error logging/monitoring (e.g., Sentry) or `/api/health` database connectivity check.

---

## Strengths Already Built (Worth Preserving)

- **Financial Domain Core:** Integer minor-unit (paisa) arithmetic (`src/core/money`), balanced double-entry assertion (`assertBalancedJournal`), server-side POS price/tax recomputation (`POSService`), fiscal period locking, and soft-archival instead of hard deletes.
- **Auth & RBAC Foundations:** Salted `scrypt` password hashing, constant-time `timingSafeEqual` verification, `HttpOnly` HS256 JWT cookies, and a 13-permission RBAC matrix (`src/core/auth/permissions.ts`).
- **UI & Offline Resilience:** Material Design 3 design system and tenant-namespaced IndexedDB + `localStorage` crash-safe POS draft & outbox store (`src/lib/crash-safe-store.ts`).

---

## Prioritized Remediation Plan (Path to Production `v1.0.0`)

| Priority | Workstream | Required Changes |
|---|---|---|
| **1 (P0)** | **True Relational Drizzle Persistence** | Replace snapshot-clone + `DELETE/INSERT` loop with real Drizzle ORM single-row/transactional SQL queries (`SELECT/INSERT/UPDATE WHERE tenant_id = ?`, atomic `UPDATE stacklyra_document_counters SET seq = seq + 1 RETURNING seq`, atomic stock `UPDATE ... WHERE stock_qty >= qty`). Read/write tenants directly from `stacklyra_tenants` in PostgreSQL (remove `/tmp` registry dependency). Fail loudly on DB errors—never swallow exceptions. |
| **2 (P0)** | **Real PostgreSQL RLS & Dedicated `/platform-admin`** | Enable `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` across all tenant tables with a non-superuser app role. Create dedicated `/platform-admin` route strictly gated by `isPlatformAdmin === true` (remove `ten-stacklyra` fallback). Restrict `UPDATE_SUBSCRIPTION` to Platform Admin and signed billing webhooks only. |
| **3 (P1)** | **Security Hardening** | Migrate staff PINs to `hashPin`/`verifyPin` (never store/return plaintext PINs), require `JWT_SECRET` and `BILLING_WEBHOOK_SECRET` in production (fail fast), move login rate-limiting to Postgres or Upstash Redis, add `billing_webhook_events` idempotency + replay checks, and remove unauthenticated staff directory enumeration. |
| **4 (P1)** | **Live PRA e-IMS & Server-Validated Invoices** | Implement real HTTP dispatch to PRA e-IMS when `praLiveMode: true` (with offline retry queue on failure) and enforce server-side numbering, fiscal lock checks, and total recomputation in `/api/invoices`. |
| **5 (P2)** | **Tests, Subdomain Routing & Refactoring** | Add Vitest integration tests (cross-tenant isolation, concurrent POS checkouts, quota guards), migrate `middleware.ts` → `proxy.ts` with wildcard `<slug>.erp.stacklyra.com` support, remove unused `mongodb`, and modularize `AlbarkaMaterial3ERP.tsx`. |
