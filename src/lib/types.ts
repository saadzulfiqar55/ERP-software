export type BusinessSegment = "RESTAURANT" | "RETAIL";

export type OrderType = "DINE_IN" | "TAKEAWAY" | "DELIVERY" | "RETAIL_COUNTER";

export type KitchenStation =
  | "KARAHI_HANDI"
  | "BBQ_GRILL"
  | "TANDOOR"
  | "RICE_PULAO"
  | "SWEET_RETAIL"
  | "BEVERAGES";

export type TaxMode = "EXCLUSIVE" | "INCLUSIVE" | "EXEMPT";

export type PaymentMethod =
  | "CASH"
  | "CARD"
  | "JAZZCASH_EASYPAISA"
  | "SPLIT"
  | "KHATA_CREDIT";

export type PRASyncStatus = "SYNCED" | "PENDING_OFFLINE" | "EXEMPT" | "FAILED";

export type UserRole = "ADMIN" | "MANAGER" | "CASHIER";

export type TenantMembershipRole = "OWNER" | "ADMIN" | "MANAGER" | "CASHIER";

export type SubscriptionPlanId = "starter" | "growth" | "enterprise";

export type TenantStatus = "TRIALING" | "ACTIVE" | "PAST_DUE" | "SUSPENDED";

export type SaaSFeatureKey =
  | "pos_terminal"
  | "invoices"
  | "inventory_catalog"
  | "material_stock"
  | "khata_ledger"
  | "pra_fiscalization"
  | "shift_reconciliation"
  | "fiscal_period_locks"
  | "audit_trail"
  | "multi_branch";

export interface PlanEntitlements {
  planId: SubscriptionPlanId;
  name: string;
  tagline: string;
  monthlyPricePkr: number;
  monthlyPriceUsd: number;
  maxSeats: number;
  maxBranches: number;
  maxProducts: number;
  features: SaaSFeatureKey[];
}

export interface TenantSubscription {
  planId: SubscriptionPlanId;
  status: TenantStatus;
  billingCycle: "MONTHLY" | "ANNUAL";
  provider: "STRIPE" | "PADDLE" | "PAYFAST" | "MANUAL_IBFT" | "TRIAL";
  externalSubscriptionId?: string;
  trialEndsAt?: string;
  currentPeriodEnd: string;
  maxSeats: number;
  maxBranches: number;
  maxProducts: number;
  features: SaaSFeatureKey[];
}

export interface TenantOrganization {
  id: string;
  slug: string;
  name: string;
  segment: "RESTAURANT" | "RETAIL" | "HYBRID";
  invoicePrefix: string;
  ownerUserId: string;
  ownerEmail: string;
  status: TenantStatus;
  planId: SubscriptionPlanId;
  subscription: TenantSubscription;
  createdAt: string;
  updatedAt: string;
}

export type ERPPermission =
  | "pos:sale:create"
  | "pos:sale:void"
  | "pos:discount:override"
  | "inventory:view"
  | "inventory:adjust"
  | "inventory:archive"
  | "invoices:delete"
  | "accounting:ledger:view"
  | "accounting:journal:post"
  | "accounting:journal:reverse"
  | "accounting:period:close"
  | "settings:pra:manage"
  | "users:manage";

export interface UserProfile {
  id: string;
  tenantId: string;
  tenantSlug?: string;
  branchId?: string;
  allowedBranches?: string[];
  name: string;
  username?: string;
  role: UserRole;
  membershipRole?: TenantMembershipRole;
  isPlatformAdmin?: boolean;
  title: string;
  email: string;
  /** @deprecated Legacy plaintext PIN. New PINs are stored only as `pinHash`; this is migrated and cleared on first use. */
  pin?: string;
  /** scrypt hash of the staff PIN (`scrypt$<salt>$<hex>`). */
  pinHash?: string;
  passwordHash?: string;
  /** Consecutive failed sign-in attempts since the last success or lockout. */
  failedLoginAttempts?: number;
  /** ISO timestamp until which sign-in is refused for this profile. */
  lockedUntil?: string;
  authType?: "PASSWORD" | "PIN";
  isDemoAccount?: boolean;
  passwordUpdatedInDb?: boolean;
  avatarInitials: string;
  badgeColor: string;
  granularPermissions?: ERPPermission[];
  permissions: {
    canEditPraSettings: boolean;
    canManageMenuPricing: boolean;
    canApproveDiscounts: boolean;
    canManageKhata: boolean;
    canViewFinancialReports: boolean;
  };
}

export interface ActiveSession {
  sessionId: string;
  tenantId: string;
  tenantSlug?: string;
  branchId?: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  membershipRole?: TenantMembershipRole;
  isPlatformAdmin?: boolean;
  userTitle: string;
  email: string;
  authMethod: "JWT_PIN" | "OAUTH_SSO";
  issuedAt: string;
  expiresAt: string;
  lastHeartbeatAt: string;
  jwtTokenPreview: string;
}

export interface SessionAuditLog {
  id: string;
  tenantId?: string;
  timestamp: string;
  event:
    | "LOGIN_SUCCESS"
    | "LOGOUT"
    | "SESSION_LOCKED_CONFLICT"
    | "ADMIN_FORCE_TAKEOVER"
    | "TOKEN_REFRESH"
    | "TENANT_ONBOARDED"
    | "LOGIN_LOCKOUT";
  userId: string;
  userName: string;
  userRole: UserRole;
  details: string;
}

export interface ImmutableAuditLog {
  id: string;
  tenantId: string;
  branchId: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  module: "POS" | "INVENTORY" | "ACCOUNTING" | "AUTH" | "SETTINGS" | "SAAS";
  action: "CREATE" | "UPDATE" | "REVERSE_VOID" | "SOFT_ARCHIVE" | "PERIOD_LOCK";
  entityType: string;
  entityId: string;
  summary: string;
}

export interface IdempotencyRecord {
  tenantId?: string;
  key: string;
  scope: string;
  createdAt: string;
  responseStatus: number;
  responseBody: unknown;
}

export interface DocumentCounter {
  tenantId?: string;
  key: string; // e.g. "ten-stacklyra:INVOICE:2026"
  seq: number;
}

export interface CashierShift {
  id: string;
  tenantId: string;
  branchId: string;
  openedAt: string;
  openedBy: string;
  openingFloatMinor: number; // Minor units (paisa)
  cashSalesMinor: number;
  cardSalesMinor: number;
  pettyCashPayoutsMinor: number;
  expectedClosingCashMinor: number;
  countedClosingCashMinor?: number;
  varianceMinor?: number;
  status: "OPEN" | "CLOSED";
  closedAt?: string;
}

export interface FiscalPeriod {
  tenantId?: string;
  periodKey: string; // e.g. "2026-11"
  label: string;
  isLocked: boolean;
  lockedAt?: string;
  lockedBy?: string;
}

export interface MongoDBConfig {
  enabled: boolean;
  uri: string;
  dbName: string;
  lastStatus: string;
  engine?: "POSTGRES_DRIZZLE" | "LOCAL_TENANT_STORE";
}

export interface ProductVariant {
  id: string;
  name: string;
  price: number;
  costPrice: number;
  priceMinor?: number; // Integer paisa (PKR * 100)
}

export interface Product {
  id: string;
  tenantId?: string;
  branchId?: string;
  code: string;
  barcode?: string;
  name: string;
  nameUrdu: string;
  segment: BusinessSegment;
  category: string;
  kitchenStation: KitchenStation;
  taxMode: TaxMode;
  stockQty: number;
  unit: string;
  variants: ProductVariant[];
  popular?: boolean;
  imageUrl?: string;
  isArchived?: boolean;
  archivedAt?: string;
}

export interface CartItem {
  cartItemId: string;
  productId: string;
  code: string;
  name: string;
  nameUrdu: string;
  segment: BusinessSegment;
  kitchenStation: KitchenStation;
  variantId: string;
  variantName: string;
  unitPrice: number;
  unitCostSnapshot?: number;
  taxRateSnapshot?: number;
  quantity: number;
  taxMode: TaxMode;
  notes?: string;
}

export interface PRAConfig {
  restaurantName: string;
  branchName: string;
  ntn: string;
  strn: string;
  posId: string;
  imsEndpointUrl: string;
  apiToken: string;
  cashTaxRate: number;
  cardTaxRate: number;
  retailTaxRate: number;
  serviceChargePercent: number;
  praLiveMode: boolean;
}

export interface TaxBreakdown {
  grossSubtotal: number;
  discountAmount: number;
  taxableAmount: number;
  exemptAmount: number;
  inclusiveTaxExtracted: number;
  exclusiveTaxAdded: number;
  totalSalesTax: number;
  effectiveTaxRateLabel: string;
  serviceCharge: number;
  grandTotal: number;
  cashPortionTax: number;
  cardPortionTax: number;
  grandTotalMinor?: number; // Integer minor units (paisa)
}

export interface Order {
  id: string;
  tenantId?: string;
  branchId?: string;
  idempotencyKey?: string;
  invoiceNumber: string;
  usin: string;
  createdAt: string;
  orderType: OrderType;
  tableNumber?: string;
  waiterName?: string;
  customerName?: string;
  customerPhone?: string;
  buyerNtnCnic?: string;
  khataAccountId?: string;
  items: CartItem[];
  discountAmount: number;
  serviceCharge: number;
  paymentMethod: PaymentMethod;
  cashPaid: number;
  cardPaid: number;
  changeReturned: number;
  taxBreakdown: TaxBreakdown;
  praInvoiceNumber: string;
  praQrPayload: string;
  praSyncStatus: PRASyncStatus;
  praResponseCode?: string;
  cashierName: string;
}

export type PartyType = "CUSTOMER" | "SUPPLIER" | "EXPENSE_HEAD";

export interface PartyAccount {
  id: string;
  tenantId?: string;
  branchId?: string;
  name: string;
  nameUrdu?: string;
  type: PartyType;
  phone: string;
  ntnOrCnic?: string;
  creditLimit: number;
  currentBalance: number;
  currentBalanceMinor?: number;
  notes?: string;
  isArchived?: boolean;
  archivedAt?: string;
}

export interface DoubleEntryLine {
  accountCode: string;
  accountName: string;
  debitMinor: number;
  creditMinor: number;
}

export interface LedgerEntry {
  id: string;
  tenantId?: string;
  branchId?: string;
  createdAt: string;
  partyId: string;
  partyName: string;
  partyType: PartyType;
  voucherNo: string;
  description: string;
  paymentMode: "CASH" | "BANK_TRANSFER" | "CARD" | "CREDIT_INVOICE" | "REVERSAL_NOTE";
  debit: number;
  credit: number;
  balanceAfter: number;
  debitMinor?: number;
  creditMinor?: number;
  balanceAfterMinor?: number;
  journalLines?: DoubleEntryLine[];
  relatedOrderId?: string;
  isReversal?: boolean;
  /** Set on a reversal note: the entry it reverses. */
  reversesEntryId?: string;
  isReversed?: boolean;
  /** Set on an original entry when it is reversed (the only change ever made to a posted entry). */
  reversedByEntryId?: string;
  reversedByVoucherNo?: string;
  reversedAt?: string;
  /** Set on a correcting voucher posted by an edit: the entry it replaces. */
  correctsEntryId?: string;
  isImmutable?: boolean;
}
