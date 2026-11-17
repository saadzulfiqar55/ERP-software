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

export type ERPPermission =
  | "pos:sale:create"
  | "pos:sale:void"
  | "pos:discount:override"
  | "inventory:view"
  | "inventory:adjust"
  | "inventory:archive"
  | "accounting:journal:post"
  | "accounting:journal:reverse"
  | "accounting:period:close"
  | "settings:pra:manage";

export interface UserProfile {
  id: string;
  tenantId?: string;
  branchId?: string;
  allowedBranches?: string[];
  name: string;
  role: UserRole;
  title: string;
  email: string;
  pin: string;
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
  tenantId?: string;
  branchId?: string;
  userId: string;
  userName: string;
  userRole: UserRole;
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
  timestamp: string;
  event:
    | "LOGIN_SUCCESS"
    | "LOGOUT"
    | "SESSION_LOCKED_CONFLICT"
    | "ADMIN_FORCE_TAKEOVER"
    | "TOKEN_REFRESH";
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
  module: "POS" | "INVENTORY" | "ACCOUNTING" | "AUTH" | "SETTINGS";
  action: "CREATE" | "UPDATE" | "REVERSE_VOID" | "SOFT_ARCHIVE" | "PERIOD_LOCK";
  entityType: string;
  entityId: string;
  summary: string;
}

export interface IdempotencyRecord {
  key: string;
  scope: string;
  createdAt: string;
  responseStatus: number;
  responseBody: unknown;
}

export interface DocumentCounter {
  key: string; // e.g. "TENANT_ALBARKA:INVOICE:2026"
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
  reversesEntryId?: string;
  isReversed?: boolean;
  isImmutable?: boolean;
}
