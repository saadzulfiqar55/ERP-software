import postgres, { Sql } from "postgres";
import type { DatabaseSchema } from "./db";
import type { TenantOrganization } from "./types";

/**
 * PostgreSQL tenant store for StackLyra ERP (Supabase Transaction Pooler `:6543`).
 *
 * Postgres is the only source of truth. Every mutation runs inside one database transaction
 * that first takes a per-tenant advisory lock, loads that tenant's state, lets the domain
 * services mutate a draft copy, and then writes back ONLY the rows that changed
 * (insert / update / delete by primary key). Concurrent requests for the same tenant are
 * serialized by the lock, so there are no lost updates and no duplicate document numbers.
 */

/** @deprecated Writes are now diff-based; sections are ignored. Kept so call sites compile. */
export type PostgresSyncSection =
  | "USERS"
  | "PRODUCTS"
  | "ORDERS"
  | "INVOICES"
  | "PARTIES"
  | "LEDGER"
  | "SETTINGS"
  | "SESSIONS"
  | "AUDIT_LOGS"
  | "IMMUTABLE_AUDIT_LOGS"
  | "CASHIER_SHIFTS"
  | "FISCAL_PERIODS"
  | "PURCHASING";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type Queryable = postgres.ISql<{}>;

declare global {
  // eslint-disable-next-line no-var
  var __stacklyraPgPool: { uri: string; sql: Sql } | undefined;
  // eslint-disable-next-line no-var
  var __stacklyraPgReady: Promise<void> | undefined;
}

export class DatabaseNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseNotConfiguredError";
  }
}

// ---------------------------------------------------------------------------
// URI helpers
// ---------------------------------------------------------------------------

export function normalizePostgresUri(uri?: string): string {
  if (!uri) return "";
  return uri.trim().replace(/^["']|["']$/g, "").trim();
}

export function hasUnreplacedPgPasswordPlaceholder(uri: string): boolean {
  return (
    uri.includes("[YOUR-DATABASE-PASSWORD]") ||
    uri.includes("<db_password>") ||
    uri.includes("<password>")
  );
}

export function isMaskedPostgresUri(uri: string): boolean {
  return uri.includes(":****@");
}

export function maskPostgresUri(uri: string): string {
  if (!uri) return "";
  return uri.replace(
    /^(postgres(?:ql)?:\/\/[^:/?#]+:)([^@/?#]+)(@)/i,
    "$1****$3"
  );
}

export function isUsablePostgresUri(uri: string): boolean {
  return (
    (uri.startsWith("postgres://") || uri.startsWith("postgresql://")) &&
    !hasUnreplacedPgPasswordPlaceholder(uri) &&
    !isMaskedPostgresUri(uri)
  );
}

/** The one and only database: `DATABASE_URL`. Throws when it is missing or a placeholder. */
export function getDatabaseUri(): string {
  const uri = normalizePostgresUri(process.env.DATABASE_URL);
  if (!uri) {
    throw new DatabaseNotConfiguredError(
      "DATABASE_URL is not set. StackLyra ERP stores all data in PostgreSQL; set DATABASE_URL to a Postgres connection string."
    );
  }
  if (!isUsablePostgresUri(uri)) {
    throw new DatabaseNotConfiguredError(
      "DATABASE_URL is not a usable postgresql:// URI (it may still contain the [YOUR-DATABASE-PASSWORD] placeholder)."
    );
  }
  return uri;
}

function getPool(): Sql {
  const uri = getDatabaseUri();
  const existing = globalThis.__stacklyraPgPool;
  if (existing && existing.uri === uri) return existing.sql;

  const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(uri);
  // `prepare: false` is required for the Supabase PgBouncer transaction pooler (port 6543).
  const sql = postgres(uri, {
    prepare: false,
    max: 10,
    // One query in flight per connection. Supabase's pooler in transaction mode (port 6543)
    // never answers queries pipelined onto one client connection outside a transaction, so
    // stacked queries hung until the function timed out. With this the driver waits for a free
    // connection (or opens one, up to `max`) instead of stacking.
    max_pipeline: 1,
    connect_timeout: 10,
    idle_timeout: 20,
    ssl: isLocal ? false : "require",
    onnotice: () => {},
  });
  globalThis.__stacklyraPgPool = { uri, sql };
  globalThis.__stacklyraPgReady = undefined;
  return sql;
}

// Postgres type OIDs used to declare parameter types up front.
const OID = { bool: 16, int4: 23, text: 25, float8: 701, textArray: 1009, jsonb: 3802 } as const;
const INT4_MIN = -2147483648;
const INT4_MAX = 2147483647;

/** Marks a value as jsonb (arrays would otherwise be sent as text[]). */
export function jsonParam(value: unknown) {
  return { __jsonb: true as const, value };
}

function isTypedParameter(v: unknown): boolean {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as { constructor?: { name?: string } }).constructor?.name === "Parameter"
  );
}

/**
 * With `prepare: false` (required by the Supabase transaction pooler) the driver needs a
 * separate round trip to ask the server for parameter types unless every parameter's type
 * is declared. Declaring them halves the latency of each query.
 * Large integers are sent as text; the SQL casts them (e.g. `$1::bigint`).
 */
function typeParam(sqlHelper: Queryable, v: unknown): unknown {
  if (isTypedParameter(v)) return v;
  if (v && typeof v === "object" && (v as { __jsonb?: boolean }).__jsonb) {
    return sqlHelper.typed((v as { value: unknown }).value as never, OID.jsonb);
  }
  if (v === null || v === undefined) return sqlHelper.typed(null as never, OID.text);
  if (typeof v === "string") return sqlHelper.typed(v as never, OID.text);
  if (typeof v === "boolean") return sqlHelper.typed(v as never, OID.bool);
  if (typeof v === "number") {
    if (Number.isInteger(v) && v >= INT4_MIN && v <= INT4_MAX) {
      return sqlHelper.typed(v as never, OID.int4);
    }
    if (Number.isInteger(v)) return sqlHelper.typed(String(v) as never, OID.text);
    return sqlHelper.typed(v as never, OID.float8);
  }
  if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
    return sqlHelper.typed(v as never, OID.textArray);
  }
  return sqlHelper.typed(v as never, OID.jsonb);
}

function run<T extends unknown[] = postgres.Row[]>(
  q: Queryable,
  text: string,
  params: unknown[] = []
) {
  const typed = params.map((p) => typeParam(q, p));
  return q.unsafe<T & postgres.Row[]>(text, typed as never[]);
}

// ---------------------------------------------------------------------------
// Schema bootstrap (Phase 3 replaces this with drizzle-kit migrations)
// ---------------------------------------------------------------------------

const SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS stacklyra_tenants (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    segment TEXT NOT NULL DEFAULT 'HYBRID',
    invoice_prefix TEXT NOT NULL DEFAULT 'SL',
    owner_user_id TEXT NOT NULL,
    owner_email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'TRIALING',
    plan_id TEXT NOT NULL DEFAULT 'growth',
    subscription JSONB NOT NULL,
    pra_config JSONB NOT NULL,
    restaurant_tables JSONB NOT NULL DEFAULT '[]'::jsonb,
    servers JSONB NOT NULL DEFAULT '[]'::jsonb,
    stock_monitor JSONB NOT NULL DEFAULT '[]'::jsonb,
    waiting_tasks JSONB NOT NULL DEFAULT '[]'::jsonb,
    session_audit_logs JSONB NOT NULL DEFAULT '[]'::jsonb,
    idempotency_records JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS stacklyra_users (
    tenant_id TEXT NOT NULL,
    id TEXT NOT NULL,
    branch_id TEXT NOT NULL DEFAULT 'BRANCH_MAIN',
    payload JSONB NOT NULL,
    username TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (tenant_id, id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_stacklyra_users_id ON stacklyra_users (id)`,
  `CREATE INDEX IF NOT EXISTS idx_stacklyra_users_username ON stacklyra_users (lower(username))`,
  `CREATE INDEX IF NOT EXISTS idx_stacklyra_users_email ON stacklyra_users (lower(email))`,
  `CREATE TABLE IF NOT EXISTS stacklyra_products (
    tenant_id TEXT NOT NULL,
    id TEXT NOT NULL,
    code TEXT NOT NULL,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    payload JSONB NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (tenant_id, id)
  )`,
  `CREATE TABLE IF NOT EXISTS stacklyra_orders (
    tenant_id TEXT NOT NULL,
    id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    invoice_number TEXT NOT NULL,
    payload JSONB NOT NULL,
    PRIMARY KEY (tenant_id, id)
  )`,
  `CREATE TABLE IF NOT EXISTS stacklyra_invoices (
    tenant_id TEXT NOT NULL,
    id TEXT NOT NULL,
    status TEXT NOT NULL,
    due_date TEXT NOT NULL,
    payload JSONB NOT NULL,
    PRIMARY KEY (tenant_id, id)
  )`,
  `CREATE TABLE IF NOT EXISTS stacklyra_parties (
    tenant_id TEXT NOT NULL,
    id TEXT NOT NULL,
    party_type TEXT NOT NULL,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    payload JSONB NOT NULL,
    PRIMARY KEY (tenant_id, id)
  )`,
  `CREATE TABLE IF NOT EXISTS stacklyra_ledger_entries (
    tenant_id TEXT NOT NULL,
    id TEXT NOT NULL,
    party_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    payload JSONB NOT NULL,
    PRIMARY KEY (tenant_id, id)
  )`,
  `CREATE TABLE IF NOT EXISTS stacklyra_document_counters (
    tenant_id TEXT NOT NULL,
    key TEXT NOT NULL,
    seq INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (tenant_id, key)
  )`,
  `CREATE TABLE IF NOT EXISTS stacklyra_cashier_shifts (
    tenant_id TEXT NOT NULL,
    id TEXT NOT NULL,
    opened_at TEXT NOT NULL,
    payload JSONB NOT NULL,
    PRIMARY KEY (tenant_id, id)
  )`,
  `CREATE TABLE IF NOT EXISTS stacklyra_fiscal_periods (
    tenant_id TEXT NOT NULL,
    period_key TEXT NOT NULL,
    payload JSONB NOT NULL,
    PRIMARY KEY (tenant_id, period_key)
  )`,
  `CREATE TABLE IF NOT EXISTS stacklyra_immutable_audit_logs (
    tenant_id TEXT NOT NULL,
    id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    payload JSONB NOT NULL,
    PRIMARY KEY (tenant_id, id)
  )`,

  // ---- Phase 2: journals, idempotency, summaries, immutability -------------------------

  // 1. Repair payloads double-encoded by the pre-Phase-1 adapter (stored as a jsonb string).
  ...[
    "stacklyra_users",
    "stacklyra_products",
    "stacklyra_orders",
    "stacklyra_invoices",
    "stacklyra_parties",
    "stacklyra_ledger_entries",
    "stacklyra_cashier_shifts",
    "stacklyra_fiscal_periods",
    "stacklyra_immutable_audit_logs",
  ].map(
    (t) =>
      `UPDATE ${t} SET payload = (payload #>> '{}')::jsonb WHERE jsonb_typeof(payload) = 'string'`
  ),
  ...[
    "subscription",
    "pra_config",
    "restaurant_tables",
    "servers",
    "stock_monitor",
    "waiting_tasks",
    "session_audit_logs",
    "idempotency_records",
  ].map(
    (c) =>
      `UPDATE stacklyra_tenants SET ${c} = (${c} #>> '{}')::jsonb WHERE jsonb_typeof(${c}) = 'string'`
  ),

  // 2. Real columns for totals and lookups, back-filled from payloads.
  `ALTER TABLE stacklyra_orders ADD COLUMN IF NOT EXISTS grand_total_minor BIGINT`,
  `ALTER TABLE stacklyra_orders ADD COLUMN IF NOT EXISTS tax_minor BIGINT`,
  `ALTER TABLE stacklyra_orders ADD COLUMN IF NOT EXISTS payment_method TEXT`,
  `UPDATE stacklyra_orders SET
     grand_total_minor = COALESCE(
       (payload->'taxBreakdown'->>'grandTotalMinor')::numeric,
       round(COALESCE((payload->'taxBreakdown'->>'grandTotal')::numeric, 0) * 100)
     )::bigint,
     tax_minor = round(COALESCE((payload->'taxBreakdown'->>'totalSalesTax')::numeric, 0) * 100)::bigint,
     payment_method = COALESCE(payload->>'paymentMethod', '')
   WHERE grand_total_minor IS NULL`,
  `ALTER TABLE stacklyra_ledger_entries ADD COLUMN IF NOT EXISTS debit_minor BIGINT`,
  `ALTER TABLE stacklyra_ledger_entries ADD COLUMN IF NOT EXISTS credit_minor BIGINT`,
  `ALTER TABLE stacklyra_ledger_entries ADD COLUMN IF NOT EXISTS voucher_no TEXT`,

  // 3. Indexes for paging and search.
  `CREATE INDEX IF NOT EXISTS idx_sl_orders_tenant_created ON stacklyra_orders (tenant_id, created_at DESC, id DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_sl_orders_tenant_invoice ON stacklyra_orders (tenant_id, lower(invoice_number))`,
  `CREATE INDEX IF NOT EXISTS idx_sl_ledger_tenant_created ON stacklyra_ledger_entries (tenant_id, created_at DESC, id DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_sl_ledger_tenant_party ON stacklyra_ledger_entries (tenant_id, party_id, created_at DESC, id DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_sl_audit_tenant_ts ON stacklyra_immutable_audit_logs (tenant_id, timestamp DESC, id DESC)`,

  // 4. Session audit log and idempotency move out of JSON columns into tables.
  `CREATE TABLE IF NOT EXISTS stacklyra_session_audit_logs (
    tenant_id TEXT NOT NULL,
    id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    payload JSONB NOT NULL,
    PRIMARY KEY (tenant_id, id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sl_session_audit_tenant_ts ON stacklyra_session_audit_logs (tenant_id, timestamp DESC, id DESC)`,
  `CREATE TABLE IF NOT EXISTS stacklyra_idempotency (
    tenant_id TEXT NOT NULL,
    scope TEXT NOT NULL,
    key TEXT NOT NULL,
    response_status INTEGER NOT NULL,
    response_body JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, scope, key)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sl_idempotency_created ON stacklyra_idempotency (created_at)`,
  `INSERT INTO stacklyra_session_audit_logs (tenant_id, id, timestamp, payload)
   SELECT t.id, e->>'id', COALESCE(e->>'timestamp', ''), e
     FROM stacklyra_tenants t,
          jsonb_array_elements(CASE WHEN jsonb_typeof(t.session_audit_logs) = 'array'
                                    THEN t.session_audit_logs ELSE '[]'::jsonb END) e
    WHERE e->>'id' IS NOT NULL
   ON CONFLICT DO NOTHING`,
  `UPDATE stacklyra_tenants SET session_audit_logs = '[]'::jsonb WHERE session_audit_logs <> '[]'::jsonb`,
  `INSERT INTO stacklyra_idempotency (tenant_id, scope, key, response_status, response_body, created_at)
   SELECT t.id, e->>'scope', e->>'key', COALESCE((e->>'responseStatus')::int, 200),
          jsonb_build_object('body', COALESCE(e->'responseBody', 'null'::jsonb)),
          COALESCE(NULLIF(e->>'createdAt', '')::timestamptz, now())
     FROM stacklyra_tenants t,
          jsonb_array_elements(CASE WHEN jsonb_typeof(t.idempotency_records) = 'array'
                                    THEN t.idempotency_records ELSE '[]'::jsonb END) e
    WHERE e->>'key' IS NOT NULL AND e->>'scope' IS NOT NULL
   ON CONFLICT DO NOTHING`,
  `UPDATE stacklyra_tenants SET idempotency_records = '[]'::jsonb WHERE idempotency_records <> '[]'::jsonb`,

  // 5. Append-only enforcement in the database itself (error code SL001).
  `CREATE OR REPLACE FUNCTION stacklyra_audit_append_only() RETURNS trigger AS $fn$
   BEGIN
     IF TG_OP = 'UPDATE' AND jsonb_typeof(OLD.payload) = 'string' THEN
       RETURN NEW; -- one-time repair of double-encoded payloads
     END IF;
     RAISE EXCEPTION 'Audit log entries are append-only (attempted %).', TG_OP
       USING ERRCODE = 'SL001';
   END
   $fn$ LANGUAGE plpgsql`,
  `CREATE OR REPLACE TRIGGER trg_sl_audit_append_only
     BEFORE UPDATE OR DELETE ON stacklyra_immutable_audit_logs
     FOR EACH ROW EXECUTE FUNCTION stacklyra_audit_append_only()`,
  `CREATE OR REPLACE FUNCTION stacklyra_ledger_append_only() RETURNS trigger AS $fn$
   DECLARE
     reversal_keys text[] := ARRAY['isReversed', 'reversedByEntryId', 'reversedByVoucherNo', 'reversedAt', 'tenantId'];
   BEGIN
     IF TG_OP = 'DELETE' THEN
       RAISE EXCEPTION 'Ledger entries cannot be deleted; post a reversal instead.'
         USING ERRCODE = 'SL001';
     END IF;
     IF jsonb_typeof(OLD.payload) = 'string' THEN
       RETURN NEW; -- one-time repair of double-encoded payloads
     END IF;
     IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
        OR NEW.id IS DISTINCT FROM OLD.id
        OR NEW.party_id IS DISTINCT FROM OLD.party_id
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR (OLD.debit_minor IS NOT NULL AND NEW.debit_minor IS DISTINCT FROM OLD.debit_minor)
        OR (OLD.credit_minor IS NOT NULL AND NEW.credit_minor IS DISTINCT FROM OLD.credit_minor)
        OR (OLD.payload - reversal_keys) IS DISTINCT FROM (NEW.payload - reversal_keys) THEN
       RAISE EXCEPTION 'Posted ledger entries cannot be edited; post a reversal and a correcting voucher instead.'
         USING ERRCODE = 'SL001';
     END IF;
     RETURN NEW;
   END
   $fn$ LANGUAGE plpgsql`,
  `CREATE OR REPLACE TRIGGER trg_sl_ledger_append_only
     BEFORE UPDATE OR DELETE ON stacklyra_ledger_entries
     FOR EACH ROW EXECUTE FUNCTION stacklyra_ledger_append_only()`,
  // ---- v3: purchasing ---------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS stacklyra_purchase_orders (
    tenant_id TEXT NOT NULL,
    id TEXT NOT NULL,
    po_number TEXT NOT NULL,
    supplier_id TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    payload JSONB NOT NULL,
    PRIMARY KEY (tenant_id, id)
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_sl_po_number ON stacklyra_purchase_orders (tenant_id, po_number)`,
  `CREATE INDEX IF NOT EXISTS ix_sl_po_status ON stacklyra_purchase_orders (tenant_id, status, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS stacklyra_goods_receipts (
    tenant_id TEXT NOT NULL,
    id TEXT NOT NULL,
    grn_number TEXT NOT NULL,
    po_id TEXT NOT NULL,
    supplier_id TEXT NOT NULL,
    received_at TEXT NOT NULL,
    total_minor BIGINT NOT NULL,
    payload JSONB NOT NULL,
    PRIMARY KEY (tenant_id, id)
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_sl_grn_number ON stacklyra_goods_receipts (tenant_id, grn_number)`,
  `CREATE INDEX IF NOT EXISTS ix_sl_grn_received ON stacklyra_goods_receipts (tenant_id, received_at DESC, id DESC)`,
  `CREATE OR REPLACE FUNCTION stacklyra_grn_append_only() RETURNS trigger AS $fn$
   BEGIN
     RAISE EXCEPTION 'Goods receipts cannot be edited or deleted; record a return instead.'
       USING ERRCODE = 'SL001';
   END
   $fn$ LANGUAGE plpgsql`,
  `CREATE OR REPLACE TRIGGER trg_sl_grn_append_only
     BEFORE UPDATE OR DELETE ON stacklyra_goods_receipts
     FOR EACH ROW EXECUTE FUNCTION stacklyra_grn_append_only()`,
  // Back-fill ledger amount columns (allowed by the trigger while the columns are still NULL).
  `UPDATE stacklyra_ledger_entries SET
     debit_minor = COALESCE((payload->>'debitMinor')::numeric, round(COALESCE((payload->>'debit')::numeric, 0) * 100))::bigint,
     credit_minor = COALESCE((payload->>'creditMinor')::numeric, round(COALESCE((payload->>'credit')::numeric, 0) * 100))::bigint,
     voucher_no = COALESCE(payload->>'voucherNo', '')
   WHERE debit_minor IS NULL`,
];

/**
 * Bump when SCHEMA_DDL changes. A cold start only reads this number (one query); the DDL,
 * one-time repairs and back-fills run once per version, not on every server instance.
 */
export const SCHEMA_VERSION = 3;

async function readSchemaVersion(q: Queryable): Promise<number> {
  try {
    const rows = await run(
      q,
      `SELECT version FROM stacklyra_schema_meta WHERE key = 'schema' LIMIT 1`
    );
    return rows[0] ? Number(rows[0].version) : 0;
  } catch (err) {
    if ((err as { code?: string })?.code === "42P01") return 0; // table not created yet
    throw err;
  }
}

/**
 * Returns a ready connection pool. The first call per process checks the schema version
 * (one query) and only when it is behind runs SCHEMA_DDL inside a transaction holding a
 * global advisory lock, with lock/statement timeouts so it can never hang a request.
 * `onFirstReady` (seeding the flagship tenant) also runs once per process.
 */
export async function getReadySql(
  onFirstReady?: (sql: Sql) => Promise<void>
): Promise<Sql> {
  const sql = getPool();
  if (!globalThis.__stacklyraPgReady) {
    globalThis.__stacklyraPgReady = (async () => {
      if ((await readSchemaVersion(sql)) < SCHEMA_VERSION) {
        const started = Date.now();
        await sql.begin(async (tx) => {
          await run(tx, `SET LOCAL lock_timeout = '10s'`);
          await run(tx, `SET LOCAL statement_timeout = '120s'`);
          await run(tx, `SELECT pg_advisory_xact_lock(hashtextextended('stacklyra:schema', 0))`);
          await run(
            tx,
            `CREATE TABLE IF NOT EXISTS stacklyra_schema_meta (
               key TEXT PRIMARY KEY,
               version INTEGER NOT NULL,
               updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
             )`
          );
          // Another instance may have upgraded while we waited for the lock.
          if ((await readSchemaVersion(tx)) >= SCHEMA_VERSION) return;
          for (const ddl of SCHEMA_DDL) {
            await run(tx, ddl);
          }
          await run(
            tx,
            `INSERT INTO stacklyra_schema_meta (key, version) VALUES ('schema', $1::integer)
             ON CONFLICT (key) DO UPDATE SET version = EXCLUDED.version, updated_at = now()`,
            [SCHEMA_VERSION]
          );
        });
        console.info(`[db] schema checked/upgraded to v${SCHEMA_VERSION} in ${Date.now() - started} ms`);
      }
      if (onFirstReady) await onFirstReady(sql);
    })().catch((err) => {
      globalThis.__stacklyraPgReady = undefined;
      throw err;
    });
  }
  await globalThis.__stacklyraPgReady;
  return sql;
}

// ---------------------------------------------------------------------------
// Locking
// ---------------------------------------------------------------------------

/**
 * Takes the per-tenant write lock for the rest of the current transaction and sets the
 * timeouts and tenant RLS context. Both statements are pipelined: one network round trip.
 * The settings statement is sent first, so lock_timeout applies to the lock wait.
 */
export async function lockTenant(tx: Queryable, tenantId: string): Promise<void> {
  await Promise.all([
    run(
      tx,
      `SELECT set_config('lock_timeout', '15s', true),
              set_config('statement_timeout', '30s', true),
              set_config('app.current_tenant', $1, true)`,
      [tenantId]
    ),
    run(tx, `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
      `stacklyra:tenant:${tenantId}`,
    ]),
  ]);
}

// ---------------------------------------------------------------------------
// Collection mapping
// ---------------------------------------------------------------------------

type Doc = Record<string, unknown>;

interface ColumnSpec {
  name: string;
  cast: string;
  value: (doc: Doc, now: string) => unknown;
}

interface CollectionSpec {
  field: keyof DatabaseSchema;
  table: string;
  idColumn: string;
  idOf: (doc: Doc) => string;
  columns: ColumnSpec[];
  hasPayload: boolean;
  orderBy?: string;
  /**
   * Append-only journal (orders, ledger, audit logs). Journals are never loaded in full:
   * reads get the newest `recent` rows, and a write transaction starts with an EMPTY list,
   * so anything a service adds is inserted and nothing is ever deleted. Individual rows can
   * be pulled into a transaction with `loadJournalRows` when a service must update one.
   */
  journal?: { recent: number };
}

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));

function minorOf(minor: unknown, major: unknown): number {
  const m = Number(minor);
  if (Number.isFinite(m) && minor !== undefined && minor !== null && minor !== "") {
    return Math.round(m);
  }
  const v = Number(major);
  return Number.isFinite(v) ? Math.round(v * 100) : 0;
}

function orderGrandTotalMinor(d: Doc): number {
  const tb = (d.taxBreakdown || {}) as Doc;
  return minorOf(tb.grandTotalMinor, tb.grandTotal);
}

function orderTaxMinor(d: Doc): number {
  const tb = (d.taxBreakdown || {}) as Doc;
  return minorOf(undefined, tb.totalSalesTax);
}

/**
 * The postgres driver JSON-encodes jsonb parameters itself, so values must be passed as
 * objects. Rows written by the previous adapter passed `JSON.stringify(...)` and were stored
 * double-encoded (a jsonb string); decode those transparently on read.
 */
function decodeJson<T = unknown>(value: unknown): T {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as T;
    }
  }
  return value as T;
}

const COLLECTIONS: CollectionSpec[] = [
  {
    field: "users",
    table: "stacklyra_users",
    idColumn: "id",
    idOf: (d) => str(d.id),
    hasPayload: true,
    columns: [
      { name: "branch_id", cast: "text", value: (d) => str(d.branchId) || "BRANCH_MAIN" },
      {
        name: "username",
        cast: "text",
        value: (d) => (str(d.username) || str(d.email).split("@")[0]).toLowerCase(),
      },
      { name: "email", cast: "text", value: (d) => str(d.email).toLowerCase() },
      { name: "role", cast: "text", value: (d) => str(d.role) },
      { name: "updated_at", cast: "text", value: (_d, now) => now },
    ],
  },
  {
    field: "products",
    table: "stacklyra_products",
    idColumn: "id",
    idOf: (d) => str(d.id),
    hasPayload: true,
    columns: [
      { name: "code", cast: "text", value: (d) => str(d.code) },
      { name: "is_archived", cast: "boolean", value: (d) => Boolean(d.isArchived) },
      { name: "updated_at", cast: "text", value: (_d, now) => now },
    ],
  },
  {
    field: "orders",
    table: "stacklyra_orders",
    idColumn: "id",
    idOf: (d) => str(d.id),
    hasPayload: true,
    orderBy: "created_at DESC",
    journal: { recent: 50 },
    columns: [
      { name: "created_at", cast: "text", value: (d) => str(d.createdAt) },
      { name: "invoice_number", cast: "text", value: (d) => str(d.invoiceNumber) },
      { name: "grand_total_minor", cast: "bigint", value: (d) => orderGrandTotalMinor(d) },
      { name: "tax_minor", cast: "bigint", value: (d) => orderTaxMinor(d) },
      { name: "payment_method", cast: "text", value: (d) => str(d.paymentMethod) },
    ],
  },
  {
    field: "erpInvoices",
    table: "stacklyra_invoices",
    idColumn: "id",
    idOf: (d) => str(d.id),
    hasPayload: true,
    columns: [
      { name: "status", cast: "text", value: (d) => str(d.status) },
      { name: "due_date", cast: "text", value: (d) => str(d.dueDate) },
    ],
  },
  {
    field: "parties",
    table: "stacklyra_parties",
    idColumn: "id",
    idOf: (d) => str(d.id),
    hasPayload: true,
    columns: [
      { name: "party_type", cast: "text", value: (d) => str(d.type) },
      { name: "is_archived", cast: "boolean", value: (d) => Boolean(d.isArchived) },
    ],
  },
  {
    field: "ledger",
    table: "stacklyra_ledger_entries",
    idColumn: "id",
    idOf: (d) => str(d.id),
    hasPayload: true,
    orderBy: "created_at DESC",
    journal: { recent: 100 },
    columns: [
      { name: "party_id", cast: "text", value: (d) => str(d.partyId) },
      { name: "created_at", cast: "text", value: (d) => str(d.createdAt) },
      { name: "debit_minor", cast: "bigint", value: (d) => minorOf(d.debitMinor, d.debit) },
      { name: "credit_minor", cast: "bigint", value: (d) => minorOf(d.creditMinor, d.credit) },
      { name: "voucher_no", cast: "text", value: (d) => str(d.voucherNo) },
    ],
  },
  {
    field: "documentCounters",
    table: "stacklyra_document_counters",
    idColumn: "key",
    idOf: (d) => str(d.key),
    hasPayload: false,
    columns: [{ name: "seq", cast: "integer", value: (d) => Number(d.seq) || 0 }],
  },
  {
    field: "cashierShifts",
    table: "stacklyra_cashier_shifts",
    idColumn: "id",
    idOf: (d) => str(d.id),
    hasPayload: true,
    orderBy: "opened_at DESC",
    columns: [{ name: "opened_at", cast: "text", value: (d) => str(d.openedAt) }],
  },
  {
    field: "fiscalPeriods",
    table: "stacklyra_fiscal_periods",
    idColumn: "period_key",
    idOf: (d) => str(d.periodKey),
    hasPayload: true,
    columns: [],
  },
  {
    field: "immutableAuditLogs",
    table: "stacklyra_immutable_audit_logs",
    idColumn: "id",
    idOf: (d) => str(d.id),
    hasPayload: true,
    orderBy: "timestamp DESC",
    journal: { recent: 100 },
    columns: [{ name: "timestamp", cast: "text", value: (d) => str(d.timestamp) }],
  },
  {
    field: "purchaseOrders",
    table: "stacklyra_purchase_orders",
    idColumn: "id",
    idOf: (d) => str(d.id),
    hasPayload: true,
    orderBy: "created_at DESC",
    columns: [
      { name: "po_number", cast: "text", value: (d) => str(d.poNumber) },
      { name: "supplier_id", cast: "text", value: (d) => str(d.supplierId) },
      { name: "status", cast: "text", value: (d) => str(d.status) },
      { name: "created_at", cast: "text", value: (d) => str(d.createdAt) },
    ],
  },
  {
    field: "goodsReceipts",
    table: "stacklyra_goods_receipts",
    idColumn: "id",
    idOf: (d) => str(d.id),
    hasPayload: true,
    orderBy: "received_at DESC",
    journal: { recent: 50 },
    columns: [
      { name: "grn_number", cast: "text", value: (d) => str(d.grnNumber) },
      { name: "po_id", cast: "text", value: (d) => str(d.poId) },
      { name: "supplier_id", cast: "text", value: (d) => str(d.supplierId) },
      { name: "received_at", cast: "text", value: (d) => str(d.receivedAt) },
      { name: "total_minor", cast: "bigint", value: (d) => Math.round(Number(d.totalMinor) || 0) },
    ],
  },
  {
    field: "sessionAuditLogs",
    table: "stacklyra_session_audit_logs",
    idColumn: "id",
    idOf: (d) => str(d.id),
    hasPayload: true,
    orderBy: "timestamp DESC",
    journal: { recent: 30 },
    columns: [{ name: "timestamp", cast: "text", value: (d) => str(d.timestamp) }],
  },
];

export type JournalField =
  | "orders"
  | "ledger"
  | "immutableAuditLogs"
  | "sessionAuditLogs"
  | "goodsReceipts";

// Tenant-row fields stored as JSONB columns on stacklyra_tenants.
const TENANT_JSON_FIELDS: Array<[keyof DatabaseSchema, string]> = [
  ["praConfig", "pra_config"],
  ["restaurantTables", "restaurant_tables"],
  ["servers", "servers"],
  ["stockMonitor", "stock_monitor"],
  ["waitingTasks", "waiting_tasks"],
];

// ---------------------------------------------------------------------------
// Tenants (registry)
// ---------------------------------------------------------------------------

function rowToTenant(row: postgres.Row): TenantOrganization {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    segment: row.segment,
    invoicePrefix: String(row.invoice_prefix),
    ownerUserId: String(row.owner_user_id),
    ownerEmail: String(row.owner_email),
    status: row.status,
    planId: row.plan_id,
    subscription: decodeJson(row.subscription),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

const TENANT_COLUMNS = `id, slug, name, segment, invoice_prefix, owner_user_id, owner_email,
  status, plan_id, subscription, created_at, updated_at`;

export async function listTenantRows(q: Queryable): Promise<TenantOrganization[]> {
  const rows = await run(
    q,
    `SELECT ${TENANT_COLUMNS} FROM stacklyra_tenants ORDER BY created_at ASC, id ASC`
  );
  return rows.map(rowToTenant);
}

/** Exact, case-insensitive match on id or slug. Never falls back to another tenant. */
export async function findTenantRow(
  q: Queryable,
  idOrSlug: string
): Promise<TenantOrganization | null> {
  const clean = idOrSlug.trim().toLowerCase();
  if (!clean) return null;
  const rows = await run(
    q,
    `SELECT ${TENANT_COLUMNS} FROM stacklyra_tenants
     WHERE lower(id) = $1 OR lower(slug) = $1
     ORDER BY (lower(id) = $1) DESC LIMIT 1`,
    [clean]
  );
  return rows[0] ? rowToTenant(rows[0]) : null;
}

/** Returns the tenant ids that contain a user matching the given id or username/email. */
export async function findTenantIdsForUser(
  q: Queryable,
  params: { tenantIdOrSlug?: string; userId?: string; identifier?: string }
): Promise<string[]> {
  // Workspace (id or slug) and user are resolved in one query.
  const rows = await run(
    q,
    `SELECT u.tenant_id
       FROM stacklyra_users u
       JOIN stacklyra_tenants t ON t.id = u.tenant_id
      WHERE ($1::text IS NULL OR lower(t.id) = $1 OR lower(t.slug) = $1)
        AND (
          ($2::text IS NOT NULL AND u.id = $2)
          OR ($3::text IS NOT NULL AND (lower(u.username) = $3 OR lower(u.email) = $3))
        )
      ORDER BY t.created_at ASC
      LIMIT 20`,
    [
      params.tenantIdOrSlug ? params.tenantIdOrSlug.trim().toLowerCase() : null,
      params.userId ?? null,
      params.identifier ? params.identifier.trim().toLowerCase() : null,
    ]
  );
  return Array.from(new Set(rows.map((r) => String(r.tenant_id))));
}

/** One user's stored profile, or null. */
export async function findUserRow(
  q: Queryable,
  tenantId: string,
  userId: string
): Promise<Doc | null> {
  const rows = await run(
    q,
    `SELECT payload FROM stacklyra_users WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
    [tenantId, userId]
  );
  return rows[0] ? decodeJson<Doc>(rows[0].payload) : null;
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

/**
 * Loads a tenant's stored state, or null when the tenant row does not exist.
 * - `read`: working set plus the newest rows of each journal (for responses).
 * - `write`: working set only; journals start empty (see CollectionSpec.journal).
 */
export async function loadTenantState(
  q: Queryable,
  tenantId: string,
  mode: "read" | "write" = "read",
  /** Load only these collections (others come back empty), e.g. ["users"] for sign-in. */
  only?: Array<keyof DatabaseSchema>
): Promise<(Partial<DatabaseSchema> & { tenant: TenantOrganization }) | null> {
  // All queries are issued together: on a transaction they are pipelined over one
  // connection, on the pool they run in parallel — one round trip either way.
  const [tenantRows, ...collectionRows] = await Promise.all([
    run(q, `SELECT * FROM stacklyra_tenants WHERE id = $1 LIMIT 1`, [tenantId]),
    ...COLLECTIONS.map((spec) => {
      if (spec.journal && mode === "write") return Promise.resolve([] as postgres.Row[]);
      if (only && !only.includes(spec.field)) return Promise.resolve([] as postgres.Row[]);
      const select = spec.hasPayload
        ? `payload`
        : `${spec.idColumn} AS __id, ${spec.columns.map((c) => c.name).join(", ")}`;
      const order = spec.orderBy ? ` ORDER BY ${spec.orderBy}, ${spec.idColumn} DESC` : "";
      const limit = spec.journal ? ` LIMIT ${spec.journal.recent}` : "";
      return run(
        q,
        `SELECT ${select} FROM ${spec.table} WHERE tenant_id = $1${order}${limit}`,
        [tenantId]
      );
    }),
  ]);
  if (tenantRows.length === 0) return null;
  const tRow = tenantRows[0];

  const state: Partial<DatabaseSchema> & { tenant: TenantOrganization } = {
    tenant: rowToTenant(tRow),
  };
  const writable = state as Record<string, unknown>;

  for (const [field, column] of TENANT_JSON_FIELDS) {
    writable[field] = decodeJson(tRow[column]) ?? (field === "praConfig" ? undefined : []);
  }

  COLLECTIONS.forEach((spec, i) => {
    const rows = collectionRows[i];
    if (spec.field === "documentCounters") {
      writable[spec.field] = rows.map((r) => ({
        tenantId,
        key: String(r.__id),
        seq: Number(r.seq),
      }));
    } else {
      writable[spec.field] = rows.map((r) => decodeJson(r.payload));
    }
  });
  // Idempotency records live in stacklyra_idempotency and are queried by key.
  writable.idempotencyRecords = [];

  return state;
}

/** Loads specific journal rows by id (e.g. the ledger entry a reversal must mark). */
export async function loadJournalRows(
  q: Queryable,
  tenantId: string,
  field: JournalField,
  ids: string[]
): Promise<Doc[]> {
  const spec = COLLECTIONS.find((c) => c.field === field);
  if (!spec || !spec.journal || ids.length === 0) return [];
  const rows = await run(
    q,
    `SELECT payload FROM ${spec.table} WHERE tenant_id = $1 AND ${spec.idColumn} = ANY($2::text[])`,
    [tenantId, ids]
  );
  return rows.map((r) => decodeJson<Doc>(r.payload));
}

// ---------------------------------------------------------------------------
// Save (diff)
// ---------------------------------------------------------------------------

export interface TenantWriteStats {
  upserted: number;
  deleted: number;
  tenantRowWritten: boolean;
}

function asDocs(value: unknown): Doc[] {
  return Array.isArray(value) ? (value as Doc[]) : [];
}

function tenantRowSignature(state: DatabaseSchema): string {
  return JSON.stringify([
    state.tenant,
    ...TENANT_JSON_FIELDS.map(([field]) => state[field] ?? null),
  ]);
}

async function upsertTenantRow(tx: Queryable, state: DatabaseSchema, now: string) {
  const t = state.tenant;
  const json = (field: keyof DatabaseSchema, fallback: unknown) =>
    state[field] ?? fallback;
  await run(
    tx,
    `INSERT INTO stacklyra_tenants (
       id, slug, name, segment, invoice_prefix, owner_user_id, owner_email,
       status, plan_id, subscription, pra_config, restaurant_tables, servers,
       stock_monitor, waiting_tasks, session_audit_logs, idempotency_records,
       created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9,
       $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb, $16::jsonb, $17::jsonb,
       $18, $19
     )
     ON CONFLICT (id) DO UPDATE SET
       slug = EXCLUDED.slug, name = EXCLUDED.name, segment = EXCLUDED.segment,
       invoice_prefix = EXCLUDED.invoice_prefix, owner_user_id = EXCLUDED.owner_user_id,
       owner_email = EXCLUDED.owner_email, status = EXCLUDED.status, plan_id = EXCLUDED.plan_id,
       subscription = EXCLUDED.subscription, pra_config = EXCLUDED.pra_config,
       restaurant_tables = EXCLUDED.restaurant_tables, servers = EXCLUDED.servers,
       stock_monitor = EXCLUDED.stock_monitor, waiting_tasks = EXCLUDED.waiting_tasks,
       session_audit_logs = EXCLUDED.session_audit_logs,
       idempotency_records = EXCLUDED.idempotency_records,
       updated_at = EXCLUDED.updated_at`,
    [
      t.id,
      t.slug,
      t.name,
      t.segment,
      t.invoicePrefix,
      t.ownerUserId,
      t.ownerEmail,
      t.status,
      t.planId,
      jsonParam(t.subscription),
      jsonParam(json("praConfig", {})),
      jsonParam(json("restaurantTables", [])),
      jsonParam(json("servers", [])),
      jsonParam(json("stockMonitor", [])),
      jsonParam(json("waitingTasks", [])),
      jsonParam([]), // session_audit_logs: moved to stacklyra_session_audit_logs
      jsonParam([]), // idempotency_records: moved to stacklyra_idempotency
      t.createdAt || now,
      now,
    ]
  );
}

async function upsertDoc(
  tx: Queryable,
  spec: CollectionSpec,
  tenantId: string,
  doc: Doc,
  now: string
) {
  const names = ["tenant_id", spec.idColumn, ...spec.columns.map((c) => c.name)];
  const values: unknown[] = [tenantId, spec.idOf(doc), ...spec.columns.map((c) => c.value(doc, now))];
  const casts = ["text", "text", ...spec.columns.map((c) => c.cast)];
  if (spec.hasPayload) {
    names.push("payload");
    values.push(jsonParam({ ...doc, tenantId }));
    casts.push("jsonb");
  }
  const placeholders = values.map((_v, i) => `$${i + 1}::${casts[i]}`);
  const updates = names
    .slice(2)
    .map((n) => `${n} = EXCLUDED.${n}`)
    .join(", ");
  await run(
    tx,
    `INSERT INTO ${spec.table} (${names.join(", ")})
     VALUES (${placeholders.join(", ")})
     ON CONFLICT (tenant_id, ${spec.idColumn}) DO ${updates ? `UPDATE SET ${updates}` : "NOTHING"}`,
    values
  );
}

/**
 * Writes the difference between `before` (what was loaded under the lock, or null for a
 * brand-new tenant) and `after`. Must run inside the transaction that holds the tenant lock.
 */
export async function saveTenantDiff(
  tx: Queryable,
  before: DatabaseSchema | null,
  after: DatabaseSchema
): Promise<TenantWriteStats> {
  const tenantId = after.tenant.id;
  const now = new Date().toISOString();
  const stats: TenantWriteStats = { upserted: 0, deleted: 0, tenantRowWritten: false };

  // Writes are collected and sent together (pipelined on the transaction's connection):
  // one round trip for the whole save instead of one per row.
  const writes: Array<Promise<unknown>> = [];

  if (!before || tenantRowSignature(before) !== tenantRowSignature(after)) {
    writes.push(upsertTenantRow(tx, after, now));
    stats.tenantRowWritten = true;
  }

  for (const spec of COLLECTIONS) {
    const beforeDocs = before ? asDocs(before[spec.field]) : [];
    const afterDocs = asDocs(after[spec.field]);

    const beforeById = new Map<string, string>();
    for (const d of beforeDocs) beforeById.set(spec.idOf(d), JSON.stringify(d));

    const seen = new Set<string>();
    for (const doc of afterDocs) {
      const id = spec.idOf(doc);
      if (!id) {
        throw new Error(`Refusing to save a ${spec.table} row without an id.`);
      }
      if (seen.has(id)) {
        throw new Error(`Refusing to save duplicate ${spec.table} id "${id}".`);
      }
      seen.add(id);
      if (beforeById.get(id) !== JSON.stringify(doc)) {
        writes.push(upsertDoc(tx, spec, tenantId, doc, now));
        stats.upserted += 1;
      }
    }

    if (!spec.journal) {
      const removed = Array.from(beforeById.keys()).filter((id) => !seen.has(id));
      if (removed.length > 0) {
        writes.push(run(
          tx,
          `DELETE FROM ${spec.table} WHERE tenant_id = $1 AND ${spec.idColumn} = ANY($2::text[])`,
          [tenantId, removed]
        ));
        stats.deleted += removed.length;
      }
    }
  }

  await Promise.all(writes);
  return stats;
}

// ---------------------------------------------------------------------------
// Idempotency (stacklyra_idempotency)
// ---------------------------------------------------------------------------

/** Keys are kept this long, so an offline sale replayed weeks later still posts once. */
export const IDEMPOTENCY_RETENTION_DAYS = 90;

export async function findIdempotencyRecord(
  q: Queryable,
  tenantId: string,
  scope: string,
  key: string
): Promise<{ responseStatus: number; responseBody: unknown } | null> {
  const rows = await run(
    q,
    `SELECT response_status, response_body FROM stacklyra_idempotency
      WHERE tenant_id = $1 AND scope = $2 AND key = $3`,
    [tenantId, scope, key]
  );
  if (!rows[0]) return null;
  return {
    responseStatus: Number(rows[0].response_status),
    responseBody: (decodeJson<{ body?: unknown }>(rows[0].response_body) || {}).body ?? null,
  };
}

export async function storeIdempotencyRecord(
  q: Queryable,
  tenantId: string,
  scope: string,
  key: string,
  responseStatus: number,
  responseBody: unknown
): Promise<void> {
  await run(
    q,
    `INSERT INTO stacklyra_idempotency (tenant_id, scope, key, response_status, response_body)
     VALUES ($1, $2, $3, $4::integer, $5::jsonb)
     ON CONFLICT (tenant_id, scope, key) DO NOTHING`,
    // Wrapped so a null/primitive body still fits the NOT NULL jsonb column.
    [tenantId, scope, key, responseStatus, jsonParam({ body: responseBody ?? null })]
  );
  // Opportunistic pruning keeps the table bounded without a scheduler.
  if (Math.random() < 0.01) {
    await run(
      q,
      `DELETE FROM stacklyra_idempotency WHERE created_at < now() - ($1::text || ' days')::interval`,
      [String(IDEMPOTENCY_RETENTION_DAYS)]
    );
  }
}

// ---------------------------------------------------------------------------
// Paged reads and summaries
// ---------------------------------------------------------------------------

export interface PageCursor {
  at: string;
  id: string;
}

export function encodeCursor(at: string, id: string): string {
  return Buffer.from(JSON.stringify([at, id]), "utf-8").toString("base64url");
}

export function decodeCursor(raw?: string | null): PageCursor | null {
  if (!raw) return null;
  try {
    const [at, id] = JSON.parse(Buffer.from(raw, "base64url").toString("utf-8"));
    if (typeof at === "string" && typeof id === "string") return { at, id };
  } catch {
    // fall through
  }
  return null;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

const PAGE_TABLES = {
  orders: { table: "stacklyra_orders", at: "created_at", atField: "createdAt" },
  ledger: { table: "stacklyra_ledger_entries", at: "created_at", atField: "createdAt" },
  audit: { table: "stacklyra_immutable_audit_logs", at: "timestamp", atField: "timestamp" },
} as const;

/**
 * Keyset pagination, newest first. Filters are fixed SQL with bound parameters.
 * - orders: `search` matches invoice / PRA number / customer; `from`/`to` are ISO bounds.
 * - ledger: `partyId` limits to one party.
 */
export async function listJournalPage(
  q: Queryable,
  tenantId: string,
  kind: keyof typeof PAGE_TABLES,
  opts: {
    cursor?: PageCursor | null;
    limit?: number;
    partyId?: string;
    search?: string;
    from?: string;
    to?: string;
  } = {}
): Promise<Page<Doc>> {
  const t = PAGE_TABLES[kind];
  const limit = Math.min(Math.max(Math.floor(opts.limit || 50), 1), 500);
  const where: string[] = ["tenant_id = $1"];
  const params: unknown[] = [tenantId];
  const add = (sqlFragment: (n: number) => string, value: unknown) => {
    params.push(value);
    where.push(sqlFragment(params.length));
  };

  if (opts.cursor) {
    params.push(opts.cursor.at, opts.cursor.id);
    where.push(`(${t.at}, id) < ($${params.length - 1}, $${params.length})`);
  }
  if (kind === "ledger" && opts.partyId) add((n) => `party_id = $${n}`, opts.partyId);
  if (kind === "orders" && opts.search) {
    add(
      (n) =>
        `(lower(invoice_number) LIKE $${n} OR lower(payload->>'praInvoiceNumber') LIKE $${n}
          OR lower(payload->>'customerName') LIKE $${n})`,
      `%${opts.search.trim().toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    );
  }
  if (kind !== "audit" && opts.from) add((n) => `${t.at} >= $${n}`, opts.from);
  if (kind !== "audit" && opts.to) add((n) => `${t.at} < $${n}`, opts.to);

  params.push(limit + 1);
  const rows = await run(
    q,
    `SELECT payload FROM ${t.table} WHERE ${where.join(" AND ")}
      ORDER BY ${t.at} DESC, id DESC LIMIT $${params.length}`,
    params
  );
  const docs = rows.map((r) => decodeJson<Doc>(r.payload));
  const hasMore = docs.length > limit;
  const items = hasMore ? docs.slice(0, limit) : docs;
  const last = items[items.length - 1];
  return {
    items,
    nextCursor:
      hasMore && last ? encodeCursor(str(last[t.atField]), str(last.id)) : null,
  };
}

export interface TenantSummary {
  orders: {
    count: number;
    revenueMinor: number;
    taxMinor: number;
    /** Order revenue per month of `year` in time zone `timeZone`, Jan..Dec. */
    monthlyRevenueMinor: number[];
  };
  ledgerCount: number;
  auditCount: number;
  year: number;
  timeZone: string;
}

export async function getTenantSummary(
  q: Queryable,
  tenantId: string,
  opts: { year: number; timeZone: string }
): Promise<TenantSummary> {
  const [totals] = await run(
    q,
    `SELECT count(*)::bigint AS n,
            COALESCE(sum(grand_total_minor), 0)::bigint AS revenue,
            COALESCE(sum(tax_minor), 0)::bigint AS tax
       FROM stacklyra_orders WHERE tenant_id = $1`,
    [tenantId]
  );
  const monthly = await run(
    q,
    `SELECT extract(month FROM (created_at::timestamptz AT TIME ZONE $2))::int AS m,
            COALESCE(sum(grand_total_minor), 0)::bigint AS revenue
       FROM stacklyra_orders
      WHERE tenant_id = $1
        AND created_at <> ''
        AND extract(year FROM (created_at::timestamptz AT TIME ZONE $2))::int = $3
      GROUP BY 1`,
    [tenantId, opts.timeZone, opts.year]
  );
  const [counts] = await run(
    q,
    `SELECT (SELECT count(*) FROM stacklyra_ledger_entries WHERE tenant_id = $1)::bigint AS ledger,
            (SELECT count(*) FROM stacklyra_immutable_audit_logs WHERE tenant_id = $1)::bigint AS audit`,
    [tenantId]
  );
  const buckets = new Array<number>(12).fill(0);
  for (const row of monthly) {
    const m = Number(row.m);
    if (m >= 1 && m <= 12) buckets[m - 1] = Number(row.revenue);
  }
  return {
    orders: {
      count: Number(totals.n),
      revenueMinor: Number(totals.revenue),
      taxMinor: Number(totals.tax),
      monthlyRevenueMinor: buckets,
    },
    ledgerCount: Number(counts.ledger),
    auditCount: Number(counts.audit),
    year: opts.year,
    timeZone: opts.timeZone,
  };
}

/** True when Postgres knows this time zone name (guards the summary query). */
export async function isKnownTimeZone(q: Queryable, tz: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_+\-/]{1,64}$/.test(tz)) return false;
  const rows = await run(q, `SELECT 1 FROM pg_timezone_names WHERE name = $1 LIMIT 1`, [tz]);
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

export async function pingPostgresConnection(rawUri: string): Promise<{
  connected: boolean;
  engine: string;
  dbName: string;
  message: string;
}> {
  const uri = normalizePostgresUri(rawUri);
  const dbName = "postgres";
  if (!isUsablePostgresUri(uri)) {
    return {
      connected: false,
      engine: "PostgreSQL (not configured)",
      dbName,
      message:
        "DATABASE_URL is missing or still contains a placeholder password. All data is stored in PostgreSQL, so the app cannot save until it is set.",
    };
  }
  try {
    const sql = await getReadySql();
    await run(sql, `SELECT 1 AS ok`);
    return {
      connected: true,
      engine: "PostgreSQL",
      dbName,
      message: "Connected. All workspace data is stored in PostgreSQL.",
    };
  } catch (err) {
    return {
      connected: false,
      engine: "PostgreSQL (unreachable)",
      dbName,
      message: `Connection check failed: ${err instanceof Error ? err.message : "unreachable"}`,
    };
  }
}
