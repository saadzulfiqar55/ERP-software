import { NextResponse } from "next/server";
import { assertActorPermission } from "@/core/auth";
import { withTransaction } from "@/core/db";
import { lookupIdempotencyRecord, storeIdempotencyRecord } from "@/core/idempotency";
import { sanitizeNoSqlPayload } from "@/core/validation";
import { InventoryService } from "@/modules/inventory/inventory.service";
import { AccountingService } from "@/modules/accounting/accounting.service";
import { POSService } from "@/modules/pos/pos.service";

export async function POST(request: Request) {
  try {
    const rawBody = await request.json();
    const body = sanitizeNoSqlPayload(rawBody);
    const idempotencyKey = body.idempotencyKey as string | undefined;

    const { result, db } = await withTransaction(async (txDb) => {
      // 1. Check Idempotency Lock first
      const cached = lookupIdempotencyRecord(txDb, idempotencyKey, "POS_ORDER_CREATE");
      if (cached) {
        return cached.responseBody as ReturnType<
          typeof POSService.completeSaleTransaction
        >;
      }

      // 2. Verify Granular RBAC Permission (`pos:sale:create`)
      const actor = await assertActorPermission(txDb, "pos:sale:create");

      // 3. Execute Domain Service inside ACID transaction
      const saleResult = POSService.completeSaleTransaction(txDb, body, actor);

      // 4. Record Idempotency Key
      storeIdempotencyRecord(txDb, idempotencyKey, "POS_ORDER_CREATE", 200, saleResult);

      return saleResult;
    });

    return NextResponse.json({
      order: result.order,
      praPayload: result.praPayload,
      db: {
        ...db,
        products: InventoryService.listActiveProducts(db),
        parties: AccountingService.listActiveParties(db),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to complete POS transaction" },
      { status: 400 }
    );
  }
}
