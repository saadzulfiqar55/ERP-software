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
}

const DB_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DB_DIR, "albarka-db.json");

const DEFAULT_MONGO_CONFIG: MongoDBConfig = {
  enabled: Boolean(process.env.MONGODB_URI),
  uri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/albarka_pos",
  dbName: "albarka_pos",
  lastStatus: process.env.MONGODB_URI
    ? "Configured via MONGODB_URI"
    : "Local JSON File Store Active (data/albarka-db.json) — MongoDB Ready",
};

const DEFAULT_CASHIER_SHIFT: CashierShift = {
  id: "shift-2026-11-17-morning",
  tenantId: "TENANT_ALBARKA",
  branchId: "BRANCH_GULBERG_01",
  openedAt: "2026-11-17T08:00:00.000Z",
  openedBy: "Haji Tariq Mahmood (ADMIN)",
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
    lockedBy: "Haji Tariq Mahmood (ADMIN)",
  },
  {
    periodKey: "2026-11",
    label: "November 2026 (Current Active Period)",
    isLocked: false,
  },
];

export function readDb(): DatabaseSchema {
  const defaults: DatabaseSchema = {
    praConfig: INITIAL_PRA_CONFIG,
    mongoConfig: DEFAULT_MONGO_CONFIG,
    products: INITIAL_PRODUCTS,
    orders: INITIAL_ORDERS,
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
        actorName: "Haji Tariq Mahmood",
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
  };

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
    return {
      ...defaults,
      ...parsed,
      users: parsed.users && parsed.users.length > 0 ? parsed.users : INITIAL_USERS,
      mongoConfig: parsed.mongoConfig || DEFAULT_MONGO_CONFIG,
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
    };
  } catch {
    return defaults;
  }
}

export function writeDb(data: DatabaseSchema): void {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
}
