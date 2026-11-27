import { SAAS_PLANS } from "@/core/saas/entitlements";
import { getPublicMongoConfig, DatabaseSchema } from "@/lib/db";
import { UserProfile } from "@/lib/types";
import { AccountingService } from "@/modules/accounting/accounting.service";
import { InventoryService } from "@/modules/inventory/inventory.service";
import { sanitizeUserForClient } from "./index";
import { hasGranularPermission } from "./permissions";

/**
 * Canonical Multi-Tenant & RBAC-scoped response projection shared across `/api/state`,
 * `/api/orders`, and `/api/ledger`.
 * - Strictly isolates tenant records.
 * - Never leaks unauthenticated business records, `passwordHash`, raw DB URIs, or PRA API tokens.
 */
export function buildScopedStateResponse(
  db: DatabaseSchema,
  actor: UserProfile | null,
  options?: { allowUnauthenticatedStaffList?: boolean }
) {
  if (!actor) {
    return {
      tenant: {
        id: db.tenant.id,
        slug: db.tenant.slug,
        name: db.tenant.name,
        segment: db.tenant.segment,
        invoicePrefix: db.tenant.invoicePrefix,
        status: db.tenant.status,
        planId: db.tenant.planId,
        subscription: db.tenant.subscription,
      },
      saasPlans: Object.values(SAAS_PLANS),
      praConfig: {
        restaurantName: db.praConfig.restaurantName,
        branchName: "",
        ntn: "",
        strn: "",
        posId: "",
        imsEndpointUrl: "",
        apiToken: "",
        cashTaxRate: db.praConfig.cashTaxRate,
        cardTaxRate: db.praConfig.cardTaxRate,
        retailTaxRate: db.praConfig.retailTaxRate,
        serviceChargePercent: db.praConfig.serviceChargePercent,
        praLiveMode: false,
      },
      mongoConfig: {
        enabled: db.mongoConfig.enabled,
        uri: "",
        dbName: "",
        engine: db.mongoConfig.engine,
        lastStatus: "Authentication required",
      },
      products: [],
      orders: [],
      erpInvoices: [],
      parties: [],
      ledger: [],
      users: options?.allowUnauthenticatedStaffList
        ? db.users
            .filter((u) => u.role !== "ADMIN" && u.tenantId === db.tenant.id)
            .map((u) => sanitizeUserForClient(u, null))
        : [],
      activeSession: null,
      sessionAuditLogs: [],
      immutableAuditLogs: [],
      idempotencyRecords: [],
      documentCounters: [],
      cashierShifts: [],
      fiscalPeriods: [],
      purchaseOrders: [],
      goodsReceipts: [],
      waitingTasks: [],
      stockMonitor: [],
      restaurantTables: [],
      servers: [],
    };
  }

  const canViewLedger = hasGranularPermission(
    actor.role,
    "accounting:ledger:view"
  );
  const canManageSettings = hasGranularPermission(
    actor.role,
    "settings:pra:manage"
  );

  const activeParties = AccountingService.listActiveParties(db);
  const scopedParties = canViewLedger
    ? activeParties
    : activeParties
        .filter((p) => p.type === "CUSTOMER")
        .map((p) => ({
          ...p,
          currentBalance: 0,
          currentBalanceMinor: 0,
          creditLimit: 0,
        }));

  const tenantUsers = db.users.filter((u) => u.tenantId === db.tenant.id);
  const visibleUsers =
    actor.role === "ADMIN"
      ? tenantUsers
      : tenantUsers.filter((u) => u.role !== "ADMIN");

  return {
    ...db,
    tenant: db.tenant,
    saasPlans: Object.values(SAAS_PLANS),
    idempotencyRecords: [],
    praConfig: canManageSettings
      ? db.praConfig
      : { ...db.praConfig, apiToken: "" },
    users: visibleUsers.map((u) => sanitizeUserForClient(u, actor)),
    // Even masked, the URI reveals the platform database host, so only the platform owner sees it.
    mongoConfig: canManageSettings && actor.isPlatformAdmin
      ? getPublicMongoConfig(db.mongoConfig)
      : {
          enabled: db.mongoConfig.enabled,
          uri: "",
          dbName: db.mongoConfig.dbName,
          engine: db.mongoConfig.engine,
          lastStatus: "Restricted to Owner / Super Admin",
        },
    products: InventoryService.listActiveProducts(db),
    parties: scopedParties,
    ledger: canViewLedger ? db.ledger : [],
    immutableAuditLogs: canViewLedger ? db.immutableAuditLogs : [],
    erpInvoices: db.erpInvoices || [],
    waitingTasks: db.waitingTasks || [],
    stockMonitor: db.stockMonitor || [],
    restaurantTables: db.restaurantTables || [],
    servers: db.servers || [],
  };
}
