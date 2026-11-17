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

export const INITIAL_MONTHLY_REVENUE: MonthlyRevenuePoint[] = [
  { month: "Jan", revenueMinor: 142000000, isCurrent: false },
  { month: "Feb", revenueMinor: 158000000, isCurrent: false },
  { month: "Mar", revenueMinor: 151000000, isCurrent: false },
  { month: "Apr", revenueMinor: 179000000, isCurrent: false },
  { month: "May", revenueMinor: 192000000, isCurrent: false },
  { month: "Jun", revenueMinor: 185000000, isCurrent: false },
  { month: "Jul", revenueMinor: 204000000, isCurrent: false },
  { month: "Aug", revenueMinor: 218000000, isCurrent: false },
  { month: "Sep", revenueMinor: 211000000, isCurrent: false },
  { month: "Oct", revenueMinor: 234000000, isCurrent: false },
  { month: "Nov", revenueMinor: 253200000, isCurrent: true },
  { month: "Dec", revenueMinor: 195000000, isCurrent: false },
];

export const INITIAL_WAITING_TASKS: WaitingTaskItem[] = [
  {
    id: "task-po-1",
    type: "PO_APPROVAL",
    title: "Purchase Order #PO-2026-089",
    subtitle: "Al-Madina Fresh Mutton & Beef Suppliers · 85 Kg Supply",
    referenceCode: "PO-2026-089",
    amountLabel: "PKR 168,500",
    status: "PENDING",
  },
  {
    id: "task-po-2",
    type: "PO_APPROVAL",
    title: "Purchase Order #PO-2026-092",
    subtitle: "Punjab Flour & Kiryana Traders · Basmati & Desi Ghee",
    referenceCode: "PO-2026-092",
    amountLabel: "PKR 94,000",
    status: "PENDING",
  },
  {
    id: "task-inv-3",
    type: "OVERDUE_ALERT",
    title: "Overdue Corporate Invoice #INV-2026-0104",
    subtitle: "Chaudhry Textile Mills · 14 days past due",
    referenceCode: "INV-2026-0104",
    amountLabel: "PKR 62,500",
    status: "PENDING",
  },
  {
    id: "task-hr-4",
    type: "LEAVE_REQUEST",
    title: "Annual Leave Request · Muhammad Asif",
    subtitle: "Senior Floor Server · Nov 22 – Nov 25 (4 days)",
    referenceCode: "HR-LV-41",
    status: "PENDING",
  },
  {
    id: "task-acc-5",
    type: "PERIOD_CLOSE",
    title: "PRA Sales Tax Reconciliation · Nov 2026",
    subtitle: "Verify e-IMS QR fiscal register before monthly return",
    referenceCode: "PRA-2026-11",
    status: "PENDING",
  },
];

export const INITIAL_STOCK_MONITOR: StockLevelMonitorItem[] = [
  {
    id: "stk-1",
    name: "Desi Ghee Tin (16 Kg Commercial)",
    sku: "RM-GHEE-16",
    currentQty: 3,
    reorderTarget: 25, // 12% -> Critical (<15% error)
    unit: "Tins",
  },
  {
    id: "stk-2",
    name: "Frozen Seekh Kabab Vacuum Pack (12 Pcs)",
    sku: "504",
    currentQty: 8,
    reorderTarget: 60, // 13.3% -> Critical (<15% error)
    unit: "Packs",
  },
  {
    id: "stk-3",
    name: "Desi Ghee Habshi Halwa Gift Box (1 Kg)",
    sku: "501",
    currentQty: 18,
    reorderTarget: 60, // 30% -> Warning (<35% warning)
    unit: "Boxes",
  },
  {
    id: "stk-4",
    name: "Super Kernel Basmati Rice (50 Kg Bag)",
    sku: "RM-RICE-50",
    currentQty: 7,
    reorderTarget: 24, // 29% -> Warning (<35% warning)
    unit: "Bags",
  },
  {
    id: "stk-5",
    name: "Albarka Karahi Masala Sealed Jar (250g)",
    sku: "503",
    currentQty: 82,
    reorderTarget: 100, // 82% -> Healthy (Primary)
    unit: "Jars",
  },
  {
    id: "stk-6",
    name: "Chilled Mineral Water & Beverages Crate",
    sku: "602",
    currentQty: 90,
    reorderTarget: 120, // 75% -> Healthy (Primary)
    unit: "Crates",
  },
];

export const INITIAL_ERP_INVOICES: ERPInvoice[] = [
  {
    id: "inv-101",
    invoiceNumber: "INV-2026-0101",
    customerId: "party-cust-1",
    customerName: "Chaudhry Textile Mills",
    customerInitials: "CT",
    customerEmail: "accounts@chaudhrytextiles.pk",
    issuedDate: "2026-11-01",
    dueDate: "2026-11-16",
    paymentTerms: "NET_15",
    currency: "PKR",
    status: "PAID",
    discountPercent: 0,
    amountMinor: 14850000, // PKR 148,500
    paymentMethodsAllowed: ["Bank transfer", "Card"],
    settings: {
      paymentReminders: true,
      attachPdfCopy: true,
      allowPartialPayments: true,
    },
    items: [
      {
        id: "li-1",
        description: "Executive Corporate Dinner Catering (45 Guests)",
        quantity: 45,
        unitPriceMinor: 300000,
        taxPercent: 10,
      },
    ],
  },
  {
    id: "inv-102",
    invoiceNumber: "INV-2026-0102",
    customerId: "party-cust-2",
    customerName: "Malik Zafar & Sons",
    customerInitials: "MZ",
    customerEmail: "finance@malikzafar.pk",
    issuedDate: "2026-10-15",
    dueDate: "2026-11-01",
    paymentTerms: "NET_15",
    currency: "PKR",
    status: "OVERDUE",
    discountPercent: 0,
    amountMinor: 6420000, // PKR 64,200
    paymentMethodsAllowed: ["Bank transfer", "Cheque"],
    settings: {
      paymentReminders: true,
      attachPdfCopy: true,
      allowPartialPayments: false,
    },
    items: [
      {
        id: "li-2",
        description: "Albarka Royal BBQ Platter (Jumbo) + Mutton Karahi",
        quantity: 12,
        unitPriceMinor: 500000,
        taxPercent: 7,
      },
    ],
  },
  {
    id: "inv-103",
    invoiceNumber: "INV-2026-0103",
    customerId: "party-cust-3",
    customerName: "Lahore Gymkhana Event Mess",
    customerInitials: "LG",
    customerEmail: "events@lahoregymkhana.pk",
    issuedDate: "2026-11-10",
    dueDate: "2026-12-10",
    paymentTerms: "NET_30",
    currency: "PKR",
    status: "SENT",
    discountPercent: 5,
    amountMinor: 21500000, // PKR 215,000
    paymentMethodsAllowed: ["Bank transfer", "Card", "Cheque"],
    settings: {
      paymentReminders: true,
      attachPdfCopy: true,
      allowPartialPayments: true,
    },
    items: [
      {
        id: "li-3",
        description: "Desi Ghee Habshi Halwa 1Kg Gift Boxes (100 Boxes)",
        quantity: 100,
        unitPriceMinor: 185000,
        taxPercent: 16,
      },
    ],
  },
  {
    id: "inv-104",
    invoiceNumber: "INV-2026-0104",
    customerId: "party-cust-1",
    customerName: "Chaudhry Textile Mills",
    customerInitials: "CT",
    customerEmail: "accounts@chaudhrytextiles.pk",
    issuedDate: "2026-10-18",
    dueDate: "2026-11-02",
    paymentTerms: "NET_15",
    currency: "PKR",
    status: "OVERDUE",
    discountPercent: 0,
    amountMinor: 6250000, // PKR 62,500
    paymentMethodsAllowed: ["Bank transfer"],
    settings: {
      paymentReminders: true,
      attachPdfCopy: true,
      allowPartialPayments: true,
    },
    items: [
      {
        id: "li-4",
        description: "Board of Directors Luncheon — Family Cabin C1",
        quantity: 1,
        unitPriceMinor: 6250000,
        taxPercent: 0,
      },
    ],
  },
  {
    id: "inv-105",
    invoiceNumber: "INV-2026-0105",
    customerId: "party-cust-4",
    customerName: "Packages Mall Retail Kiosk",
    customerInitials: "PM",
    customerEmail: "procurement@packagesmall.pk",
    issuedDate: "2026-11-14",
    dueDate: "2026-11-29",
    paymentTerms: "NET_15",
    currency: "PKR",
    status: "SENT",
    discountPercent: 0,
    amountMinor: 8940000, // PKR 89,400
    paymentMethodsAllowed: ["Bank transfer", "Card"],
    settings: {
      paymentReminders: true,
      attachPdfCopy: true,
      allowPartialPayments: true,
    },
    items: [
      {
        id: "li-5",
        description: "Frozen Seekh Kabab Packs & Karahi Masala Jars Wholesale",
        quantity: 60,
        unitPriceMinor: 149000,
        taxPercent: 0,
      },
    ],
  },
  {
    id: "inv-106",
    invoiceNumber: "INV-2026-0106",
    customerId: "party-cust-5",
    customerName: "Beaconhouse Regional Office",
    customerInitials: "BR",
    customerEmail: "admin@beaconhouse.edu.pk",
    issuedDate: "2026-11-16",
    dueDate: "2026-12-16",
    paymentTerms: "NET_30",
    currency: "PKR",
    status: "DRAFT",
    discountPercent: 0,
    amountMinor: 4580000, // PKR 45,800
    paymentMethodsAllowed: ["Bank transfer", "Cheque"],
    settings: {
      paymentReminders: false,
      attachPdfCopy: true,
      allowPartialPayments: false,
    },
    items: [
      {
        id: "li-6",
        description: "Annual Faculty Hi-Tea Boxed Sweets & Savories",
        quantity: 40,
        unitPriceMinor: 114500,
        taxPercent: 0,
      },
    ],
  },
  {
    id: "inv-107",
    invoiceNumber: "INV-2026-0107",
    customerId: "party-cust-6",
    customerName: "Systems Limited Lahore Campus",
    customerInitials: "SL",
    customerEmail: "facilities@systemsltd.com",
    issuedDate: "2026-11-12",
    dueDate: "2026-11-12",
    paymentTerms: "DUE_ON_RECEIPT",
    currency: "PKR",
    status: "PAID",
    discountPercent: 0,
    amountMinor: 31200000, // PKR 312,000
    paymentMethodsAllowed: ["Bank transfer", "Card"],
    settings: {
      paymentReminders: true,
      attachPdfCopy: true,
      allowPartialPayments: false,
    },
    items: [
      {
        id: "li-7",
        description: "Friday Staff Dera Buffet — 200 Employees",
        quantity: 200,
        unitPriceMinor: 156000,
        taxPercent: 5,
      },
    ],
  },
];
