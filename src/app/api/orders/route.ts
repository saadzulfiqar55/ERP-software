import { NextResponse } from "next/server";
import { assertActorPermission } from "@/core/auth";
import { buildScopedStateResponse } from "@/core/auth/state-scoper";
import { withTransaction } from "@/core/db";
import { lookupIdempotencyRecord, storeIdempotencyRecord } from "@/core/idempotency";
import { sanitizeNoSqlPayload } from "@/core/validation";
import { UserProfile } from "@/lib/types";
import { POSService } from "@/modules/pos/pos.service";

export async function POST(request: Request) {
  try {
    const rawBody = await request.json();
    const body = sanitizeNoSqlPayload(rawBody);
    const idempotencyKey = body.idempotencyKey as string | undefined;

    let actorRef: UserProfile | null = null;

    const { result, db } = await withTransaction(async (txDb) => {
      // Verify Granular RBAC Permission (`pos:sale:create`) before returning cached idempotency too
      const actor = await assertActorPermission(txDb, "pos:sale:create");
      actorRef = actor;

      // 1. Check Idempotency Lock
      const cached = lookupIdempotencyRecord(txDb, idempotencyKey, "POS_ORDER_CREATE");
      if (cached) {
        return cached.responseBody as ReturnType<
          typeof POSService.completeSaleTransaction
        >;
      }

      // 2. Execute Domain Service inside ACID transaction
      const saleResult = POSService.completeSaleTransaction(txDb, body, actor);

      // 3. Record Idempotency Key
      storeIdempotencyRecord(txDb, idempotencyKey, "POS_ORDER_CREATE", 200, saleResult);

      return saleResult;
    }, ["ORDERS", "PRODUCTS", "PARTIES", "LEDGER", "CASHIER_SHIFTS", "IMMUTABLE_AUDIT_LOGS"]);

    return NextResponse.json({
      order: result.order,
      praPayload: result.praPayload,
      db: buildScopedStateResponse(db, actorRef),
    });
  } catch (err) {
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
