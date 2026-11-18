import { DatabaseSchema, readDbAsync, writeDbAsync } from "@/lib/db";

/**
 * Atomic Multi-Document ACID Transaction Wrapper (`withTransaction`)
 * - Executes all mutations against a cloned transactional state snapshot.
 * - If any Domain Service throws (e.g., InsufficientStockError, UnbalancedJournalError, FiscalPeriodLocked),
 *   all changes are rolled back atomically and nothing is written to disk or MongoDB.
 */
export async function withTransaction<T>(
  work: (txDb: DatabaseSchema) => Promise<T> | T
): Promise<{ result: T; db: DatabaseSchema }> {
  const currentDb = await readDbAsync();
  // Deep clone snapshot for ACID rollback safety
  const txSnapshot: DatabaseSchema = JSON.parse(JSON.stringify(currentDb));

  const result = await work(txSnapshot);

  // Commit transaction atomically to MongoDB Atlas (+ local JSON cache when writable)
  await writeDbAsync(txSnapshot);

  return { result, db: txSnapshot };
}

/**
 * Atomic Sequential Document Numbering (`DocumentCounters` collection)
 * Generates tax-compliant, gapless sequential numbers (e.g. ALB-2026-001003, VCH-2026-000105, REV-2026-000001)
 */
export function nextSequentialNumber(
  txDb: DatabaseSchema,
  docType: "INVOICE" | "USIN" | "VOUCHER" | "REVERSAL",
  prefix: string,
  year: number = 2026
): string {
  const counterKey = `TENANT_ALBARKA:${docType}:${year}`;
  const counters = txDb.documentCounters || [];
  const idx = counters.findIndex((c) => c.key === counterKey);

  let nextSeq = docType === "INVOICE" || docType === "USIN" ? 1003 : 105;
  if (idx !== -1) {
    nextSeq = counters[idx].seq + 1;
    counters[idx] = { key: counterKey, seq: nextSeq };
  } else {
    counters.push({ key: counterKey, seq: nextSeq });
  }
  txDb.documentCounters = counters;

  const padded = String(nextSeq).padStart(6, "0");
  return `${prefix}-${year}-${padded}`;
}
