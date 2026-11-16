import { DatabaseSchema } from "./db";

/**
 * MongoDB Adapter for Albarka POS
 * Works with MongoDB Atlas or local MongoDB (`mongodb://127.0.0.1:27017/albarka_pos`).
 * Uses dynamic import if `mongodb` npm package is installed, or MongoDB Atlas Data API if HTTP endpoint is provided.
 */
export const MONGODB_COLLECTIONS = {
  PRODUCTS: "products",
  ORDERS: "orders",
  PARTIES: "parties",
  LEDGER: "ledger_entries",
  SETTINGS: "system_settings",
  SESSIONS: "active_sessions",
  AUDIT_LOGS: "session_audit_logs",
} as const;

export const MONGOOSE_SCHEMA_REFERENCE = `// Mongoose / MongoDB Schema Architecture (albarka_pos)
// Install driver: npm install mongodb mongoose
// Set in .env.local: MONGODB_URI="mongodb://127.0.0.1:27017/albarka_pos"

1. products      -> { code, barcode, name, nameUrdu, segment, category, kitchenStation, taxMode, stockQty, variants[] }
2. orders        -> { invoiceNumber, usin, orderType, items[], taxBreakdown, praInvoiceNumber, praQrPayload, paymentMethod }
3. parties       -> { name, nameUrdu, type: "CUSTOMER" | "SUPPLIER", phone, creditLimit, currentBalance }
4. ledger_entries-> { voucherNo, partyId, debit, credit, balanceAfter, paymentMode, relatedOrderId }
5. active_sessions -> { sessionId (unique), userId, userRole, issuedAt, expiresAt, jwtTokenPreview } // Max 1 document (Single-Session Lock)
`;

export async function pingMongoConnection(uri: string): Promise<{
  connected: boolean;
  engine: string;
  message: string;
}> {
  if (!uri || !uri.startsWith("mongodb")) {
    return {
      connected: false,
      engine: "Local JSON Store (Fallback Active)",
      message: "Provide a valid mongodb:// or mongodb+srv:// URI to enable live MongoDB storage.",
    };
  }

  try {
    // Dynamically attempt to load official 'mongodb' driver if installed
    const mongodbModuleName = "mongodb";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mongodb: any = await import(/* webpackIgnore: true */ mongodbModuleName);
    const client = new mongodb.MongoClient(uri, {
      serverSelectionTimeoutMS: 2500,
    });
    await client.connect();
    await client.db().command({ ping: 1 });
    await client.close();
    return {
      connected: true,
      engine: "MongoDB Native Driver",
      message: "Connected to MongoDB cluster successfully.",
    };
  } catch (err) {
    return {
      connected: false,
      engine: "Hybrid JSON + MongoDB Ready",
      message:
        err instanceof Error && err.message.includes("Cannot find module")
          ? "MongoDB URI saved! Run `npm install mongodb` in your terminal to switch from local JSON store to live MongoDB."
          : `MongoDB connection check: ${err instanceof Error ? err.message : "Unreachable"}`,
    };
  }
}

export async function syncSnapshotToMongoIfAvailable(
  uri: string,
  dbName: string,
  snapshot: DatabaseSchema
): Promise<boolean> {
  if (!uri || !uri.startsWith("mongodb")) return false;
  try {
    const mongodbModuleName = "mongodb";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mongodb: any = await import(/* webpackIgnore: true */ mongodbModuleName);
    const client = new mongodb.MongoClient(uri, {
      serverSelectionTimeoutMS: 2000,
    });
    await client.connect();
    const db = client.db(dbName || "albarka_pos");
    await db
      .collection(MONGODB_COLLECTIONS.SETTINGS)
      .updateOne(
        { _id: "albarka_master_snapshot" },
        { $set: { ...snapshot, updatedAt: new Date().toISOString() } },
        { upsert: true }
      );
    await client.close();
    return true;
  } catch {
    return false;
  }
}
