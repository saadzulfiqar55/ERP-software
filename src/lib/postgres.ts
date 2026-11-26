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
  | "FISCAL_PERIODS";

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
    connect_timeout: 10,
    idle_timeout: 20,
    ssl: isLocal ? false : "require",
    onnotice: () => {},
  });
  globalThis.__stacklyraPgPool = { uri, sql };
  globalThis.__stacklyraPgReady = undefined;
  return sql;
}

function run<T extends unknown[] = postgres.Row[]>(
  q: Queryable,
  text: string,
  params: unknown[] = []
) {
  return q.unsafe<T & postgres.Row[]>(text, params as never[]);
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
];

/**
 * Returns a ready connection pool. On first use per process it creates the schema
 * (serialized across instances by an advisory lock) and runs `onFirstReady`
 * (used to seed the flagship tenant).
 */
export async function getReadySql(
  onFirstReady?: (sql: Sql) => Promise<void>
): Promise<Sql> {
  const sql = getPool();
  if (!globalThis.__stacklyraPgReady) {
    globalThis.__stacklyraPgReady = (async () => {
      await sql.begin(async (tx) => {
        await run(tx, `SELECT pg_advisory_xact_lock(hashtextextended('stacklyra:schema', 0))`);
        for (const ddl of SCHEMA_DDL) {
          await run(tx, ddl);
        }
      });
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
 * tenant RLS context. Works with the transaction pooler because it is transaction-scoped.
 */
export async function lockTenant(tx: Queryable, tenantId: string): Promise<void> {
  await run(tx, `SET LOCAL lock_timeout = '15s'`);
  await run(tx, `SET LOCAL statement_timeout = '30s'`);
  await run(tx, `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
    `stacklyra:tenant:${tenantId}`,
  ]);
  await run(tx, `SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);
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
  /** Load only the newest N rows (the in-memory list is capped to the same size). */
  limit?: number;
  /** Rows are never deleted from the database, even when dropped from the in-memory list. */
  appendOnly?: boolean;
}

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));

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
    columns: [
      { name: "created_at", cast: "text", value: (d) => str(d.createdAt) },
      { name: "invoice_number", cast: "text", value: (d) => str(d.invoiceNumber) },
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
    columns: [
      { name: "party_id", cast: "text", value: (d) => str(d.partyId) },
      { name: "created_at", cast: "text", value: (d) => str(d.createdAt) },
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
    // appendAuditLog keeps the newest 300 in memory; the table keeps everything.
    limit: 300,
    appendOnly: true,
    columns: [{ name: "timestamp", cast: "text", value: (d) => str(d.timestamp) }],
  },
];

// Tenant-row fields stored as JSONB columns on stacklyra_tenants.
const TENANT_JSON_FIELDS: Array<[keyof DatabaseSchema, string]> = [
  ["praConfig", "pra_config"],
  ["restaurantTables", "restaurant_tables"],
  ["servers", "servers"],
  ["stockMonitor", "stock_monitor"],
  ["waitingTasks", "waiting_tasks"],
  ["sessionAuditLogs", "session_audit_logs"],
  ["idempotencyRecords", "idempotency_records"],
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
  params: { tenantId?: string; userId?: string; identifier?: string }
): Promise<string[]> {
  const rows = await run(
    q,
    `SELECT u.tenant_id
       FROM stacklyra_users u
       JOIN stacklyra_tenants t ON t.id = u.tenant_id
      WHERE ($1::text IS NULL OR u.tenant_id = $1)
        AND (
          ($2::text IS NOT NULL AND u.id = $2)
          OR ($3::text IS NOT NULL AND (lower(u.username) = $3 OR lower(u.email) = $3))
        )
      ORDER BY t.created_at ASC
      LIMIT 20`,
    [
      params.tenantId ?? null,
      params.userId ?? null,
      params.identifier ? params.identifier.trim().toLowerCase() : null,
    ]
  );
  return Array.from(new Set(rows.map((r) => String(r.tenant_id))));
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

/** Loads a tenant's stored state, or null when the tenant row does not exist. */
export async function loadTenantState(
  q: Queryable,
  tenantId: string
): Promise<(Partial<DatabaseSchema> & { tenant: TenantOrganization }) | null> {
  const tenantRows = await run(
    q,
    `SELECT * FROM stacklyra_tenants WHERE id = $1 LIMIT 1`,
    [tenantId]
  );
  if (tenantRows.length === 0) return null;
  const tRow = tenantRows[0];

  const collectionRows = await Promise.all(
    COLLECTIONS.map((spec) => {
      const select = spec.hasPayload
        ? `payload`
        : `${spec.idColumn} AS __id, ${spec.columns.map((c) => c.name).join(", ")}`;
      const order = spec.orderBy ? ` ORDER BY ${spec.orderBy}, ${spec.idColumn} DESC` : "";
      const limit = spec.limit ? ` LIMIT ${spec.limit}` : "";
      return run(
        q,
        `SELECT ${select} FROM ${spec.table} WHERE tenant_id = $1${order}${limit}`,
        [tenantId]
      );
    })
  );

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

  return state;
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
      t.subscription,
      json("praConfig", {}),
      json("restaurantTables", []),
      json("servers", []),
      json("stockMonitor", []),
      json("waitingTasks", []),
      json("sessionAuditLogs", []),
      json("idempotencyRecords", []),
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
    values.push({ ...doc, tenantId });
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

  if (!before || tenantRowSignature(before) !== tenantRowSignature(after)) {
    await upsertTenantRow(tx, after, now);
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
        await upsertDoc(tx, spec, tenantId, doc, now);
        stats.upserted += 1;
      }
    }

    if (!spec.appendOnly) {
      const removed = Array.from(beforeById.keys()).filter((id) => !seen.has(id));
      if (removed.length > 0) {
        await run(
          tx,
          `DELETE FROM ${spec.table} WHERE tenant_id = $1 AND ${spec.idColumn} = ANY($2::text[])`,
          [tenantId, removed]
        );
        stats.deleted += removed.length;
      }
    }
  }

  return stats;
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
