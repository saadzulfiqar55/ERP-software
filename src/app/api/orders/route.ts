import { NextResponse } from "next/server";
import { isoParam, readErrorResponse, requireRequestActor } from "@/core/auth/request-actor";
import { readJournalPage } from "@/lib/db";
import {
  assertActorPermission,
  resolveAuthenticatedTenantId,
} from "@/core/auth";
import { buildScopedStateResponse } from "@/core/auth/state-scoper";
import { mapDataLayerError, withTransaction } from "@/core/db";
import {
  lookupIdempotencyRecord,
  storeIdempotencyRecord,
} from "@/core/idempotency";
import { SaaSEntitlementError } from "@/core/saas/entitlements";
import { sanitizeNoSqlPayload } from "@/core/validation";
import { UserProfile } from "@/lib/types";
import { POSService } from "@/modules/pos/pos.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/orders?cursor=&limit=&q=&from=&to=
 * Pages through all POS orders, newest first. `q` matches invoice / PRA number / customer.
 */
export async function GET(request: Request) {
  try {
    const { tenant } = await requireRequestActor();
    const url = new URL(request.url);
    const page = await readJournalPage(tenant.id, "orders", {
      cursor: url.searchParams.get("cursor"),
      limit: Number(url.searchParams.get("limit")) || 50,
      search: url.searchParams.get("q")?.slice(0, 100) || undefined,
      from: isoParam(url.searchParams.get("from")),
      to: isoParam(url.searchParams.get("to")),
    });
    return NextResponse.json(page);
  } catch (err) {
    return readErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const sessionTenantId = await resolveAuthenticatedTenantId();
    if (!sessionTenantId) {
      return NextResponse.json(
        { error: "Authentication required: Sign in with an active workspace profile." },
        { status: 401 }
      );
    }

    const rawBody = await request.json();
    const body = sanitizeNoSqlPayload(rawBody);
    const idempotencyKey = body.idempotencyKey as string | undefined;

    let actorRef: UserProfile | null = null;

    const { result, db } = await withTransaction(
      async (txDb, ctx) => {
        const actor = await assertActorPermission(txDb, "pos:sale:create");
        actorRef = actor;

        const cached = await lookupIdempotencyRecord(
          ctx,
          idempotencyKey,
          `POS_ORDER_CREATE:${txDb.tenant.id}`
        );
        if (cached) {
          return cached.responseBody as ReturnType<
            typeof POSService.completeSaleTransaction
          >;
        }

        const saleResult = POSService.completeSaleTransaction(txDb, body, actor);

        await storeIdempotencyRecord(
          ctx,
          idempotencyKey,
          `POS_ORDER_CREATE:${txDb.tenant.id}`,
          200,
          saleResult
        );

        return saleResult;
      },
      [
        "ORDERS",
        "PRODUCTS",
        "PARTIES",
        "LEDGER",
        "CASHIER_SHIFTS",
        "IMMUTABLE_AUDIT_LOGS",
      ],
      sessionTenantId
    );

    return NextResponse.json({
      order: result.order,
      praPayload: result.praPayload,
      db: buildScopedStateResponse(db, actorRef),
    });
  } catch (err) {
    const dataLayer = mapDataLayerError(err);
    if (dataLayer) {
      return NextResponse.json(dataLayer.body, { status: dataLayer.status });
    }
    if (err instanceof SaaSEntitlementError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.statusCode }
      );
    }
    const message =
      err instanceof Error ? err.message : "Failed to complete POS transaction";
    const status = message.includes("Access Denied")
      ? 403
      : message.includes("Authentication required")
      ? 401
      : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
