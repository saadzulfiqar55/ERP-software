# StackLyra ERP: System Design and Native App Plan

Status: draft for team review
Date: 2026-11-28
Scope: backend changes and a native Android app for StackLyra ERP v0.7.0

This document describes where the system is today, what must change before a native app can be built on it, the target architecture, and the order of work. It is based on a read of the code, not on load tests or a penetration test. Items that were not verified are marked "unverified".

---

## 1. Summary

- StackLyra ERP is a multi-tenant ERP and POS for Pakistani retail and restaurant businesses. It is a Next.js 16 monolith backed by Postgres (Supabase).
- We want a native Android app. It must serve many users: many businesses (tenants), many staff per business, many devices per business, and several staff sharing one device.
- Recommendation: build the app in **native Kotlin** (Jetpack Compose, Room, WorkManager). The main reasons are POS hardware support and reliable offline sync, not raw speed.
- The backend is not ready for a second client. It needs token-based auth, a versioned API, a sync protocol, and several security fixes first.
- Keep the backend as a modular monolith. Do not split it into microservices.

---

## 2. Current system

### 2.1 Stack

| Layer | Technology |
| :--- | :--- |
| Web framework | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS v4, Material Design 3 tokens |
| Database | PostgreSQL on Supabase, through the `postgres` driver |
| Auth | HS256 JWT in an httpOnly cookie, scrypt password and PIN hashing |
| Hosting target | Vercel (serverless), `erp.stacklyra.com` |

### 2.2 Code layout

```
src/app/api/*    thin HTTP route handlers
src/modules/*    domain services: POS, accounting, inventory, purchasing
src/core/*       auth, RBAC, transactions, idempotency, money, audit, entitlements
src/lib/*        Postgres access, JWT, password hashing, tax calculator, PRA client
src/components/* web UI (one 5,000-line shell component plus smaller views)
```

### 2.3 How a write works today

1. The route resolves the tenant from the session JWT.
2. `withTransaction` opens a Postgres transaction and takes a per-tenant advisory lock. All writes for one tenant run one after another.
3. The tenant's state is loaded into an in-memory object. Journals (orders, ledger, audit logs, goods receipts) are not loaded in full.
4. The route checks the actor's permission and looks up the idempotency key.
5. A domain service changes the in-memory object.
6. `saveTenantDiff` writes back only the changed rows.

### 2.4 What is already good

- Money is stored and calculated in integer paisa.
- Every sale builds balanced double-entry journal lines.
- The ledger, audit log and goods receipts are append-only, enforced by database triggers.
- Fiscal periods can be locked.
- Idempotency records are stored in Postgres for 90 days.
- RBAC is enforced on the server: 3 roles, 13 permissions.
- Plan limits (seats, branches, products, features) are enforced on the server.
- Database errors return a 503. Nothing is reported as saved when it was not.

### 2.5 Known gaps

| # | Gap | Why it matters for mobile |
| :--- | :--- | :--- |
| G1 | No Postgres row-level security. Tenant isolation depends on `WHERE tenant_id` in app code. | One missed filter leaks another business's data. |
| G2 | `/api/invoices` stores client-supplied totals and invoice numbers. | A native app is easy to tamper with. |
| G3 | Invoice status changes (`MARK_PAID`, `BULK_MARK_SENT`) need only the cashier permission and post nothing to the ledger. | Staff can mark invoices paid with no payment. |
| G4 | Login rate limiting is an in-memory map keyed on `x-forwarded-for`. | It does not work across serverless instances. 4-digit PINs can be brute-forced. |
| G5 | `GET /api/state?workspace=<slug>` returns the staff list with no login. | It gives an attacker targets for G4. |
| G6 | Sessions are stateless 8-hour JWTs with no revocation. | A removed staff member or stolen token stays valid. |
| G7 | Platform admin is tied to one hardcoded user ID in the flagship tenant. | There is no separate control plane. |
| G8 | Billing webhook has no event-ID tracking. | A captured request can be replayed within 5 minutes. |
| G9 | Workspace sign-up has no rate limit or CAPTCHA (unverified beyond the code read). | Anyone can create unlimited tenants. |
| G10 | PRA fiscalization is simulated. No request is sent to PRA. | Customers may believe sales are reported when they are not. |
| G11 | No automated tests. | Sync and concurrency bugs will not be caught. |
| G12 | `src/lib/drizzle/schema.ts` does not match the real tables. | It misleads anyone reading the schema. |
| G13 | `/api/state` returns the whole scoped tenant state. | Too large and too slow for mobile networks. |
| G14 | `middleware.ts` uses a convention that Next.js 16 has deprecated in favor of `proxy.ts`. | Maintenance only. |

---

## 3. Requirements

### 3.1 Multi-user requirements

The app is not for one user. "Multi-user" means four different things here, and each one drives design:

| Dimension | Meaning | Design consequence |
| :--- | :--- | :--- |
| Many tenants | Many businesses on one platform | Strict tenant isolation (RLS), per-tenant limits |
| Many staff per tenant | Owner, managers, cashiers | Roles and permissions enforced on the server, per-user audit trail |
| Many devices per tenant | Several terminals selling at once | Concurrency control, sync, device registration and revocation |
| Many staff per device | Cashiers share one terminal across shifts | Fast user switching, every action attributed to a user and a device |

### 3.2 Functional scope for the first app release

- Device enrollment and staff login
- Catalog and stock sync
- POS sale, online and offline
- Receipt printing
- Cashier shift open and close
- Sync status screen (pending, failed, last synced)

Later releases: inventory adjustments, purchasing (PO and GRN), ledger views, invoices, owner dashboard.

### 3.3 Non-functional requirements

- A sale must complete with no network connection.
- No sale may be lost or recorded twice.
- Totals shown on the device must match what the server records.
- A lost or stolen device can be shut out from the server.
- The app must run on low-cost Android phones and on dedicated Android POS terminals.

---

## 4. Target architecture

### 4.1 Overview

```
 Android app (Kotlin)            Web app (Next.js UI)
   Room local database             browser
   outbox + sync worker               |
        |                             |
        +----------- HTTPS -----------+
                      |
              /api/v1 (versioned REST, OpenAPI)
                      |
          domain services (src/modules, src/core)
                      |
           Postgres on Supabase (RLS enabled)
                      |
        PRA e-IMS (server-side only, with retry queue)
```

Principles:

1. **The server decides.** Prices, tax, totals, document numbers, permissions and plan limits are computed on the server. Clients compute totals only to show them.
2. **One API for all clients.** The web UI and the Android app call the same `/api/v1` endpoints.
3. **Modular monolith.** Domain services stay in one deployable app.
4. **Offline first on the device.** The app reads and writes its local database. A background worker syncs with the server.

### 4.2 API design

- Prefix all client endpoints with `/api/v1`. Keep the current routes until the web UI has moved over.
- Write an OpenAPI spec and generate the Kotlin client and the TypeScript types from it.
- Replace the whole-state `/api/state` call with granular endpoints.

Proposed endpoints:

| Area | Endpoint | Purpose |
| :--- | :--- | :--- |
| Devices | `POST /v1/devices/enroll` | Exchange a pairing code for a device credential |
| Devices | `POST /v1/devices/{id}/revoke` | Admin shuts out a device |
| Auth | `POST /v1/auth/login` | Staff PIN or owner password login on an enrolled device |
| Auth | `POST /v1/auth/refresh` | Rotate the refresh token |
| Auth | `POST /v1/auth/logout` | End the session |
| Sync | `GET /v1/sync/pull?since=<seq>` | Changed catalog, stock, parties, settings, users, permissions |
| Sync | `POST /v1/sync/push` | Batch of outbox operations, each with an idempotency key |
| POS | `POST /v1/orders` | Online sale |
| POS | `GET /v1/orders` | Paged order history (cursor based, already exists) |
| Shifts | `POST /v1/shifts/open`, `POST /v1/shifts/close` | Cashier shift lifecycle |
| Meta | `GET /v1/meta` | Minimum supported app version, server time, feature flags |
| Health | `GET /v1/health` | Database connectivity check |

Rules for every endpoint:

- Standard error body: `{ error, code }`, as the data layer already returns.
- Every write accepts an idempotency key.
- Lists use cursor pagination.
- Responses carry the server time so devices can detect clock drift.

### 4.3 Authentication and devices

Current auth is a browser cookie. Mobile needs the following.

**Device enrollment**

1. An admin opens Settings on the web and creates a pairing code (short lived, single use), shown as text and as a QR code.
2. The app scans it and calls `POST /v1/devices/enroll`.
3. The server creates a device record (tenant, branch, name, status) and returns a device credential.
4. The app stores the credential in the Android Keystore.

**Staff login on a device**

- Staff choose their profile and enter a PIN. The request carries the device credential, so the staff list is only visible to enrolled devices. This closes G5.
- The server returns a short-lived access token (about 15 minutes) and a rotating refresh token, both bound to the device.
- Owners log in with a password. Add optional two-factor authentication later.

**Server-side protection**

- Store failed login attempts in Postgres, keyed by account and by device. Lock the account after repeated failures. This closes G4.
- Raise staff PINs from 4 to 6 digits.
- Store refresh tokens hashed in a table, so a session can be revoked. This closes G6.
- Revoking a device invalidates all its tokens.

**Shared devices and user switching**

- Several staff can be signed in on one device. Switching user asks for the PIN and takes a few seconds.
- Every local operation records the user ID and the device ID.
- Auto-lock after a period of inactivity.

**Offline login**

- The device keeps a salted hash of each staff PIN for offline unlock.
- Limit offline attempts and wipe the cached hashes after too many failures.
- Require an online login at least every few days. The exact interval is an open decision (section 9).
- Permissions are cached at the last sync. The server re-checks permissions when operations are pushed and can reject them.

### 4.4 Sync protocol

**Local storage**

- Room database with tables for products, stock, parties, settings, users, orders, shifts, and an outbox.
- Encrypt the database (SQLCipher) because it holds business data and PIN hashes.

**Pull (server to device)**

- Add a per-tenant change sequence number. Each changed row gets the next number.
- Writes are already serialized per tenant, so the sequence is strictly ordered.
- The device stores the last sequence it received and asks for everything after it.
- Products are soft-archived, not deleted, so archived rows flow through the same pull. Other entities need tombstones.
- First sync downloads a full snapshot in pages.

**Push (device to server)**

- Each local action is one outbox operation: type, payload, user ID, device ID, local timestamp, idempotency key.
- A WorkManager job sends operations in order, in batches.
- The server runs each one through the same domain service used online.
- The server answers per operation: applied, already applied (idempotent replay), or rejected with a reason.
- Rejected operations stay visible to the user. They are never dropped silently.

**Conflict rules**

| Data | Rule |
| :--- | :--- |
| Sales | Never merged. Each sale is a new record. |
| Stock | The server applies deltas (minus 2), not absolute values. |
| Catalog and settings | Server wins. Devices do not edit these offline in the first release. |
| Prices at sale time | The sale keeps the price and tax snapshot the cashier saw. The server validates it against the price history and flags mismatches for review. |

**Live updates between devices**

- First release: pull on a timer and after each push.
- Later: Firebase Cloud Messaging as a "sync now" signal, so stock changes reach other terminals in seconds.

### 4.5 Document numbering offline

Today invoice numbers are gapless and assigned by the server under the tenant lock. An offline device cannot ask the server.

Recommended approach: **a number series per device.**

- Each enrolled device gets a short terminal code, for example `T03`.
- The device issues numbers from its own gapless series: `SL-2026-T03-000123`.
- The server checks on push that the series has no gaps or repeats.

Alternative: provisional numbers that the server replaces at sync. This is simpler but the printed receipt would not match the final number.

This choice must agree with PRA invoice numbering rules, which are unverified. It is an open decision (section 9).

### 4.6 Stock when offline

Two terminals can sell the last unit while offline. Options:

1. Allow negative stock and flag it for the manager. Recommended, because rejecting a sale that already happened at the counter does not help anyone.
2. Reject at sync and require a manager to resolve.

This is a business decision (section 9).

### 4.7 Concurrency with many devices

The per-tenant advisory lock is correct but limits throughput: each write loads the tenant's state and holds the lock.

Plan:

1. Keep the lock for now. Measure write time per tenant with realistic data sizes.
2. If it becomes a bottleneck, move the hot paths to single SQL statements that do not need the full state:
   - stock: `UPDATE ... SET qty = qty - $n WHERE qty >= $n`
   - counters: `UPDATE ... SET seq = seq + 1 RETURNING seq`
3. Batch pushes from one device run in one transaction where possible.

### 4.8 Branches

- The code has one default branch (`BRANCH_MAIN`), while plans allow up to 50 branches.
- Add a real branch dimension before multi-branch customers use the app: devices belong to a branch, stock is held per branch, orders and shifts carry a branch ID.
- Staff can be limited to specific branches.

### 4.9 PRA fiscalization

- Build the real PRA e-IMS call on the server.
- Queue failed submissions and retry them. Record the status per order.
- Devices never call PRA directly.
- Until this is built, the UI must say that fiscalization is simulated.
- What a receipt must show when a sale is made offline, before PRA has answered, is unverified and is an open decision.

### 4.10 Database changes

| Change | Purpose |
| :--- | :--- |
| Enable RLS and add policies on every tenant table. Run the app as a non-superuser role. | Closes G1 |
| `devices` table | Enrollment, branch, terminal code, status |
| `refresh_tokens` table (hashed) | Revocable sessions |
| `login_attempts` table | Shared, durable rate limiting |
| `change_seq` column and per-tenant sequence | Sync pull |
| `branch_id`, `device_id`, `user_id` on orders, shifts and audit logs | Attribution |
| `billing_webhook_events` table | Closes G8 |
| `pra_submissions` queue table | Real PRA with retries |
| Delete or rewrite `drizzle/schema.ts` | Closes G12 |

---

## 5. Mobile platform decision

### 5.1 Comparison

| Factor | Kotlin (native) | React Native | Expo |
| :--- | :--- | :--- | :--- |
| POS hardware (printers, scanners, cash drawers, terminal SDKs) | First-party SDKs | Community wrappers or custom native modules | Hardest; needs dev builds and custom modules |
| Offline database and background sync | Room and WorkManager, first party | Possible, more moving parts | Possible, more limits |
| UI speed for forms and lists | Excellent | Good enough | Good enough |
| iOS from the same code | No (possible later with Kotlin Multiplatform) | Yes | Yes |
| Shares code with the web app | No | Yes (types, validation) | Yes |
| Fits the team's current skills (TypeScript) | No | Yes | Yes |

### 5.2 Recommendation

**Native Kotlin for the POS app.**

- Speed is not the deciding factor. An ERP screen is forms, lists and a cart, and all three options render that well.
- The deciding factors are hardware integration and dependable offline sync. Both are strongest on native Android.
- The target market is mostly Android, so sharing code with iOS is worth less here.

When this recommendation changes:

- If the team has no Kotlin experience and cannot hire it, choose React Native. A well-built React Native app is better than a poorly built Kotlin one.
- If the app is mainly reports and approvals for owners, with no hardware, Expo is enough.
- If iOS is needed in the first year, choose React Native, or use Kotlin Multiplatform from the start.

### 5.3 Android technical stack

| Concern | Choice |
| :--- | :--- |
| Language | Kotlin |
| UI | Jetpack Compose, Material 3 |
| Architecture | MVVM with unidirectional data flow, repository pattern |
| Local database | Room, encrypted with SQLCipher |
| Background work | WorkManager |
| Networking | Retrofit or Ktor client, generated from the OpenAPI spec |
| Serialization | kotlinx.serialization |
| Dependency injection | Hilt |
| Secrets | Android Keystore |
| Preferences | DataStore |
| Push | Firebase Cloud Messaging |
| Crash reporting | Firebase Crashlytics or Sentry |

### 5.4 App module structure

```
app/                 navigation, dependency wiring
core/network/        generated API client, auth interceptor, token refresh
core/database/       Room entities, DAOs, migrations
core/sync/           outbox, pull and push workers, conflict handling
core/auth/           device enrollment, login, user switching, offline unlock
core/money/          integer paisa arithmetic, display-only tax calculation
core/hardware/       printer, scanner and cash drawer interfaces and drivers
feature/pos/         cart, checkout, receipt
feature/shifts/      open and close shift
feature/catalog/     product browsing and search
feature/syncstatus/  pending and failed operations
```

Keep `core/sync`, `core/money` and `core/network` free of Android UI code, so they can move into a Kotlin Multiplatform module if iOS is needed later.

---

## 6. Security plan

Fix in this order. Items 1 to 4 block the mobile release.

1. **Invoices (G2, G3):** compute totals, assign numbers, check fiscal locks and post to the ledger on the server. Require a stronger permission for status changes.
2. **Tenant isolation (G1):** enable RLS with a non-superuser app role. Remove the `X-ERP-Tenant-Boundary` header until RLS is real.
3. **Login (G4, G5, G6):** durable rate limiting and account lockout, 6-digit PINs, staff list only for enrolled devices, revocable tokens.
4. **PRA (G10):** real integration, or a clear label in the UI.
5. **Webhook replay (G8):** store processed event IDs.
6. **Sign-up abuse (G9):** rate limit and CAPTCHA.
7. **Platform admin (G7):** separate the platform control plane from the flagship tenant.

Mobile-specific measures:

- Encrypted local database, tokens in the Keystore.
- TLS certificate pinning.
- No secrets in the app package.
- A minimum-version check so old, vulnerable app versions can be forced to update.
- Remote device revocation, with local data wiped at the next contact.

---

## 7. Testing and operations

### 7.1 Tests

| Level | What to cover |
| :--- | :--- |
| Backend integration | Tenant isolation, concurrent checkouts, journal balance, idempotent replay, plan limits |
| Sync | Out-of-order pushes, repeated pushes, rejected operations, large first sync |
| Shared test cases | One JSON file of tax and totals cases, run by both the server tests and the Android tests |
| Contract | The server responses match the OpenAPI spec |
| Android | Unit tests for sync and money, UI tests for the checkout flow, tests with the network off |

### 7.2 Operations

- Error monitoring on the server and crash reporting in the app.
- `/v1/health` endpoint.
- Structured logs with tenant ID, user ID and device ID.
- Play Store internal testing track, then a staged rollout.
- For dedicated POS terminals, consider kiosk mode.

---

## 8. Order of work

| Phase | Work | Done when |
| :--- | :--- | :--- |
| 0. Hardening | Security items 1 to 4, backend integration tests, health endpoint | The known gaps that block mobile are closed and tested |
| 1. API foundation | `/api/v1`, OpenAPI spec, device enrollment, token auth, refresh, revocation | A test client can enroll, log in and call the API with no cookies |
| 2. Sync | Change sequence, pull and push endpoints, numbering and stock policies | A scripted client can sell offline and reconcile correctly |
| 3. Android MVP | Enrollment, login, user switching, catalog sync, offline sale, receipt print, sync status | A cashier can run a full shift with the network off |
| 4. Pilot | One or two real businesses, monitoring, fixes | A week of real use with no lost or duplicate sales |
| 5. More modules | Inventory, purchasing, ledger views, owner dashboard, push-triggered sync | Feature parity with the web app where it makes sense |
| 6. Web migration | Move the web UI to `/api/v1`, retire the old routes | One API for all clients |

Phases 0 to 2 are backend work and can start before any Kotlin developer joins.

---

## 9. Open decisions

| # | Decision | Owner | Notes |
| :--- | :--- | :--- | :--- |
| D1 | Kotlin, React Native or Expo | Team lead | Depends on team skills, hardware needs and iOS timing (section 5.2) |
| D2 | Offline invoice numbering: per-device series or provisional numbers | Product and accounting | Must agree with PRA rules (unverified) |
| D3 | Offline stock: allow negative or reject at sync | Product | Section 4.6 |
| D4 | How long a device may work offline before an online login is required | Product and security | Section 4.3 |
| D5 | What an offline receipt shows before PRA responds | Compliance | Section 4.9 |
| D6 | Which POS hardware to support first | Product | Drives the hardware module |
| D7 | Is iOS needed in the first year | Business | Affects D1 |
| D8 | Keep Drizzle and make the schema real, or remove it | Backend | G12 |
| D9 | Is the app a POS terminal, an owner's management app, or both | Product | Affects D1 and the MVP scope |

---

## 10. Risks

| Risk | Effect | Mitigation |
| :--- | :--- | :--- |
| Sync bugs lose or duplicate sales | Financial errors, loss of trust | Idempotency keys, append-only records, sync tests, a pilot before wide release |
| Mobile is built before the backend is hardened | Known flaws become easier to exploit | Phase 0 comes first |
| The per-tenant lock slows busy tenants | Slow checkouts with many terminals | Measure early, then move hot paths to single statements |
| PRA rules conflict with the offline design | Rework of numbering and receipts | Settle D2 and D5 before Phase 2 |
| No Kotlin experience on the team | Slow delivery, weak quality | Decide D1 honestly, hire or train before Phase 3 |
| Tax logic differs between server and device | Receipt total differs from the recorded total | Server decides, shared test cases |
