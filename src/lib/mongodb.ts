import dns from "node:dns";
import { MongoClient } from "mongodb";
import type { DatabaseSchema } from "./db";

/**
 * MongoDB Adapter for Albarka ERP & POS
 * Connects to MongoDB Atlas (or local MongoDB) while enforcing strict database isolation
 * into `albarka_erp` so shared clusters (e.g., `votix`) are never touched.
 */
export const DEFAULT_ISOLATED_DB_NAME = "albarka_erp";

const PROTECTED_FOREIGN_DBS = new Set(["votix", "admin", "local", "config"]);

export const MONGODB_COLLECTIONS = {
  USERS: "users",
  PRODUCTS: "products",
  ORDERS: "orders",
  INVOICES: "invoices",
  PARTIES: "parties",
  LEDGER: "ledger_entries",
  SETTINGS: "system_settings",
  SESSIONS: "active_sessions",
  AUDIT_LOGS: "session_audit_logs",
  IMMUTABLE_AUDIT_LOGS: "immutable_audit_logs",
  CASHIER_SHIFTS: "cashier_shifts",
  FISCAL_PERIODS: "fiscal_periods",
} as const;

export type MongoSyncSection = keyof typeof MONGODB_COLLECTIONS;

declare global {
  // Global singleton cache for MongoClient pools across Next.js hot reloads
  // eslint-disable-next-line no-var
  var __albarkaMongoClients: Map<string, Promise<MongoClient>> | undefined;
  // eslint-disable-next-line no-var
  var __albarkaMongoIndexesEnsured: Set<string> | undefined;
}

async function ensureMongoIndexes(
  db: ReturnType<MongoClient["db"]>,
  dbName: string
): Promise<void> {
  if (!globalThis.__albarkaMongoIndexesEnsured) {
    globalThis.__albarkaMongoIndexesEnsured = new Set<string>();
  }
  if (globalThis.__albarkaMongoIndexesEnsured.has(dbName)) return;
  globalThis.__albarkaMongoIndexesEnsured.add(dbName);

  await Promise.allSettled([
    db.collection(MONGODB_COLLECTIONS.USERS).createIndex({ username: 1 }),
    db.collection(MONGODB_COLLECTIONS.USERS).createIndex({ email: 1 }),
    db.collection(MONGODB_COLLECTIONS.PRODUCTS).createIndex({ code: 1, isArchived: 1 }),
    db.collection(MONGODB_COLLECTIONS.ORDERS).createIndex({ createdAt: -1 }),
    db.collection(MONGODB_COLLECTIONS.INVOICES).createIndex({ status: 1, dueDate: 1 }),
    db.collection(MONGODB_COLLECTIONS.LEDGER).createIndex({ partyId: 1, createdAt: -1 }),
  ]);
}

function getClientCache(): Map<string, Promise<MongoClient>> {
  if (!globalThis.__albarkaMongoClients) {
    globalThis.__albarkaMongoClients = new Map<string, Promise<MongoClient>>();
  }
  return globalThis.__albarkaMongoClients;
}

export function normalizeMongoUri(uri?: string): string {
  if (!uri) return "";
  return uri.trim().replace(/^["']|["']$/g, "").trim();
}

export function resolveIsolatedDbName(requested?: string): string {
  const raw =
    requested?.trim() ||
    process.env.MONGODB_DB_NAME?.trim() ||
    DEFAULT_ISOLATED_DB_NAME;
  const candidate = raw.replace(/^["']|["']$/g, "").trim() || DEFAULT_ISOLATED_DB_NAME;

  if (PROTECTED_FOREIGN_DBS.has(candidate.toLowerCase())) {
    throw new Error(
      `Database '${candidate}' is protected to keep Albarka ERP isolated from other cluster databases. Use '${DEFAULT_ISOLATED_DB_NAME}'.`
    );
  }

  return candidate;
}

export function hasUnreplacedPasswordPlaceholder(uri: string): boolean {
  return uri.includes("<db_password>") || uri.includes("<password>");
}

export function isMaskedMongoUri(uri: string): boolean {
  return uri.includes(":****@");
}

/**
 * Redacts the password portion of a MongoDB connection URI before sending to browser clients.
 */
export function maskMongoUri(uri: string): string {
  if (!uri) return "";
  return uri.replace(
    /^(mongodb(?:\+srv)?:\/\/[^:/?#]+:)([^@/?#]+)(@)/i,
    "$1****$3"
  );
}

/**
 * Ensures the URI never implicitly targets `votix` in its path component.
 */
export function assertSafeMongoUri(uri: string): void {
  const trimmed = normalizeMongoUri(uri);
  if (!trimmed.startsWith("mongodb://") && !trimmed.startsWith("mongodb+srv://")) {
    throw new Error("Provide a valid mongodb:// or mongodb+srv:// URI.");
  }

  const withoutProtocol = trimmed.replace(/^mongodb(?:\+srv)?:\/\//i, "");
  const slashIdx = withoutProtocol.indexOf("/");
  if (slashIdx !== -1) {
    const dbSegment = withoutProtocol
      .slice(slashIdx + 1)
      .split("?")[0]
      .trim()
      .toLowerCase();
    if (dbSegment && PROTECTED_FOREIGN_DBS.has(dbSegment)) {
      throw new Error(
        `Connection URI targets protected database '${dbSegment}'. Point it to '/${DEFAULT_ISOLATED_DB_NAME}' instead.`
      );
    }
  }
}

async function connectWithDnsFallback(uri: string): Promise<MongoClient> {
  const options = {
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: 10,
  };
  try {
    const client = new MongoClient(uri, options);
    return await client.connect();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (
      uri.startsWith("mongodb+srv://") &&
      (msg.includes("querySrv") || msg.includes("ECONNREFUSED") || msg.includes("ETIMEOUT"))
    ) {
      // Fallback for Windows/ISP routers whose local DNS stub rejects SRV lookups
      dns.setServers(["8.8.8.8", "1.1.1.1"]);
      const retryClient = new MongoClient(uri, options);
      return await retryClient.connect();
    }
    throw err;
  }
}

async function getMongoClient(uri: string): Promise<MongoClient> {
  const cache = getClientCache();
  const existing = cache.get(uri);
  if (existing) {
    return existing;
  }

  const promise = connectWithDnsFallback(uri).catch((err) => {
    cache.delete(uri);
    throw err;
  });

  cache.set(uri, promise);
  return promise;
}

export async function pingMongoConnection(
  rawUri: string,
  requestedDbName?: string
): Promise<{
  connected: boolean;
  engine: string;
  dbName: string;
  message: string;
}> {
  const uri = normalizeMongoUri(rawUri);
  let dbName = DEFAULT_ISOLATED_DB_NAME;
  try {
    dbName = resolveIsolatedDbName(requestedDbName);
  } catch (err) {
    return {
      connected: false,
      engine: "Isolation Guard Blocked",
      dbName: DEFAULT_ISOLATED_DB_NAME,
      message: err instanceof Error ? err.message : "Invalid database name.",
    };
  }

  if (!uri || !uri.startsWith("mongodb")) {
    return {
      connected: false,
      engine: "Local JSON Store (Fallback Active)",
      dbName,
      message:
        "Provide a valid mongodb:// or mongodb+srv:// URI (or set MONGODB_URI in Vercel Environment Variables without quotes) to enable live MongoDB storage.",
    };
  }

  if (isMaskedMongoUri(uri)) {
    return {
      connected: false,
      engine: "Local JSON Store (Credentials Required)",
      dbName,
      message:
        "URI password is masked (****). Set MONGODB_URI in Vercel Environment Variables (no quotes) or paste the full connection URI with your password.",
    };
  }

  if (hasUnreplacedPasswordPlaceholder(uri)) {
    return {
      connected: false,
      engine: "Local JSON Store (Password Required)",
      dbName,
      message: `Atlas URI configured for isolated DB '${dbName}'. Replace <db_password> in .env.local (or paste the full URI above) to connect.`,
    };
  }

  try {
    assertSafeMongoUri(uri);
    const client = await getMongoClient(uri);
    await client.db(dbName).command({ ping: 1 });
    return {
      connected: true,
      engine: "MongoDB Atlas / Native Driver",
      dbName,
      message: `Connected to isolated database '${dbName}' successfully.`,
    };
  } catch (err) {
    return {
      connected: false,
      engine: "Hybrid JSON + MongoDB Ready",
      dbName,
      message: `MongoDB connection check: ${
        err instanceof Error ? err.message : "Unreachable"
      }`,
    };
  }
}

async function replaceCollectionDocs<T extends { id?: string }>(
  db: ReturnType<MongoClient["db"]>,
  collectionName: string,
  docs: T[]
): Promise<void> {
  const collection = db.collection(collectionName);
  await collection.deleteMany({});
  if (docs.length > 0) {
    await collection.insertMany(
      docs.map((doc) => ({
        ...doc,
        _syncedAt: new Date().toISOString(),
      }))
    );
  }
}

export async function syncSnapshotToMongoIfAvailable(
  uri: string,
  requestedDbName: string,
  snapshot: DatabaseSchema,
  sections?: MongoSyncSection[]
): Promise<boolean> {
  if (!uri || !uri.startsWith("mongodb") || hasUnreplacedPasswordPlaceholder(uri)) {
    return false;
  }

  try {
    assertSafeMongoUri(uri);
    const dbName = resolveIsolatedDbName(requestedDbName);
    const client = await getMongoClient(uri);
    const db = client.db(dbName);
    await ensureMongoIndexes(db, dbName);

    // Strip any raw URI credentials before persisting snapshot metadata
    const sanitizedSnapshot: DatabaseSchema = {
      ...snapshot,
      mongoConfig: {
        ...snapshot.mongoConfig,
        uri: maskMongoUri(snapshot.mongoConfig.uri),
        dbName,
      },
    };

    const syncSet = sections ? new Set<MongoSyncSection>(sections) : null;
    const shouldSync = (section: MongoSyncSection) =>
      !syncSet || syncSet.has(section);

    const ops: Array<Promise<unknown>> = [
      db
        .collection<{ _id: string } & Record<string, unknown>>(
          MONGODB_COLLECTIONS.SETTINGS
        )
        .updateOne(
          { _id: "albarka_master_snapshot" },
          {
            $set: {
              ...sanitizedSnapshot,
              updatedAt: new Date().toISOString(),
            },
          },
          { upsert: true }
        ),
    ];

    if (shouldSync("USERS")) {
      ops.push(
        replaceCollectionDocs(db, MONGODB_COLLECTIONS.USERS, snapshot.users)
      );
    }
    if (shouldSync("PRODUCTS")) {
      ops.push(
        replaceCollectionDocs(
          db,
          MONGODB_COLLECTIONS.PRODUCTS,
          snapshot.products
        )
      );
    }
    if (shouldSync("ORDERS")) {
      ops.push(
        replaceCollectionDocs(db, MONGODB_COLLECTIONS.ORDERS, snapshot.orders)
      );
    }
    if (shouldSync("INVOICES")) {
      ops.push(
        replaceCollectionDocs(
          db,
          MONGODB_COLLECTIONS.INVOICES,
          snapshot.erpInvoices || []
        )
      );
    }
    if (shouldSync("PARTIES")) {
      ops.push(
        replaceCollectionDocs(db, MONGODB_COLLECTIONS.PARTIES, snapshot.parties)
      );
    }
    if (shouldSync("LEDGER")) {
      ops.push(
        replaceCollectionDocs(db, MONGODB_COLLECTIONS.LEDGER, snapshot.ledger)
      );
    }
    if (shouldSync("AUDIT_LOGS")) {
      ops.push(
        replaceCollectionDocs(
          db,
          MONGODB_COLLECTIONS.AUDIT_LOGS,
          snapshot.sessionAuditLogs
        )
      );
    }
    if (shouldSync("IMMUTABLE_AUDIT_LOGS")) {
      ops.push(
        replaceCollectionDocs(
          db,
          MONGODB_COLLECTIONS.IMMUTABLE_AUDIT_LOGS,
          snapshot.immutableAuditLogs
        )
      );
    }
    if (shouldSync("CASHIER_SHIFTS")) {
      ops.push(
        replaceCollectionDocs(
          db,
          MONGODB_COLLECTIONS.CASHIER_SHIFTS,
          snapshot.cashierShifts
        )
      );
    }
    if (shouldSync("SESSIONS")) {
      ops.push(
        db
          .collection<{ _id: string } & Record<string, unknown>>(
            MONGODB_COLLECTIONS.SESSIONS
          )
          .updateOne(
            { _id: "single_active_session" },
            {
              $set: {
                activeSession: snapshot.activeSession,
                updatedAt: new Date().toISOString(),
              },
            },
            { upsert: true }
          )
      );
    }

    await Promise.all(ops);
    return true;
  } catch {
    return false;
  }
}

export async function loadSnapshotFromMongo(
  uri: string,
  requestedDbName?: string
): Promise<Partial<DatabaseSchema> | null> {
  if (!uri || !uri.startsWith("mongodb") || hasUnreplacedPasswordPlaceholder(uri)) {
    return null;
  }

  try {
    assertSafeMongoUri(uri);
    const dbName = resolveIsolatedDbName(requestedDbName);
    const client = await getMongoClient(uri);
    const db = client.db(dbName);
    const doc = await db
      .collection<{ _id: string } & Partial<DatabaseSchema> & { updatedAt?: string }>(
        MONGODB_COLLECTIONS.SETTINGS
      )
      .findOne({ _id: "albarka_master_snapshot" });

    if (!doc) return null;
    const { _id: _omitId, updatedAt: _omitUpdatedAt, ...snapshot } = doc;
    void _omitId;
    void _omitUpdatedAt;
    return snapshot;
  } catch {
    return null;
  }
}
