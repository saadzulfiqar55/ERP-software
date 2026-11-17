import { NextResponse } from "next/server";
import { appendAuditLog } from "@/core/audit";
import { resolveAuthenticatedActor } from "@/core/auth";
import { withTransaction } from "@/core/db";
import { toMinorUnits } from "@/core/money";
import { sanitizeNoSqlPayload } from "@/core/validation";
import { getPublicMongoConfig, readDb } from "@/lib/db";
import { isMaskedMongoUri, pingMongoConnection } from "@/lib/mongodb";
import { MongoDBConfig, PRAConfig, Product } from "@/lib/types";
import { AccountingService } from "@/modules/accounting/accounting.service";
import { InventoryService } from "@/modules/inventory/inventory.service";

export async function GET() {
  const db = readDb();
  return NextResponse.json({
    ...db,
    mongoConfig: getPublicMongoConfig(db.mongoConfig),
    products: InventoryService.listActiveProducts(db),
    parties: AccountingService.listActiveParties(db),
  });
}

export async function PUT(request: Request) {
  try {
    const rawBody = await request.json();
    const body = sanitizeNoSqlPayload(rawBody);

    const { db } = await withTransaction(async (txDb) => {
      const actor = await resolveAuthenticatedActor(txDb);

      if (body.praConfig) {
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
        InventoryService.upsertProduct(
          txDb,
          body.newProduct as Product,
          false,
          actor
        );
      }

      if (body.editProduct) {
        InventoryService.upsertProduct(
          txDb,
          body.editProduct as Product,
          true,
          actor
        );
      }

      if (body.deleteProductId) {
        // Soft-archive per ERP Architecture Checklist Section 5 (Soft Deletes Only)
        InventoryService.archiveProductSoft(
          txDb,
          body.deleteProductId as string,
          actor
        );
      }

      if (body.updateProductImage) {
        const { productId, imageUrl } = body.updateProductImage as {
          productId: string;
          imageUrl: string;
        };
        txDb.products = txDb.products.map((p) =>
          p.id === productId ? { ...p, imageUrl } : p
        );
      }

      if (body.reconcileShift) {
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

      return true;
    });

    return NextResponse.json({
      ...db,
      mongoConfig: getPublicMongoConfig(db.mongoConfig),
      products: InventoryService.listActiveProducts(db),
      parties: AccountingService.listActiveParties(db),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update state" },
      { status: 400 }
    );
  }
}
