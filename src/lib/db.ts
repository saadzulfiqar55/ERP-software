import fs from "fs";
import path from "path";
import {
  INITIAL_LEDGER,
  INITIAL_ORDERS,
  INITIAL_PARTIES,
  INITIAL_PRA_CONFIG,
  INITIAL_PRODUCTS,
  INITIAL_USERS,
} from "./seed-data";
import {
  DEFAULT_ISOLATED_DB_NAME,
  hasUnreplacedPasswordPlaceholder,
  loadSnapshotFromMongo,
  maskMongoUri,
  MongoSyncSection,
  normalizeMongoUri,
  resolveIsolatedDbName,
  syncSnapshotToMongoIfAvailable,
} from "./mongodb";
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
  UserProfile,
} from "./types";

export interface DatabaseSchema {
  praConfig: PRAConfig;
  mongoConfig: MongoDBConfig;
  products: Product[];
  orders: Order[];
  erpInvoices?: ERPInvoice[];
  parties: PartyAccount[];
  ledger: LedgerEntry[];
  users: UserProfile[];
  activeSession: ActiveSession | null;
  sessionAuditLogs: SessionAuditLog[];
  immutableAuditLogs: ImmutableAuditLog[];
  idempotencyRecords: IdempotencyRecord[];
  documentCounters: DocumentCounter[];
  cashierShifts: CashierShift[];
  fiscalPeriods: FiscalPeriod[];
  waitingTasks?: WaitingTaskItem[];
  stockMonitor?: StockLevelMonitorItem[];
}

const IS_SERVERLESS = Boolean(
  process.env.VERCEL ||
    process.env.VERCEL_ENV ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.NETLIFY ||
    process.cwd().startsWith("/var/task")
);
const DB_DIR = IS_SERVERLESS
  ? path.join("/tmp", "albarka-data")
  : path.join(process.cwd(), "data");
const DB_FILE = path.join(DB_DIR, "albarka-db.json");
const ENV_LOCAL_FILE = path.join(process.cwd(), ".env.local");

function readDotEnvLocalValue(key: string): string | undefined {
  try {
    if (!fs.existsSync(ENV_LOCAL_FILE)) return undefined;
    const raw = fs.readFileSync(ENV_LOCAL_FILE, "utf-8");
    const regex = new RegExp(`^${key}=(?:"([^"]*)"|'([^']*)'|([^\\r\\n#]*))`, "m");
    const match = raw.match(regex);
    const val = match?.[1] ?? match?.[2] ?? match?.[3];
    return val?.trim() || undefined;
  } catch {
    return undefined;
  }
}

function getEnvMongoConfig(): MongoDBConfig | null {
  const envUri = normalizeMongoUri(
    process.env.MONGODB_URI || readDotEnvLocalValue("MONGODB_URI")
  );
  if (!envUri) return null;

  const envDbName =
    process.env.MONGODB_DB_NAME?.trim() ||
    readDotEnvLocalValue("MONGODB_DB_NAME");

  let safeDb = DEFAULT_ISOLATED_DB_NAME;
  try {
    safeDb = resolveIsolatedDbName(envDbName);
  } catch {
    safeDb = DEFAULT_ISOLATED_DB_NAME;
  }

  const needsPassword = hasUnreplacedPasswordPlaceholder(envUri);
  return {
    enabled: !needsPassword,
    uri: envUri,
    dbName: safeDb,
    lastStatus: needsPassword
      ? `Atlas URI detected in .env.local (isolated DB: ${safeDb}) — replace <db_password> with your MongoDB password to connect.`
      : `Configured via .env.local (isolated DB: ${safeDb})`,
  };
}

const DEFAULT_MONGO_CONFIG: MongoDBConfig = getEnvMongoConfig() || {
  enabled: false,
  uri: "mongodb://127.0.0.1:27017/albarka_erp",
  dbName: DEFAULT_ISOLATED_DB_NAME,
  lastStatus:
    "Local JSON File Store Active (data/albarka-db.json) — MongoDB Ready",
};

export function getPublicMongoConfig(config: MongoDBConfig): MongoDBConfig {
  return {
    ...config,
    uri: maskMongoUri(config.uri),
  };
}

const DEFAULT_CASHIER_SHIFT: CashierShift = {
  id: "shift-2026-11-17-morning",
  tenantId: "TENANT_ALBARKA",
  branchId: "BRANCH_GULBERG_01",
  openedAt: "2026-11-17T08:00:00.000Z",
  openedBy: "Saad (ADMIN)",
  openingFloatMinor: 2500000, // PKR 25,000 opening float in paisa
  cashSalesMinor: 603200, // PKR 6,032
  cardSalesMinor: 490800, // PKR 4,908
  pettyCashPayoutsMinor: 0,
  expectedClosingCashMinor: 3103200, // PKR 31,032
  status: "OPEN",
};

const DEFAULT_FISCAL_PERIODS: FiscalPeriod[] = [
  {
    periodKey: "2026-10",
    label: "October 2026 (Closed Fiscal Period)",
    isLocked: true,
    lockedAt: "2026-11-02T10:00:00.000Z",
    lockedBy: "Saad (ADMIN)",
  },
  {
    periodKey: "2026-11",
    label: "November 2026 (Current Active Period)",
    isLocked: false,
  },
];

function buildDefaults(): DatabaseSchema {
  return {
    praConfig: INITIAL_PRA_CONFIG,
    mongoConfig: DEFAULT_MONGO_CONFIG,
    products: INITIAL_PRODUCTS,
    orders: INITIAL_ORDERS,
    erpInvoices: INITIAL_ERP_INVOICES,
    parties: INITIAL_PARTIES,
    ledger: INITIAL_LEDGER,
    users: INITIAL_USERS,
    activeSession: null,
    sessionAuditLogs: [],
    immutableAuditLogs: [
      {
        id: "aud-init-1",
        tenantId: "TENANT_ALBARKA",
        branchId: "BRANCH_GULBERG_01",
        timestamp: "2026-11-17T08:00:00.000Z",
        actorId: "user-admin-1",
        actorName: "Saad",
        actorRole: "ADMIN",
        module: "POS",
        action: "CREATE",
        entityType: "CashierShift",
        entityId: "shift-2026-11-17-morning",
        summary: "Opened register shift with PKR 25,000 opening float.",
      },
    ],
    idempotencyRecords: [],
    documentCounters: [
      { key: "TENANT_ALBARKA:INVOICE:2026", seq: 1002 },
      { key: "TENANT_ALBARKA:USIN:2026", seq: 1002 },
      { key: "TENANT_ALBARKA:VOUCHER:2026", seq: 104 },
    ],
    cashierShifts: [DEFAULT_CASHIER_SHIFT],
    fiscalPeriods: DEFAULT_FISCAL_PERIODS,
    waitingTasks: INITIAL_WAITING_TASKS,
    stockMonitor: INITIAL_STOCK_MONITOR,
  };
}

function mergeWithDefaults(
  parsed: Partial<DatabaseSchema>,
  envMongo: MongoDBConfig | null
): DatabaseSchema {
  const defaults = buildDefaults();
  const seededAdmin = INITIAL_USERS.find((u) => u.id === "user-admin-1");

  // Upgrade any legacy ADMIN record loaded from existing JSON / MongoDB snapshots
  // so weak 4-digit PIN auth (`1111`) is permanently replaced with scrypt password auth.
  const rawUsers =
    parsed.users && parsed.users.length > 0 ? parsed.users : INITIAL_USERS;
  const normalizedUsers = rawUsers.map((u) => {
    if (u.role === "ADMIN") {
      const isLegacyPrimaryAdmin =
        u.id === "user-admin-1" && u.name === "Haji Tariq Mahmood";
      const envAdminUsername = process.env.ADMIN_USERNAME?.trim().toLowerCase();
      return {
        ...u,
        name: isLegacyPrimaryAdmin ? "Saad" : u.name,
        username:
          (u.id === "user-admin-1" ? envAdminUsername : undefined) ||
          u.username ||
          (u.id === "user-admin-1" ? "saad" : u.email.split("@")[0]),
        email:
          isLegacyPrimaryAdmin && u.email === "admin@albarkarestaurant.pk"
            ? "saad@albarkarestaurant.pk"
            : u.email,
        avatarInitials: isLegacyPrimaryAdmin ? "SA" : u.avatarInitials,
        pin: "",
        authType: "PASSWORD" as const,
        isDemoAccount: false,
        passwordHash: u.passwordHash || seededAdmin?.passwordHash,
      };
    }
    return {
      ...u,
      username:
        u.username ||
        (u.id === "user-manager-1"
          ? "manager"
          : u.id === "user-cashier-1"
          ? "cashier"
          : u.email.split("@")[0]),
      authType: u.authType || ("PIN" as const),
      isDemoAccount:
        u.isDemoAccount ?? (u.id === "user-manager-1" || u.id === "user-cashier-1"),
    };
  });

  return {
    ...defaults,
    ...parsed,
    users: normalizedUsers,
    erpInvoices:
      parsed.erpInvoices && parsed.erpInvoices.length > 0
        ? parsed.erpInvoices
        : INITIAL_ERP_INVOICES,
    mongoConfig: envMongo || parsed.mongoConfig || DEFAULT_MONGO_CONFIG,
    sessionAuditLogs: parsed.sessionAuditLogs || [],
    immutableAuditLogs: parsed.immutableAuditLogs || defaults.immutableAuditLogs,
    idempotencyRecords: parsed.idempotencyRecords || [],
    documentCounters: parsed.documentCounters || defaults.documentCounters,
    cashierShifts:
      parsed.cashierShifts && parsed.cashierShifts.length > 0
        ? parsed.cashierShifts
        : defaults.cashierShifts,
    fiscalPeriods:
      parsed.fiscalPeriods && parsed.fiscalPeriods.length > 0
        ? parsed.fiscalPeriods
        : defaults.fiscalPeriods,
    waitingTasks:
      parsed.waitingTasks && parsed.waitingTasks.length > 0
        ? parsed.waitingTasks
        : defaults.waitingTasks,
    stockMonitor:
      parsed.stockMonitor && parsed.stockMonitor.length > 0
        ? parsed.stockMonitor
        : defaults.stockMonitor,
  };
}

export function readDb(): DatabaseSchema {
  const defaults = buildDefaults();

  try {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(defaults, null, 2), "utf-8");
      return defaults;
    }
    const raw = fs.readFileSync(DB_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<DatabaseSchema>;
    return mergeWithDefaults(parsed, getEnvMongoConfig());
  } catch {
    return defaults;
  }
}

export function writeDb(data: DatabaseSchema): void {
  try {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch {
    // Serverless environments with read-only filesystems rely on MongoDB Atlas persistence
  }
}

/**
 * MongoDB-first async state loader for serverless deployments (Vercel) and local Node.
 * Falls back transparently to local JSON store if MongoDB is disabled or unreachable.
 */
export async function readDbAsync(): Promise<DatabaseSchema> {
  const envMongo = getEnvMongoConfig();
  const localSnapshot = readDb();
  const activeMongo =
    envMongo?.enabled && envMongo.uri
      ? envMongo
      : localSnapshot.mongoConfig?.enabled && localSnapshot.mongoConfig?.uri
      ? localSnapshot.mongoConfig
      : null;

  if (activeMongo) {
    const remote = await loadSnapshotFromMongo(
      activeMongo.uri,
      activeMongo.dbName
    );
    if (remote) {
      return mergeWithDefaults(remote, {
        ...activeMongo,
        lastStatus: `MongoDB Atlas Connected (isolated DB: ${activeMongo.dbName})`,
      });
    }
  }

  return localSnapshot;
}

/**
 * Persists state to MongoDB Atlas (authoritative in production/Vercel) and best-effort JSON cache.
 */
export async function writeDbAsync(
  data: DatabaseSchema,
  sections?: MongoSyncSection[]
): Promise<void> {
  writeDb(data);
  if (data.mongoConfig?.enabled && data.mongoConfig?.uri) {
    await syncSnapshotToMongoIfAvailable(
      data.mongoConfig.uri,
      data.mongoConfig.dbName,
      data,
      sections
    );
  }
}
