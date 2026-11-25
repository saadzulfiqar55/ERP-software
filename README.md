# StackLyra ERP — Material Design 3 ERP, POS & Khata Accounting

A full-stack **Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS v4 + MongoDB** Enterprise Resource Planning (ERP), Point of Sale (POS), Invoicing, Double-Entry Khata Accounting, and **Punjab Revenue Authority (PRA) e-IMS** workspace designed with **Google Material Design 3 (Material You)**.

---

## 1. Tech Stack & Libraries

| Layer | Technology / Library | Version (`package.json`) | Purpose |
| :--- | :--- | :--- | :--- |
| **Framework** | Next.js (App Router) | `^16.4.6` | Routing, Server/Client boundaries, `loading.tsx` Suspense fallback, API routes, Edge/Proxy middleware, `icon.svg` favicon generation |
| **UI Runtime** | React & React DOM | `^19.0.0` | Component rendering, React `useId()` SVG deduplication, client state hydration |
| **Language** | TypeScript | `^5.7.2` | End-to-end static typing across domain models, API contracts, and UI components |
| **Styling** | Tailwind CSS + `@tailwindcss/postcss` + PostCSS | `^4.3.5` / `^8.4.49` | `@theme`-mapped Material Design 3 CSS variables with Light & Dark (`[data-theme="dark"]`) support |
| **Typography** | `next/font/google` (`Roboto`, `Roboto_Mono`) | Built-in Next.js | Self-hosted/optimized Material typography + `tabular-nums` monospace financial figures |
| **Icons & Brand** | `lucide-react` + Custom SVG | `^0.468.0` | Consistent vector UI iconography and the **StackLyra** origami bird mark enclosed in an M3 squircle (`src/app/icon.svg`, `StackLyraLogo`) |
| **Database** | `mongodb` (Official Node.js Driver) | `^7.9.0` | MongoDB Atlas / local MongoDB persistence (configured via `serverExternalPackages: ["mongodb"]` in `next.config.ts`) |
| **Cryptography** | Node.js `node:crypto` | Built-in (`@types/node ^22.10.0`) | Zero-dependency `scrypt` salted password hashing, RFC 7519 `HS256` JWT signing/verification, `timingSafeEqual` comparisons |

---

## 2. Project Architecture & Directory Map

```text
src/
├── middleware.ts                         # Security headers & API no-store boundary
├── app/
│   ├── layout.tsx                        # Root layout, Google fonts, metadata, anti-FOUC theme script
│   ├── globals.css                       # Tailwind v4 @import + Material 3 Light/Dark CSS tokens
│   ├── icon.svg                          # StackLyra origami bird (in M3 squircle) browser favicon
│   ├── loading.tsx                       # App Router Suspense pre-hydration fallback -> WorkspaceSplash
│   ├── page.tsx                          # Home entry (defaults to dashboard)
│   ├── dashboard/page.tsx                # Dashboard view route
│   ├── invoices/page.tsx                 # Invoices workspace route
│   ├── invoices/new/page.tsx             # New invoice creation route
│   └── api/
│       ├── auth/route.ts                 # Login (Password/PIN), logout, session inspection, +12h JWT refresh
│       ├── state/route.ts                # Scoped state hydration & Super Admin / Inventory mutations + Mongo ping
│       ├── orders/route.ts               # Idempotent POS checkout API -> POSService
│       ├── invoices/route.ts             # ERP invoice lifecycle (CREATE, MARK_PAID, BULK_MARK_SENT, DUPLICATE, VOID, DELETE)
│       ├── ledger/route.ts               # Double-entry Khata vouchers, parties, and fiscal period locks
│       └── users/route.ts                # Super Admin user CRUD & Super Admin password rotation
├── core/
│   ├── audit/index.ts                    # Append-only ImmutableAuditLog helper
│   ├── auth/index.ts                     # Server-side actor resolution, RBAC assertions, client sanitization
│   ├── auth/permissions.ts               # 3-tier role hierarchy & granular permission matrix
│   ├── db/index.ts                       # ACID-style transaction wrapper (`withTransaction`) & sequential counters
│   ├── idempotency/index.ts              # Duplicate mutation protection (`IdempotencyRecord`)
│   ├── money/index.ts                    # Integer minor-unit (paisa) arithmetic & double-entry balance check
│   └── validation/index.ts               # Recursive NoSQL injection sanitizer & runtime assertions
├── modules/
│   ├── pos/pos.service.ts                # POS checkout orchestration, stock deduction, PRA & Khata posting
│   ├── accounting/accounting.service.ts  # Double-entry voucher posting, party ledgers, fiscal period locking
│   └── inventory/inventory.service.ts    # Anti-overselling atomic stock guard & catalog CRUD
├── lib/
│   ├── auth-jwt.ts                       # RFC 7519 HS256 JWT sign/verify with constant-time HMAC check
│   ├── password.ts                       # `scrypt$<salt>$<hex>` hashing & timing-safe verification
│   ├── db.ts                             # Dual persistence coordinator (MongoDB Atlas primary + JSON cache fallback)
│   ├── mongodb.ts                        # Isolated `albarka_erp` Mongo adapter, client pool cache, auto-indexing
│   ├── tax-calculator.ts                 # Dynamic PRA GST & split-payment calculator
│   ├── pra-client.ts                     # PRA e-IMS fiscal payload builder & deterministic QR URL generator
│   ├── nav.ts                            # `ERP_BRAND_CONFIG` ("StackLyra ERP") & RBAC-filtered navigation registry
│   ├── format.ts                         # Currency/date formatting helpers
│   ├── types.ts                          # Shared domain interfaces & union types
│   ├── seed-data.ts                      # Initial Super Admin bootstrap (`Saad`) & clean empty workspace defaults
│   └── mock/erp-data.ts                  # Shared ERP invoice/task/stock interfaces & empty default baselines
└── components/
    ├── AuthScreen.tsx                    # Split login view (Demo Staff PIN selector + Super Admin credentials)
    ├── DishVisual.tsx                    # Product/dish visual card helper
    ├── ReceiptModal.tsx                  # Printable thermal/PRA QR receipt preview modal
    ├── dashboard/DashboardView.tsx       # Executive KPIs, revenue telemetry, waiting tasks & stock monitor
    ├── invoices/InvoicesView.tsx         # Invoice table, filter chips, creation & status actions
    ├── shell/AlbarkaMaterial3ERP.tsx     # Main multi-module ERP shell (POS, Sales, Inventory, Ledger, HR, Settings)
    ├── shell/CommandPalette.tsx          # Global `Ctrl+K` / `Cmd+K` search across nav, products, orders & parties
    ├── shell/WorkspaceSplash.tsx         # Shared pre-hydration & session-check splash screen
    └── ui/                               # Material Design 3 primitives (`m3.tsx`, `StackLyraLogo.tsx`, `ThemeToggle.tsx`, etc.)
```

---

## 3. Core Methodologies & Security Architecture

### Zero-Trust Boundary & Request Hardening
- **Security Headers (`src/middleware.ts`):** Every response applies `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, and `X-ERP-Tenant-Boundary: TENANT_ALBARKA`. All `/api/*` routes enforce `Cache-Control: no-store, max-age=0`.
- **NoSQL Operator Sanitization (`src/core/validation/index.ts`):** Incoming JSON payloads pass through `sanitizeNoSqlPayload()`, recursively stripping keys beginning with `$` or containing `.` to neutralize MongoDB operator injection (`$gt`, `$ne`, `$where`, etc.).

### Authentication & Multi-Terminal JWT Sessions
- **Two Credential Tiers:**
  - **Owner / Super Admin (`ADMIN`, e.g., `Saad`):** Authenticates exclusively via username/email + password (`authType: "PASSWORD"`). Passwords are stored as salted `scrypt$<salt>$<hash>` strings (`src/lib/password.ts`) and can also be overridden cleanly via `ADMIN_USERNAME` / `ADMIN_PASSWORD` environment variables. Legacy 4-digit admin PINs are stripped during schema normalization (`mergeWithDefaults`).
  - **Staff Profiles (`MANAGER`, `CASHIER`):** Created by Super Admin under **Settings → Staff roles & profiles** for fast shift PIN login on POS terminals.
- **Brute-Force Protection (`src/app/api/auth/route.ts`):** Sliding-window per-IP + identifier rate limiter (`MAX_FAILED_ATTEMPTS = 8` within a `5`-minute window).
- **HTTP-Only HS256 JWT (`src/lib/auth-jwt.ts`, `src/core/auth/index.ts`):**
  - Successful authentication mints a stateless HMAC-SHA256 JWT stored in an `httpOnly`, `SameSite=Lax` cookie (`albarka_session_jwt`, `secure: true` in production) valid for 8 hours on login or 12 hours on refresh (`REFRESH_SESSION`), supporting concurrent logins across multiple terminals/browsers without single-session locking.
- **Client Sanitization (`sanitizeUserForClient`):** `passwordHash` is stripped from every response; `ADMIN` profiles and credentials are withheld when queried by non-admin viewers (`/api/state` also restricts ledger entries, supplier/staff balances, immutable audit logs, and masked MongoDB URIs by role permissions).

### 3-Tier Granular RBAC (`src/core/auth/permissions.ts`)
Authorization is enforced server-side via `assertActorPermission(db, permission)` on every API mutation—not merely hidden in the UI:

| Role | Rank | Granted Permissions |
| :--- | :--- | :--- |
| **`ADMIN` (Super Admin)** | `3` | All 13 permissions: POS create/void/discount override, inventory view/adjust/archive, invoice delete/void, accounting ledger view/post/reverse/period-close, PRA & MongoDB settings (`settings:pra:manage`), and staff user management (`users:manage`) |
| **`MANAGER`** | `2` | `pos:sale:create`, `pos:discount:override`, `inventory:view`, `inventory:adjust` |
| **`CASHIER`** | `1` | `pos:sale:create`, `inventory:view` |

### Dual Persistence & Isolated MongoDB Adapter
- **Authoritative Cloud Store (`src/lib/mongodb.ts`):** Uses a global singleton `MongoClient` pool (`__albarkaMongoClients`) to persist state across **12 collections** (`users`, `products`, `orders`, `invoices`, `parties`, `ledger_entries`, `system_settings`, `active_sessions`, `session_audit_logs`, `immutable_audit_logs`, `cashier_shifts`, `fiscal_periods`).
- **Database Isolation:** Defaults to `albarka_erp` and explicitly rejects protected cluster databases (`votix`, `admin`, `local`, `config`) via `resolveIsolatedDbName()`.
- **Auto-Indexing & Selective Sync:** Creates lookup indexes once per database (`users.username`, `users.email`, `products.code + isArchived`, `orders.createdAt`, `invoices.status + dueDate`, `ledger_entries.partyId + createdAt`) and supports partial collection writes (`MongoSyncSection[]`).
- **Resilient JSON Fallback (`src/lib/db.ts`):** When MongoDB is disabled or unreachable, state seamlessly reads from and writes to `data/albarka-db.json` locally (or `/tmp/albarka-data/albarka-db.json` on read-only serverless hosts like Vercel).

### Transactional Safety, Precision & Performance
- **Atomic Rollback Wrapper (`withTransaction` in `src/core/db/index.ts`):** Clones the database snapshot before executing domain logic; any validation failure, stock shortage, unbalanced journal, or locked period aborts the entire mutation cleanly before disk/MongoDB commit.
- **Idempotency Keys (`src/core/idempotency/index.ts`):** `POST /api/orders` and `POST /api/ledger` check `idempotencyKey` + `scope` (retaining the latest 200 locks) to prevent duplicate checkouts or ledger postings on retries.
- **Immutable Audit & Sequential Counters:** `appendAuditLog` logs the most recent 300 domain mutations alongside 30 auth `sessionAuditLogs`; `nextSequentialNumber` issues gapless tax/accounting IDs (`ALB-YYYY-XXXXXX`, `USIN-YYYY-XXXXXX`, `VCH-YYYY-XXXXXX`).
- **Frontend Performance Optimizations:**
  - Heavy sub-views (`DashboardView`, `InvoicesView`, `CommandPalette`, `ReceiptModal`, `AuthScreen`) are code-split via `next/dynamic(..., { ssr: false })`.
  - Pre-hydration startup shares a single Server/Client-compatible `WorkspaceSplash` component across `src/app/loading.tsx` and the `authChecking` bootstrap gate.
  - Inline `<script>` in `RootLayout` reads `localStorage("albarka-theme")` (`light` / `dark` / `system`) before paint to eliminate dark-mode flash (FOUC).

---

## 4. Business & Domain Logic

### POS Checkout & Atomic Inventory (`POSService` + `InventoryService`)
1. **Fiscal Lock Check:** Calls `AccountingService.assertFiscalPeriodOpen(txDb, createdAt)` to reject postings into closed `"YYYY-MM"` periods.
2. **Line-Item Snapshotting:** Captures historical `unitCostSnapshot` and `taxRateSnapshot` per item so future menu price/cost edits never alter past invoices.
3. **Anti-Overselling Stock Guard:** Two-pass validation in `InventoryService.deductStockAtomic()` verifies `stockQty >= requestedQty` across all `RETAIL` items before deducting quantities (throwing `InsufficientStockError` on shortage).
4. **Cashier Shift Tracking & Khata Credit:** Updates active `cashierShifts` cash/card sales totals in minor units (`paisa`) and automatically posts a debit voucher to `PartyAccount` when paid via `KHATA_CREDIT`.

### Double-Entry Ledger & Integer Minor-Unit Engine (`AccountingService` + `src/core/money/index.ts`)
- All monetary arithmetic in vouchers and settlement postings runs in **integer paisa** (`1 PKR = 100 paisa` via `toMinorUnits` / `fromMinorUnits`) to prevent IEEE 754 floating-point drift.
- Every POS sale and Khata voucher constructs balanced `DoubleEntryLine[]` entries (e.g., `1010-CASH-CARD-DRAWER` or `1200-AR-KHATA` vs. `4010-SALES-REVENUE` + `2210-PRA-GST-PAYABLE`) and validates `Sum(Debits) === Sum(Credits)` with `assertBalancedJournal()`.
- Vouchers and POS orders cannot post into fiscal periods marked `isLocked: true` (e.g., closed prior months).

### Dynamic PRA e-IMS Tax Engine (`src/lib/tax-calculator.ts` & `src/lib/pra-client.ts`)
- **Payment-Method Tax Rates:** Supports configurable GST rates (`cashTaxRate` default `16%`, `cardTaxRate` default `5%` for Card / JazzCash / EasyPaisa, `retailTaxRate` `18%`).
- **Split Payments:** Calculates weighted proportional tax across cash and card shares (`splitCashRatio`).
- **Item Tax Modes:** Handles `EXCLUSIVE` (tax added on top), `INCLUSIVE` (tax extracted via `Gross - Gross / (1 + r)`), and `EXEMPT` items per line, plus optional percentage service charge.
- **Fiscal Payload & QR:** Maps items into PRA e-IMS JSON (`PCTCode` `9801.2000` for restaurant / `2106.9090` for retail, `PaymentMode` `1`/`2`/`5`/`6`) and generates deterministic invoice numbers (`<POSID>-<YYMMDD>-<USIN6>`) and verification QR URLs (`e.pra.punjab.gov.pk/verify?...`).

---

## 5. Material 3 Design System (`src/app/globals.css` & `src/components/ui/`)

All UI colors and elevations bind to CSS custom properties mapped into Tailwind v4 `@theme` (with full `[data-theme="dark"]` parity):

| Token | CSS Variable | Utility Class | Usage |
| :--- | :--- | :--- | :--- |
| **Primary** | `--md-primary` (`#36618E`) | `bg-md-primary` / `text-md-on-primary` | Filled CTAs, focus rings, brand accents |
| **Primary Container** | `--md-primary-container` (`#D1E4FF`) | `bg-md-primary-container` | Extended FAB (`Create`), icon tiles, `Sent` badges |
| **Secondary Container** | `--md-secondary-container` (`#D7E3F7`) | `bg-md-secondary-container` | Active navigation pill, selected `FilterChip` & `SegmentedButton` |
| **Surface Hierarchy** | `--md-surface`, `-low`, `-lowest`, `-high` | `bg-md-surface*` | App canvas (`#F8F9FF`), `264px` nav drawer, flat `16px`-radius cards |
| **Semantic Containers** | `--md-success-container`, `--md-warning-container`, `--md-error-container` | `bg-md-*-container` | Status chips, stock progress thresholds, alerts |

Key reusable primitives in `src/components/ui/`: `Button`, `ExtendedFab`, `NavItem`, `SearchBar`, `Card`, `StatCard`, `StatusChip`, `FilterChip`, `SegmentedButton`, `OutlinedTextField`, `Switch`, `ProgressBar`, `StackLyraLogo`, and `ThemeToggle`.

---

## 6. Environment Variables & Running Locally

Create `.env.local` based on `.env.example`:

```bash
JWT_SECRET="replace_with_a_long_random_hmac_secret"
ADMIN_USERNAME="saad"
ADMIN_PASSWORD="replace_with_strong_super_admin_password"
MONGODB_URI="mongodb+srv://<user>:<password>@<cluster>.mongodb.net/albarka_erp?retryWrites=true&w=majority"
MONGODB_DB_NAME="albarka_erp"
```

### Install & Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000` (or `/dashboard`, `/invoices`, `/invoices/new`).

- **Super Admin (`ADMIN` — Saad):** Sign in via **Super Admin** mode using `ADMIN_USERNAME` / `ADMIN_PASSWORD` (or your stored DB password, rotatable anytime under Settings).
- **Staff Accounts (`PIN` mode):** Created by Super Admin under **Settings → Staff roles & profiles** (no demo accounts or default PINs ship out of the box).

### Production Build

```bash
npm run build
# If Turbopack PostCSS worker encounters an environment issue on Windows:
npx next build --webpack
```
