import { getPublicMongoConfig, DatabaseSchema } from "@/lib/db";
import { UserProfile } from "@/lib/types";
import { AccountingService } from "@/modules/accounting/accounting.service";
import { InventoryService } from "@/modules/inventory/inventory.service";
import { sanitizeUserForClient } from "./index";
import { hasGranularPermission } from "./permissions";

/**
 * Canonical RBAC-scoped response projection shared across `/api/state`, `/api/orders`,
 * and `/api/ledger`. Prevents leaking unauthenticated business records, `passwordHash`,
 * raw MongoDB URIs, PRA API tokens, or `idempotencyRecords`.
 */
export function buildScopedStateResponse(
  db: DatabaseSchema,
  actor: UserProfile | null
) {
  if (!actor) {
    return {
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
        lastStatus: "Authentication required",
      },
      products: [],
      orders: [],
      erpInvoices: [],
      parties: [],
      ledger: [],
      users: db.users
        .filter((u) => u.role !== "ADMIN")
        .map((u) => sanitizeUserForClient(u, null)),
      activeSession: null,
      sessionAuditLogs: [],
      immutableAuditLogs: [],
      idempotencyRecords: [],
      documentCounters: [],
      cashierShifts: [],
      fiscalPeriods: [],
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

  const visibleUsers =
    actor.role === "ADMIN"
      ? db.users
      : db.users.filter((u) => u.role !== "ADMIN");

  return {
    ...db,
    idempotencyRecords: [],
    praConfig: canManageSettings
      ? db.praConfig
      : { ...db.praConfig, apiToken: "" },
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
    restaurantTables: db.restaurantTables || [],
    servers: db.servers || [],
  };
}
