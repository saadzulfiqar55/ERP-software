import { NextResponse } from "next/server";
import { appendAuditLog } from "@/core/audit";
import {
  assertActorPermission,
  hasGranularPermission,
  sanitizeUserForClient,
  tryResolveOptionalActor,
} from "@/core/auth";
import { withTransaction } from "@/core/db";
import { toMinorUnits } from "@/core/money";
import { sanitizeNoSqlPayload } from "@/core/validation";
import { DatabaseSchema, getPublicMongoConfig, readDbAsync } from "@/lib/db";
import { isMaskedMongoUri, pingMongoConnection } from "@/lib/mongodb";
import { MongoDBConfig, PRAConfig, Product, UserProfile } from "@/lib/types";
import { AccountingService } from "@/modules/accounting/accounting.service";
import { InventoryService } from "@/modules/inventory/inventory.service";

export const dynamic = "force-dynamic";

function buildScopedStateResponse(
  db: DatabaseSchema,
  actor: UserProfile | null
) {
  const canViewLedger = actor
    ? hasGranularPermission(actor.role, "accounting:ledger:view")
    : false;
  const canManageSettings = actor
    ? hasGranularPermission(actor.role, "settings:pra:manage")
    : false;

  const activeParties = AccountingService.listActiveParties(db);
  const scopedParties = canViewLedger
    ? activeParties
    : actor
    ? activeParties
        .filter((p) => p.type === "CUSTOMER")
        .map((p) => ({
          ...p,
          currentBalance: 0,
          currentBalanceMinor: 0,
          creditLimit: 0,
        }))
    : [];

  const visibleUsers =
    actor?.role === "ADMIN"
      ? db.users
      : db.users.filter((u) => u.role !== "ADMIN");

  return {
    ...db,
    users: visibleUsers.map((u) => sanitizeUserForClient(u, actor)),
    mongoConfig: canManageSettings
      ? getPublicMongoConfig(db.mongoConfig)
      : {
          enabled: db.mongoConfig.enabled,
          uri: "",
          dbName: db.mongoConfig.dbName,
          lastStatus: "Restricted to Owner / Super Admin",
        },
    products: InventoryService.listActiveProducts(db),
    parties: scopedParties,
    ledger: canViewLedger ? db.ledger : [],
    immutableAuditLogs: canViewLedger ? db.immutableAuditLogs : [],
    erpInvoices: db.erpInvoices || [],
    waitingTasks: db.waitingTasks || [],
    stockMonitor: db.stockMonitor || [],
  };
}

export async function GET() {
  const db = await readDbAsync();
  const actor = await tryResolveOptionalActor(db);
  return NextResponse.json(buildScopedStateResponse(db, actor));
}

export async function PUT(request: Request) {
  try {
    const rawBody = await request.json();
    const body = sanitizeNoSqlPayload(rawBody);

    let resolvedActor: UserProfile | null = null;

    const { db } = await withTransaction(async (txDb) => {
      if (body.praConfig) {
        const actor = await assertActorPermission(txDb, "settings:pra:manage");
        resolvedActor = actor;
        txDb.praConfig = {
          ...txDb.praConfig,
          ...(body.praConfig as Partial<PRAConfig>),
        };
        appendAuditLog(txDb, {
          actorId: actor.id,
          actorName: actor.name,
          actorRole: actor.role,
          module: "SETTINGS",
          action: "UPDATE",
          entityType: "PRAConfig",
          entityId: txDb.praConfig.posId,
          summary: `Updated PRA e-IMS parameters (Cash GST: ${txDb.praConfig.cashTaxRate}%, Card GST: ${txDb.praConfig.cardTaxRate}%).`,
        });
      }

      if (body.mongoConfig) {
        const actor = await assertActorPermission(txDb, "settings:pra:manage");
        resolvedActor = actor;
        const incoming = body.mongoConfig as Partial<MongoDBConfig>;
        const incomingUri = incoming.uri?.trim() || "";
        const isStaleLocalDefault =
          incomingUri.startsWith("mongodb://127.0.0.1:27017/") &&
          txDb.mongoConfig.uri.startsWith("mongodb+srv://");

        const preservedUri =
          incomingUri && !isMaskedMongoUri(incomingUri) && !isStaleLocalDefault
            ? incomingUri
            : txDb.mongoConfig.uri;

        const nextMongo: MongoDBConfig = {
          ...txDb.mongoConfig,
          ...incoming,
          uri: preservedUri,
          dbName: isStaleLocalDefault
            ? txDb.mongoConfig.dbName
            : incoming.dbName || txDb.mongoConfig.dbName,
        };
        const pingResult = await pingMongoConnection(
          nextMongo.uri,
          nextMongo.dbName
        );
        nextMongo.dbName = pingResult.dbName;
        nextMongo.lastStatus = `${pingResult.engine}: ${pingResult.message}`;
        nextMongo.enabled = pingResult.connected;
        txDb.mongoConfig = nextMongo;
      }

      if (body.newProduct) {
        const actor = await assertActorPermission(txDb, "inventory:adjust");
        resolvedActor = actor;
        InventoryService.upsertProduct(
          txDb,
          body.newProduct as Product,
          false,
          actor
        );
      }

      if (body.editProduct) {
        const actor = await assertActorPermission(txDb, "inventory:adjust");
        resolvedActor = actor;
        InventoryService.upsertProduct(
          txDb,
          body.editProduct as Product,
          true,
          actor
        );
      }

      if (body.deleteProductId) {
        // Strictly Owner / Super Admin ONLY (`inventory:archive`)
        const actor = await assertActorPermission(txDb, "inventory:archive");
        resolvedActor = actor;
        InventoryService.archiveProductSoft(
          txDb,
          body.deleteProductId as string,
          actor
        );
      }

      if (body.updateProductImage) {
        const actor = await assertActorPermission(txDb, "inventory:adjust");
        resolvedActor = actor;
        const { productId, imageUrl } = body.updateProductImage as {
          productId: string;
          imageUrl: string;
        };
        txDb.products = txDb.products.map((p) =>
          p.id === productId ? { ...p, imageUrl } : p
        );
      }

      if (body.reconcileShift) {
        const actor = await assertActorPermission(txDb, "pos:sale:create");
        resolvedActor = actor;
        const { countedCashPkr } = body.reconcileShift as {
          countedCashPkr: number;
        };
        if (txDb.cashierShifts && txDb.cashierShifts.length > 0) {
          const shift = txDb.cashierShifts[0];
          const countedMinor = toMinorUnits(countedCashPkr);
          const varianceMinor = countedMinor - shift.expectedClosingCashMinor;
          txDb.cashierShifts[0] = {
            ...shift,
            countedClosingCashMinor: countedMinor,
            varianceMinor,
          };
          appendAuditLog(txDb, {
            actorId: actor.id,
            actorName: actor.name,
            actorRole: actor.role,
            module: "POS",
            action: "UPDATE",
            entityType: "CashierShift",
            entityId: shift.id,
            summary: `Reconciled cashier shift drawer (Counted: PKR ${countedCashPkr.toLocaleString()}).`,
          });
        }
      }

      if (body.approveTaskId) {
        const taskId = String(body.approveTaskId);
        const targetTask = (txDb.waitingTasks || []).find((t) => t.id === taskId);
        if (!targetTask) {
          throw new Error("Task not found.");
        }
        const requiredPerm =
          targetTask.type === "OVERDUE_ALERT" || targetTask.type === "PERIOD_CLOSE"
            ? "accounting:ledger:view"
            : "inventory:adjust";
        const actor = await assertActorPermission(txDb, requiredPerm);
        resolvedActor = actor;
        txDb.waitingTasks = (txDb.waitingTasks || []).map((t) =>
          t.id === taskId ? { ...t, status: "APPROVED" } : t
        );
        appendAuditLog(txDb, {
          actorId: actor.id,
          actorName: actor.name,
          actorRole: actor.role,
          module: "SETTINGS",
          action: "UPDATE",
          entityType: "WaitingTask",
          entityId: taskId,
          summary: `Approved ${targetTask.referenceCode}: ${targetTask.title}.`,
        });
      }

      if (body.reorderStockId) {
        const actor = await assertActorPermission(txDb, "inventory:adjust");
        resolvedActor = actor;
        const stockId = String(body.reorderStockId);
        const item = (txDb.stockMonitor || []).find((s) => s.id === stockId);
        if (!item) {
          throw new Error("Stock item not found.");
        }
        txDb.stockMonitor = (txDb.stockMonitor || []).map((s) =>
          s.id === stockId ? { ...s, currentQty: s.reorderTarget } : s
        );
        appendAuditLog(txDb, {
          actorId: actor.id,
          actorName: actor.name,
          actorRole: actor.role,
          module: "INVENTORY",
          action: "UPDATE",
          entityType: "StockMonitor",
          entityId: stockId,
          summary: `Restocked "${item.name}" to ${item.reorderTarget} ${item.unit}.`,
        });
      }

      return true;
    }, ["PRODUCTS", "CASHIER_SHIFTS", "IMMUTABLE_AUDIT_LOGS"]);

    const actorForResponse =
      resolvedActor || (await tryResolveOptionalActor(db));
    return NextResponse.json(buildScopedStateResponse(db, actorForResponse));
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update state";
    const status = message.includes("Access Denied")
      ? 403
      : message.includes("Authentication required")
      ? 401
      : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
