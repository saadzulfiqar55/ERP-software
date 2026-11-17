import { DatabaseSchema } from "@/lib/db";

/**
 * Idempotency Guard for Critical Mutations (POS Checkout, Ledger Posting)
 * Prevents duplicate financial transactions caused by double-clicks or offline queue retries.
 */
export function lookupIdempotencyRecord(
  db: DatabaseSchema,
  key: string | undefined,
  scope: string
) {
  if (!key) return null;
  const records = db.idempotencyRecords || [];
  return records.find((r) => r.key === key && r.scope === scope) || null;
}

export function storeIdempotencyRecord(
  db: DatabaseSchema,
  key: string | undefined,
  scope: string,
  responseStatus: number,
  responseBody: unknown
): void {
  if (!key) return;
  const existing = db.idempotencyRecords || [];
  db.idempotencyRecords = [
    {
      key,
      scope,
      createdAt: new Date().toISOString(),
      responseStatus,
      responseBody,
    },
    ...existing.slice(0, 199), // Retain recent 200 idempotency locks
  ];
}
