import type { TransactionContext } from "@/core/db";

/**
 * Idempotency guard for critical mutations (POS checkout, ledger posting).
 * Prevents duplicate financial transactions from double-clicks or offline-queue replays.
 *
 * Records live in `stacklyra_idempotency` (kept 90 days) and are read and written inside
 * the tenant's transaction, so concurrent replays of the same key resolve to one result.
 */
export async function lookupIdempotencyRecord(
  ctx: TransactionContext,
  key: string | undefined,
  scope: string
): Promise<{ responseStatus: number; responseBody: unknown } | null> {
  if (!key) return null;
  return ctx.findIdempotency(scope, key);
}

export async function storeIdempotencyRecord(
  ctx: TransactionContext,
  key: string | undefined,
  scope: string,
  responseStatus: number,
  responseBody: unknown
): Promise<void> {
  if (!key) return;
  await ctx.storeIdempotency(scope, key, responseStatus, responseBody);
}
