import { DEFAULT_TENANT_ID } from "@/core/audit";
import { resolveAuthenticatedTenantId } from "@/core/auth";
import { DatabaseSchema, runTenantTransaction, TenantNotFoundError } from "@/lib/db";
import { DatabaseNotConfiguredError } from "@/lib/postgres";
import type { PostgresSyncSection } from "@/lib/postgres";

/**
 * Tenant-scoped database transaction (`withTransaction`).
 * - Tenant comes from `explicitTenantId` (webhooks, sign-in, provisioning) or the verified
 *   session JWT. There is no fallback tenant: with neither, the call is rejected.
 * - Runs in one Postgres transaction holding that tenant's write lock, so concurrent
 *   requests for the same tenant run one after another.
 * - If any domain service or plan guard throws, or a write fails, nothing is committed
 *   and the error propagates to the caller.
 *
 * `_legacySections` is ignored: changed rows are detected automatically.
 */
export async function withTransaction<T>(
  work: (txDb: DatabaseSchema) => Promise<T> | T,
  _legacySections?: PostgresSyncSection[],
  explicitTenantId?: string
): Promise<{ result: T; db: DatabaseSchema }> {
  void _legacySections;
  const tenantId = explicitTenantId || (await resolveAuthenticatedTenantId());
  if (!tenantId) {
    throw new Error("Authentication required: Sign in with an active workspace profile.");
  }
  return runTenantTransaction(tenantId, work);
}

/**
 * Tenant-Isolated Atomic Sequential Document Numbering (`DocumentCounters`)
 * Generates gapless sequential numbers scoped per tenant (e.g. SL-2026-000001, VCH-2026-000001)
 */
export function nextSequentialNumber(
  txDb: DatabaseSchema,
  docType: "INVOICE" | "USIN" | "VOUCHER" | "REVERSAL",
  prefix?: string,
  year: number = new Date().getFullYear()
): string {
  const tenantId = txDb.tenant?.id || DEFAULT_TENANT_ID;
  const effectivePrefix =
    prefix && prefix !== "ALB"
      ? prefix
      : docType === "INVOICE"
      ? txDb.tenant?.invoicePrefix || "SL"
      : prefix || "SL";

  const counterKey = `${tenantId}:${docType}:${year}`;
  const counters = txDb.documentCounters || [];
  const idx = counters.findIndex((c) => c.key === counterKey);

  let nextSeq = 1;
  if (idx !== -1) {
    nextSeq = counters[idx].seq + 1;
    counters[idx] = { tenantId, key: counterKey, seq: nextSeq };
  } else {
    counters.push({ tenantId, key: counterKey, seq: nextSeq });
  }
  txDb.documentCounters = counters;

  const padded = String(nextSeq).padStart(6, "0");
  return `${effectivePrefix}-${year}-${padded}`;
}

/**
 * Maps data-layer failures to HTTP responses so a database outage is reported as one
 * (503) instead of a validation error, and nothing is ever reported as saved when it wasn't.
 * Returns null for ordinary domain errors, which callers handle as before.
 */
export function mapDataLayerError(
  err: unknown
): { status: number; body: { error: string; code: string } } | null {
  if (err instanceof TenantNotFoundError) {
    return { status: 404, body: { error: err.message, code: "TENANT_NOT_FOUND" } };
  }
  if (err instanceof DatabaseNotConfiguredError) {
    console.error("[db] not configured:", err.message);
    return {
      status: 503,
      body: { error: "The database is not configured. Nothing was saved.", code: "DB_NOT_CONFIGURED" },
    };
  }
  const pgCode = (err as { code?: unknown })?.code;
  const isPgError =
    typeof pgCode === "string" &&
    (/^[0-9A-Z]{5}$/.test(pgCode) || /^(ECONN|ETIMEDOUT|ENOTFOUND|CONNECT_TIMEOUT|CONNECTION_)/.test(pgCode));
  if (isPgError) {
    console.error("[db] query failed:", pgCode, err instanceof Error ? err.message : err);
    return {
      status: 503,
      body: {
        error: "The database is temporarily unavailable. Nothing was saved; please retry.",
        code: "DB_UNAVAILABLE",
      },
    };
  }
  return null;
}
