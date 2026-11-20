"use client";

import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  BarChart3,
  Barcode,
  Bell,
  BookOpen,
  Calculator,
  Camera,
  CheckCircle2,
  Database,
  Download,
  FileText,
  Flame,
  HelpCircle,
  ImageIcon,
  Info,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Pencil,
  Plus,
  Printer,
  Receipt,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  Trash2,
  Truck,
  Users,
  X,
} from "lucide-react";
import {
  ActiveSession,
  BusinessSegment,
  CartItem,
  CashierShift,
  FiscalPeriod,
  ImmutableAuditLog,
  LedgerEntry,
  MongoDBConfig,
  Order,
  OrderType,
  PartyAccount,
  PartyType,
  PaymentMethod,
  PRAConfig,
  Product,
  ProductVariant,
  SessionAuditLog,
  UserProfile,
  UserRole,
} from "@/lib/types";
import { calculateSalesTax } from "@/lib/tax-calculator";
import {
  ERP_BRAND_CONFIG,
  ERP_NAVIGATION_ITEMS,
  ERPNavKey,
} from "@/lib/nav";
import { hasGranularPermission } from "@/core/auth/permissions";
import {
  Avatar,
  Button,
  Card,
  CompactField,
  CompactSelect,
  EmptyState,
  ExtendedFab,
  FilterChip,
  NavItem,
  OutlinedTextField,
  PageHeader,
  SearchBar,
  SegmentedButton,
  Snackbar,
  StatusChip,
  ThemeSelector,
  ThemeToggle,
} from "@/components/ui/m3";
import type {
  ERPInvoice,
  StockLevelMonitorItem,
  WaitingTaskItem,
} from "@/lib/mock/erp-data";
import DishVisual from "@/components/DishVisual";
import { WorkspaceSplash } from "@/components/shell/WorkspaceSplash";
import { SovraLogo } from "@/components/ui/SovraLogo";
import { ERP_VERSION_TAG } from "@/lib/version";

const DashboardView = dynamic(
  () => import("@/components/dashboard/DashboardView"),
  { ssr: false }
);
const InvoicesView = dynamic(
  () => import("@/components/invoices/InvoicesView"),
  { ssr: false }
);
const AboutView = dynamic(
  () => import("@/components/about/AboutView"),
  { ssr: false }
);
const CommandPalette = dynamic(
  () => import("@/components/shell/CommandPalette"),
  { ssr: false }
);
const ReceiptModal = dynamic(() => import("@/components/ReceiptModal"), {
  ssr: false,
});
const AuthScreen = dynamic(() => import("@/components/AuthScreen"), {
  ssr: false,
});

const EMPTY_PRA_CONFIG: PRAConfig = {
  restaurantName: "ALBARKA RESTAURANT & BAKERS",
  branchName: "",
  ntn: "",
  strn: "",
  posId: "",
  imsEndpointUrl: "",
  apiToken: "",
  cashTaxRate: 16,
  cardTaxRate: 5,
  retailTaxRate: 18,
  serviceChargePercent: 5,
  praLiveMode: false,
};

const RESTAURANT_TABLES = [
  "Main Hall - T1",
  "Main Hall - T2",
  "Main Hall - T3",
  "Family Hall - T4",
  "Family Hall - T5",
  "VIP Family Cabin - C1",
  "Outdoor Dera - D1",
  "Outdoor Dera - D2",
];

const WAITERS = [
  "Muhammad Asif",
  "Rana Dilawar",
  "Irfan Khan",
  "Sajid Mehmood",
  "Counter Self",
];

const QUICK_CHEF_NOTES = [
  "Desi Ghee",
  "Less Spicy",
  "Black Pepper",
  "Extra Gravy",
  "Well Done BBQ",
  "Garlic Tarka",
];

export default function HomePage() {
  return <AlbarkaMaterial3ERP defaultNav="dashboard" />;
}

export function AlbarkaMaterial3ERP({
  defaultNav = "dashboard",
  defaultInvoiceMode = "LIST",
}: {
  defaultNav?: ERPNavKey;
  defaultInvoiceMode?: "LIST" | "NEW";
}) {
  // Authentication & Single-Session State (loaded strictly from /api/state)
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [sessionAuditLogs, setSessionAuditLogs] = useState<SessionAuditLog[]>([]);
  const [authChecking, setAuthChecking] = useState<boolean>(true);

  // Material 3 App Shell State
  const [activeNav, setActiveNav] = useState<ERPNavKey>(defaultNav);
  const [invoiceViewKey, setInvoiceViewKey] = useState<"LIST" | "NEW">(
    defaultInvoiceMode
  );
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState<boolean>(false);
  const [createMenuOpen, setCreateMenuOpen] = useState<boolean>(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState<boolean>(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState<boolean>(false);
  const [snackbarMessage, setSnackbarMessage] = useState<string>("");

  const [settingsSubTab, setSettingsSubTab] = useState<
    | "PRA_INTEGRATION"
    | "TAX_RULES"
    | "SESSION_JWT_MANAGER"
    | "MONGODB_DATABASE"
    | "RESTAURANT_PROFILES"
    | "ERP_AUDIT_COMPLIANCE"
    | "APPEARANCE"
  >("PRA_INTEGRATION");

  // Persistent App Data State (hydrated from DB via /api/state)
  const [praConfig, setPraConfig] = useState<PRAConfig>(EMPTY_PRA_CONFIG);
  const [mongoConfig, setMongoConfig] = useState<MongoDBConfig>({
    enabled: false,
    uri: "",
    dbName: "albarka_erp",
    lastStatus: "Loading MongoDB status…",
  });
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [erpInvoices, setErpInvoices] = useState<ERPInvoice[]>([]);
  const [parties, setParties] = useState<PartyAccount[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [waitingTasks, setWaitingTasks] = useState<WaitingTaskItem[]>([]);
  const [stockMonitor, setStockMonitor] = useState<StockLevelMonitorItem[]>([]);
  const [immutableAuditLogs, setImmutableAuditLogs] = useState<
    ImmutableAuditLog[]
  >([]);
  const [cashierShifts, setCashierShifts] = useState<CashierShift[]>([]);
  const [fiscalPeriods, setFiscalPeriods] = useState<FiscalPeriod[]>([]);
  const [countedCashInput, setCountedCashInput] = useState<string>("");

  // POS Filters & Search
  const [segmentFilter, setSegmentFilter] = useState<"ALL" | BusinessSegment>(
    "ALL"
  );
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [barcodeInput, setBarcodeInput] = useState<string>("");

  // Active Order State
  const [orderType, setOrderType] = useState<OrderType>("DINE_IN");
  const [tableNumber, setTableNumber] = useState<string>(RESTAURANT_TABLES[3]);
  const [waiterName, setWaiterName] = useState<string>(WAITERS[0]);
  const [customerName, setCustomerName] = useState<string>("");
  const [customerPhone, setCustomerPhone] = useState<string>("");
  const [buyerNtnCnic] = useState<string>("");
  const [selectedKhataId, setSelectedKhataId] = useState<string>("");
  const [cart, setCart] = useState<CartItem[]>([
    {
      cartItemId: "init-1",
      productId: "prod-101",
      code: "101",
      name: "Albarka Special Mutton Karahi",
      nameUrdu: "",
      segment: "RESTAURANT",
      kitchenStation: "KARAHI_HANDI",
      variantId: "v-101-full",
      variantName: "Full (1 Kg)",
      unitPrice: 3800,
      quantity: 1,
      taxMode: "EXCLUSIVE",
      notes: "Desi Ghee",
    },
    {
      cartItemId: "init-2",
      productId: "prod-401",
      code: "401",
      name: "Roghni / Garlic Kalonji Naan",
      nameUrdu: "",
      segment: "RESTAURANT",
      kitchenStation: "TANDOOR",
      variantId: "v-401-reg",
      variantName: "Roghni Naan",
      unitPrice: 110,
      quantity: 4,
      taxMode: "EXCLUSIVE",
    },
    {
      cartItemId: "init-3",
      productId: "prod-501",
      code: "501",
      name: "Desi Ghee Habshi Halwa Box",
      nameUrdu: "",
      segment: "RETAIL",
      kitchenStation: "SWEET_RETAIL",
      variantId: "v-501-500g",
      variantName: "500g Pack",
      unitPrice: 950,
      quantity: 1,
      taxMode: "INCLUSIVE",
    },
  ]);

  // Billing & Tax Controls
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [includeServiceCharge] = useState<boolean>(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [splitCashRatio, setSplitCashRatio] = useState<number>(0.5);
  const [cashTendered, setCashTendered] = useState<string>("");
  const [activeReceiptOrder, setActiveReceiptOrder] = useState<Order | null>(
    null
  );
  const [submittingOrder, setSubmittingOrder] = useState<boolean>(false);

  // Standalone Sales Tax Calculator state
  const [calcAmount, setCalcAmount] = useState<number>(5000);
  const [calcTaxMode, setCalcTaxMode] = useState<"EXCLUSIVE" | "INCLUSIVE">(
    "EXCLUSIVE"
  );
  const [calcDiscount, setCalcDiscount] = useState<number>(0);

  // Ledger / Khata Form State
  const [ledgerPartyFilter, setLedgerPartyFilter] = useState<"ALL" | PartyType>(
    "ALL"
  );
  const [selectedPartyId, setSelectedPartyId] = useState<string>("");
  const [voucherType, setVoucherType] = useState<
    | "CUSTOMER_RECEIPT"
    | "SUPPLIER_BILL"
    | "SUPPLIER_PAYMENT"
    | "EXPENSE_VOUCHER"
  >("CUSTOMER_RECEIPT");
  const [voucherAmount, setVoucherAmount] = useState<string>("");
  const [voucherDesc, setVoucherDesc] = useState<string>("");
  const [voucherMode] = useState<"CASH" | "BANK_TRANSFER" | "CARD">("CASH");

  // New / Edit Party Form
  const [editingPartyId, setEditingPartyId] = useState<string | null>(null);
  const [newPartyName, setNewPartyName] = useState<string>("");
  const [newPartyType, setNewPartyType] = useState<PartyType>("CUSTOMER");
  const [newPartyPhone, setNewPartyPhone] = useState<string>("");
  const [newPartyOpening, setNewPartyOpening] = useState<string>("0");

  // Edit Ledger Voucher Entry State
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editEntryVoucherNo, setEditEntryVoucherNo] = useState<string>("");
  const [editEntryDesc, setEditEntryDesc] = useState<string>("");
  const [editEntryDebit, setEditEntryDebit] = useState<string>("0");
  const [editEntryCredit, setEditEntryCredit] = useState<string>("0");

  // New / Edit Product Form
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [newProdName, setNewProdName] = useState<string>("");
  const [newProdCode, setNewProdCode] = useState<string>("");
  const [newProdSegment, setNewProdSegment] =
    useState<BusinessSegment>("RESTAURANT");
  const [newProdCategory, setNewProdCategory] =
    useState<string>("Karahi & Handi");
  const [newProdPrice, setNewProdPrice] = useState<string>("");
  const [newProdStock, setNewProdStock] = useState<string>("100");
  const [newProdImageUrl, setNewProdImageUrl] = useState<string>("");

  // Super Admin Staff Profile Management Form
  const [newProfileName, setNewProfileName] = useState<string>("");
  const [newProfileUsername, setNewProfileUsername] = useState<string>("");
  const [newProfileRole, setNewProfileRole] = useState<UserRole>("CASHIER");
  const [newProfileTitle, setNewProfileTitle] = useState<string>("");
  const [newProfileEmail, setNewProfileEmail] = useState<string>("");
  const [newProfilePin, setNewProfilePin] = useState<string>("");
  const [newProfilePassword, setNewProfilePassword] = useState<string>("");
  const [savingProfile, setSavingProfile] = useState<boolean>(false);

  // Super Admin Password Rotation State
  const [currentAdminPassword, setCurrentAdminPassword] = useState<string>("");
  const [nextAdminPassword, setNextAdminPassword] = useState<string>("");
  const [confirmAdminPassword, setConfirmAdminPassword] = useState<string>("");
  const [savingAdminPassword, setSavingAdminPassword] = useState<boolean>(false);

  // Global Ctrl+K shortcut to open Command Palette
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function fetchScopedState() {
    const stateRes = await fetch("/api/state");
    if (!stateRes.ok) return;
    const data = await stateRes.json();
    if (data.praConfig) setPraConfig(data.praConfig);
    if (data.mongoConfig) setMongoConfig(data.mongoConfig);
    setProducts(data.products || []);
    setOrders(data.orders || []);
    if (data.erpInvoices) setErpInvoices(data.erpInvoices);
    setParties(data.parties || []);
    if (data.parties?.[0]?.id) {
      setSelectedKhataId((prev) => prev || data.parties[0].id);
      setSelectedPartyId((prev) => prev || data.parties[0].id);
    }
    setLedger(data.ledger || []);
    if (data.users) setUsers(data.users);
    if (data.waitingTasks) setWaitingTasks(data.waitingTasks);
    if (data.stockMonitor) setStockMonitor(data.stockMonitor);
    setImmutableAuditLogs(data.immutableAuditLogs || []);
    if (data.cashierShifts) setCashierShifts(data.cashierShifts);
    if (data.fiscalPeriods) setFiscalPeriods(data.fiscalPeriods);
  }

  // Load State + Verify JWT Cookie Session on Mount
  useEffect(() => {
    async function initApp() {
      try {
        const [, authRes] = await Promise.all([
          fetchScopedState(),
          fetch("/api/auth"),
        ]);
        if (authRes.ok) {
          const authData = await authRes.json();
          setActiveSession(authData.activeSession || null);
          setSessionAuditLogs(authData.sessionAuditLogs || []);
          if (authData.authenticated && authData.user) {
            setCurrentUser(authData.user);
          }
        }
      } catch {
        // Offline fallback
      } finally {
        setAuthChecking(false);
      }
    }
    initApp();
  }, []);

  function notifySaved(msg: string) {
    setSnackbarMessage(msg);
    setTimeout(() => setSnackbarMessage(""), 4500);
  }

  async function handleApproveTask(task: WaitingTaskItem) {
    const res = await fetch("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approveTaskId: task.id }),
    });
    const data = await res.json();
    if (!res.ok) {
      notifySaved(data.error || "Permission denied for task approval.");
      return;
    }
    if (data.waitingTasks) setWaitingTasks(data.waitingTasks);
    if (data.immutableAuditLogs) setImmutableAuditLogs(data.immutableAuditLogs);
    notifySaved(`Approved ${task.referenceCode} (${task.title})`);
  }

  async function handleReorderStock(item: StockLevelMonitorItem) {
    const res = await fetch("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reorderStockId: item.id }),
    });
    const data = await res.json();
    if (!res.ok) {
      notifySaved(data.error || "Permission denied for stock reorder.");
      return;
    }
    if (data.stockMonitor) setStockMonitor(data.stockMonitor);
    if (data.immutableAuditLogs) setImmutableAuditLogs(data.immutableAuditLogs);
    notifySaved(
      `Restocked ${item.name} to ${item.reorderTarget} ${item.unit}`
    );
  }

  async function handleLogoutSession() {
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "LOGOUT" }),
    });
    if (res.ok) {
      const data = await res.json();
      setSessionAuditLogs(data.sessionAuditLogs || []);
      setActiveSession(null);
      setCurrentUser(null);
      setLedger([]);
      setParties([]);
      setWaitingTasks([]);
      setImmutableAuditLogs([]);
      setActiveNav("dashboard");
      void fetchScopedState();
    }
  }

  async function handleRefreshSession() {
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "REFRESH_SESSION" }),
    });
    if (res.ok) {
      const data = await res.json();
      setActiveSession(data.activeSession);
      setSessionAuditLogs(data.sessionAuditLogs || []);
      notifySaved(`JWT Token Refreshed (${data.activeSession.sessionId})`);
    }
  }

  async function handleUpdateProductImage(productId: string, imageUrl: string) {
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, imageUrl } : p))
    );

    const res = await fetch("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        updateProductImage: { productId, imageUrl },
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setProducts(data.products);
      notifySaved("Menu item photo updated.");
    }
  }

  function handleNewProdImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setNewProdImageUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  const categories = useMemo(() => {
    const set = new Set<string>(products.map((p) => p.category));
    return ["ALL", ...Array.from(set)];
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (segmentFilter !== "ALL" && p.segment !== segmentFilter) return false;
      if (categoryFilter !== "ALL" && p.category !== categoryFilter) return false;
      if (searchQuery.trim() !== "") {
        const q = searchQuery.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q) ||
          (p.barcode && p.barcode.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [products, segmentFilter, categoryFilter, searchQuery]);

  const liveTaxBreakdown = useMemo(() => {
    return calculateSalesTax(
      cart,
      paymentMethod,
      discountAmount,
      praConfig,
      includeServiceCharge,
      splitCashRatio
    );
  }, [
    cart,
    paymentMethod,
    discountAmount,
    praConfig,
    includeServiceCharge,
    splitCashRatio,
  ]);

  const canViewLedger = currentUser
    ? hasGranularPermission(currentUser.role, "accounting:ledger:view")
    : false;

  const totalSalesRevenue = useMemo(
    () => orders.reduce((s, o) => s + o.taxBreakdown.grandTotal, 0),
    [orders]
  );
  const totalPraTaxCollected = useMemo(
    () => orders.reduce((s, o) => s + o.taxBreakdown.totalSalesTax, 0),
    [orders]
  );
  const totalReceivables = useMemo(
    () =>
      parties
        .filter((p) => p.type === "CUSTOMER" && p.currentBalance > 0)
        .reduce((s, p) => s + p.currentBalance, 0),
    [parties]
  );
  const totalPayables = useMemo(
    () =>
      parties
        .filter((p) => p.type === "SUPPLIER" && p.currentBalance < 0)
        .reduce((s, p) => s + Math.abs(p.currentBalance), 0),
    [parties]
  );
  const supplierCount = useMemo(
    () => parties.filter((p) => p.type === "SUPPLIER").length,
    [parties]
  );
  const pendingTasksCount = useMemo(
    () =>
      waitingTasks.filter((t) => {
        if (t.status !== "PENDING") return false;
        if (
          !canViewLedger &&
          (t.type === "OVERDUE_ALERT" || t.type === "PERIOD_CLOSE")
        ) {
          return false;
        }
        return true;
      }).length,
    [waitingTasks, canViewLedger]
  );

  const cashComparison = useMemo(
    () =>
      calculateSalesTax(
        cart,
        "CASH",
        discountAmount,
        praConfig,
        includeServiceCharge
      ),
    [cart, discountAmount, praConfig, includeServiceCharge]
  );
  const cardComparison = useMemo(
    () =>
      calculateSalesTax(
        cart,
        "CARD",
        discountAmount,
        praConfig,
        includeServiceCharge
      ),
    [cart, discountAmount, praConfig, includeServiceCharge]
  );

  function addToCart(product: Product, variant: ProductVariant) {
    setCart((prev) => {
      const existingIndex = prev.findIndex(
        (item) =>
          item.productId === product.id && item.variantId === variant.id
      );
      if (existingIndex > -1) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + 1,
        };
        return updated;
      }
      return [
        ...prev,
        {
          cartItemId: `${product.id}-${variant.id}-${Date.now()}`,
          productId: product.id,
          code: product.code,
          name: product.name,
          nameUrdu: "",
          segment: product.segment,
          kitchenStation: product.kitchenStation,
          variantId: variant.id,
          variantName: variant.name,
          unitPrice: variant.price,
          quantity: 1,
          taxMode: product.taxMode,
        },
      ];
    });
  }

  function handleBarcodeScan(e: React.FormEvent) {
    e.preventDefault();
    const code = barcodeInput.trim();
    if (!code) return;
    const found = products.find(
      (p) => p.code.toLowerCase() === code.toLowerCase() || p.barcode === code
    );
    if (found && found.variants.length > 0) {
      addToCart(found, found.variants[0]);
      setBarcodeInput("");
    }
  }

  function updateQuantity(cartItemId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((item) =>
          item.cartItemId === cartItemId
            ? { ...item, quantity: item.quantity + delta }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  function updateItemNote(cartItemId: string, notes: string) {
    setCart((prev) =>
      prev.map((item) =>
        item.cartItemId === cartItemId ? { ...item, notes } : item
      )
    );
  }

  async function handleCheckout() {
    if (cart.length === 0 || submittingOrder) return;
    setSubmittingOrder(true);

    const grandTotal = liveTaxBreakdown.grandTotal;
    let cashPaid = 0;
    let cardPaid = 0;
    let changeReturned = 0;

    if (paymentMethod === "CASH") {
      const tendered = Number(cashTendered) || grandTotal;
      cashPaid = Math.max(tendered, grandTotal);
      changeReturned = Math.max(0, cashPaid - grandTotal);
    } else if (
      paymentMethod === "CARD" ||
      paymentMethod === "JAZZCASH_EASYPAISA"
    ) {
      cardPaid = grandTotal;
    } else if (paymentMethod === "SPLIT") {
      cashPaid = Math.round(grandTotal * splitCashRatio);
      cardPaid = grandTotal - cashPaid;
    }

    const khataParty =
      paymentMethod === "KHATA_CREDIT"
        ? parties.find((p) => p.id === selectedKhataId)
        : undefined;

    const payload = {
      idempotencyKey: `pos-sale-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,
      orderType,
      tableNumber: orderType === "DINE_IN" ? tableNumber : undefined,
      waiterName: orderType === "DINE_IN" ? waiterName : undefined,
      customerName:
        khataParty?.name ||
        customerName ||
        (orderType === "DINE_IN" ? tableNumber : "Walk-in"),
      customerPhone,
      buyerNtnCnic: khataParty?.ntnOrCnic || buyerNtnCnic,
      khataAccountId:
        paymentMethod === "KHATA_CREDIT" ? selectedKhataId : undefined,
      items: cart,
      discountAmount: liveTaxBreakdown.discountAmount,
      serviceCharge: liveTaxBreakdown.serviceCharge,
      paymentMethod,
      cashPaid,
      cardPaid,
      changeReturned,
      taxBreakdown: liveTaxBreakdown,
      cashierName: `${currentUser?.name} (${currentUser?.role})`,
    };

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setOrders(data.db.orders);
        setProducts(data.db.products);
        setParties(data.db.parties);
        setLedger(data.db.ledger);
        if (data.db.immutableAuditLogs)
          setImmutableAuditLogs(data.db.immutableAuditLogs);
        if (data.db.cashierShifts) setCashierShifts(data.db.cashierShifts);
        setActiveReceiptOrder(data.order);
        setCart([]);
        setDiscountAmount(0);
        setCashTendered("");
      } else {
        notifySaved(data.error || "Order rejected by domain guard.");
      }
    } finally {
      setSubmittingOrder(false);
    }
  }

  async function handlePostVoucher(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(voucherAmount);
    if (!amount || amount <= 0 || !selectedPartyId) return;

    let debit = 0;
    let credit = 0;
    let defaultDesc = "";

    if (voucherType === "CUSTOMER_RECEIPT") {
      credit = amount;
      defaultDesc = "Payment Received from Customer (Khata Recovery)";
    } else if (voucherType === "SUPPLIER_BILL") {
      credit = amount;
      defaultDesc = "Supplier Purchase Bill / GRN Inward";
    } else if (voucherType === "SUPPLIER_PAYMENT") {
      debit = amount;
      defaultDesc = "Payout to Supplier from Cash / Bank";
    } else {
      debit = amount;
      defaultDesc = "Daily Restaurant Petty Expense Voucher";
    }

    const res = await fetch("/api/ledger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        partyId: selectedPartyId,
        debit,
        credit,
        paymentMode: voucherMode,
        description: voucherDesc.trim() || defaultDesc,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      setParties(data.db.parties);
      setLedger(data.db.ledger);
      if (data.db.immutableAuditLogs)
        setImmutableAuditLogs(data.db.immutableAuditLogs);
      setVoucherAmount("");
      setVoucherDesc("");
      notifySaved("Ledger voucher recorded and party balance updated.");
    }
  }

  async function handleCreateParty(e: React.FormEvent) {
    e.preventDefault();
    if (!newPartyName.trim()) return;

    if (editingPartyId) {
      const existing = parties.find((p) => p.id === editingPartyId);
      if (!existing) return;
      const updatedParty: PartyAccount = {
        ...existing,
        name: newPartyName.trim(),
        type: newPartyType,
        phone: newPartyPhone.trim() || "-",
        currentBalance: Number(newPartyOpening) || 0,
      };
      const res = await fetch("/api/ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "EDIT_PARTY",
          party: updatedParty,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setParties(data.db.parties);
        setLedger(data.db.ledger);
        setEditingPartyId(null);
        setNewPartyName("");
        setNewPartyPhone("");
        setNewPartyOpening("0");
        notifySaved(`Updated Khata account "${updatedParty.name}".`);
      }
      return;
    }

    const res = await fetch("/api/ledger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "CREATE_PARTY",
        name: newPartyName.trim(),
        nameUrdu: "",
        type: newPartyType,
        phone: newPartyPhone.trim(),
        openingBalance: Number(newPartyOpening) || 0,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setParties(data.db.parties);
      setSelectedPartyId(data.party.id);
      setNewPartyName("");
      setNewPartyPhone("");
      setNewPartyOpening("0");
      notifySaved(`Khata account "${data.party.name}" created.`);
    }
  }

  function startEditingParty(party: PartyAccount) {
    setEditingPartyId(party.id);
    setNewPartyName(party.name);
    setNewPartyType(party.type);
    setNewPartyPhone(party.phone === "-" ? "" : party.phone);
    setNewPartyOpening(String(party.currentBalance));
  }

  function cancelEditingParty() {
    setEditingPartyId(null);
    setNewPartyName("");
    setNewPartyPhone("");
    setNewPartyOpening("0");
  }

  async function handleDeleteParty(partyId: string, partyName: string) {
    const res = await fetch("/api/ledger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "DELETE_PARTY",
        partyId,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setParties(data.db.parties);
      setLedger(data.db.ledger);
      if (editingPartyId === partyId) cancelEditingParty();
      notifySaved(`Archived Khata account "${partyName}".`);
    }
  }

  function startEditingEntry(entry: LedgerEntry) {
    setEditingEntryId(entry.id);
    setEditEntryVoucherNo(entry.voucherNo);
    setEditEntryDesc(entry.description);
    setEditEntryDebit(String(entry.debit));
    setEditEntryCredit(String(entry.credit));
  }

  async function handleSaveEditedEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!editingEntryId) return;
    const res = await fetch("/api/ledger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "EDIT_ENTRY",
        entryId: editingEntryId,
        voucherNo: editEntryVoucherNo.trim(),
        description: editEntryDesc.trim(),
        debit: Number(editEntryDebit) || 0,
        credit: Number(editEntryCredit) || 0,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setParties(data.db.parties);
      setLedger(data.db.ledger);
      setEditingEntryId(null);
      notifySaved("Ledger voucher updated and party balance recalculated.");
    }
  }

  async function handleDeleteEntry(entryId: string, voucherNo: string) {
    const res = await fetch("/api/ledger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "DELETE_ENTRY",
        entryId,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setParties(data.db.parties);
      setLedger(data.db.ledger);
      if (data.db.immutableAuditLogs)
        setImmutableAuditLogs(data.db.immutableAuditLogs);
      if (editingEntryId === entryId) setEditingEntryId(null);
      notifySaved(`Voided voucher ${voucherNo} and adjusted balance.`);
    } else {
      notifySaved(data.error || "Action blocked by Fiscal Period Lock.");
    }
  }

  async function handleReverseEntry(entryId: string, voucherNo: string) {
    const res = await fetch("/api/ledger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "REVERSE_ENTRY",
        entryId,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setParties(data.db.parties);
      setLedger(data.db.ledger);
      if (data.db.immutableAuditLogs)
        setImmutableAuditLogs(data.db.immutableAuditLogs);
      notifySaved(`Posted append-only Reversal Credit Note for ${voucherNo}.`);
    } else {
      notifySaved(data.error || "Reversal blocked by Fiscal Period Lock.");
    }
  }

  async function handleToggleFiscalPeriod(periodKey: string) {
    const res = await fetch("/api/ledger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "TOGGLE_FISCAL_PERIOD",
        periodKey,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.db.fiscalPeriods) setFiscalPeriods(data.db.fiscalPeriods);
      if (data.db.immutableAuditLogs)
        setImmutableAuditLogs(data.db.immutableAuditLogs);
      notifySaved(`Updated Fiscal Period lock for ${periodKey}.`);
    }
  }

  async function handleReconcileShift(e: React.FormEvent) {
    e.preventDefault();
    const countedCashPkr = Number(countedCashInput);
    if (!Number.isFinite(countedCashPkr) || countedCashPkr < 0) return;

    const res = await fetch("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reconcileShift: { countedCashPkr },
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.cashierShifts) setCashierShifts(data.cashierShifts);
      if (data.immutableAuditLogs)
        setImmutableAuditLogs(data.immutableAuditLogs);
      notifySaved("Cashier shift register reconciled and variance recorded.");
    }
  }

  async function handleSavePraConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUser?.permissions.canEditPraSettings) {
      notifySaved("Only Admin profile can modify PRA fiscal parameters.");
      return;
    }
    const res = await fetch("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ praConfig }),
    });
    if (res.ok) {
      const data = await res.json();
      setPraConfig(data.praConfig);
      notifySaved("PRA e-IMS settings & GST rates saved.");
    }
  }

  async function handleSaveMongoConfig(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mongoConfig }),
    });
    const data = await res.json();
    if (res.ok) {
      setMongoConfig(data.mongoConfig);
      notifySaved(data.mongoConfig.lastStatus);
    } else {
      notifySaved(data.error || "Failed to test MongoDB connection.");
    }
  }

  async function handleAddProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!newProdName.trim() || !newProdPrice) return;

    if (editingProductId) {
      const existing = products.find((p) => p.id === editingProductId);
      if (!existing) return;
      const updatedProduct: Product = {
        ...existing,
        code: newProdCode.trim() || existing.code,
        name: newProdName.trim(),
        segment: newProdSegment,
        category: newProdCategory,
        kitchenStation:
          newProdSegment === "RETAIL"
            ? "SWEET_RETAIL"
            : newProdCategory.includes("BBQ")
            ? "BBQ_GRILL"
            : newProdCategory.includes("Tandoor")
            ? "TANDOOR"
            : newProdCategory.includes("Rice")
            ? "RICE_PULAO"
            : "KARAHI_HANDI",
        taxMode: newProdSegment === "RETAIL" ? "INCLUSIVE" : "EXCLUSIVE",
        stockQty: Number(newProdStock) || 0,
        imageUrl: newProdImageUrl.trim() || undefined,
        variants:
          existing.variants.length > 0
            ? existing.variants.map((v, idx) =>
                idx === 0
                  ? {
                      ...v,
                      price: Number(newProdPrice),
                      costPrice: Math.round(Number(newProdPrice) * 0.6),
                    }
                  : v
              )
            : [
                {
                  id: `v-${Date.now()}`,
                  name:
                    newProdSegment === "RETAIL"
                      ? "Standard Pack"
                      : "Full Portion",
                  price: Number(newProdPrice),
                  costPrice: Math.round(Number(newProdPrice) * 0.6),
                },
              ],
      };

      const res = await fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editProduct: updatedProduct }),
      });
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products);
        cancelEditingProduct();
        notifySaved(`Updated "${updatedProduct.name}".`);
      }
      return;
    }

    const newProduct: Product = {
      id: `prod-${Date.now()}`,
      code: newProdCode.trim() || `${products.length + 701}`,
      barcode: `896100${products.length + 701}`,
      name: newProdName.trim(),
      nameUrdu: "",
      segment: newProdSegment,
      category: newProdCategory,
      kitchenStation:
        newProdSegment === "RETAIL"
          ? "SWEET_RETAIL"
          : newProdCategory.includes("BBQ")
          ? "BBQ_GRILL"
          : newProdCategory.includes("Tandoor")
          ? "TANDOOR"
          : newProdCategory.includes("Rice")
          ? "RICE_PULAO"
          : "KARAHI_HANDI",
      taxMode: newProdSegment === "RETAIL" ? "INCLUSIVE" : "EXCLUSIVE",
      stockQty: Number(newProdStock) || 100,
      unit: newProdSegment === "RETAIL" ? "Pack" : "Portion",
      imageUrl: newProdImageUrl.trim() || undefined,
      variants: [
        {
          id: `v-${Date.now()}`,
          name: newProdSegment === "RETAIL" ? "Standard Pack" : "Full Portion",
          price: Number(newProdPrice),
          costPrice: Math.round(Number(newProdPrice) * 0.6),
        },
      ],
    };

    const res = await fetch("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newProduct }),
    });
    if (res.ok) {
      const data = await res.json();
      setProducts(data.products);
      setNewProdName("");
      setNewProdCode("");
      setNewProdPrice("");
      setNewProdImageUrl("");
      notifySaved(`Added "${newProduct.name}" to menu catalog.`);
    }
  }

  function startEditingProduct(product: Product) {
    setEditingProductId(product.id);
    setNewProdName(product.name);
    setNewProdCode(product.code);
    setNewProdSegment(product.segment);
    setNewProdCategory(product.category);
    setNewProdPrice(String(product.variants[0]?.price || 0));
    setNewProdStock(String(product.stockQty));
    setNewProdImageUrl(product.imageUrl || "");
  }

  function cancelEditingProduct() {
    setEditingProductId(null);
    setNewProdName("");
    setNewProdCode("");
    setNewProdPrice("");
    setNewProdStock("100");
    setNewProdImageUrl("");
  }

  async function handleDeleteProduct(productId: string, productName: string) {
    const res = await fetch("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deleteProductId: productId }),
    });
    const data = await res.json();
    if (res.ok) {
      setProducts(data.products);
      if (editingProductId === productId) cancelEditingProduct();
      notifySaved(`Archived "${productName}" from menu catalog.`);
    } else {
      notifySaved(data.error || "Only Owner / Super Admin can archive items.");
    }
  }

  async function handleCreateProfile(e: React.FormEvent) {
    e.preventDefault();
    const isCreatingAdmin = newProfileRole === "ADMIN";
    if (!newProfileName.trim() || !newProfileEmail.trim()) {
      notifySaved("Fill in Name and Work Email.");
      return;
    }
    if (isCreatingAdmin && newProfilePassword.length < 8) {
      notifySaved("Super Admin profiles require a password (min 8 chars).");
      return;
    }
    if (!isCreatingAdmin && !/^\d{4}$/.test(newProfilePin.trim())) {
      notifySaved("Staff PIN must be exactly 4 digits.");
      return;
    }
    setSavingProfile(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CREATE",
          name: newProfileName.trim(),
          username: newProfileUsername.trim(),
          role: newProfileRole,
          title: newProfileTitle.trim(),
          email: newProfileEmail.trim(),
          pin: isCreatingAdmin ? "" : newProfilePin.trim(),
          password: isCreatingAdmin ? newProfilePassword : "",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        notifySaved(data.error || "Failed to add profile.");
        return;
      }
      if (data.users) setUsers(data.users);
      if (data.immutableAuditLogs) setImmutableAuditLogs(data.immutableAuditLogs);
      setNewProfileName("");
      setNewProfileUsername("");
      setNewProfileTitle("");
      setNewProfileEmail("");
      setNewProfilePin("");
      setNewProfilePassword("");
      notifySaved(`Added ${newProfileRole} profile "${data.user.name}".`);
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangeAdminPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!currentAdminPassword || nextAdminPassword.length < 8) {
      notifySaved("New Super Admin password must be at least 8 characters.");
      return;
    }
    if (nextAdminPassword !== confirmAdminPassword) {
      notifySaved("New password and confirmation do not match.");
      return;
    }
    setSavingAdminPassword(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CHANGE_PASSWORD",
          currentPassword: currentAdminPassword,
          newPassword: nextAdminPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        notifySaved(data.error || "Failed to update Super Admin password.");
        return;
      }
      if (data.immutableAuditLogs) setImmutableAuditLogs(data.immutableAuditLogs);
      setCurrentAdminPassword("");
      setNextAdminPassword("");
      setConfirmAdminPassword("");
      notifySaved("Super Admin password updated securely (scrypt hash saved).");
    } finally {
      setSavingAdminPassword(false);
    }
  }

  async function handleDeleteProfile(userId: string, userName: string) {
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "DELETE", userId }),
    });
    const data = await res.json();
    if (!res.ok) {
      notifySaved(data.error || "Failed to remove profile.");
      return;
    }
    if (data.users) setUsers(data.users);
    if (data.immutableAuditLogs) setImmutableAuditLogs(data.immutableAuditLogs);
    notifySaved(`Removed profile "${userName}".`);
  }

  function exportPRACsv() {
    const headers = [
      "InvoiceNumber",
      "PRA_Fiscal_Invoice",
      "USIN",
      "DateTime",
      "OrderType",
      "Customer",
      "BuyerNTN",
      "PaymentMethod",
      "TaxableValue_PKR",
      "SalesTax_PKR",
      "GrandTotal_PKR",
      "PRASyncStatus",
    ];
    const rows = orders.map((o) => [
      o.invoiceNumber,
      o.praInvoiceNumber,
      o.usin,
      o.createdAt,
      o.orderType,
      `"${o.customerName || "Walk-in"}"`,
      o.buyerNtnCnic || "",
      o.paymentMethod,
      o.taxBreakdown.taxableAmount,
      o.taxBreakdown.totalSalesTax,
      o.taxBreakdown.grandTotal,
      o.praSyncStatus,
    ]);
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `Albarka_PRA_Sales_Tax_Register.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  if (authChecking) {
    return <WorkspaceSplash />;
  }

  if (!currentUser) {
    return (
      <AuthScreen
        users={users}
        activeSession={activeSession}
        onAuthSuccess={({ user, activeSession: ses, sessionAuditLogs: logs }) => {
          setCurrentUser(user);
          setActiveSession(ses);
          setSessionAuditLogs(logs);
          if (!hasGranularPermission(user.role, "settings:pra:manage")) {
            setSettingsSubTab("APPEARANCE");
          }
          void fetchScopedState();
        }}
      />
    );
  }

  const isSuperAdmin = currentUser.role === "ADMIN";
  const canManageInventory = hasGranularPermission(
    currentUser.role,
    "inventory:adjust"
  );
  const canArchiveInventory = hasGranularPermission(
    currentUser.role,
    "inventory:archive"
  );
  const canDeleteInvoices = hasGranularPermission(
    currentUser.role,
    "invoices:delete"
  );
  const canManageUsers = hasGranularPermission(
    currentUser.role,
    "users:manage"
  );
  const canManagePra = hasGranularPermission(
    currentUser.role,
    "settings:pra:manage"
  );

  // Permission-filtered navigation items (Section 3 requirement)
  const permittedNavItems = ERP_NAVIGATION_ITEMS.filter((item) =>
    hasGranularPermission(currentUser.role, item.permission)
  );
  const primaryNavItems = permittedNavItems.filter(
    (i) => i.section === "PRIMARY"
  );
  const systemNavItems = permittedNavItems.filter(
    (i) => i.section === "SYSTEM"
  );

  const renderNavIcon = (iconName: string) => {
    const props = { className: "w-5 h-5", strokeWidth: 1.8 };
    switch (iconName) {
      case "LayoutDashboard":
        return <LayoutDashboard {...props} />;
      case "Store":
        return <Store {...props} />;
      case "ShoppingBag":
        return <ShoppingBag {...props} />;
      case "Truck":
        return <Truck {...props} />;
      case "Package":
        return <Package {...props} />;
      case "FileText":
        return <FileText {...props} />;
      case "BookOpen":
        return <BookOpen {...props} />;
      case "Users":
        return <Users {...props} />;
      case "BarChart3":
        return <BarChart3 {...props} />;
      case "Info":
        return <Info {...props} />;
      default:
        return <Settings {...props} />;
    }
  };

  const getNavBadgeCount = (key: ERPNavKey): number | undefined => {
    switch (key) {
      case "pos":
        return cart.length;
      case "sales":
        return orders.length;
      case "purchasing":
        return supplierCount;
      case "inventory":
        return products.length;
      case "invoices":
        return erpInvoices.length;
      case "accounting":
        return ledger.length;
      case "hr":
        return users.length;
      default:
        return undefined;
    }
  };

  return (
    <div className="min-h-screen flex bg-md-surface text-md-on-surface">
      {/* =================================================================== */}
      {/* 1. MATERIAL 3 NAVIGATION DRAWER (≥1024px: 264px, 600-1023px: 80px)  */}
      {/* =================================================================== */}
      <aside className="hidden sm:flex flex-col justify-between shrink-0 sticky top-0 h-screen z-30 bg-md-surface-container-low border-r border-md-divider w-20 lg:w-[264px] p-3">
        <div className="space-y-4 overflow-y-auto">
          {/* Brand Row */}
          <div className="flex items-center gap-3 px-2 py-2">
            <SovraLogo size={40} className="shrink-0" />
            <div className="hidden lg:block min-w-0">
              <div className="font-medium text-base text-md-on-surface truncate leading-tight">
                {ERP_BRAND_CONFIG.productName}
              </div>
              <div className="text-xs text-md-on-surface-variant truncate">
                {ERP_BRAND_CONFIG.workspaceSubtitle} · {ERP_VERSION_TAG}
              </div>
            </div>
          </div>

          {/* Extended FAB (+ Create Menu) */}
          <div className="relative">
            <div className="hidden lg:block">
              <ExtendedFab
                icon={<Plus className="w-5 h-5" strokeWidth={2} />}
                label="Create"
                onClick={() => setCreateMenuOpen((prev) => !prev)}
              />
            </div>
            <div className="lg:hidden flex justify-center">
              <ExtendedFab
                collapsed
                icon={<Plus className="w-5 h-5" strokeWidth={2} />}
                label="Create"
                onClick={() => setCreateMenuOpen((prev) => !prev)}
              />
            </div>

            {createMenuOpen && (
              <div className="absolute left-0 top-16 z-40 w-56 rounded-2xl bg-md-surface-container-lowest border border-md-outline-variant shadow-lg py-2 text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setActiveNav("invoices");
                    setInvoiceViewKey("NEW");
                    setCreateMenuOpen(false);
                  }}
                  className="w-full px-4 py-2.5 text-left hover:bg-md-surface-container-low text-md-on-surface font-medium"
                >
                  New invoice
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveNav("pos");
                    setCreateMenuOpen(false);
                  }}
                  className="w-full px-4 py-2.5 text-left hover:bg-md-surface-container-low text-md-on-surface"
                >
                  New sales order (POS)
                </button>
                {canViewLedger && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveNav("purchasing");
                      setCreateMenuOpen(false);
                    }}
                    className="w-full px-4 py-2.5 text-left hover:bg-md-surface-container-low text-md-on-surface"
                  >
                    New purchase order
                  </button>
                )}
                {canManageInventory && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveNav("inventory");
                      setCreateMenuOpen(false);
                    }}
                    className="w-full px-4 py-2.5 text-left hover:bg-md-surface-container-low text-md-on-surface"
                  >
                    New product
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Primary Navigation Items */}
          <nav aria-label="Main navigation" className="space-y-1">
            {primaryNavItems.map((item) => (
              <div key={item.key}>
                <div className="hidden lg:block">
                  <NavItem
                    icon={renderNavIcon(item.iconName)}
                    label={item.label}
                    active={activeNav === item.key}
                    badgeCount={getNavBadgeCount(item.key)}
                    onClick={() => {
                      setActiveNav(item.key);
                      if (item.key === "invoices") setInvoiceViewKey("LIST");
                    }}
                  />
                </div>
                <div className="lg:hidden">
                  <NavItem
                    collapsed
                    icon={renderNavIcon(item.iconName)}
                    label={item.label}
                    active={activeNav === item.key}
                    onClick={() => {
                      setActiveNav(item.key);
                      if (item.key === "invoices") setInvoiceViewKey("LIST");
                    }}
                  />
                </div>
              </div>
            ))}

            <div className="my-2 border-t border-md-divider" />

            {systemNavItems.map((item) => (
              <div key={item.key}>
                <div className="hidden lg:block">
                  <NavItem
                    icon={renderNavIcon(item.iconName)}
                    label={item.label}
                    active={activeNav === item.key}
                    onClick={() => setActiveNav(item.key)}
                  />
                </div>
                <div className="lg:hidden">
                  <NavItem
                    collapsed
                    icon={renderNavIcon(item.iconName)}
                    label={item.label}
                    active={activeNav === item.key}
                    onClick={() => setActiveNav(item.key)}
                  />
                </div>
              </div>
            ))}
          </nav>
        </div>

        {/* Bottom Active User Chip */}
        <div className="hidden lg:flex items-center justify-between px-3 py-2.5 rounded-2xl bg-md-surface-container-lowest border border-md-outline-variant">
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar initials={currentUser.avatarInitials} size="sm" />
            <div className="min-w-0">
              <div className="text-xs font-medium text-md-on-surface truncate">
                {currentUser.name}
              </div>
              <div className="text-[11px] text-md-on-surface-variant font-mono">
                {currentUser.role} · {activeSession?.sessionId || "JWT"}
              </div>
            </div>
          </div>
          <Button
            variant="icon"
            aria-label="Sign out"
            onClick={handleLogoutSession}
            className="w-9! h-9!"
          >
            <LogOut className="w-4 h-4" strokeWidth={1.8} />
          </Button>
        </div>
      </aside>

      {/* Mobile Modal Drawer (<600px) */}
      {mobileDrawerOpen && (
        <div
          className="fixed inset-0 z-50 bg-md-on-surface/40 sm:hidden"
          onClick={() => setMobileDrawerOpen(false)}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            className="w-[264px] h-full bg-md-surface-container-low p-4 flex flex-col justify-between"
          >
            <div className="space-y-4 overflow-y-auto">
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-3">
                  <SovraLogo size={40} className="shrink-0" />
                  <span className="font-medium text-base">
                    {ERP_BRAND_CONFIG.productName}
                  </span>
                </div>
                <Button
                  variant="icon"
                  aria-label="Close drawer"
                  onClick={() => setMobileDrawerOpen(false)}
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>

              <nav className="space-y-1">
                {permittedNavItems.map((item) => (
                  <NavItem
                    key={item.key}
                    icon={renderNavIcon(item.iconName)}
                    label={item.label}
                    active={activeNav === item.key}
                    badgeCount={getNavBadgeCount(item.key)}
                    onClick={() => {
                      setActiveNav(item.key);
                      setMobileDrawerOpen(false);
                    }}
                  />
                ))}
              </nav>
            </div>
          </aside>
        </div>
      )}

      {/* =================================================================== */}
      {/* 2. MAIN CONTENT AREA + MATERIAL 3 TOP BAR                           */}
      {/* =================================================================== */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="sticky top-0 z-20 bg-md-surface/95 px-4 sm:px-8 py-3 flex items-center justify-between gap-4 border-b border-md-divider">
          <div className="flex items-center gap-3 flex-1 max-w-2xl">
            <Button
              variant="icon"
              aria-label="Open navigation menu"
              onClick={() => setMobileDrawerOpen(true)}
              className="sm:hidden"
            >
              <Menu className="w-5 h-5" strokeWidth={1.8} />
            </Button>

            {/* 56px Tall Pill Search Field (Opens Command Palette on Click / Ctrl K) */}
            <SearchBar
              onOpenPalette={() => setCommandPaletteOpen(true)}
              placeholder="Search orders, customers, products…"
            />
          </div>

          {/* Right Side 48px Touch-Target Action Icons & User Menu */}
          <div className="flex items-center gap-1 sm:gap-2 relative">
            <ThemeToggle />

            <Button
              variant="icon"
              aria-label="About Sovra ERP and shortcuts"
              onClick={() => setActiveNav("about")}
            >
              <HelpCircle className="w-5 h-5" strokeWidth={1.8} />
            </Button>

            <div className="relative">
              <Button
                variant="icon"
                aria-label="Notifications"
                onClick={() => setActiveNav("dashboard")}
              >
                <Bell className="w-5 h-5" strokeWidth={1.8} />
              </Button>
              {pendingTasksCount > 0 && (
                <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-md-error text-md-on-primary text-[10px] font-medium flex items-center justify-center pointer-events-none">
                  {pendingTasksCount}
                </span>
              )}
            </div>

            <button
              type="button"
              aria-label="User profile and workspace menu"
              onClick={() => setAvatarMenuOpen((prev) => !prev)}
              className="w-12 h-12 rounded-full flex items-center justify-center hover:bg-md-surface-container-high transition"
            >
              <Avatar initials={currentUser.avatarInitials} variant="tertiary" />
            </button>

            {avatarMenuOpen && (
              <div className="absolute right-0 top-14 z-40 w-60 rounded-2xl bg-md-surface-container-lowest border border-md-outline-variant shadow-lg py-2 text-sm">
                <div className="px-4 py-2.5 border-b border-md-divider">
                  <div className="font-medium text-md-on-surface">
                    {currentUser.name}
                  </div>
                  <div className="text-xs text-md-on-surface-variant">
                    {currentUser.email} · {currentUser.role}
                  </div>
                </div>
                {canManageUsers && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveNav("settings");
                      setSettingsSubTab("RESTAURANT_PROFILES");
                      setAvatarMenuOpen(false);
                    }}
                    className="w-full px-4 py-2.5 text-left hover:bg-md-surface-container-low text-md-on-surface"
                  >
                    Profile &amp; role permissions
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setActiveNav("settings");
                    setSettingsSubTab("SESSION_JWT_MANAGER");
                    setAvatarMenuOpen(false);
                  }}
                  className="w-full px-4 py-2.5 text-left hover:bg-md-surface-container-low text-md-on-surface"
                >
                  {isSuperAdmin ? "Switch company / JWT session" : "Active JWT session"}
                </button>
                <div className="my-1 border-t border-md-divider" />
                <button
                  type="button"
                  onClick={() => {
                    setAvatarMenuOpen(false);
                    handleLogoutSession();
                  }}
                  className="w-full px-4 py-2.5 text-left hover:bg-md-error-container text-md-error font-medium"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Page Container (32px desktop / 16px mobile padding) */}
        <main className="p-4 sm:p-8 flex-1 max-w-[1600px] w-full mx-auto">
          {/* =============================================================== */}
          {/* PAGE 5.1: DASHBOARD                                             */}
          {/* =============================================================== */}
          {activeNav === "dashboard" && (
            <DashboardView
              orders={orders}
              erpInvoices={erpInvoices}
              parties={parties}
              tasks={waitingTasks}
              stockItems={stockMonitor}
              canViewLedger={canViewLedger}
              canAdjustStock={canManageInventory}
              onApproveTask={handleApproveTask}
              onReorderStock={handleReorderStock}
              onNavigate={(target) => setActiveNav(target as ERPNavKey)}
              onSelectOrderReceipt={(ord) => setActiveReceiptOrder(ord)}
            />
          )}

          {/* =============================================================== */}
          {/* PAGE 5.2 & 5.3: INVOICES LIST & NEW INVOICE                     */}
          {/* =============================================================== */}
          {activeNav === "invoices" && (
            <InvoicesView
              key={invoiceViewKey}
              initialMode={invoiceViewKey}
              parties={parties}
              products={products}
              invoices={erpInvoices}
              onInvoicesChange={setErpInvoices}
              canDeleteInvoices={canDeleteInvoices}
              onShowSnackbar={notifySaved}
            />
          )}

          {/* =============================================================== */}
          {/* POS TERMINAL (HYBRID RESTAURANT + RETAIL COUNTER)               */}
          {/* =============================================================== */}
          {activeNav === "pos" && (
            <div className="space-y-6">
              <PageHeader
                title="POS Terminal"
                subtitle="Hybrid Desi Restaurant Dining (KOT) & Retail Barcode Checkout with Live PRA e-IMS"
                actions={
                  <SegmentedButton
                    value={segmentFilter}
                    onChange={setSegmentFilter}
                    options={[
                      { value: "ALL", label: `All (${products.length})` },
                      { value: "RESTAURANT", label: "Restaurant" },
                      { value: "RETAIL", label: "Retail" },
                    ]}
                  />
                }
              />

              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                {/* LEFT 8 COLS: MENU CARDS */}
                <div className="xl:col-span-8 space-y-5">
                  <Card className="p-4! space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <form
                        onSubmit={handleBarcodeScan}
                        className="flex items-center gap-2 flex-1 max-w-sm"
                      >
                        <CompactField
                          value={barcodeInput}
                          onChange={setBarcodeInput}
                          placeholder="Scan barcode or SKU (101, 501)…"
                          className="flex-1"
                        />
                        <Button type="submit" variant="tonal" size="sm">
                          Add SKU
                        </Button>
                      </form>

                      <CompactField
                        value={searchQuery}
                        onChange={setSearchQuery}
                        placeholder="Filter Karahi, BBQ, Pulao, Halwa…"
                        className="w-full sm:w-64"
                      />
                    </div>

                    <div className="flex items-center gap-2 overflow-x-auto pb-1">
                      {categories.map((cat) => (
                        <FilterChip
                          key={cat}
                          label={cat}
                          selected={categoryFilter === cat}
                          onClick={() => setCategoryFilter(cat)}
                        />
                      ))}
                    </div>
                  </Card>

                  {/* Product Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredProducts.map((product) => (
                      <Card
                        key={product.id}
                        interactive
                        className="p-4! flex flex-col justify-between group cursor-pointer"
                      >
                        <div
                          onClick={() => {
                            if (product.variants.length > 0) {
                              addToCart(product, product.variants[0]);
                            }
                          }}
                        >
                          <DishVisual
                            product={product}
                            canEditImage={canManageInventory}
                            onImageUpload={handleUpdateProductImage}
                          />
                          <div className="mt-3 px-0.5">
                            <div className="text-xs font-medium text-md-on-surface-variant">
                              {product.category}
                            </div>
                            <h3 className="text-base font-medium text-md-on-surface mt-0.5">
                              {product.name}
                            </h3>
                          </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-md-divider grid grid-cols-1 gap-2">
                          {product.variants.map((variant) => (
                            <button
                              key={variant.id}
                              type="button"
                              onClick={() => addToCart(product, variant)}
                              className="w-full h-10 px-4 rounded-full border-0 bg-md-surface-container-low hover:bg-md-primary text-md-on-surface hover:text-md-on-primary text-xs font-medium flex items-center justify-between transition-all duration-150 hover:-translate-y-px hover:scale-[1.01] active:scale-[0.985]"
                            >
                              <span>{variant.name}</span>
                              <span className="font-mono tabular-nums font-semibold">
                                PKR {variant.price.toLocaleString()} +
                              </span>
                            </button>
                          ))}
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>

                {/* RIGHT 4 COLS: BILLING & PRA FISCALIZATION */}
                <Card className="xl:col-span-4 space-y-4 lg:sticky lg:top-24">
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        { id: "DINE_IN", label: "Dine-in" },
                        { id: "TAKEAWAY", label: "Takeaway" },
                        { id: "DELIVERY", label: "Delivery" },
                        { id: "RETAIL_COUNTER", label: "Retail" },
                      ] as const
                    ).map((m) => (
                      <FilterChip
                        key={m.id}
                        label={m.label}
                        selected={orderType === m.id}
                        onClick={() => setOrderType(m.id)}
                      />
                    ))}
                  </div>

                  {orderType === "DINE_IN" ? (
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <OutlinedTextField
                        label="Table"
                        value={tableNumber}
                        onChange={setTableNumber}
                        options={RESTAURANT_TABLES.map((t) => ({
                          value: t,
                          label: t,
                        }))}
                      />
                      <OutlinedTextField
                        label="Server"
                        value={waiterName}
                        onChange={setWaiterName}
                        options={WAITERS.map((w) => ({ value: w, label: w }))}
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <OutlinedTextField
                        label="Customer"
                        value={customerName}
                        onChange={setCustomerName}
                      />
                      <OutlinedTextField
                        label="Phone"
                        value={customerPhone}
                        onChange={setCustomerPhone}
                      />
                    </div>
                  )}

                  {/* Cart Items */}
                  <div className="border-t border-b border-md-divider py-3 max-h-64 overflow-y-auto space-y-2.5">
                    {cart.length === 0 ? (
                      <div className="text-center py-6 text-xs text-md-on-surface-variant">
                        Tap any menu card or scan a barcode to add items.
                      </div>
                    ) : (
                      cart.map((item) => (
                        <div
                          key={item.cartItemId}
                          className="p-3 rounded-xl bg-md-surface-container-low space-y-2 text-sm"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-medium text-md-on-surface">
                                {item.name}{" "}
                                <span className="text-xs text-md-primary">
                                  [{item.variantName}]
                                </span>
                              </div>
                              <div className="text-xs font-mono text-md-on-surface-variant tabular-nums">
                                PKR {item.unitPrice.toLocaleString()} ×{" "}
                                {item.quantity}
                              </div>
                            </div>
                            <div className="font-mono font-medium tabular-nums text-md-on-surface">
                              {(item.unitPrice * item.quantity).toLocaleString()}
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  updateQuantity(item.cartItemId, -1)
                                }
                                className="w-7 h-7 rounded-full border-0 bg-md-surface-container-lowest hover:bg-md-secondary-container shadow-xs text-xs font-bold transition-all duration-150 hover:scale-105 active:scale-95"
                              >
                                -
                              </button>
                              <span className="w-6 text-center font-mono text-xs font-medium tabular-nums">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  updateQuantity(item.cartItemId, 1)
                                }
                                className="w-7 h-7 rounded-full border-0 bg-md-surface-container-lowest hover:bg-md-secondary-container shadow-xs text-xs font-bold transition-all duration-150 hover:scale-105 active:scale-95"
                              >
                                +
                              </button>
                            </div>

                            {item.segment === "RESTAURANT" && (
                              <CompactSelect
                                variant="subtle"
                                minMenuWidth={190}
                                value={item.notes || ""}
                                placeholder="Chef note…"
                                ariaLabel="Chef note"
                                onChange={(val) =>
                                  updateItemNote(item.cartItemId, val)
                                }
                                options={[
                                  { value: "", label: "Chef note…" },
                                  ...QUICK_CHEF_NOTES.map((n) => ({
                                    value: n,
                                    label: n,
                                  })),
                                ]}
                              />
                            )}

                            <button
                              type="button"
                              onClick={() =>
                                updateQuantity(item.cartItemId, -item.quantity)
                              }
                              aria-label="Remove item"
                              className="text-md-on-surface-variant hover:text-md-error p-1"
                            >
                              <Trash2 className="w-4 h-4" strokeWidth={1.8} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Payment Mode FilterChips */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-md-on-surface-variant">
                        Payment mode (Auto PRA GST)
                      </span>
                      <StatusChip
                        label={`Cash ${praConfig.cashTaxRate}% · Card ${praConfig.cardTaxRate}%`}
                        variant="primary"
                      />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          { id: "CASH", label: `Cash (${praConfig.cashTaxRate}%)` },
                          { id: "CARD", label: `Card (${praConfig.cardTaxRate}%)` },
                          {
                            id: "JAZZCASH_EASYPAISA",
                            label: `Raast / QR (${praConfig.cardTaxRate}%)`,
                          },
                          { id: "SPLIT", label: "Split" },
                          { id: "KHATA_CREDIT", label: "Customer Khata" },
                        ] as const
                      ).map((pm) => (
                        <FilterChip
                          key={pm.id}
                          label={pm.label}
                          selected={paymentMethod === pm.id}
                          onClick={() => setPaymentMethod(pm.id)}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Totals Summary (surface-container-low) */}
                  <div className="p-4 rounded-2xl bg-md-surface-container-low space-y-1.5 text-sm tabular-nums">
                    <div className="flex justify-between text-md-on-surface-variant">
                      <span>Subtotal</span>
                      <span className="font-mono text-md-on-surface">
                        PKR {liveTaxBreakdown.grossSubtotal.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between text-md-on-surface-variant">
                      <span>
                        PRA GST ({liveTaxBreakdown.effectiveTaxRateLabel})
                      </span>
                      <span className="font-mono text-md-primary font-medium">
                        + PKR {liveTaxBreakdown.totalSalesTax.toLocaleString()}
                      </span>
                    </div>
                    <div className="pt-2 border-t border-md-divider flex items-baseline justify-between">
                      <span className="font-semibold text-md-on-surface">
                        Total payable
                      </span>
                      <span className="text-2xl font-mono font-medium text-md-primary-strong">
                        PKR {liveTaxBreakdown.grandTotal.toLocaleString()}
                      </span>
                    </div>
                    <div className="pt-1 text-xs text-md-on-surface-variant flex justify-between">
                      <span>
                        Cash (16%): PKR{" "}
                        {cashComparison.grandTotal.toLocaleString()}
                      </span>
                      <span>
                        Card (5%): PKR{" "}
                        {cardComparison.grandTotal.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <Button
                    variant="filled"
                    size="lg"
                    className="w-full"
                    disabled={cart.length === 0 || submittingOrder}
                    icon={<Printer className="w-4 h-4" strokeWidth={1.8} />}
                    onClick={handleCheckout}
                  >
                    {submittingOrder
                      ? "Fiscalizing with PRA…"
                      : `Complete & print PRA bill (PKR ${liveTaxBreakdown.grandTotal.toLocaleString()})`}
                  </Button>
                </Card>
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* SALES ORDERS & PRA FISCAL REGISTER                              */}
          {/* =============================================================== */}
          {activeNav === "sales" && (
            <div className="space-y-6">
              <PageHeader
                title="Sales orders & PRA register"
                subtitle="Official Punjab Revenue Authority e-IMS fiscalized receipts and KOT history"
                actions={
                  <>
                    <Button
                      variant="outlined"
                      icon={<Download className="w-4 h-4" strokeWidth={1.8} />}
                      onClick={exportPRACsv}
                    >
                      Export PRA CSV
                    </Button>
                    <Button
                      variant="filled"
                      icon={<Plus className="w-4 h-4" strokeWidth={1.8} />}
                      onClick={() => setActiveNav("pos")}
                    >
                      New POS sale
                    </Button>
                  </>
                }
              />

              <Card className="p-0! overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-md-divider bg-md-surface-container-low/60 text-xs font-medium text-md-on-surface-variant">
                        <th className="py-3.5 px-4">Order #</th>
                        <th className="py-3.5 px-4">PRA Fiscal Invoice #</th>
                        <th className="py-3.5 px-4">Customer / Table</th>
                        <th className="py-3.5 px-4">Payment</th>
                        <th className="py-3.5 px-4 text-right">PRA GST</th>
                        <th className="py-3.5 px-4 text-right">Total</th>
                        <th className="py-3.5 px-4 text-right">Receipt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-md-divider">
                      {orders.map((ord) => (
                        <tr
                          key={ord.id}
                          className="hover:bg-md-surface-container-low transition"
                        >
                          <td className="py-3.5 px-4 font-mono font-medium text-md-primary">
                            {ord.invoiceNumber}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-xs text-md-on-surface-variant">
                            {ord.praInvoiceNumber}
                          </td>
                          <td className="py-3.5 px-4 font-medium">
                            {ord.customerName || ord.tableNumber || "Walk-in"}
                          </td>
                          <td className="py-3.5 px-4">
                            <StatusChip
                              label={ord.paymentMethod}
                              variant="primary"
                            />
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                            PKR {ord.taxBreakdown.totalSalesTax.toLocaleString()}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-medium tabular-nums">
                            PKR {ord.taxBreakdown.grandTotal.toLocaleString()}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <Button
                              variant="tonal"
                              size="sm"
                              onClick={() => setActiveReceiptOrder(ord)}
                            >
                              Receipt & QR
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {/* =============================================================== */}
          {/* INVENTORY & MENU CATALOGUE                                      */}
          {/* =============================================================== */}
          {activeNav === "inventory" && (
            <div className="space-y-6">
              <PageHeader
                title="Inventory & menu catalogue"
                subtitle="Manage restaurant dishes, retail SKUs, stock levels, and card photos"
              />

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {canManageInventory && (
                  <Card className="lg:col-span-4 space-y-4 h-fit">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold text-md-on-surface">
                      {editingProductId
                        ? `Edit item (#${newProdCode})`
                        : "New product / dish"}
                    </h2>
                    {editingProductId && (
                      <Button
                        variant="text"
                        size="sm"
                        onClick={cancelEditingProduct}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>

                  <form onSubmit={handleAddProduct} className="space-y-4">
                    <OutlinedTextField
                      label="Product or dish name"
                      required
                      value={newProdName}
                      onChange={setNewProdName}
                    />

                    <div className="grid grid-cols-2 gap-3">
                      <OutlinedTextField
                        label="Segment"
                        value={newProdSegment}
                        onChange={(v) =>
                          setNewProdSegment(v as BusinessSegment)
                        }
                        options={[
                          { value: "RESTAURANT", label: "Restaurant (KOT)" },
                          { value: "RETAIL", label: "Retail (SKU)" },
                        ]}
                      />
                      <OutlinedTextField
                        label="Category"
                        value={newProdCategory}
                        onChange={setNewProdCategory}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <OutlinedTextField
                        label="SKU"
                        mono
                        value={newProdCode}
                        onChange={setNewProdCode}
                      />
                      <OutlinedTextField
                        label="Price"
                        type="number"
                        required
                        value={newProdPrice}
                        onChange={setNewProdPrice}
                      />
                      <OutlinedTextField
                        label="Stock"
                        type="number"
                        value={newProdStock}
                        onChange={setNewProdStock}
                      />
                    </div>

                    <div className="p-3.5 rounded-xl bg-md-surface-container-low space-y-2.5">
                      <label className="text-xs font-medium text-md-on-surface-variant block">
                        Product photo (file or URL)
                      </label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleNewProdImageFile}
                        className="w-full text-xs text-md-on-surface-variant file:mr-3 file:py-1.5 file:px-3.5 file:rounded-full file:border-0 file:text-xs file:font-medium file:bg-md-secondary-container file:text-md-on-secondary-container hover:file:bg-md-primary-container"
                      />
                      <CompactField
                        value={newProdImageUrl}
                        onChange={setNewProdImageUrl}
                        placeholder="Or paste image URL (https://…)"
                        className="w-full"
                      />
                    </div>

                    <Button type="submit" variant="filled" className="w-full">
                      {editingProductId ? "Save changes" : "Add to catalogue"}
                    </Button>
                  </form>
                </Card>
                )}

                <Card
                  className={`${
                    canManageInventory ? "lg:col-span-8" : "lg:col-span-12"
                  } p-0! overflow-hidden`}
                >
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-md-divider bg-md-surface-container-low/60 text-xs font-medium text-md-on-surface-variant">
                          <th className="py-3.5 px-4">Photo</th>
                          <th className="py-3.5 px-3">SKU</th>
                          <th className="py-3.5 px-3">Product</th>
                          <th className="py-3.5 px-3">Segment</th>
                          <th className="py-3.5 px-3">Price</th>
                          <th className="py-3.5 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-md-divider">
                        {products.map((p) => (
                          <tr
                            key={p.id}
                            className="hover:bg-md-surface-container-low transition"
                          >
                            <td className="py-3 px-4">
                              {p.imageUrl ? (
                                <img
                                  src={p.imageUrl}
                                  alt={p.name}
                                  className="w-12 h-9 rounded-lg object-cover border border-md-outline-variant"
                                />
                              ) : (
                                <div className="w-12 h-9 rounded-lg bg-md-surface-container-high flex items-center justify-center text-md-on-surface-variant">
                                  <ImageIcon className="w-4 h-4" />
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-3 font-mono font-medium text-md-primary">
                              #{p.code}
                            </td>
                            <td className="py-3 px-3">
                              <div className="font-medium text-md-on-surface">
                                {p.name}
                              </div>
                              <div className="text-xs text-md-on-surface-variant">
                                {p.category}
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <StatusChip
                                label={p.segment}
                                variant={
                                  p.segment === "RESTAURANT"
                                    ? "primary"
                                    : "success"
                                }
                              />
                            </td>
                            <td className="py-3 px-3 font-mono text-xs tabular-nums">
                              PKR {p.variants[0]?.price.toLocaleString()}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="inline-flex items-center gap-1">
                                {canManageInventory && (
                                  <Button
                                    variant="icon"
                                    aria-label="Edit item"
                                    onClick={() => startEditingProduct(p)}
                                    className="w-9! h-9!"
                                  >
                                    <Pencil className="w-4 h-4" strokeWidth={1.8} />
                                  </Button>
                                )}
                                {canArchiveInventory && (
                                  <Button
                                    variant="icon"
                                    aria-label="Archive item"
                                    onClick={() =>
                                      handleDeleteProduct(p.id, p.name)
                                    }
                                    className="w-9! h-9!"
                                  >
                                    <Trash2 className="w-4 h-4" strokeWidth={1.8} />
                                  </Button>
                                )}
                                {!canManageInventory && !canArchiveInventory && (
                                  <span className="text-xs text-md-on-surface-variant">
                                    Read-only
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* ACCOUNTING & DOUBLE-ENTRY KHATA LEDGER (SUPER ADMIN ONLY)       */}
          {/* =============================================================== */}
          {(activeNav === "accounting" ||
            activeNav === "purchasing" ||
            activeNav === "hr") &&
            (!canViewLedger ? (
              <Card>
                <EmptyState
                  title="Owner / Super Admin authorization required"
                  subtitle="Ledger journals, Khata balances, and supplier payables are restricted to Owner / Super Admin profiles."
                />
              </Card>
            ) : (
            <div className="space-y-6">
              <PageHeader
                title={
                  activeNav === "purchasing"
                    ? "Purchasing & supplier payables"
                    : activeNav === "hr"
                    ? "People, HR & payroll accounts"
                    : "Accounting & double-entry ledger"
                }
                subtitle="Append-only financial journal, customer receivables, supplier payables, and PRA tax calculator"
              />

              {/* Totals Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-2xl p-5 bg-md-success-container text-md-on-success-container">
                  <div className="text-xs font-medium">
                    Customer receivables (Khata)
                  </div>
                  <div className="text-[22px] leading-[28px] font-normal font-mono tabular-nums mt-1">
                    PKR {totalReceivables.toLocaleString()}
                  </div>
                </div>
                <div className="rounded-2xl p-5 bg-md-error-container text-md-on-error-container">
                  <div className="text-xs font-medium">Supplier payables</div>
                  <div className="text-[22px] leading-[28px] font-normal font-mono tabular-nums mt-1">
                    PKR {totalPayables.toLocaleString()}
                  </div>
                </div>
                <div className="rounded-2xl p-5 bg-md-primary-container text-md-on-primary-container">
                  <div className="text-xs font-medium">
                    Posted double-entry vouchers
                  </div>
                  <div className="text-[22px] leading-[28px] font-normal font-mono tabular-nums mt-1">
                    {ledger.length} entries
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left 5 Cols: Party Accounts */}
                <div className="lg:col-span-5 space-y-5">
                  <Card className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-base font-semibold text-md-on-surface">
                        Party accounts
                      </h2>
                      <div className="flex gap-1.5">
                        {(["ALL", "CUSTOMER", "SUPPLIER"] as const).map((t) => (
                          <FilterChip
                            key={t}
                            label={t}
                            selected={ledgerPartyFilter === t}
                            onClick={() => setLedgerPartyFilter(t)}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2.5 max-h-80 overflow-y-auto p-[5px]">
                      {parties
                        .filter(
                          (p) =>
                            ledgerPartyFilter === "ALL" ||
                            p.type === ledgerPartyFilter
                        )
                        .map((party) => (
                          <div
                            key={party.id}
                            onClick={() => setSelectedPartyId(party.id)}
                            className={`p-3.5 rounded-2xl border-0 cursor-pointer transition-colors duration-200 ${
                              selectedPartyId === party.id
                                ? "bg-md-primary-container/45 ring-2 ring-md-primary/60 shadow-xs"
                                : "bg-md-surface-container-low hover:bg-md-surface-container-high/70"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-sm text-md-on-surface">
                                {party.name}
                              </span>
                              <div className="flex items-center gap-1">
                                <StatusChip
                                  label={party.type}
                                  variant={
                                    party.type === "CUSTOMER"
                                      ? "success"
                                      : "warning"
                                  }
                                />
                                <Button
                                  variant="icon"
                                  aria-label="Edit party"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startEditingParty(party);
                                  }}
                                  className="w-8! h-8!"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="icon"
                                  aria-label="Archive party"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteParty(party.id, party.name);
                                  }}
                                  className="w-8! h-8!"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </div>
                            <div className="flex items-center justify-between mt-1 text-xs">
                              <span className="text-md-on-surface-variant">
                                {party.phone}
                              </span>
                              <span className="font-mono font-medium tabular-nums">
                                {party.currentBalance >= 0
                                  ? `Receivable: PKR ${party.currentBalance.toLocaleString()}`
                                  : `Payable: PKR ${Math.abs(
                                      party.currentBalance
                                    ).toLocaleString()}`}
                              </span>
                            </div>
                          </div>
                        ))}
                    </div>
                  </Card>

                  <Card className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-semibold text-md-on-surface">
                        {editingPartyId ? "Edit party account" : "New party account"}
                      </h3>
                      {editingPartyId && (
                        <Button
                          variant="text"
                          size="sm"
                          onClick={cancelEditingParty}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                    <form onSubmit={handleCreateParty} className="space-y-4">
                      <OutlinedTextField
                        label="Party or company name"
                        required
                        value={newPartyName}
                        onChange={setNewPartyName}
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <OutlinedTextField
                          label="Account type"
                          value={newPartyType}
                          onChange={(v) => setNewPartyType(v as PartyType)}
                          options={[
                            { value: "CUSTOMER", label: "Customer" },
                            { value: "SUPPLIER", label: "Supplier" },
                            { value: "EXPENSE_HEAD", label: "Expense" },
                          ]}
                        />
                        <OutlinedTextField
                          label="Phone"
                          value={newPartyPhone}
                          onChange={setNewPartyPhone}
                        />
                      </div>
                      <OutlinedTextField
                        label="Balance (PKR)"
                        type="number"
                        value={newPartyOpening}
                        onChange={setNewPartyOpening}
                      />
                      <Button type="submit" variant="filled" className="w-full">
                        {editingPartyId ? "Save account" : "Create account"}
                      </Button>
                    </form>
                  </Card>
                </div>

                {/* Right 7 Cols: Post Voucher + Journal Table */}
                <div className="lg:col-span-7 space-y-5">
                  <Card className="space-y-4">
                    <h2 className="text-base font-semibold text-md-on-surface">
                      Post balanced journal voucher
                    </h2>
                    <form onSubmit={handlePostVoucher} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <OutlinedTextField
                          label="Party account"
                          value={selectedPartyId}
                          onChange={setSelectedPartyId}
                          options={parties.map((p) => ({
                            value: p.id,
                            label: p.name,
                          }))}
                        />
                        <OutlinedTextField
                          label="Voucher type"
                          value={voucherType}
                          onChange={(v) =>
                            setVoucherType(v as typeof voucherType)
                          }
                          options={[
                            {
                              value: "CUSTOMER_RECEIPT",
                              label: "Customer receipt",
                            },
                            {
                              value: "SUPPLIER_BILL",
                              label: "Supplier bill (GRN)",
                            },
                            {
                              value: "SUPPLIER_PAYMENT",
                              label: "Supplier payout",
                            },
                            {
                              value: "EXPENSE_VOUCHER",
                              label: "Petty expense",
                            },
                          ]}
                        />
                        <OutlinedTextField
                          label="Amount (PKR)"
                          type="number"
                          required
                          value={voucherAmount}
                          onChange={setVoucherAmount}
                        />
                      </div>
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <OutlinedTextField
                            label="Narration / reference"
                            value={voucherDesc}
                            onChange={setVoucherDesc}
                          />
                        </div>
                        <Button type="submit" variant="filled" size="lg">
                          Post voucher
                        </Button>
                      </div>
                    </form>
                  </Card>

                  <Card className="p-0! overflow-hidden">
                    <div className="p-4 border-b border-md-divider">
                      <h3 className="text-base font-semibold text-md-on-surface">
                        Double-entry ledger statement
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-md-divider bg-md-surface-container-low/60 text-xs font-medium text-md-on-surface-variant">
                            <th className="py-3 px-4">Voucher #</th>
                            <th className="py-3 px-3">Party</th>
                            <th className="py-3 px-3">Description</th>
                            <th className="py-3 px-3 text-right">Debit</th>
                            <th className="py-3 px-3 text-right">Credit</th>
                            <th className="py-3 px-3 text-right">Balance</th>
                            <th className="py-3 px-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-md-divider">
                          {ledger.map((entry) => (
                            <tr
                              key={entry.id}
                              className="hover:bg-md-surface-container-low"
                            >
                              <td className="py-3 px-4 font-mono font-medium text-md-primary">
                                {entry.voucherNo}
                              </td>
                              <td className="py-3 px-3 font-medium">
                                {entry.partyName}
                              </td>
                              <td className="py-3 px-3 text-xs text-md-on-surface-variant">
                                {entry.description}
                              </td>
                              <td className="py-3 px-3 text-right font-mono tabular-nums">
                                {entry.debit > 0
                                  ? entry.debit.toLocaleString()
                                  : "-"}
                              </td>
                              <td className="py-3 px-3 text-right font-mono tabular-nums">
                                {entry.credit > 0
                                  ? entry.credit.toLocaleString()
                                  : "-"}
                              </td>
                              <td className="py-3 px-3 text-right font-mono font-medium tabular-nums">
                                PKR {entry.balanceAfter.toLocaleString()}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <div className="inline-flex items-center gap-1">
                                  <Button
                                    variant="tonal"
                                    size="sm"
                                    onClick={() =>
                                      handleReverseEntry(
                                        entry.id,
                                        entry.voucherNo
                                      )
                                    }
                                  >
                                    Reverse
                                  </Button>
                                  <Button
                                    variant="icon"
                                    aria-label="Delete voucher"
                                    onClick={() =>
                                      handleDeleteEntry(
                                        entry.id,
                                        entry.voucherNo
                                      )
                                    }
                                    className="w-8! h-8!"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </div>
              </div>
            </div>
            ))}

          {/* =============================================================== */}
          {/* REPORTS, Z-CLOSING & SALES TAX CALCULATOR                       */}
          {/* =============================================================== */}
          {activeNav === "reports" && (
            <div className="space-y-6">
              <PageHeader
                title="Reports, Z-closing & PRA tax simulator"
                subtitle="Shift drawer reconciliation, fiscal period locking, and Cash (16%) vs Card (5%) tax calculator"
              />

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Cashier Shift Reconciliation */}
                <Card className="lg:col-span-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold text-md-on-surface">
                      Cashier shift & drawer reconciliation
                    </h2>
                    <StatusChip label="Shift OPEN" variant="success" />
                  </div>

                  {cashierShifts[0] && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <div className="p-3.5 rounded-2xl bg-md-surface-container-low">
                          <div className="text-xs text-md-on-surface-variant">
                            Opening float
                          </div>
                          <div className="font-mono font-medium tabular-nums mt-1">
                            PKR{" "}
                            {(
                              cashierShifts[0].openingFloatMinor / 100
                            ).toLocaleString()}
                          </div>
                        </div>
                        <div className="p-3.5 rounded-2xl bg-md-surface-container-low">
                          <div className="text-xs text-md-on-surface-variant">
                            Cash sales
                          </div>
                          <div className="font-mono font-medium tabular-nums mt-1">
                            PKR{" "}
                            {(
                              cashierShifts[0].cashSalesMinor / 100
                            ).toLocaleString()}
                          </div>
                        </div>
                        <div className="p-3.5 rounded-2xl bg-md-primary-container text-md-on-primary-container">
                          <div className="text-xs">Expected cash</div>
                          <div className="font-mono font-semibold tabular-nums mt-1">
                            PKR{" "}
                            {(
                              cashierShifts[0].expectedClosingCashMinor / 100
                            ).toLocaleString()}
                          </div>
                        </div>
                      </div>

                      <form
                        onSubmit={handleReconcileShift}
                        className="flex items-end gap-3"
                      >
                        <div className="flex-1">
                          <OutlinedTextField
                            label="Counted physical cash (PKR)"
                            type="number"
                            value={countedCashInput}
                            onChange={setCountedCashInput}
                          />
                        </div>
                        <Button type="submit" variant="filled" size="lg">
                          Reconcile
                        </Button>
                      </form>
                    </div>
                  )}
                </Card>

                {/* Sales Tax Calculator */}
                <Card className="lg:col-span-6 space-y-4">
                  <h2 className="text-base font-semibold text-md-on-surface">
                    PRA sales tax calculator (Cash {praConfig.cashTaxRate}% vs Card{" "}
                    {praConfig.cardTaxRate}%)
                  </h2>
                  <div className="grid grid-cols-2 gap-3">
                    <OutlinedTextField
                      label="Gross bill amount (PKR)"
                      type="number"
                      value={calcAmount}
                      onChange={(v) => setCalcAmount(Number(v) || 0)}
                    />
                    <OutlinedTextField
                      label="Discount (PKR)"
                      type="number"
                      value={calcDiscount}
                      onChange={(v) => setCalcDiscount(Number(v) || 0)}
                    />
                  </div>
                  {(() => {
                    const net = Math.max(0, calcAmount - calcDiscount);
                    const cashTax = Math.round(
                      net * (praConfig.cashTaxRate / 100)
                    );
                    const cardTax = Math.round(
                      net * (praConfig.cardTaxRate / 100)
                    );
                    return (
                      <div className="grid grid-cols-2 gap-3 text-sm tabular-nums">
                        <div className="p-4 rounded-2xl bg-md-surface-container-low space-y-1">
                          <div className="text-xs font-medium text-md-on-surface-variant">
                            Cash ({praConfig.cashTaxRate}% GST)
                          </div>
                          <div className="text-lg font-mono font-medium">
                            PKR {(net + cashTax).toLocaleString()}
                          </div>
                          <div className="text-xs text-md-on-surface-variant">
                            Tax: PKR {cashTax.toLocaleString()}
                          </div>
                        </div>
                        <div className="p-4 rounded-2xl bg-md-primary-container text-md-on-primary-container space-y-1">
                          <div className="text-xs font-medium">
                            Card ({praConfig.cardTaxRate}% GST)
                          </div>
                          <div className="text-lg font-mono font-semibold">
                            PKR {(net + cardTax).toLocaleString()}
                          </div>
                          <div className="text-xs">
                            Saves PKR {(cashTax - cardTax).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </Card>
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* SETTINGS, PRA e-IMS, JWT, MONGODB & IMMUTABLE AUDIT LOG         */}
          {/* =============================================================== */}
          {activeNav === "settings" && (
            <div className="space-y-6 max-w-5xl">
              <PageHeader
                title="Settings & PRA configuration"
                subtitle="Configure Punjab Revenue Authority e-IMS, tax rules, JWT security, MongoDB, and audit logs"
              />

              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { id: "PRA_INTEGRATION", label: "PRA e-IMS", visible: canManagePra },
                    { id: "TAX_RULES", label: "Tax rules", visible: canManagePra },
                    { id: "MONGODB_DATABASE", label: "MongoDB", visible: canManagePra },
                    { id: "RESTAURANT_PROFILES", label: "Staff roles & profiles", visible: canManageUsers },
                    { id: "ERP_AUDIT_COMPLIANCE", label: "Audit trail", visible: canViewLedger },
                    { id: "SESSION_JWT_MANAGER", label: "JWT & session lock", visible: true },
                    { id: "APPEARANCE", label: "Appearance", visible: true },
                  ] as const
                )
                  .filter((tab) => tab.visible)
                  .map((tab) => (
                  <FilterChip
                    key={tab.id}
                    label={tab.label}
                    selected={settingsSubTab === tab.id}
                    onClick={() => setSettingsSubTab(tab.id)}
                  />
                ))}
              </div>

              {settingsSubTab === "PRA_INTEGRATION" && canManagePra && (
                <Card className="space-y-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold text-md-on-surface">
                      Punjab Revenue Authority (PRA) e-IMS fiscal parameters
                    </h2>
                    <StatusChip label="Connected (Code 100)" variant="success" />
                  </div>
                  <form onSubmit={handleSavePraConfig} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <OutlinedTextField
                        label="Official PRA POS ID"
                        mono
                        value={praConfig.posId}
                        onChange={(v) => setPraConfig({ ...praConfig, posId: v })}
                      />
                      <OutlinedTextField
                        label="PRA API Bearer Token"
                        mono
                        value={praConfig.apiToken}
                        onChange={(v) =>
                          setPraConfig({ ...praConfig, apiToken: v })
                        }
                      />
                      <div className="sm:col-span-2">
                        <OutlinedTextField
                          label="PRA IMS Endpoint URL"
                          mono
                          value={praConfig.imsEndpointUrl}
                          onChange={(v) =>
                            setPraConfig({ ...praConfig, imsEndpointUrl: v })
                          }
                        />
                      </div>
                    </div>
                    <Button type="submit" variant="filled">
                      Save PRA settings
                    </Button>
                  </form>
                </Card>
              )}

              {settingsSubTab === "TAX_RULES" && canManagePra && (
                <Card className="space-y-5">
                  <h2 className="text-base font-semibold text-md-on-surface">
                    Sales tax tariff & service charge rules
                  </h2>
                  <form onSubmit={handleSavePraConfig} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <OutlinedTextField
                        label="Cash GST rate (%)"
                        type="number"
                        value={praConfig.cashTaxRate}
                        onChange={(v) =>
                          setPraConfig({ ...praConfig, cashTaxRate: Number(v) })
                        }
                      />
                      <OutlinedTextField
                        label="Card / Digital GST rate (%)"
                        type="number"
                        value={praConfig.cardTaxRate}
                        onChange={(v) =>
                          setPraConfig({ ...praConfig, cardTaxRate: Number(v) })
                        }
                      />
                      <OutlinedTextField
                        label="Service charge (%)"
                        type="number"
                        value={praConfig.serviceChargePercent}
                        onChange={(v) =>
                          setPraConfig({
                            ...praConfig,
                            serviceChargePercent: Number(v),
                          })
                        }
                      />
                    </div>
                    <Button type="submit" variant="filled">
                      Update tax rules
                    </Button>
                  </form>
                </Card>
              )}

              {settingsSubTab === "SESSION_JWT_MANAGER" && (
                <Card className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-md-on-surface">
                        Active HS256 JWT session & single-profile lock
                      </h2>
                      <p className="text-xs text-md-on-surface-variant">
                        Session ID: {activeSession?.sessionId} · Holder:{" "}
                        {activeSession?.userName} ({activeSession?.userRole})
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="tonal" onClick={handleRefreshSession}>
                        Extend JWT (+12h)
                      </Button>
                      <Button variant="filled" onClick={handleLogoutSession}>
                        Revoke & sign out
                      </Button>
                    </div>
                  </div>
                </Card>
              )}

              {settingsSubTab === "MONGODB_DATABASE" && canManagePra && (
                <Card className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-base font-semibold text-md-on-surface">
                      MongoDB connection configuration
                    </h2>
                    <StatusChip
                      label={`Isolated DB: ${mongoConfig.dbName || "albarka_erp"}`}
                      variant={mongoConfig.enabled ? "success" : "primary"}
                    />
                  </div>
                  <div className="p-3.5 rounded-xl bg-md-surface-container-low text-xs text-md-on-surface-variant space-y-1">
                    <div>{mongoConfig.lastStatus}</div>
                    <div className="text-[11px] opacity-80">
                      Protected databases (such as <code className="font-mono">votix</code>) are blocked so Sovra ERP data stays in its own separate database (<code className="font-mono">albarka_erp</code>).
                    </div>
                  </div>
                  <form onSubmit={handleSaveMongoConfig} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="sm:col-span-2">
                        <OutlinedTextField
                          label="MongoDB URI"
                          mono
                          value={mongoConfig.uri}
                          onChange={(v) =>
                            setMongoConfig({ ...mongoConfig, uri: v })
                          }
                        />
                      </div>
                      <OutlinedTextField
                        label="Database name"
                        mono
                        value={mongoConfig.dbName}
                        onChange={(v) =>
                          setMongoConfig({ ...mongoConfig, dbName: v })
                        }
                      />
                    </div>
                    <Button type="submit" variant="filled">
                      Test & save MongoDB connection
                    </Button>
                  </form>
                </Card>
              )}

              {settingsSubTab === "RESTAURANT_PROFILES" && canManageUsers && (
                <div className="space-y-6">
                  {/* Add Staff Profile Form (Owner / Super Admin Only) */}
                  <Card className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h2 className="text-base font-semibold text-md-on-surface">
                          Add new workspace profile
                        </h2>
                        <p className="text-xs text-md-on-surface-variant mt-0.5">
                          Super Admin hierarchy: only Owner / Super Admin profiles can create or remove staff, delete items/invoices, or view the financial ledger.
                        </p>
                      </div>
                      <StatusChip label="Super Admin Control" variant="primary" />
                    </div>

                    <form onSubmit={handleCreateProfile} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        <OutlinedTextField
                          label="Full name"
                          required
                          placeholder="e.g. Bilal Ahmed"
                          value={newProfileName}
                          onChange={setNewProfileName}
                        />
                        <OutlinedTextField
                          label="Username"
                          mono
                          required
                          placeholder="e.g. bilal"
                          value={newProfileUsername}
                          onChange={setNewProfileUsername}
                        />
                        <OutlinedTextField
                          label="Hierarchy role"
                          value={newProfileRole}
                          onChange={(v) => setNewProfileRole(v as UserRole)}
                          options={[
                            { value: "CASHIER", label: "CASHIER (POS Only)" },
                            { value: "MANAGER", label: "MANAGER (Floor Ops)" },
                            { value: "ADMIN", label: "ADMIN (Super Admin)" },
                          ]}
                        />
                        <OutlinedTextField
                          label="Job title"
                          placeholder="e.g. Evening Cashier"
                          value={newProfileTitle}
                          onChange={setNewProfileTitle}
                        />
                        <OutlinedTextField
                          label="Work email"
                          type="email"
                          required
                          placeholder="name@albarkarestaurant.pk"
                          value={newProfileEmail}
                          onChange={setNewProfileEmail}
                        />
                        {newProfileRole === "ADMIN" ? (
                          <OutlinedTextField
                            label="Admin password (min 8)"
                            type="password"
                            required
                            placeholder="Strong password"
                            value={newProfilePassword}
                            onChange={setNewProfilePassword}
                          />
                        ) : (
                          <OutlinedTextField
                            label="4-digit PIN"
                            mono
                            required
                            placeholder="4444"
                            value={newProfilePin}
                            onChange={setNewProfilePin}
                          />
                        )}
                      </div>
                      <Button
                        type="submit"
                        variant="filled"
                        disabled={savingProfile}
                        icon={<Plus className="w-4 h-4" strokeWidth={1.8} />}
                      >
                        {savingProfile ? "Saving profile…" : "Add staff profile"}
                      </Button>
                    </form>
                  </Card>

                  {/* Rotate Super Admin Password */}
                  <Card className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h2 className="text-base font-semibold text-md-on-surface">
                          Rotate Super Admin password
                        </h2>
                        <p className="text-xs text-md-on-surface-variant mt-0.5">
                          Updates your salted scrypt password hash in MongoDB Atlas immediately.
                        </p>
                      </div>
                      <StatusChip label="scrypt KDF" variant="success" />
                    </div>
                    <form onSubmit={handleChangeAdminPassword} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <OutlinedTextField
                          label="Current password"
                          type="password"
                          required
                          value={currentAdminPassword}
                          onChange={setCurrentAdminPassword}
                        />
                        <OutlinedTextField
                          label="New password (min 8)"
                          type="password"
                          required
                          value={nextAdminPassword}
                          onChange={setNextAdminPassword}
                        />
                        <OutlinedTextField
                          label="Confirm new password"
                          type="password"
                          required
                          value={confirmAdminPassword}
                          onChange={setConfirmAdminPassword}
                        />
                      </div>
                      <Button
                        type="submit"
                        variant="tonal"
                        disabled={savingAdminPassword}
                        icon={<KeyRound className="w-4 h-4" strokeWidth={1.8} />}
                      >
                        {savingAdminPassword ? "Updating…" : "Update Super Admin password"}
                      </Button>
                    </form>
                  </Card>

                  {/* Existing Staff Profiles Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {users.map((u) => {
                      const isSelf = u.id === currentUser.id;
                      const adminCount = users.filter((x) => x.role === "ADMIN").length;
                      const cannotRemove = isSelf || (u.role === "ADMIN" && adminCount <= 1);
                      const isPasswordProfile =
                        u.role === "ADMIN" || u.authType === "PASSWORD";
                      return (
                        <Card key={u.id} className="space-y-3 flex flex-col justify-between">
                          <div className="space-y-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <StatusChip
                                label={
                                  u.role === "ADMIN"
                                    ? "OWNER / SUPER ADMIN"
                                    : u.role
                                }
                                variant={
                                  u.role === "ADMIN"
                                    ? "primary"
                                    : u.role === "MANAGER"
                                    ? "success"
                                    : "neutral"
                                }
                              />
                              <span className="font-mono text-xs text-md-on-surface-variant">
                                {isPasswordProfile
                                  ? "Password"
                                  : `PIN: ${u.pin || "****"}`}
                              </span>
                            </div>
                            <div>
                              <div className="font-medium text-base text-md-on-surface">
                                {u.name}
                              </div>
                              <div className="text-xs text-md-on-surface-variant">
                                @{u.username || u.email.split("@")[0]} · {u.title} · {u.email}
                              </div>
                            </div>
                            <div className="text-[11px] text-md-on-surface-variant pt-1">
                              {u.role === "ADMIN"
                                ? "Full access: Ledger, Deletes/Voids, MongoDB, PRA & Profiles"
                                : u.role === "MANAGER"
                                ? "POS, Discounts & Menu edits (No Ledger or Deletes)"
                                : "POS Terminal & Read-only Catalog (No Ledger or Deletes)"}
                            </div>
                          </div>

                          <div className="pt-2 border-t border-md-divider flex items-center justify-between">
                            <span className="text-[11px] text-md-on-surface-variant">
                              {isSelf ? "Active session holder" : "Workspace profile"}
                            </span>
                            {!cannotRemove && (
                              <Button
                                variant="text"
                                size="sm"
                                icon={<Trash2 className="w-3.5 h-3.5 text-md-error" strokeWidth={1.8} />}
                                onClick={() => handleDeleteProfile(u.id, u.name)}
                                className="text-md-error!"
                              >
                                Remove
                              </Button>
                            )}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )}

              {settingsSubTab === "ERP_AUDIT_COMPLIANCE" && canViewLedger && (
                <Card className="p-0! overflow-hidden">
                  <div className="p-4 border-b border-md-divider">
                    <h2 className="text-base font-semibold text-md-on-surface">
                      Immutable domain audit trail ({immutableAuditLogs.length}{" "}
                      records)
                    </h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-md-divider bg-md-surface-container-low/60 text-xs font-medium text-md-on-surface-variant">
                          <th className="py-3 px-4">Time</th>
                          <th className="py-3 px-3">Module</th>
                          <th className="py-3 px-3">Action</th>
                          <th className="py-3 px-3">Actor</th>
                          <th className="py-3 px-4">Summary</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-md-divider">
                        {immutableAuditLogs.map((aud) => (
                          <tr key={aud.id}>
                            <td className="py-3 px-4 font-mono text-xs text-md-on-surface-variant">
                              {new Date(aud.timestamp).toLocaleTimeString()}
                            </td>
                            <td className="py-3 px-3">
                              <StatusChip label={aud.module} variant="primary" />
                            </td>
                            <td className="py-3 px-3 font-mono text-xs">
                              {aud.action}
                            </td>
                            <td className="py-3 px-3 text-xs font-medium">
                              {aud.actorName} ({aud.actorRole})
                            </td>
                            <td className="py-3 px-4 text-xs text-md-on-surface-variant">
                              {aud.summary}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
              {settingsSubTab === "APPEARANCE" && (
                <Card className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h2 className="text-base font-semibold text-md-on-surface">
                        Material 3 Theme & Appearance
                      </h2>
                      <p className="text-xs text-md-on-surface-variant mt-0.5">
                        Switch between Light, Dark, or follow your OS color preference. Saved locally in your browser.
                      </p>
                    </div>
                    <ThemeSelector />
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* =============================================================== */}
          {/* ABOUT, VERSIONING & CREATOR SOCIALS                             */}
          {/* =============================================================== */}
          {activeNav === "about" && <AboutView />}
        </main>
      </div>

      {/* Command Palette (Ctrl + K) */}
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onNavigate={(key) => setActiveNav(key as ERPNavKey)}
        products={products}
        orders={orders}
        parties={parties}
        userRole={currentUser.role}
      />

      {/* Material 3 Bottom-Left Snackbar */}
      <Snackbar
        message={snackbarMessage}
        onClose={() => setSnackbarMessage("")}
      />

      {/* 80mm Thermal Receipt, KOT & PRA JSON Modal */}
      <ReceiptModal
        order={activeReceiptOrder}
        praConfig={praConfig}
        onClose={() => setActiveReceiptOrder(null)}
      />
    </div>
  );
}
