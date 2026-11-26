import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
} from "drizzle-orm/pg-core";
import type {
  CartItem,
  DoubleEntryLine,
  ERPPermission,
  KitchenStation,
  OrderType,
  PartyType,
  PaymentMethod,
  PRAConfig,
  PRASyncStatus,
  ProductVariant,
  SubscriptionPlanId,
  TaxBreakdown,
  TaxMode,
  TenantMembershipRole,
  TenantStatus,
  TenantSubscription,
  UserProfile,
  UserRole,
} from "@/lib/types";
import type { ERPInvoiceLineItem } from "@/lib/mock/erp-data";

/**
 * 1. SaaS Tenants / Organizations Table (`stacklyra_tenants`)
 */
export const tenantsTable = pgTable(
  "stacklyra_tenants",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    segment: text("segment").notNull().default("HYBRID"),
    invoicePrefix: text("invoice_prefix").notNull().default("SL"),
    ownerUserId: text("owner_user_id").notNull(),
    ownerEmail: text("owner_email").notNull(),
    status: text("status").$type<TenantStatus>().notNull().default("TRIALING"),
    planId: text("plan_id")
      .$type<SubscriptionPlanId>()
      .notNull()
      .default("growth"),
    subscription: jsonb("subscription").$type<TenantSubscription>().notNull(),
    praConfig: jsonb("pra_config").$type<PRAConfig>().notNull(),
    restaurantTables: jsonb("restaurant_tables")
      .$type<string[]>()
      .notNull()
      .default([]),
    servers: jsonb("servers").$type<string[]>().notNull().default([]),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_stacklyra_tenants_slug").on(table.slug)]
);

/**
 * 2. Tenant Users & Memberships Table (`stacklyra_users`)
 */
export const usersTable = pgTable(
  "stacklyra_users",
  {
    id: text("id").notNull(),
    tenantId: text("tenant_id").notNull(),
    branchId: text("branch_id").notNull().default("BRANCH_MAIN"),
    name: text("name").notNull(),
    username: text("username").notNull(),
    email: text("email").notNull(),
    role: text("role").$type<UserRole>().notNull(),
    membershipRole: text("membership_role")
      .$type<TenantMembershipRole>()
      .notNull()
      .default("CASHIER"),
    isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
    title: text("title").notNull(),
    pin: text("pin").notNull().default(""),
    passwordHash: text("password_hash"),
    authType: text("auth_type")
      .$type<"PASSWORD" | "PIN">()
      .notNull()
      .default("PIN"),
    passwordUpdatedInDb: boolean("password_updated_in_db")
      .notNull()
      .default(false),
    avatarInitials: text("avatar_initials").notNull(),
    badgeColor: text("badge_color").notNull(),
    granularPermissions: jsonb("granular_permissions")
      .$type<ERPPermission[]>()
      .notNull()
      .default([]),
    permissions: jsonb("permissions")
      .$type<UserProfile["permissions"]>()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    index("idx_stacklyra_users_tenant_username").on(
      table.tenantId,
      table.username
    ),
    index("idx_stacklyra_users_email").on(table.email),
  ]
);

/**
 * 3. Tenant Products & Menu Catalog (`stacklyra_products`)
 */
export const productsTable = pgTable(
  "stacklyra_products",
  {
    id: text("id").notNull(),
    tenantId: text("tenant_id").notNull(),
    branchId: text("branch_id").notNull().default("BRANCH_MAIN"),
    code: text("code").notNull(),
    barcode: text("barcode"),
    name: text("name").notNull(),
    nameUrdu: text("name_urdu").notNull().default(""),
    segment: text("segment").$type<"RESTAURANT" | "RETAIL">().notNull(),
    category: text("category").notNull(),
    kitchenStation: text("kitchen_station").$type<KitchenStation>().notNull(),
    taxMode: text("tax_mode").$type<TaxMode>().notNull(),
    stockQty: integer("stock_qty").notNull().default(0),
    unit: text("unit").notNull().default("Portion"),
    variants: jsonb("variants").$type<ProductVariant[]>().notNull(),
    popular: boolean("popular").default(false),
    imageUrl: text("image_url"),
    isArchived: boolean("is_archived").notNull().default(false),
    archivedAt: text("archived_at"),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    index("idx_stacklyra_products_tenant_code").on(table.tenantId, table.code),
  ]
);

/**
 * 4. POS Orders (`stacklyra_orders`)
 */
export const ordersTable = pgTable(
  "stacklyra_orders",
  {
    id: text("id").notNull(),
    tenantId: text("tenant_id").notNull(),
    branchId: text("branch_id").notNull().default("BRANCH_MAIN"),
    idempotencyKey: text("idempotency_key"),
    invoiceNumber: text("invoice_number").notNull(),
    usin: text("usin").notNull(),
    createdAt: text("created_at").notNull(),
    orderType: text("order_type").$type<OrderType>().notNull(),
    tableNumber: text("table_number"),
    waiterName: text("waiter_name"),
    customerName: text("customer_name"),
    customerPhone: text("customer_phone"),
    buyerNtnCnic: text("buyer_ntn_cnic"),
    khataAccountId: text("khata_account_id"),
    items: jsonb("items").$type<CartItem[]>().notNull(),
    discountAmount: numeric("discount_amount").notNull(),
    serviceCharge: numeric("service_charge").notNull(),
    paymentMethod: text("payment_method").$type<PaymentMethod>().notNull(),
    cashPaid: numeric("cash_paid").notNull(),
    cardPaid: numeric("card_paid").notNull(),
    changeReturned: numeric("change_returned").notNull(),
    taxBreakdown: jsonb("tax_breakdown").$type<TaxBreakdown>().notNull(),
    praInvoiceNumber: text("pra_invoice_number").notNull(),
    praQrPayload: text("pra_qr_payload").notNull(),
    praSyncStatus: text("pra_sync_status").$type<PRASyncStatus>().notNull(),
    praResponseCode: text("pra_response_code"),
    cashierName: text("cashier_name").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    index("idx_stacklyra_orders_tenant_created").on(
      table.tenantId,
      table.createdAt
    ),
  ]
);

/**
 * 5. ERP B2B/Customer Invoices (`stacklyra_invoices`)
 */
export const invoicesTable = pgTable(
  "stacklyra_invoices",
  {
    id: text("id").notNull(),
    tenantId: text("tenant_id").notNull(),
    invoiceNumber: text("invoice_number").notNull(),
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email").notNull(),
    issueDate: text("issue_date").notNull(),
    dueDate: text("due_date").notNull(),
    status: text("status").notNull(),
    subtotal: numeric("subtotal").notNull(),
    taxAmount: numeric("tax_amount").notNull(),
    discountAmount: numeric("discount_amount").notNull(),
    totalAmount: numeric("total_amount").notNull(),
    notes: text("notes").notNull().default(""),
    lineItems: jsonb("line_items").$type<ERPInvoiceLineItem[]>().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    index("idx_stacklyra_invoices_tenant_status").on(
      table.tenantId,
      table.status
    ),
  ]
);

/**
 * 6. Party Khata Accounts (`stacklyra_parties`)
 */
export const partiesTable = pgTable(
  "stacklyra_parties",
  {
    id: text("id").notNull(),
    tenantId: text("tenant_id").notNull(),
    branchId: text("branch_id").notNull().default("BRANCH_MAIN"),
    name: text("name").notNull(),
    nameUrdu: text("name_urdu").default(""),
    type: text("type").$type<PartyType>().notNull(),
    phone: text("phone").notNull(),
    ntnOrCnic: text("ntn_or_cnic").default(""),
    creditLimit: numeric("credit_limit").notNull(),
    currentBalance: numeric("current_balance").notNull(),
    currentBalanceMinor: bigint("current_balance_minor", { mode: "number" }).notNull(),
    notes: text("notes").default(""),
    isArchived: boolean("is_archived").notNull().default(false),
    archivedAt: text("archived_at"),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.id] })]
);

/**
 * 7. Double-Entry Ledger Vouchers (`stacklyra_ledger_entries`)
 */
export const ledgerEntriesTable = pgTable(
  "stacklyra_ledger_entries",
  {
    id: text("id").notNull(),
    tenantId: text("tenant_id").notNull(),
    branchId: text("branch_id").notNull().default("BRANCH_MAIN"),
    createdAt: text("created_at").notNull(),
    partyId: text("party_id").notNull(),
    partyName: text("party_name").notNull(),
    partyType: text("party_type").$type<PartyType>().notNull(),
    voucherNo: text("voucher_no").notNull(),
    description: text("description").notNull(),
    paymentMode: text("payment_mode").notNull(),
    debit: numeric("debit").notNull(),
    credit: numeric("credit").notNull(),
    balanceAfter: numeric("balance_after").notNull(),
    debitMinor: bigint("debit_minor", { mode: "number" }).notNull(),
    creditMinor: bigint("credit_minor", { mode: "number" }).notNull(),
    balanceAfterMinor: bigint("balance_after_minor", { mode: "number" }).notNull(),
    journalLines: jsonb("journal_lines").$type<DoubleEntryLine[]>().notNull(),
    relatedOrderId: text("related_order_id"),
    isReversal: boolean("is_reversal").default(false),
    reversesEntryId: text("reverses_entry_id"),
    isReversed: boolean("is_reversed").default(false),
    isImmutable: boolean("is_immutable").notNull().default(true),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    index("idx_stacklyra_ledger_tenant_party").on(
      table.tenantId,
      table.partyId
    ),
  ]
);

/**
 * 8. Per-Tenant Atomic Document Counters (`stacklyra_document_counters`)
 */
export const documentCountersTable = pgTable(
  "stacklyra_document_counters",
  {
    tenantId: text("tenant_id").notNull(),
    key: text("key").notNull(),
    seq: integer("seq").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.key] })]
);

/**
 * 9. Cashier Shifts (`stacklyra_cashier_shifts`)
 */
export const cashierShiftsTable = pgTable(
  "stacklyra_cashier_shifts",
  {
    id: text("id").notNull(),
    tenantId: text("tenant_id").notNull(),
    branchId: text("branch_id").notNull().default("BRANCH_MAIN"),
    openedAt: text("opened_at").notNull(),
    openedBy: text("opened_by").notNull(),
    openingFloatMinor: bigint("opening_float_minor", { mode: "number" }).notNull(),
    cashSalesMinor: bigint("cash_sales_minor", { mode: "number" }).notNull(),
    cardSalesMinor: bigint("card_sales_minor", { mode: "number" }).notNull(),
    pettyCashPayoutsMinor: bigint("petty_cash_payouts_minor", { mode: "number" }).notNull(),
    expectedClosingCashMinor: bigint("expected_closing_cash_minor", { mode: "number" }).notNull(),
    countedClosingCashMinor: bigint("counted_closing_cash_minor", { mode: "number" }),
    varianceMinor: bigint("variance_minor", { mode: "number" }),
    status: text("status").$type<"OPEN" | "CLOSED">().notNull(),
    closedAt: text("closed_at"),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.id] })]
);

/**
 * 10. Per-Tenant Fiscal Periods (`stacklyra_fiscal_periods`)
 */
export const fiscalPeriodsTable = pgTable(
  "stacklyra_fiscal_periods",
  {
    tenantId: text("tenant_id").notNull(),
    periodKey: text("period_key").notNull(),
    label: text("label").notNull(),
    isLocked: boolean("is_locked").notNull().default(false),
    lockedAt: text("locked_at"),
    lockedBy: text("locked_by"),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.periodKey] })]
);

/**
 * 11. Immutable Audit Logs (`stacklyra_immutable_audit_logs`)
 */
export const immutableAuditLogsTable = pgTable(
  "stacklyra_immutable_audit_logs",
  {
    id: text("id").notNull(),
    tenantId: text("tenant_id").notNull(),
    branchId: text("branch_id").notNull().default("BRANCH_MAIN"),
    timestamp: text("timestamp").notNull(),
    actorId: text("actor_id").notNull(),
    actorName: text("actor_name").notNull(),
    actorRole: text("actor_role").$type<UserRole>().notNull(),
    module: text("module").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    summary: text("summary").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    index("idx_stacklyra_audit_tenant_ts").on(table.tenantId, table.timestamp),
  ]
);
