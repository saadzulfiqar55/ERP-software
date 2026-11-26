import { NextResponse } from "next/server";
import { appendAuditLog, DEFAULT_BRANCH_ID, DEFAULT_TENANT_ID } from "@/core/audit";
import {
  assertActorPermission,
  resolveAuthenticatedTenantId,
  tryResolveOptionalActor,
} from "@/core/auth";
import { buildScopedStateResponse } from "@/core/auth/state-scoper";
import { mapDataLayerError, withTransaction } from "@/core/db";
import { toMinorUnits } from "@/core/money";
import {
  assertTenantFeature,
  assertTenantWriteActive,
  SaaSEntitlementError,
} from "@/core/saas/entitlements";
import { sanitizeNoSqlPayload } from "@/core/validation";
import { findTenantStrict, getEnvDatabaseConfig, readDbAsync } from "@/lib/db";
import {
  normalizePostgresUri,
  pingPostgresConnection,
  PostgresSyncSection,
} from "@/lib/postgres";
import { StockLevelMonitorItem } from "@/lib/mock/erp-data";
import {
  CashierShift,
  MongoDBConfig,
  PRAConfig,
  Product,
  UserProfile,
} from "@/lib/types";
import { InventoryService } from "@/modules/inventory/inventory.service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return await handleGet(request);
  } catch (err) {
    const dataLayer = mapDataLayerError(err);
    if (dataLayer) {
      return NextResponse.json(dataLayer.body, { status: dataLayer.status });
    }
    console.error("[api] GET failed:", err);
    return NextResponse.json({ error: "Request failed." }, { status: 500 });
  }
}

async function handleGet(request: Request) {
  const url = new URL(request.url);
  const requestedWorkspaceSlug = url.searchParams.get("workspace")?.trim();

  // Strictly prefer the session-derived tenantId when authenticated
  const sessionTenantId = await resolveAuthenticatedTenantId();

  if (sessionTenantId) {
    const db = await readDbAsync(sessionTenantId);
    const actor = await tryResolveOptionalActor(db);
    return NextResponse.json(buildScopedStateResponse(db, actor));
  }

  // If unauthenticated and a specific workspace slug is requested for Staff PIN lookup
  if (requestedWorkspaceSlug) {
    const foundTenant = await findTenantStrict(requestedWorkspaceSlug);
    if (!foundTenant) {
      return NextResponse.json(
        { error: `Workspace "${requestedWorkspaceSlug}" not found.` },
        { status: 404 }
      );
    }
    const db = await readDbAsync(foundTenant.id);
    return NextResponse.json(
      buildScopedStateResponse(db, null, {
        allowUnauthenticatedStaffList: true,
      })
    );
  }

  const db = await readDbAsync(DEFAULT_TENANT_ID);
  return NextResponse.json(
    buildScopedStateResponse(db, null, {
      allowUnauthenticatedStaffList: false,
    })
  );
}

export async function PUT(request: Request) {
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

    // Network calls must not run while the tenant write lock is held.
    const dbPing = body.mongoConfig
      ? await pingPostgresConnection(getEnvDatabaseConfig().uri)
      : null;

    let resolvedActor: UserProfile | null = null;
    const touchedSections = new Set<PostgresSyncSection>();

    const { db } = await withTransaction(
      async (txDb) => {
        assertTenantWriteActive(txDb.tenant);
        const tenantId = txDb.tenant.id;

        if (body.praConfig) {
          const actor = await assertActorPermission(txDb, "settings:pra:manage");
          resolvedActor = actor;
          txDb.praConfig = {
            ...txDb.praConfig,
            ...(body.praConfig as Partial<PRAConfig>),
          };
          appendAuditLog(txDb, {
            tenantId,
            actorId: actor.id,
            actorName: actor.name,
            actorRole: actor.role,
            module: "SETTINGS",
            action: "UPDATE",
            entityType: "PRAConfig",
            entityId: txDb.praConfig.posId || tenantId,
            summary: `Updated PRA e-IMS parameters (Cash GST: ${txDb.praConfig.cashTaxRate}%, Card GST: ${txDb.praConfig.cardTaxRate}%).`,
          });
          touchedSections.add("SETTINGS");
          touchedSections.add("IMMUTABLE_AUDIT_LOGS");
        }

        if (body.mongoConfig) {
          const actor = await assertActorPermission(txDb, "settings:pra:manage");
          resolvedActor = actor;
          // The database connection is platform infrastructure: it comes only from the
          // DATABASE_URL environment variable. Only the platform owner may re-check its status,
          // and no client can supply a URI (that allowed server-side requests to arbitrary hosts).
          if (!actor.isPlatformAdmin) {
            throw new Error(
              "RBAC Access Denied: database connection settings are managed by the StackLyra platform."
            );
          }
          const envUri = normalizePostgresUri(getEnvDatabaseConfig().uri);
          const pingResult = dbPing!;
          const nextDbConfig: MongoDBConfig = {
            ...txDb.mongoConfig,
            uri: envUri,
            dbName: pingResult.dbName,
            engine: "POSTGRES_DRIZZLE",
            lastStatus: `${pingResult.engine}: ${pingResult.message}`,
            enabled: pingResult.connected,
          };
          txDb.mongoConfig = nextDbConfig;
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
          touchedSections.add("PRODUCTS");
          touchedSections.add("IMMUTABLE_AUDIT_LOGS");
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
          touchedSections.add("PRODUCTS");
          touchedSections.add("IMMUTABLE_AUDIT_LOGS");
        }

        if (body.deleteProductId) {
          const actor = await assertActorPermission(txDb, "inventory:archive");
          resolvedActor = actor;
          InventoryService.archiveProductSoft(
            txDb,
            body.deleteProductId as string,
            actor
          );
          touchedSections.add("PRODUCTS");
          touchedSections.add("IMMUTABLE_AUDIT_LOGS");
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
          touchedSections.add("PRODUCTS");
        }

        // Material Stock CRUD
        if (body.addStockItem) {
          const actor = await assertActorPermission(txDb, "inventory:adjust");
          resolvedActor = actor;
          assertTenantFeature(txDb.tenant, "material_stock", "Material Stock Tracking");
          const item = body.addStockItem as StockLevelMonitorItem;
          const cleanItem: StockLevelMonitorItem = {
            id: item.id || `stk-${Date.now()}`,
            name: String(item.name || "").trim(),
            sku:
              String(item.sku || "").trim() ||
              `MAT-${Date.now().toString().slice(-4)}`,
            currentQty: Math.max(0, Number(item.currentQty) || 0),
            reorderTarget: Math.max(1, Number(item.reorderTarget) || 10),
            unit: String(item.unit || "Units").trim() || "Units",
          };
          if (!cleanItem.name) throw new Error("Material name is required.");
          txDb.stockMonitor = [cleanItem, ...(txDb.stockMonitor || [])];
          appendAuditLog(txDb, {
            tenantId,
            actorId: actor.id,
            actorName: actor.name,
            actorRole: actor.role,
            module: "INVENTORY",
            action: "CREATE",
            entityType: "MaterialStock",
            entityId: cleanItem.id,
            summary: `Added material stock "${cleanItem.name}" (${cleanItem.currentQty} ${cleanItem.unit}).`,
          });
          touchedSections.add("SETTINGS");
          touchedSections.add("IMMUTABLE_AUDIT_LOGS");
        }

        if (body.editStockItem) {
          const actor = await assertActorPermission(txDb, "inventory:adjust");
          resolvedActor = actor;
          const updated = body.editStockItem as StockLevelMonitorItem;
          txDb.stockMonitor = (txDb.stockMonitor || []).map((s) =>
            s.id === updated.id
              ? {
                  ...s,
                  name: String(updated.name || s.name).trim(),
                  sku: String(updated.sku || s.sku).trim(),
                  currentQty: Math.max(0, Number(updated.currentQty) || 0),
                  reorderTarget: Math.max(1, Number(updated.reorderTarget) || 1),
                  unit: String(updated.unit || s.unit).trim() || "Units",
                }
              : s
          );
          touchedSections.add("SETTINGS");
        }

        if (body.adjustStockQty) {
          const actor = await assertActorPermission(txDb, "inventory:adjust");
          resolvedActor = actor;
          const { stockId, delta } = body.adjustStockQty as {
            stockId: string;
            delta: number;
          };
          txDb.stockMonitor = (txDb.stockMonitor || []).map((s) =>
            s.id === stockId
              ? {
                  ...s,
                  currentQty: Math.max(0, s.currentQty + Number(delta || 0)),
                }
              : s
          );
          touchedSections.add("SETTINGS");
        }

        if (body.deleteStockId) {
          const actor = await assertActorPermission(txDb, "inventory:archive");
          resolvedActor = actor;
          const stockId = String(body.deleteStockId);
          const existing = (txDb.stockMonitor || []).find(
            (s) => s.id === stockId
          );
          txDb.stockMonitor = (txDb.stockMonitor || []).filter(
            (s) => s.id !== stockId
          );
          if (existing) {
            appendAuditLog(txDb, {
              tenantId,
              actorId: actor.id,
              actorName: actor.name,
              actorRole: actor.role,
              module: "INVENTORY",
              action: "SOFT_ARCHIVE",
              entityType: "MaterialStock",
              entityId: stockId,
              summary: `Removed material stock item "${existing.name}".`,
            });
            touchedSections.add("SETTINGS");
            touchedSections.add("IMMUTABLE_AUDIT_LOGS");
          }
        }

        // Dynamic Restaurant Tables & Servers CRUD
        if (body.addTable) {
          const actor = await assertActorPermission(txDb, "inventory:adjust");
          resolvedActor = actor;
          const tableName = String(body.addTable).trim();
          if (!tableName) throw new Error("Table name cannot be empty.");
          const current = txDb.restaurantTables || [];
          if (!current.includes(tableName)) {
            txDb.restaurantTables = [...current, tableName];
          }
          touchedSections.add("SETTINGS");
        }

        if (body.removeTable) {
          const actor = await assertActorPermission(txDb, "inventory:adjust");
          resolvedActor = actor;
          const target = String(body.removeTable).trim();
          txDb.restaurantTables = (txDb.restaurantTables || []).filter(
            (t) => t !== target
          );
          touchedSections.add("SETTINGS");
        }

        if (body.addServer) {
          const actor = await assertActorPermission(txDb, "inventory:adjust");
          resolvedActor = actor;
          const serverName = String(body.addServer).trim();
          if (!serverName) throw new Error("Server name cannot be empty.");
          const current = txDb.servers || [];
          if (!current.includes(serverName)) {
            txDb.servers = [...current, serverName];
          }
          touchedSections.add("SETTINGS");
        }

        if (body.removeServer) {
          const actor = await assertActorPermission(txDb, "inventory:adjust");
          resolvedActor = actor;
          const target = String(body.removeServer).trim();
          txDb.servers = (txDb.servers || []).filter((s) => s !== target);
          touchedSections.add("SETTINGS");
        }

        if (body.openShift) {
          const actor = await assertActorPermission(txDb, "pos:sale:create");
          resolvedActor = actor;
          const floatPkr = Math.max(
            0,
            Number(
              (body.openShift as { openingFloatPkr?: number }).openingFloatPkr
            ) || 0
          );
          const floatMinor = toMinorUnits(floatPkr);
          const newShift: CashierShift = {
            id: `shift-${Date.now()}`,
            tenantId,
            branchId: actor.branchId || DEFAULT_BRANCH_ID,
            openedAt: new Date().toISOString(),
            openedBy: `${actor.name} (${actor.role})`,
            openingFloatMinor: floatMinor,
            cashSalesMinor: 0,
            cardSalesMinor: 0,
            pettyCashPayoutsMinor: 0,
            expectedClosingCashMinor: floatMinor,
            status: "OPEN",
          };
          txDb.cashierShifts = [newShift, ...(txDb.cashierShifts || [])];
          appendAuditLog(txDb, {
            tenantId,
            actorId: actor.id,
            actorName: actor.name,
            actorRole: actor.role,
            module: "POS",
            action: "CREATE",
            entityType: "CashierShift",
            entityId: newShift.id,
            summary: `Opened register shift with PKR ${floatPkr.toLocaleString()} opening float.`,
          });
          touchedSections.add("CASHIER_SHIFTS");
          touchedSections.add("IMMUTABLE_AUDIT_LOGS");
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
            const varianceMinor =
              countedMinor - shift.expectedClosingCashMinor;
            txDb.cashierShifts[0] = {
              ...shift,
              countedClosingCashMinor: countedMinor,
              varianceMinor,
            };
            appendAuditLog(txDb, {
              tenantId,
              actorId: actor.id,
              actorName: actor.name,
              actorRole: actor.role,
              module: "POS",
              action: "UPDATE",
              entityType: "CashierShift",
              entityId: shift.id,
              summary: `Reconciled cashier shift drawer (Counted: PKR ${countedCashPkr.toLocaleString()}).`,
            });
            touchedSections.add("CASHIER_SHIFTS");
            touchedSections.add("IMMUTABLE_AUDIT_LOGS");
          }
        }

        if (body.approveTaskId) {
          const taskId = String(body.approveTaskId);
          const targetTask = (txDb.waitingTasks || []).find(
            (t) => t.id === taskId
          );
          if (!targetTask) {
            throw new Error("Task not found.");
          }
          const requiredPerm =
            targetTask.type === "OVERDUE_ALERT" ||
            targetTask.type === "PERIOD_CLOSE"
              ? "accounting:ledger:view"
              : "inventory:adjust";
          const actor = await assertActorPermission(txDb, requiredPerm);
          resolvedActor = actor;
          txDb.waitingTasks = (txDb.waitingTasks || []).map((t) =>
            t.id === taskId ? { ...t, status: "APPROVED" } : t
          );
          appendAuditLog(txDb, {
            tenantId,
            actorId: actor.id,
            actorName: actor.name,
            actorRole: actor.role,
            module: "SETTINGS",
            action: "UPDATE",
            entityType: "WaitingTask",
            entityId: taskId,
            summary: `Approved ${targetTask.referenceCode}: ${targetTask.title}.`,
          });
          touchedSections.add("SETTINGS");
          touchedSections.add("IMMUTABLE_AUDIT_LOGS");
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
            tenantId,
            actorId: actor.id,
            actorName: actor.name,
            actorRole: actor.role,
            module: "INVENTORY",
            action: "UPDATE",
            entityType: "StockMonitor",
            entityId: stockId,
            summary: `Restocked "${item.name}" to ${item.reorderTarget} ${item.unit}.`,
          });
          touchedSections.add("SETTINGS");
          touchedSections.add("IMMUTABLE_AUDIT_LOGS");
        }

        return true;
      },
      Array.from(touchedSections),
      sessionTenantId
    );

    const actorForResponse =
      resolvedActor || (await tryResolveOptionalActor(db));
    return NextResponse.json(buildScopedStateResponse(db, actorForResponse));
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
      err instanceof Error ? err.message : "Failed to update state";
    const status = message.includes("Access Denied")
      ? 403
      : message.includes("Authentication required")
      ? 401
      : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
