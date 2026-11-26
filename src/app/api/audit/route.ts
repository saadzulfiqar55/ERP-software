import { NextResponse } from "next/server";
import { readErrorResponse, requireRequestActor } from "@/core/auth/request-actor";
import { readJournalPage } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/audit?cursor=&limit=
 * Pages through the immutable audit log, newest first.
 */
export async function GET(request: Request) {
  try {
    const { tenant } = await requireRequestActor("accounting:ledger:view");
    const url = new URL(request.url);
    const page = await readJournalPage(tenant.id, "audit", {
      cursor: url.searchParams.get("cursor"),
      limit: Number(url.searchParams.get("limit")) || 100,
    });
    return NextResponse.json(page);
  } catch (err) {
    return readErrorResponse(err);
  }
}
