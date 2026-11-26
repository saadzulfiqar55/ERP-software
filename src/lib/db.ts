import { buildTenantSubscription } from "@/core/saas/entitlements";
import {
  DEFAULT_TENANT_ID,
  DEFAULT_TENANT_SLUG,
} from "@/core/audit";
import {
  INITIAL_LEDGER,
  INITIAL_ORDERS,
  INITIAL_PARTIES,
  INITIAL_PRA_CONFIG,
  INITIAL_PRODUCTS,
  INITIAL_USERS,
} from "./seed-data";
import {
  decodeCursor,
  findIdempotencyRecord,
  findUserRow,
  getTenantSummary,
  isKnownTimeZone,
  listJournalPage,
  Page,
  TenantSummary,
  findTenantIdsForUser,
  findTenantRow,
  getReadySql,
  loadJournalRows,
  storeIdempotencyRecord,
  isUsablePostgresUri,
  listTenantRows,
  loadTenantState,
  lockTenant,
  maskPostgresUri,
  normalizePostgresUri,
  Queryable,
  saveTenantDiff,
} from "./postgres";
import {
  ERPInvoice,
  INITIAL_ERP_INVOICES,
  INITIAL_STOCK_MONITOR,
  INITIAL_WAITING_TASKS,
  StockLevelMonitorItem,
  WaitingTaskItem,
} from "./mock/erp-data";
import {
  ActiveSession,
  CashierShift,
  DocumentCounter,
  FiscalPeriod,
  IdempotencyRecord,
  ImmutableAuditLog,
  LedgerEntry,
  MongoDBConfig,
  Order,
  PartyAccount,
  PRAConfig,
  Product,
  SessionAuditLog,
  SubscriptionPlanId,
  TenantOrganization,
  UserProfile,
} from "./types";

/**
 * StackLyra ERP data access.
 *
 * PostgreSQL (`DATABASE_URL`) is the single source of truth. There is no local JSON store
 * and no in-process cache: every read goes to the database, and every write goes through
 * `runTenantTransaction`, which locks the tenant, loads its state inside the transaction,
 * applies the change and writes back only what changed.
 */
export interface DatabaseSchema {
  tenant: TenantOrganization;
  praConfig: PRAConfig;
  mongoConfig: MongoDBConfig;
  products: Product[];
  orders: Order[];
  erpInvoices?: ERPInvoice[];
  parties: PartyAccount[];
  ledger: LedgerEntry[];
  users: UserProfile[];
  /** Not persisted: per-request view only (sessions are stateless JWTs). */
  activeSession: ActiveSession | null;
  sessionAuditLogs: SessionAuditLog[];
  immutableAuditLogs: ImmutableAuditLog[];
  idempotencyRecords: IdempotencyRecord[];
  documentCounters: DocumentCounter[];
  cashierShifts: CashierShift[];
  fiscalPeriods: FiscalPeriod[];
  waitingTasks?: WaitingTaskItem[];
  stockMonitor?: StockLevelMonitorItem[];
  restaurantTables?: string[];
  servers?: string[];
}

export class TenantNotFoundError extends Error {
  constructor(identifier: string) {
    super(`Workspace "${identifier}" not found.`);
    this.name = "TenantNotFoundError";
  }
}

/** Status of the platform database, shown in Settings (URI only ever comes from the env). */
export function getEnvDatabaseConfig(): MongoDBConfig {
  const uri = normalizePostgresUri(process.env.DATABASE_URL);
  const usable = isUsablePostgresUri(uri);
  return {
    enabled: usable,
    uri,
    dbName: "postgres",
    engine: "POSTGRES_DRIZZLE",
    lastStatus: usable
      ? "PostgreSQL connected — single source of truth for all workspace data."
      : "DATABASE_URL is missing or still a placeholder. The app cannot load or save data until it is set.",
  };
}

export function getPublicMongoConfig(config: MongoDBConfig): MongoDBConfig {
  return {
    ...config,
    uri: maskPostgresUri(config.uri),
  };
}

export function buildDefaultFlagshipTenant(): TenantOrganization {
  const now = new Date().toISOString();
  return {
    id: DEFAULT_TENANT_ID,
    slug: DEFAULT_TENANT_SLUG,
    name: "StackLyra Workspace",
    segment: "HYBRID",
    invoicePrefix: "SL",
    ownerUserId: "user-admin-1",
    ownerEmail: "saad@stacklyra.com",
    status: "ACTIVE",
    planId: "enterprise",
    subscription: buildTenantSubscription(
      "enterprise",
      "ACTIVE",
      "ANNUAL",
      "MANUAL_IBFT"
    ),
    createdAt: now,
    updatedAt: now,
  };
}

function buildDefaultFiscalPeriods(tenantId: string): FiscalPeriod[] {
  return [
    {
      tenantId,
      periodKey: new Date().toISOString().slice(0, 7),
      label: `${new Date().toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })} (Active Period)`,
      isLocked: false,
    },
  ];
}

export function buildTenantDefaults(
  tenant: TenantOrganization,
  initialOwner?: UserProfile
): DatabaseSchema {
  const currentYear = new Date().getFullYear();
  const isFlagship = tenant.id === DEFAULT_TENANT_ID;
  const defaultUsers: UserProfile[] = initialOwner
    ? [initialOwner]
    : isFlagship
    ? INITIAL_USERS
    : [];

  return {
    tenant,
    praConfig: {
      ...INITIAL_PRA_CONFIG,
      restaurantName: tenant.name || "StackLyra Workspace",
    },
    mongoConfig: getEnvDatabaseConfig(),
    products: isFlagship ? INITIAL_PRODUCTS : [],
    orders: isFlagship ? INITIAL_ORDERS : [],
    erpInvoices: isFlagship ? INITIAL_ERP_INVOICES : [],
    parties: isFlagship ? INITIAL_PARTIES : [],
    ledger: isFlagship ? INITIAL_LEDGER : [],
    users: defaultUsers,
    activeSession: null,
    sessionAuditLogs: [],
    immutableAuditLogs: [],
    idempotencyRecords: [],
    documentCounters: [
      { tenantId: tenant.id, key: `${tenant.id}:INVOICE:${currentYear}`, seq: 0 },
      { tenantId: tenant.id, key: `${tenant.id}:USIN:${currentYear}`, seq: 0 },
      { tenantId: tenant.id, key: `${tenant.id}:VOUCHER:${currentYear}`, seq: 0 },
    ],
    cashierShifts: [],
    fiscalPeriods: buildDefaultFiscalPeriods(tenant.id),
    waitingTasks: isFlagship ? INITIAL_WAITING_TASKS : [],
    stockMonitor: isFlagship ? INITIAL_STOCK_MONITOR : [],
    restaurantTables: [],
    servers: [],
  };
}

function mergeWithTenantDefaults(
  tenant: TenantOrganization,
  parsed: Partial<DatabaseSchema>,
  envDbConfig: MongoDBConfig
): DatabaseSchema {
  const defaults = buildTenantDefaults(tenant);
  const seededAdmin = INITIAL_USERS.find((u) => u.id === "user-admin-1");
  const isFlagship = tenant.id === DEFAULT_TENANT_ID;

  const rawUsers =
    parsed.users && parsed.users.length > 0 ? parsed.users : defaults.users;

  const normalizedUsers = rawUsers.map((u) => {
    const stampedTenantId = u.tenantId && u.tenantId !== "TENANT_ALBARKA" ? u.tenantId : tenant.id;
    if (u.role === "ADMIN") {
      const isPrimaryFlagshipAdmin = isFlagship && u.id === "user-admin-1";
      const envAdminUsername = process.env.ADMIN_USERNAME?.trim().toLowerCase();
      return {
        ...u,
        tenantId: stampedTenantId,
        tenantSlug: tenant.slug,
        membershipRole: u.membershipRole || ("OWNER" as const),
        isPlatformAdmin: isPrimaryFlagshipAdmin ? true : Boolean(u.isPlatformAdmin),
        name:
          isPrimaryFlagshipAdmin && u.name === "Haji Tariq Mahmood"
            ? "Saad"
            : u.name,
        username:
          (isPrimaryFlagshipAdmin ? envAdminUsername : undefined) ||
          u.username ||
          (isPrimaryFlagshipAdmin ? "saad" : u.email.split("@")[0]),
        email:
          isPrimaryFlagshipAdmin &&
          (u.email === "admin@albarkarestaurant.pk" ||
            u.email === "saad@albarkarestaurant.pk")
            ? "saad@stacklyra.com"
            : u.email,
        avatarInitials:
          isPrimaryFlagshipAdmin && u.name === "Haji Tariq Mahmood"
            ? "SA"
            : u.avatarInitials,
        pin: "",
        authType: "PASSWORD" as const,
        isDemoAccount: false,
        passwordHash:
          u.passwordHash ||
          (isPrimaryFlagshipAdmin ? seededAdmin?.passwordHash : undefined),
      };
    }
    return {
      ...u,
      tenantId: stampedTenantId,
      tenantSlug: tenant.slug,
      membershipRole:
        u.membershipRole || (u.role === "MANAGER" ? "MANAGER" : "CASHIER"),
      isPlatformAdmin: false,
      username: u.username || u.email.split("@")[0],
      authType: u.authType || ("PIN" as const),
      isDemoAccount: false,
    };
  });

  return {
    ...defaults,
    ...parsed,
    tenant,
    praConfig: {
      ...defaults.praConfig,
      ...(parsed.praConfig || {}),
      restaurantName:
        parsed.praConfig?.restaurantName &&
        parsed.praConfig.restaurantName !== "Albarka Karahi & Handi"
          ? parsed.praConfig.restaurantName
          : tenant.name,
    },
    users: normalizedUsers,
    products: (parsed.products ?? defaults.products).map((p) => ({
      ...p,
      tenantId: tenant.id,
    })),
    orders: (parsed.orders ?? defaults.orders).map((o) => ({
      ...o,
      tenantId: tenant.id,
    })),
    erpInvoices: parsed.erpInvoices ?? defaults.erpInvoices,
    parties: (parsed.parties ?? defaults.parties).map((pt) => ({
      ...pt,
      tenantId: tenant.id,
    })),
    ledger: (parsed.ledger ?? defaults.ledger).map((le) => ({
      ...le,
      tenantId: tenant.id,
    })),
    mongoConfig: envDbConfig,
    sessionAuditLogs: parsed.sessionAuditLogs || [],
    immutableAuditLogs: (
      parsed.immutableAuditLogs ?? defaults.immutableAuditLogs
    ).map((al) => ({
      ...al,
      tenantId: tenant.id,
    })),
    idempotencyRecords: parsed.idempotencyRecords || [],
    documentCounters: parsed.documentCounters ?? defaults.documentCounters,
    cashierShifts: (parsed.cashierShifts ?? defaults.cashierShifts).map((cs) => ({
      ...cs,
      tenantId: tenant.id,
    })),
    fiscalPeriods:
      parsed.fiscalPeriods && parsed.fiscalPeriods.length > 0
        ? parsed.fiscalPeriods.map((fp) => ({ ...fp, tenantId: tenant.id }))
        : defaults.fiscalPeriods,
    waitingTasks: parsed.waitingTasks ?? defaults.waitingTasks,
    stockMonitor: parsed.stockMonitor ?? defaults.stockMonitor,
    restaurantTables: parsed.restaurantTables ?? defaults.restaurantTables,
    servers: parsed.servers ?? defaults.servers,
  };
}

// ---------------------------------------------------------------------------
// Readiness: schema + flagship tenant
// ---------------------------------------------------------------------------

async function ensureFlagshipTenant(sql: Awaited<ReturnType<typeof getReadySql>>) {
  // Cheap check first: after the first boot this is a single indexed lookup.
  if (await findTenantRow(sql, DEFAULT_TENANT_ID)) return;
  await sql.begin(async (tx) => {
    await lockTenant(tx, DEFAULT_TENANT_ID);
    const existing = await findTenantRow(tx, DEFAULT_TENANT_ID);
    if (existing) return;
    const flagship = buildDefaultFlagshipTenant();
    await saveTenantDiff(tx, null, buildTenantDefaults(flagship));
  });
}

async function getDb() {
  return getReadySql(ensureFlagshipTenant);
}

// ---------------------------------------------------------------------------
// Tenant registry (stacklyra_tenants)
// ---------------------------------------------------------------------------

export async function listTenantsRegistry(): Promise<TenantOrganization[]> {
  return listTenantRows(await getDb());
}

/** Exact match on tenant id or slug; null when no such workspace exists. */
export async function findTenantStrict(
  identifier: string
): Promise<TenantOrganization | null> {
  if (!identifier?.trim()) return null;
  return findTenantRow(await getDb(), identifier);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

async function loadMergedState(
  q: Queryable,
  tenantId: string,
  mode: "read" | "write" = "read",
  only?: Array<keyof DatabaseSchema>
): Promise<DatabaseSchema> {
  const stored = await loadTenantState(q, tenantId, mode, only);
  if (!stored) throw new TenantNotFoundError(tenantId);
  return mergeWithTenantDefaults(stored.tenant, stored, getEnvDatabaseConfig());
}

/**
 * Read-only snapshot of a tenant (no lock). Use only for responses; never write it back.
 * Throws TenantNotFoundError for an unknown tenant instead of falling back to another one.
 */
/**
 * Tenant row, users and recent session log only — what sign-in, session checks, refresh
 * and logout need. Much cheaper than readDbAsync; other collections come back empty.
 */
export async function readTenantAuthView(tenantId: string): Promise<DatabaseSchema> {
  const sql = await getDb();
  return loadMergedState(sql, tenantId, "read", ["users", "sessionAuditLogs"]);
}

export async function readDbAsync(
  tenantId: string = DEFAULT_TENANT_ID
): Promise<DatabaseSchema> {
  const sql = await getDb();
  const tenant = await findTenantRow(sql, tenantId);
  if (!tenant) throw new TenantNotFoundError(tenantId);
  return loadMergedState(sql, tenant.id);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Extra database access available to a transaction's `work`, all inside the same
 * transaction and tenant lock.
 */
export interface TransactionContext {
  /**
   * Pulls specific ledger entries into the draft (journals start empty in a transaction),
   * e.g. the entry a reversal must mark as reversed. Returns the draft copies.
   */
  loadLedgerEntries(ids: string[]): Promise<LedgerEntry[]>;
  findIdempotency(
    scope: string,
    key: string
  ): Promise<{ responseStatus: number; responseBody: unknown } | null>;
  storeIdempotency(
    scope: string,
    key: string,
    responseStatus: number,
    responseBody: unknown
  ): Promise<void>;
}

/**
 * Runs `work` against a draft of the tenant's working set inside one Postgres transaction:
 * lock tenant → load working set → work(draft, ctx) → write changed rows → commit.
 *
 * Journals (orders, ledger, audit logs) start EMPTY in the draft: services append to them
 * and only the new rows are inserted. If `work` throws, or any write fails, the transaction
 * rolls back and the error propagates.
 *
 * The returned `db` is a fresh read taken after commit (working set + recent journal rows),
 * so responses show the committed state, not the partial draft.
 */
export async function runTenantTransaction<T>(
  tenantId: string,
  work: (txDb: DatabaseSchema, ctx: TransactionContext) => Promise<T> | T,
  options: { readBack?: boolean } = {}
): Promise<{ result: T; db: DatabaseSchema }> {
  const sql = await getDb();
  // Callers pass a canonical tenant id (from the session JWT or a tenant record), so no
  // lookup is needed first: the load inside the transaction reports a missing tenant.
  const tenant = { id: tenantId };

  let committedDraft: DatabaseSchema | null = null;
  const result = await sql.begin(async (tx) => {
    await lockTenant(tx, tenant.id);
    const before = await loadMergedState(tx, tenant.id, "write");
    const draft: DatabaseSchema = JSON.parse(JSON.stringify(before));

    const ctx: TransactionContext = {
      async loadLedgerEntries(ids) {
        const wanted = ids.filter(
          (id) => id && !draft.ledger.some((e) => e.id === id)
        );
        const rows = (await loadJournalRows(tx, tenant.id, "ledger", wanted)) as unknown as LedgerEntry[];
        for (const row of rows) {
          before.ledger.push(JSON.parse(JSON.stringify(row)));
          draft.ledger.push(JSON.parse(JSON.stringify(row)));
        }
        return draft.ledger.filter((e) => ids.includes(e.id));
      },
      findIdempotency: (scope, key) => findIdempotencyRecord(tx, tenant.id, scope, key),
      storeIdempotency: (scope, key, status, body) =>
        storeIdempotencyRecord(tx, tenant.id, scope, key, status, body),
    };

    const workResult = await work(draft, ctx);
    if (draft.tenant.id !== tenant.id) {
      throw new Error("A transaction may not change the tenant id.");
    }
    await saveTenantDiff(tx, before, draft);
    committedDraft = draft;
    return workResult;
  });

  // readBack: false skips the extra read for callers that only need the tenant/user
  // records they changed (sign-in, logout, billing). Journals in that draft hold only
  // the rows added by this transaction.
  if (options.readBack === false && committedDraft) {
    return { result: result as T, db: committedDraft };
  }
  const committed = await loadMergedState(sql, tenant.id, "read");
  return { result: result as T, db: committed };
}

/**
 * Resolves a user by id or username/email, optionally within one workspace.
 * Uses indexed lookups instead of loading every tenant.
 */
export async function findUserAcrossTenantsAsync(params: {
  tenantSlug?: string;
  userId?: string;
  identifier?: string;
}): Promise<{ tenant: TenantOrganization; user: UserProfile; db: DatabaseSchema } | null> {
  const sql = await getDb();

  const scope = params.tenantSlug?.trim().toLowerCase() || undefined;
  const scopeIsFlagship =
    !scope || scope === DEFAULT_TENANT_ID || scope === DEFAULT_TENANT_SLUG;

  const identifier = params.identifier?.trim().toLowerCase();
  const envAdminUsername = process.env.ADMIN_USERNAME?.trim().toLowerCase();

  const candidateIds = await findTenantIdsForUser(sql, {
    tenantIdOrSlug: scope,
    userId: params.userId,
    identifier,
  });
  // The flagship admin may sign in with ADMIN_USERNAME even if the stored username differs.
  if (
    identifier &&
    envAdminUsername &&
    identifier === envAdminUsername &&
    scopeIsFlagship &&
    !candidateIds.includes(DEFAULT_TENANT_ID)
  ) {
    candidateIds.push(DEFAULT_TENANT_ID);
  }

  for (const tenantId of candidateIds) {
    // Only the tenant row and its users are needed to authenticate.
    const db = await loadMergedState(sql, tenantId, "read", ["users", "sessionAuditLogs"]);
    let found: UserProfile | undefined;
    if (params.userId) {
      found = db.users.find((u) => u.id === params.userId);
    }
    if (!found && identifier) {
      found = db.users.find(
        (u) =>
          u.username?.toLowerCase() === identifier ||
          u.email.toLowerCase() === identifier
      );
      if (
        !found &&
        tenantId === DEFAULT_TENANT_ID &&
        envAdminUsername &&
        identifier === envAdminUsername
      ) {
        found = db.users.find((u) => u.id === "user-admin-1");
      }
    }
    if (found) return { tenant: db.tenant, user: found, db };
  }
  return null;
}

/**
 * Creates a new tenant workspace and its owner in a single transaction.
 * The primary key and the UNIQUE slug constraint make a taken slug fail atomically.
 */
export async function provisionNewTenantWorkspaceAsync(params: {
  organizationName: string;
  slug: string;
  segment: "RESTAURANT" | "RETAIL" | "HYBRID";
  planId: SubscriptionPlanId;
  ownerUser: UserProfile;
  invoicePrefix?: string;
}): Promise<{ tenant: TenantOrganization; db: DatabaseSchema }> {
  const sql = await getDb();
  const takenMessage = `Workspace slug "${params.slug}" is already taken. Choose another workspace URL.`;

  const now = new Date().toISOString();
  const tenantId = `ten-${params.slug}`;
  const prefix =
    params.invoicePrefix ||
    params.organizationName
      .replace(/[^a-zA-Z]/g, "")
      .slice(0, 3)
      .toUpperCase() ||
    "SL";

  const tenant: TenantOrganization = {
    id: tenantId,
    slug: params.slug,
    name: params.organizationName,
    segment: params.segment,
    invoicePrefix: prefix,
    ownerUserId: params.ownerUser.id,
    ownerEmail: params.ownerUser.email,
    status: "TRIALING",
    planId: params.planId,
    subscription: buildTenantSubscription(params.planId, "TRIALING", "MONTHLY", "TRIAL"),
    createdAt: now,
    updatedAt: now,
  };

  const ownerWithTenant: UserProfile = {
    ...params.ownerUser,
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    membershipRole: "OWNER",
    isPlatformAdmin: false,
  };

  const initialDb = buildTenantDefaults(tenant, ownerWithTenant);
  initialDb.sessionAuditLogs = [
    {
      id: `audit-${Date.now()}`,
      tenantId: tenant.id,
      timestamp: now,
      event: "TENANT_ONBOARDED",
      userId: ownerWithTenant.id,
      userName: ownerWithTenant.name,
      userRole: ownerWithTenant.role,
      details: `Provisioned StackLyra ERP workspace "${tenant.name}" (${tenant.slug}) on ${params.planId.toUpperCase()} plan.`,
    },
  ];

  try {
    await sql.begin(async (tx) => {
      await lockTenant(tx, tenant.id);
      if (
        (await findTenantRow(tx, tenant.id)) ||
        (await findTenantRow(tx, tenant.slug))
      ) {
        throw new Error(takenMessage);
      }
      await saveTenantDiff(tx, null, initialDb);
    });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "23505") throw new Error(takenMessage);
    throw err;
  }

  return { tenant, db: initialDb };
}

// ---------------------------------------------------------------------------
// Lightweight reads for paged endpoints (no full tenant load)
// ---------------------------------------------------------------------------

/** The signed-in user's profile within a tenant, or null if the tenant/user is gone. */
export async function getTenantUser(
  tenantId: string,
  userId: string
): Promise<{ tenant: TenantOrganization; user: UserProfile } | null> {
  const sql = await getDb();
  const tenant = await findTenantRow(sql, tenantId);
  if (!tenant) return null;
  const row = await findUserRow(sql, tenant.id, userId);
  if (!row) return null;
  const user = row as unknown as UserProfile;
  if (user.tenantId && user.tenantId !== tenant.id && user.tenantId !== "TENANT_ALBARKA") {
    return null;
  }
  return { tenant, user };
}

export type JournalKind = "orders" | "ledger" | "audit";

export async function readJournalPage(
  tenantId: string,
  kind: JournalKind,
  opts: {
    cursor?: string | null;
    limit?: number;
    partyId?: string;
    search?: string;
    from?: string;
    to?: string;
  }
): Promise<Page<Record<string, unknown>>> {
  const sql = await getDb();
  return listJournalPage(sql, tenantId, kind, {
    ...opts,
    cursor: decodeCursor(opts.cursor),
  });
}

export async function readTenantSummary(
  tenantId: string,
  opts: { year?: number; timeZone?: string }
): Promise<TenantSummary> {
  const sql = await getDb();
  const year =
    opts.year && opts.year >= 2000 && opts.year <= 2100
      ? Math.floor(opts.year)
      : new Date().getUTCFullYear();
  const tz =
    opts.timeZone && (await isKnownTimeZone(sql, opts.timeZone)) ? opts.timeZone : "UTC";
  return getTenantSummary(sql, tenantId, { year, timeZone: tz });
}
