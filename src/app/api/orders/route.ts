import { NextResponse } from "next/server";
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
      async (txDb) => {
        const actor = await assertActorPermission(txDb, "pos:sale:create");
        actorRef = actor;

        const cached = lookupIdempotencyRecord(
          txDb,
          idempotencyKey,
          `POS_ORDER_CREATE:${txDb.tenant.id}`
        );
        if (cached) {
          return cached.responseBody as ReturnType<
            typeof POSService.completeSaleTransaction
          >;
        }

        const saleResult = POSService.completeSaleTransaction(txDb, body, actor);

        storeIdempotencyRecord(
          txDb,
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
