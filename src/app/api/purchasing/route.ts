import { NextResponse } from "next/server";
import { assertActorPermission } from "@/core/auth";
import { hasGranularPermission } from "@/core/auth/permissions";
import { readErrorResponse, requireRequestActor } from "@/core/auth/request-actor";
import { mapDataLayerError, withTransaction } from "@/core/db";
import { assertTenantWriteActive, SaaSEntitlementError } from "@/core/saas/entitlements";
import { DatabaseSchema, readTenantSlice } from "@/lib/db";
import { PartyAccount, UserProfile } from "@/lib/types";
import {
  PurchaseLineInput,
  PurchasingError,
  PurchasingService,
  ReceiveLineInput,
} from "@/modules/purchasing/purchasing.service";

export const dynamic = "force-dynamic";

function supplierView(p: PartyAccount, showBalance: boolean) {
  return {
    id: p.id,
    name: p.name,
    phone: p.phone,
    ntnOrCnic: p.ntnOrCnic || "",
    // Negative = we owe the supplier. Only shown to roles that can see the khata.
    balanceMinor: showBalance
      ? p.currentBalanceMinor ?? Math.round(p.currentBalance * 100)
      : null,
  };
}

/** Everything the Purchasing screen needs, scoped to what the actor may see. */
function buildView(db: DatabaseSchema, actor: UserProfile) {
  const canViewLedger = hasGranularPermission(actor.role, "accounting:ledger:view");
  return {
    purchaseOrders: [...(db.purchaseOrders || [])].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    ),
    goodsReceipts: db.goodsReceipts || [],
    suppliers: db.parties
      .filter((p) => p.type === "SUPPLIER" && !p.isArchived)
      .map((p) => supplierView(p, canViewLedger))
      .sort((a, b) => a.name.localeCompare(b.name)),
    materials: (db.stockMonitor || []).map((s) => ({
      id: s.id,
      name: s.name,
      sku: s.sku,
      unit: s.unit,
      currentQty: s.currentQty,
      reorderTarget: s.reorderTarget,
      lastUnitCostMinor: s.lastUnitCostMinor ?? null,
      avgUnitCostMinor: s.avgUnitCostMinor ?? null,
    })),
    products: db.products
      .filter((p) => !p.isArchived)
      .map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        unit: p.unit,
        segment: p.segment,
        stockQty: p.stockQty,
        variants: p.variants.map((v) => ({ id: v.id, name: v.name, costPrice: v.costPrice })),
      })),
    permissions: {
      canManage: hasGranularPermission(actor.role, "purchasing:manage"),
      canReceive: hasGranularPermission(actor.role, "purchasing:receive"),
      canViewBalances: canViewLedger,
    },
  };
}

const VIEW_FIELDS: Array<keyof DatabaseSchema> = [
  "purchaseOrders",
  "goodsReceipts",
  "parties",
  "products",
];

/** GET /api/purchasing — orders, recent goods receipts, suppliers and purchasable items. */
export async function GET() {
  try {
    const { tenant, actor } = await requireRequestActor("purchasing:manage");
    const db = await readTenantSlice(tenant.id, VIEW_FIELDS);
    return NextResponse.json(buildView(db, actor));
  } catch (err) {
    return readErrorResponse(err);
  }
}

type Body = {
  action?: string;
  idempotencyKey?: string;
  // CREATE_SUPPLIER
  name?: string;
  phone?: string;
  ntnOrCnic?: string;
  // SAVE_ORDER
  id?: string;
  supplierId?: string;
  lines?: unknown;
  expectedDate?: string;
  notes?: string;
  place?: boolean;
  // PLACE / CANCEL / CLOSE / RECEIVE
  poId?: string;
  reason?: string;
  supplierInvoiceRef?: string;
};

/**
 * POST /api/purchasing
 *   { action: "CREATE_SUPPLIER", name, phone?, ntnOrCnic? }
 *   { action: "SAVE_ORDER", id?, supplierId, lines: [{itemKind,itemId,variantId?,qtyOrdered,unitCostMinor}], expectedDate?, notes?, place? }
 *   { action: "PLACE_ORDER" | "CLOSE_ORDER", poId }
 *   { action: "CANCEL_ORDER", poId, reason? }
 *   { action: "RECEIVE", poId, idempotencyKey, lines: [{poLineId, qty, unitCostMinor?}], supplierInvoiceRef?, notes? }
 * Every action runs in one tenant transaction and returns the refreshed purchasing view.
 */
export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body || typeof body.action !== "string") {
    return NextResponse.json({ error: "Missing action." }, { status: 400 });
  }
  const action = body.action;
  const permission = action === "RECEIVE" ? "purchasing:receive" : "purchasing:manage";
  const idemKey =
    typeof body.idempotencyKey === "string" && body.idempotencyKey.length <= 100
      ? body.idempotencyKey
      : "";

  try {
    const { result, db } = await withTransaction(
      async (txDb, ctx) => {
        const actor = await assertActorPermission(txDb, permission);
        assertTenantWriteActive(txDb.tenant);

        if (action === "RECEIVE") {
          if (!idemKey) throw new PurchasingError("Missing idempotencyKey.");
          const scope = `PURCHASING_RECEIVE:${txDb.tenant.id}`;
          const replay = await ctx.findIdempotency(scope, idemKey);
          if (replay) {
            return { actor, message: "Already recorded.", replay: replay.responseBody };
          }
          const { grn } = PurchasingService.receive(
            txDb,
            {
              poId: String(body.poId || ""),
              lines: (Array.isArray(body.lines) ? body.lines : []) as ReceiveLineInput[],
              supplierInvoiceRef: body.supplierInvoiceRef,
              notes: body.notes,
            },
            actor
          );
          const summary = { grnId: grn.id, grnNumber: grn.grnNumber, totalMinor: grn.totalMinor, ledgerVoucherNo: grn.ledgerVoucherNo || null };
          await ctx.storeIdempotency(scope, idemKey, 200, summary);
          return { actor, message: `Recorded ${grn.grnNumber}.`, grn: summary };
        }

        switch (action) {
          case "CREATE_SUPPLIER": {
            const supplier = PurchasingService.createSupplier(
              txDb,
              { name: String(body.name || ""), phone: body.phone, ntnOrCnic: body.ntnOrCnic },
              actor
            );
            return { actor, message: `Added supplier ${supplier.name}.`, supplierId: supplier.id };
          }
          case "SAVE_ORDER": {
            const po = PurchasingService.saveOrder(
              txDb,
              {
                id: body.id || undefined,
                supplierId: String(body.supplierId || ""),
                lines: (Array.isArray(body.lines) ? body.lines : []) as PurchaseLineInput[],
                expectedDate: body.expectedDate,
                notes: body.notes,
                place: Boolean(body.place),
              },
              actor
            );
            return {
              actor,
              message: po.status === "ORDERED" ? `Placed ${po.poNumber}.` : `Saved draft ${po.poNumber}.`,
              poId: po.id,
            };
          }
          case "PLACE_ORDER": {
            const po = PurchasingService.placeOrder(txDb, String(body.poId || ""), actor);
            return { actor, message: `Placed ${po.poNumber}.`, poId: po.id };
          }
          case "CANCEL_ORDER": {
            const po = PurchasingService.cancelOrder(txDb, String(body.poId || ""), String(body.reason || ""), actor);
            return { actor, message: `Cancelled ${po.poNumber}.`, poId: po.id };
          }
          case "CLOSE_ORDER": {
            const po = PurchasingService.closeOrder(txDb, String(body.poId || ""), actor);
            return { actor, message: `Closed ${po.poNumber}.`, poId: po.id };
          }
          default:
            throw new PurchasingError(`Unknown action "${action}".`);
        }
      },
      undefined,
      undefined,
      { readBack: true }
    );

    const { actor, ...rest } = result;
    return NextResponse.json({ ...rest, ...buildView(db, actor) });
  } catch (err) {
    if (err instanceof PurchasingError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof SaaSEntitlementError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    const dataLayer = mapDataLayerError(err);
    if (dataLayer) return NextResponse.json(dataLayer.body, { status: dataLayer.status });
    const message = err instanceof Error ? err.message : "Request failed.";
    const status = message.includes("Access Denied")
      ? 403
      : message.includes("Authentication required")
      ? 401
      : message.includes("Fiscal Period Locked")
      ? 409
      : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
