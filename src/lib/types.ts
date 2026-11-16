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

export interface UserProfile {
  id: string;
  name: string;
  role: UserRole;
  title: string;
  email: string;
  pin: string;
  avatarInitials: string;
  badgeColor: string;
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
  event: "LOGIN_SUCCESS" | "LOGOUT" | "SESSION_LOCKED_CONFLICT" | "ADMIN_FORCE_TAKEOVER" | "TOKEN_REFRESH";
  userId: string;
  userName: string;
  userRole: UserRole;
  details: string;
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
}

export interface Product {
  id: string;
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
}

export interface Order {
  id: string;
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
  name: string;
  nameUrdu?: string;
  type: PartyType;
  phone: string;
  ntnOrCnic?: string;
  creditLimit: number;
  currentBalance: number;
  notes?: string;
}

export interface LedgerEntry {
  id: string;
  createdAt: string;
  partyId: string;
  partyName: string;
  partyType: PartyType;
  voucherNo: string;
  description: string;
  paymentMode: "CASH" | "BANK_TRANSFER" | "CARD" | "CREDIT_INVOICE";
  debit: number;
  credit: number;
  balanceAfter: number;
  relatedOrderId?: string;
}
