export type InvoiceStatus = "PAID" | "SENT" | "DRAFT" | "OVERDUE" | "CANCELLED";

export interface ERPInvoiceLineItem {
  id: string;
  productId?: string;
  description: string;
  quantity: number;
  unitPriceMinor: number; // Integer minor units (paisa/cents)
  taxPercent: number;
}

export interface ERPInvoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  customerInitials: string;
  customerEmail: string;
  issuedDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  paymentTerms: "NET_30" | "NET_15" | "DUE_ON_RECEIPT";
  currency: "PKR" | "USD";
  status: InvoiceStatus;
  discountPercent: number;
  amountMinor: number; // Integer minor units
  notes?: string;
  paymentMethodsAllowed: string[];
  settings: {
    paymentReminders: boolean;
    attachPdfCopy: boolean;
    allowPartialPayments: boolean;
  };
  items: ERPInvoiceLineItem[];
}

export interface MonthlyRevenuePoint {
  month: string;
  revenueMinor: number;
  isCurrent: boolean;
}

export interface WaitingTaskItem {
  id: string;
  type: "PO_APPROVAL" | "OVERDUE_ALERT" | "LEAVE_REQUEST" | "PERIOD_CLOSE";
  title: string;
  subtitle: string;
  referenceCode: string;
  amountLabel?: string;
  status: "PENDING" | "APPROVED";
}

export interface StockLevelMonitorItem {
  id: string;
  name: string;
  sku: string;
  currentQty: number;
  reorderTarget: number;
  unit: string;
}

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const currentMonthIdx = new Date().getMonth();

export const INITIAL_MONTHLY_REVENUE: MonthlyRevenuePoint[] = MONTH_LABELS.map(
  (month, idx) => ({
    month,
    revenueMinor: 0,
    isCurrent: idx === currentMonthIdx,
  })
);

export const INITIAL_WAITING_TASKS: WaitingTaskItem[] = [];

export const INITIAL_STOCK_MONITOR: StockLevelMonitorItem[] = [];

export const INITIAL_ERP_INVOICES: ERPInvoice[] = [];
