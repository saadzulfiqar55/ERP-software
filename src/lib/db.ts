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
