import { NextResponse } from "next/server";
import { readErrorResponse, requireRequestActor } from "@/core/auth/request-actor";
import { hasGranularPermission } from "@/core/auth/permissions";
import { readTenantSummary } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/summary?year=2026&tz=Asia/Karachi
 * All-time order totals, per-month revenue for `year` (in time zone `tz`), and counts —
 * computed in SQL so the browser never needs every order.
 */
export async function GET(request: Request) {
  try {
    const { tenant, actor } = await requireRequestActor();
    const url = new URL(request.url);
    const summary = await readTenantSummary(tenant.id, {
      year: Number(url.searchParams.get("year")) || undefined,
      timeZone: url.searchParams.get("tz") || undefined,
    });
    // Ledger and audit counts follow the same visibility as the lists themselves.
    if (!hasGranularPermission(actor.role, "accounting:ledger:view")) {
      summary.ledgerCount = 0;
      summary.auditCount = 0;
    }
    return NextResponse.json(summary);
  } catch (err) {
    return readErrorResponse(err);
  }
}
