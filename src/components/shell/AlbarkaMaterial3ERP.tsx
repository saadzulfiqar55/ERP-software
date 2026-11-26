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
  SubscriptionPlanId,
  TenantOrganization,
  UserProfile,
  UserRole,
} from "@/lib/types";
import { SAAS_PLANS } from "@/core/saas/entitlements";
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
  ProgressBar,
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
import type { TenantSummary } from "@/lib/postgres";
import DishVisual from "@/components/DishVisual";
import { WorkspaceSplash } from "@/components/shell/WorkspaceSplash";
import { StackLyraLogo } from "@/components/ui/StackLyraLogo";
import { ERP_VERSION_TAG } from "@/lib/version";
import {
  clearDurableSnapshot,
  getTenantScopedKey,
  POS_DRAFT_KEY,
  PosDraftSnapshot,
  QueuedMutation,
  readDurableOutboxAsync,
  readDurableSnapshotAsync,
  readSyncJson,
  WORKSPACE_CACHE_KEY,
  writeDurableOutbox,
  writeDurableSnapshot,
} from "@/lib/crash-safe-store";

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
  restaurantName: "StackLyra Workspace",
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
  // Authentication & Multi-Tenant SaaS Session State (loaded strictly from /api/state & /api/auth)
  const [tenant, setTenant] = useState<TenantOrganization | null>(null);
  const [platformTenants, setPlatformTenants] = useState<TenantOrganization[]>([]);
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
    | "SAAS_SUBSCRIPTION"
    | "PRA_INTEGRATION"
    | "TAX_RULES"
    | "SESSION_JWT_MANAGER"
    | "MONGODB_DATABASE"
    | "RESTAURANT_PROFILES"
    | "ERP_AUDIT_COMPLIANCE"
    | "APPEARANCE"
  >("SAAS_SUBSCRIPTION");

  // Persistent App Data State (hydrated from DB via /api/state)
  const [praConfig, setPraConfig] = useState<PRAConfig>(EMPTY_PRA_CONFIG);
  const [mongoConfig, setMongoConfig] = useState<MongoDBConfig>({
    enabled: false,
    uri: "",
    dbName: "postgres (Supabase Pooler :6543)",
    lastStatus: "Loading Supabase PostgreSQL status…",
  });
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [erpInvoices, setErpInvoices] = useState<ERPInvoice[]>([]);
  const [parties, setParties] = useState<PartyAccount[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [waitingTasks, setWaitingTasks] = useState<WaitingTaskItem[]>([]);
  const [stockMonitor, setStockMonitor] = useState<StockLevelMonitorItem[]>([]);
  const [restaurantTables, setRestaurantTables] = useState<string[]>([]);
  const [servers, setServers] = useState<string[]>([]);
  const [immutableAuditLogs, setImmutableAuditLogs] = useState<
    ImmutableAuditLog[]
  >([]);
  // Server-computed totals and counts; lists above only hold the newest rows + loaded pages.
  const [summary, setSummary] = useState<TenantSummary | null>(null);
  const [loadingMore, setLoadingMore] = useState<null | "orders" | "ledger" | "audit">(null);
  const [cashierShifts, setCashierShifts] = useState<CashierShift[]>([]);
  const [fiscalPeriods, setFiscalPeriods] = useState<FiscalPeriod[]>([]);
  const [countedCashInput, setCountedCashInput] = useState<string>("");
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [syncQueue, setSyncQueue] = useState<QueuedMutation[]>([]);
  const [syncingQueue, setSyncingQueue] = useState<boolean>(false);

  // POS Filters & Search
  const [segmentFilter, setSegmentFilter] = useState<"ALL" | BusinessSegment>(
    "ALL"
  );
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [barcodeInput, setBarcodeInput] = useState<string>("");

  // Active Order State (Clean Empty Cart & Dynamic Floor Lists)
  const [orderType, setOrderType] = useState<OrderType>("DINE_IN");
  const [tableNumber, setTableNumber] = useState<string>("");
  const [waiterName, setWaiterName] = useState<string>("");
  const [manageFloorOpen, setManageFloorOpen] = useState<boolean>(false);
  const [newTableInput, setNewTableInput] = useState<string>("");
  const [newServerInput, setNewServerInput] = useState<string>("");
  const [customerName, setCustomerName] = useState<string>("");
  const [customerPhone, setCustomerPhone] = useState<string>("");
  const [buyerNtnCnic] = useState<string>("");
  const [selectedKhataId, setSelectedKhataId] = useState<string>("");
  const [cart, setCart] = useState<CartItem[]>([]);

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

  // Standalone Sales Tax Calculator & Shift Float state
  const [openingFloatInput, setOpeningFloatInput] = useState<string>("0");
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
  // Separated Menu vs Material Stock state
  const [inventoryTab, setInventoryTab] = useState<"MENU" | "STOCK">("MENU");
  const [newProdName, setNewProdName] = useState<string>("");
  const [newProdCode, setNewProdCode] = useState<string>("");
  const [newProdCategory, setNewProdCategory] =
    useState<string>("Main Course");
  const [newProdPrice, setNewProdPrice] = useState<string>("");
  const [newProdImageUrl, setNewProdImageUrl] = useState<string>("");

  // Material Stock CRUD Form State
  const [editingStockId, setEditingStockId] = useState<string | null>(null);
  const [newStockName, setNewStockName] = useState<string>("");
  const [newStockSku, setNewStockSku] = useState<string>("");
  const [newStockQty, setNewStockQty] = useState<string>("0");
  const [newStockTarget, setNewStockTarget] = useState<string>("25");
  const [newStockUnit, setNewStockUnit] = useState<string>("Kg");

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

  const activeTenantId = currentUser?.tenantId || tenant?.id || "ten-stacklyra";
  const scopedWorkspaceCacheKey = getTenantScopedKey(
    WORKSPACE_CACHE_KEY,
    activeTenantId
  );
  const scopedPosDraftKey = getTenantScopedKey(POS_DRAFT_KEY, activeTenantId);

  function saveWorkspaceCache(
    partial: Record<string, unknown>,
    explicitTenantId?: string
  ) {
    const key = getTenantScopedKey(
      WORKSPACE_CACHE_KEY,
      explicitTenantId || activeTenantId
    );
    const prev = readSyncJson<Record<string, unknown>>(key) || {};
    writeDurableSnapshot(key, { ...prev, ...partial });
  }

  function persistSyncQueue(next: QueuedMutation[], explicitTenantId?: string) {
    setSyncQueue(next);
    writeDurableOutbox(next, explicitTenantId || activeTenantId);
  }

  // Continuously checkpoint active POS order to IndexedDB + localStorage scoped by tenantId
  useEffect(() => {
    if (authChecking || !currentUser) return;
    if (
      cart.length === 0 &&
      !customerName &&
      !customerPhone &&
      discountAmount === 0
    ) {
      clearDurableSnapshot(scopedPosDraftKey);
      return;
    }
    const draft: PosDraftSnapshot = {
      tenantId: activeTenantId,
      cart,
      orderType,
      tableNumber,
      waiterName,
      customerName,
      customerPhone,
      selectedKhataId,
      discountAmount,
      paymentMethod,
      splitCashRatio,
      cashTendered,
      updatedAt: new Date().toISOString(),
    };
    writeDurableSnapshot(scopedPosDraftKey, draft);
  }, [
    authChecking,
    currentUser,
    activeTenantId,
    scopedPosDraftKey,
    cart,
    orderType,
    tableNumber,
    waiterName,
    customerName,
    customerPhone,
    selectedKhataId,
    discountAmount,
    paymentMethod,
    splitCashRatio,
    cashTendered,
  ]);

  async function flushSyncQueue(overrideQueue?: QueuedMutation[]) {
    const queueToRun = overrideQueue ?? syncQueue;
    if (queueToRun.length === 0 || syncingQueue) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    setSyncingQueue(true);
    const remaining: QueuedMutation[] = [];
    let syncedCount = 0;

    for (let i = 0; i < queueToRun.length; i++) {
      const item = queueToRun[i];
      try {
        const res = await fetch(item.url, {
          method: item.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.payload),
        });
        if (!res.ok && res.status >= 500) {
          remaining.push(...queueToRun.slice(i));
          break;
        }
        syncedCount++;
      } catch {
        remaining.push(...queueToRun.slice(i));
        break;
      }
    }

    persistSyncQueue(remaining);
    setSyncingQueue(false);
    if (syncedCount > 0 && remaining.length === 0) {
      notifySaved(`Synced ${syncedCount} offline change(s) to cloud.`);
      void fetchScopedState();
    }
  }

  async function sendFastStateMutation(
    payload: Record<string, unknown>
  ): Promise<{ ok: boolean; queued: boolean; data?: Record<string, unknown>; error?: string }> {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const entry: QueuedMutation = {
        id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        url: "/api/state",
        method: "PUT",
        payload,
        createdAt: new Date().toISOString(),
      };
      persistSyncQueue([...syncQueue, entry]);
      return { ok: true, queued: true };
    }

    try {
      const res = await fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, queued: false, error: data.error || "Sync failed" };
      }
      if (data.immutableAuditLogs) setImmutableAuditLogs(data.immutableAuditLogs);
      return { ok: true, queued: false, data };
    } catch {
      const entry: QueuedMutation = {
        id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        url: "/api/state",
        method: "PUT",
        payload,
        createdAt: new Date().toISOString(),
      };
      persistSyncQueue([...syncQueue, entry]);
      return { ok: true, queued: true };
    }
  }

  async function fetchScopedState() {
    const stateRes = await fetch("/api/state");
    if (!stateRes.ok) return;
    const data = await stateRes.json();
    if (data.tenant) setTenant(data.tenant);
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
    const nextTables: string[] = data.restaurantTables || [];
    const nextServers: string[] = data.servers || [];
    setRestaurantTables(nextTables);
    setServers(nextServers);
    setTableNumber((prev) =>
      prev && nextTables.includes(prev) ? prev : nextTables[0] || ""
    );
    setWaiterName((prev) =>
      prev && nextServers.includes(prev) ? prev : nextServers[0] || ""
    );
    setImmutableAuditLogs(data.immutableAuditLogs || []);
    if (data.cashierShifts) setCashierShifts(data.cashierShifts);
    if (data.fiscalPeriods) setFiscalPeriods(data.fiscalPeriods);

    const tid = data.tenant?.id || activeTenantId;
    saveWorkspaceCache(
      {
        tenant: data.tenant,
        praConfig: data.praConfig,
        products: data.products || [],
        orders: data.orders || [],
        erpInvoices: data.erpInvoices || [],
        waitingTasks: data.waitingTasks || [],
        stockMonitor: data.stockMonitor || [],
        restaurantTables: nextTables,
        servers: nextServers,
      },
      tid
    );
  }

  async function fetchPlatformTenantsIfOwner() {
    try {
      const res = await fetch("/api/saas/onboarding");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.tenants)) {
        setPlatformTenants(data.tenants);
      }
    } catch {
      // Ignore
    }
  }

  async function handleUpdateSubscriptionPlan(
    planId: SubscriptionPlanId,
    targetTenantId?: string,
    status?: "TRIALING" | "ACTIVE" | "PAST_DUE" | "SUSPENDED"
  ) {
    try {
      const res = await fetch("/api/saas/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPDATE_SUBSCRIPTION",
          planId,
          targetTenantId,
          status,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        notifySaved(data.error || "Could not update subscription plan.");
        return;
      }
      if (data.tenant && (!targetTenantId || targetTenantId === tenant?.id)) {
        setTenant(data.tenant);
      }
      if (Array.isArray(data.tenants)) {
        setPlatformTenants(data.tenants);
      }
      notifySaved(
        `Updated SaaS plan to ${SAAS_PLANS[planId]?.name || planId} (${
          status || "ACTIVE"
        }).`
      );
      void fetchScopedState();
    } catch {
      notifySaved("Network error while updating SaaS plan.");
    }
  }

  async function hydrateTenantLocalCrashStore(tid: string) {
    const tCacheKey = getTenantScopedKey(WORKSPACE_CACHE_KEY, tid);
    const tDraftKey = getTenantScopedKey(POS_DRAFT_KEY, tid);
    let restoredCartCount = 0;

    try {
      const c = readSyncJson<Record<string, unknown>>(tCacheKey);
      if (c) {
        if (c.praConfig) setPraConfig(c.praConfig as PRAConfig);
        if (Array.isArray(c.products)) setProducts(c.products as Product[]);
        if (Array.isArray(c.orders)) setOrders(c.orders as Order[]);
        if (Array.isArray(c.erpInvoices))
          setErpInvoices(c.erpInvoices as ERPInvoice[]);
        if (Array.isArray(c.waitingTasks))
          setWaitingTasks(c.waitingTasks as WaitingTaskItem[]);
        if (Array.isArray(c.stockMonitor))
          setStockMonitor(c.stockMonitor as StockLevelMonitorItem[]);
      }

      const draft =
        readSyncJson<PosDraftSnapshot>(tDraftKey) ||
        (await readDurableSnapshotAsync<PosDraftSnapshot>(tDraftKey));
      if (draft && Array.isArray(draft.cart) && draft.cart.length > 0) {
        setCart(draft.cart);
        if (draft.orderType) setOrderType(draft.orderType);
        if (draft.tableNumber) setTableNumber(draft.tableNumber);
        if (draft.waiterName) setWaiterName(draft.waiterName);
        if (draft.customerName) setCustomerName(draft.customerName);
        if (draft.customerPhone) setCustomerPhone(draft.customerPhone);
        if (draft.selectedKhataId) setSelectedKhataId(draft.selectedKhataId);
        if (typeof draft.discountAmount === "number")
          setDiscountAmount(draft.discountAmount);
        if (draft.paymentMethod) setPaymentMethod(draft.paymentMethod);
        if (typeof draft.splitCashRatio === "number")
          setSplitCashRatio(draft.splitCashRatio);
        if (draft.cashTendered) setCashTendered(draft.cashTendered);
        restoredCartCount = draft.cart.length;
      } else {
        setCart([]);
      }
    } catch {
      // Ignore corrupt cache
    }

    if (restoredCartCount > 0) {
      notifySaved(
        `Recovered unfinished POS order (${restoredCartCount} item${
          restoredCartCount > 1 ? "s" : ""
        }) from previous session.`
      );
    }

    const durableOutbox = await readDurableOutboxAsync(tid);
    setSyncQueue(durableOutbox);
    if (
      durableOutbox.length > 0 &&
      (typeof navigator === "undefined" || navigator.onLine)
    ) {
      void flushSyncQueue(durableOutbox);
    }
  }

  // Hydrate instant local cache, restore crash-recovered POS drafts & outbox, monitor connectivity, and verify JWT session on mount
  useEffect(() => {
    if (typeof navigator !== "undefined") {
      setIsOnline(navigator.onLine);
    }
    const handleOnline = () => {
      setIsOnline(true);
      void flushSyncQueue();
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

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
          if (authData.tenant) {
            setTenant(authData.tenant);
          }
          if (authData.authenticated && authData.user) {
            setCurrentUser(authData.user);
            const tid =
              authData.tenant?.id || authData.user.tenantId || "ten-stacklyra";
            await hydrateTenantLocalCrashStore(tid);
            if (authData.user.isPlatformAdmin || tid === "ten-stacklyra") {
              void fetchPlatformTenantsIfOwner();
            }
          }
        }
      } catch {
        // Offline cache already hydrated
      } finally {
        setAuthChecking(false);
      }
    }
    initApp();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function notifySaved(msg: string) {
    setSnackbarMessage(msg);
    setTimeout(() => setSnackbarMessage(""), 4500);
  }

  async function handleApproveTask(task: WaitingTaskItem) {
    const prevTasks = waitingTasks;
    const nextTasks = waitingTasks.map((t) =>
      t.id === task.id ? { ...t, status: "APPROVED" as const } : t
    );
    setWaitingTasks(nextTasks);
    saveWorkspaceCache({ waitingTasks: nextTasks });
    notifySaved(`Approved ${task.referenceCode} (${task.title})`);

    const res = await sendFastStateMutation({ approveTaskId: task.id });
    if (!res.ok) {
      setWaitingTasks(prevTasks);
      saveWorkspaceCache({ waitingTasks: prevTasks });
      notifySaved(res.error || "Permission denied for task approval.");
    } else if (res.queued) {
      notifySaved("Approved offline — queued for cloud sync.");
    }
  }

  async function handleReorderStock(item: StockLevelMonitorItem) {
    const prevStock = stockMonitor;
    const nextStock = stockMonitor.map((s) =>
      s.id === item.id ? { ...s, currentQty: s.reorderTarget } : s
    );
    setStockMonitor(nextStock);
    saveWorkspaceCache({ stockMonitor: nextStock });
    notifySaved(`Restocked ${item.name} to ${item.reorderTarget} ${item.unit}`);

    const res = await sendFastStateMutation({ reorderStockId: item.id });
    if (!res.ok) {
      setStockMonitor(prevStock);
      saveWorkspaceCache({ stockMonitor: prevStock });
      notifySaved(res.error || "Permission denied for stock reorder.");
    } else if (res.queued) {
      notifySaved("Restocked offline — queued for cloud sync.");
    }
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
      setSummary(null);
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

  // All-time totals come from /api/summary; the local sum is only an offline fallback.
  const totalSalesRevenue = useMemo(
    () =>
      summary
        ? summary.orders.revenueMinor / 100
        : orders.reduce((s, o) => s + o.taxBreakdown.grandTotal, 0),
    [orders, summary]
  );
  const totalPraTaxCollected = useMemo(
    () =>
      summary
        ? summary.orders.taxMinor / 100
        : orders.reduce((s, o) => s + o.taxBreakdown.totalSalesTax, 0),
    [orders, summary]
  );
  const totalOrderCount = summary ? summary.orders.count : orders.length;
  const totalLedgerCount = summary && canViewLedger ? summary.ledgerCount : ledger.length;
  const totalAuditCount =
    summary && canViewLedger ? summary.auditCount : immutableAuditLogs.length;

  // Refresh server totals whenever the lists change (after sales, postings, reloads).
  useEffect(() => {
    if (!currentUser) return;
    const timer = setTimeout(() => {
      void fetchSummary();
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, orders, ledger, immutableAuditLogs]);
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

    // Write-ahead outbox record BEFORE network dispatch so crashes/power-loss mid-checkout never lose the sale
    const outboxId = `q-ord-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const outboxEntry: QueuedMutation = {
      id: outboxId,
      url: "/api/orders",
      method: "POST",
      payload,
      createdAt: new Date().toISOString(),
      label: `POS Checkout (PKR ${grandTotal.toLocaleString()})`,
    };
    const queueWithSale = [...syncQueue, outboxEntry];
    persistSyncQueue(queueWithSale);

    const completeOfflineSale = () => {
      const localOrder: Order = {
        id: `ord-offline-${Date.now()}`,
        idempotencyKey: payload.idempotencyKey,
        invoiceNumber: `OFF-${Date.now().toString().slice(-6)}`,
        usin: `OFF-${Date.now().toString().slice(-6)}`,
        praInvoiceNumber: "OFFLINE-PENDING-PRA",
        praQrPayload: "",
        praSyncStatus: "PENDING_OFFLINE",
        createdAt: new Date().toISOString(),
        orderType,
        tableNumber: payload.tableNumber,
        waiterName: payload.waiterName,
        customerName: payload.customerName,
        customerPhone: payload.customerPhone,
        buyerNtnCnic: payload.buyerNtnCnic,
        khataAccountId: payload.khataAccountId,
        items: cart,
        discountAmount: payload.discountAmount,
        serviceCharge: payload.serviceCharge,
        paymentMethod,
        cashPaid,
        cardPaid,
        changeReturned,
        taxBreakdown: liveTaxBreakdown,
        cashierName: payload.cashierName,
      };
      const nextOrders = [localOrder, ...orders];
      setOrders(nextOrders);
      saveWorkspaceCache({ orders: nextOrders });
      setActiveReceiptOrder(localOrder);
      setCart([]);
      setDiscountAmount(0);
      setCashTendered("");
      clearDurableSnapshot(scopedPosDraftKey);
      notifySaved("Sale saved locally — queued in outbox for cloud & PRA sync.");
    };

    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        completeOfflineSale();
        return;
      }
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        persistSyncQueue(syncQueue.filter((q) => q.id !== outboxId));
        setOrders(data.db.orders);
        setProducts(data.db.products);
        setParties(data.db.parties);
        setLedger(data.db.ledger);
        saveWorkspaceCache({ orders: data.db.orders, products: data.db.products });
        if (data.db.immutableAuditLogs)
          setImmutableAuditLogs(data.db.immutableAuditLogs);
        if (data.db.cashierShifts) setCashierShifts(data.db.cashierShifts);
        setActiveReceiptOrder(data.order);
        setCart([]);
        setDiscountAmount(0);
        setCashTendered("");
        clearDurableSnapshot(scopedPosDraftKey);
      } else {
        // Explicit server/domain rejection (stock, locked fiscal period, auth): remove stale outbox entry
        persistSyncQueue(syncQueue.filter((q) => q.id !== outboxId));
        notifySaved(data.error || "Order rejected by domain guard.");
      }
    } catch {
      completeOfflineSale();
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
      notifySaved(
        `Reversed ${data.reversal?.voucherNo || "the voucher"} and posted corrected voucher ${data.corrected?.voucherNo || ""}.`
      );
    } else {
      const data = await res.json().catch(() => ({}));
      notifySaved(data.error || "Could not correct the voucher.");
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
      notifySaved(`Voided ${voucherNo} by posting reversal ${data.reversal?.voucherNo || ""}.`);
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
      notifySaved(`Posted reversal ${data.reversal?.voucherNo || ""} for ${voucherNo}.`);
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

  async function handleOpenShift(e: React.FormEvent) {
    e.preventDefault();
    const openingFloatPkr = Math.max(0, Number(openingFloatInput) || 0);
    const res = await fetch("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ openShift: { openingFloatPkr } }),
    });
    const data = await res.json();
    if (res.ok) {
      if (data.cashierShifts) setCashierShifts(data.cashierShifts);
      if (data.immutableAuditLogs) setImmutableAuditLogs(data.immutableAuditLogs);
      notifySaved(`Opened cashier shift with PKR ${openingFloatPkr.toLocaleString()} float.`);
    } else {
      notifySaved(data.error || "Failed to open cashier shift.");
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
        segment: "RESTAURANT",
        category: newProdCategory,
        kitchenStation: newProdCategory.includes("BBQ")
          ? "BBQ_GRILL"
          : newProdCategory.includes("Tandoor")
          ? "TANDOOR"
          : newProdCategory.includes("Rice")
          ? "RICE_PULAO"
          : "KARAHI_HANDI",
        taxMode: "EXCLUSIVE",
        stockQty: 0,
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
                  name: "Full Portion",
                  price: Number(newProdPrice),
                  costPrice: Math.round(Number(newProdPrice) * 0.6),
                },
              ],
      };

      const prevProducts = products;
      const nextProducts = products.map((p) =>
        p.id === updatedProduct.id ? updatedProduct : p
      );
      setProducts(nextProducts);
      saveWorkspaceCache({ products: nextProducts });
      cancelEditingProduct();
      notifySaved(`Updated "${updatedProduct.name}".`);

      const res = await sendFastStateMutation({ editProduct: updatedProduct });
      if (!res.ok) {
        setProducts(prevProducts);
        saveWorkspaceCache({ products: prevProducts });
        notifySaved(res.error || "Failed to update menu item.");
      }
      return;
    }

    const newProduct: Product = {
      id: `prod-${Date.now()}`,
      code: newProdCode.trim() || `${products.length + 101}`,
      barcode: `896100${products.length + 101}`,
      name: newProdName.trim(),
      nameUrdu: "",
      segment: "RESTAURANT",
      category: newProdCategory,
      kitchenStation: newProdCategory.includes("BBQ")
        ? "BBQ_GRILL"
        : newProdCategory.includes("Tandoor")
        ? "TANDOOR"
        : newProdCategory.includes("Rice")
        ? "RICE_PULAO"
        : "KARAHI_HANDI",
      taxMode: "EXCLUSIVE",
      stockQty: 0,
      unit: "Portion",
      imageUrl: newProdImageUrl.trim() || undefined,
      variants: [
        {
          id: `v-${Date.now()}`,
          name: "Full Portion",
          price: Number(newProdPrice),
          costPrice: Math.round(Number(newProdPrice) * 0.6),
        },
      ],
    };

    const prevProducts = products;
    const nextProducts = [newProduct, ...products];
    setProducts(nextProducts);
    saveWorkspaceCache({ products: nextProducts });
    setNewProdName("");
    setNewProdCode("");
    setNewProdPrice("");
    setNewProdImageUrl("");
    notifySaved(`Added "${newProduct.name}" to menu.`);

    const res = await sendFastStateMutation({ newProduct });
    if (!res.ok) {
      setProducts(prevProducts);
      saveWorkspaceCache({ products: prevProducts });
      notifySaved(res.error || "Failed to add menu item.");
    }
  }

  function startEditingProduct(product: Product) {
    setInventoryTab("MENU");
    setEditingProductId(product.id);
    setNewProdName(product.name);
    setNewProdCode(product.code);
    setNewProdCategory(product.category);
    setNewProdPrice(String(product.variants[0]?.price || 0));
    setNewProdImageUrl(product.imageUrl || "");
  }

  function cancelEditingProduct() {
    setEditingProductId(null);
    setNewProdName("");
    setNewProdCode("");
    setNewProdPrice("");
    setNewProdImageUrl("");
  }

  async function handleDeleteProduct(productId: string, productName: string) {
    const prevProducts = products;
    const nextProducts = products.filter((p) => p.id !== productId);
    setProducts(nextProducts);
    saveWorkspaceCache({ products: nextProducts });
    if (editingProductId === productId) cancelEditingProduct();
    notifySaved(`Removed "${productName}" from menu.`);

    const res = await sendFastStateMutation({ deleteProductId: productId });
    if (!res.ok) {
      setProducts(prevProducts);
      saveWorkspaceCache({ products: prevProducts });
      notifySaved(res.error || "Only Owner / Super Admin can archive items.");
    }
  }

  async function handleSaveStockItem(e: React.FormEvent) {
    e.preventDefault();
    if (!newStockName.trim()) return;

    const itemPayload: StockLevelMonitorItem = {
      id: editingStockId || `stk-${Date.now()}`,
      name: newStockName.trim(),
      sku: newStockSku.trim() || `MAT-${Date.now().toString().slice(-4)}`,
      currentQty: Math.max(0, Number(newStockQty) || 0),
      reorderTarget: Math.max(1, Number(newStockTarget) || 10),
      unit: newStockUnit.trim() || "Units",
    };

    const prevStock = stockMonitor;
    const isEdit = Boolean(editingStockId);
    const nextStock = isEdit
      ? stockMonitor.map((s) => (s.id === itemPayload.id ? itemPayload : s))
      : [itemPayload, ...stockMonitor];

    setStockMonitor(nextStock);
    saveWorkspaceCache({ stockMonitor: nextStock });
    setEditingStockId(null);
    setNewStockName("");
    setNewStockSku("");
    setNewStockQty("0");
    setNewStockTarget("25");
    setNewStockUnit("Kg");
    notifySaved(
      isEdit
        ? `Updated material "${itemPayload.name}".`
        : `Added material "${itemPayload.name}".`
    );

    const res = await sendFastStateMutation(
      isEdit ? { editStockItem: itemPayload } : { addStockItem: itemPayload }
    );
    if (!res.ok) {
      setStockMonitor(prevStock);
      saveWorkspaceCache({ stockMonitor: prevStock });
      notifySaved(res.error || "Failed to save material stock.");
    }
  }

  async function handleAdjustStockQty(stockId: string, delta: number) {
    const prevStock = stockMonitor;
    const nextStock = stockMonitor.map((s) =>
      s.id === stockId ? { ...s, currentQty: Math.max(0, s.currentQty + delta) } : s
    );
    setStockMonitor(nextStock);
    saveWorkspaceCache({ stockMonitor: nextStock });

    const res = await sendFastStateMutation({
      adjustStockQty: { stockId, delta },
    });
    if (!res.ok) {
      setStockMonitor(prevStock);
      saveWorkspaceCache({ stockMonitor: prevStock });
      notifySaved(res.error || "Failed to adjust stock quantity.");
    }
  }

  async function handleDeleteStockItem(stockId: string, name: string) {
    const prevStock = stockMonitor;
    const nextStock = stockMonitor.filter((s) => s.id !== stockId);
    setStockMonitor(nextStock);
    saveWorkspaceCache({ stockMonitor: nextStock });
    if (editingStockId === stockId) {
      setEditingStockId(null);
      setNewStockName("");
    }
    notifySaved(`Removed material "${name}".`);

    const res = await sendFastStateMutation({ deleteStockId: stockId });
    if (!res.ok) {
      setStockMonitor(prevStock);
      saveWorkspaceCache({ stockMonitor: prevStock });
      notifySaved(res.error || "Only Owner / Super Admin can remove material stock.");
    }
  }

  async function handleAddTable(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const trimmed = newTableInput.trim();
    if (!trimmed) return;
    if (restaurantTables.includes(trimmed)) {
      setNewTableInput("");
      return;
    }
    const prevTables = restaurantTables;
    const nextTables = [...restaurantTables, trimmed];
    setRestaurantTables(nextTables);
    setTableNumber((prev) => prev || trimmed);
    saveWorkspaceCache({ restaurantTables: nextTables });
    setNewTableInput("");
    notifySaved(`Added table "${trimmed}".`);

    const res = await sendFastStateMutation({ addTable: trimmed });
    if (!res.ok) {
      setRestaurantTables(prevTables);
      saveWorkspaceCache({ restaurantTables: prevTables });
      notifySaved(res.error || "Failed to add table.");
    }
  }

  async function handleRemoveTable(target: string) {
    const prevTables = restaurantTables;
    const nextTables = restaurantTables.filter((t) => t !== target);
    setRestaurantTables(nextTables);
    if (tableNumber === target) setTableNumber(nextTables[0] || "");
    saveWorkspaceCache({ restaurantTables: nextTables });
    notifySaved(`Removed table "${target}".`);

    const res = await sendFastStateMutation({ removeTable: target });
    if (!res.ok) {
      setRestaurantTables(prevTables);
      saveWorkspaceCache({ restaurantTables: prevTables });
      notifySaved(res.error || "Failed to remove table.");
    }
  }

  async function handleAddServer(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const trimmed = newServerInput.trim();
    if (!trimmed) return;
    if (servers.includes(trimmed)) {
      setNewServerInput("");
      return;
    }
    const prevServers = servers;
    const nextServers = [...servers, trimmed];
    setServers(nextServers);
    setWaiterName((prev) => prev || trimmed);
    saveWorkspaceCache({ servers: nextServers });
    setNewServerInput("");
    notifySaved(`Added server "${trimmed}".`);

    const res = await sendFastStateMutation({ addServer: trimmed });
    if (!res.ok) {
      setServers(prevServers);
      saveWorkspaceCache({ servers: prevServers });
      notifySaved(res.error || "Failed to add server.");
    }
  }

  async function handleRemoveServer(target: string) {
    const prevServers = servers;
    const nextServers = servers.filter((s) => s !== target);
    setServers(nextServers);
    if (waiterName === target) setWaiterName(nextServers[0] || "");
    saveWorkspaceCache({ servers: nextServers });
    notifySaved(`Removed server "${target}".`);

    const res = await sendFastStateMutation({ removeServer: target });
    if (!res.ok) {
      setServers(prevServers);
      saveWorkspaceCache({ servers: prevServers });
      notifySaved(res.error || "Failed to remove server.");
    }
  }

  async function handleCreateProfile(e: React.FormEvent) {
    e.preventDefault();
    const isCreatingAdmin = newProfileRole === "ADMIN";
    if (!newProfileName.trim()) {
      notifySaved("Enter full name.");
      return;
    }
    if (isCreatingAdmin && (!newProfileEmail.trim() || newProfilePassword.length < 8)) {
      notifySaved("Super Admin profiles require Work Email and a password (min 8 chars).");
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

  async function fetchSummary() {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const year = new Date().getFullYear();
      const res = await fetch(
        `/api/summary?year=${year}&tz=${encodeURIComponent(tz)}`
      );
      if (res.ok) setSummary((await res.json()) as TenantSummary);
    } catch {
      // Offline: keep the last summary; totals fall back to loaded rows.
    }
  }

  function encodeListCursor(at: string, id: string): string {
    const json = JSON.stringify([at, id]);
    const b64 = btoa(unescape(encodeURIComponent(json)));
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  /** Appends the next page of orders / ledger entries / audit logs to the loaded list. */
  async function loadMoreJournal(kind: "orders" | "ledger" | "audit") {
    if (loadingMore) return;
    const list: Array<{ id: string; createdAt?: string; timestamp?: string }> =
      kind === "orders" ? orders : kind === "ledger" ? ledger : immutableAuditLogs;
    const last = list[list.length - 1];
    if (!last) return;
    const at = (kind === "audit" ? last.timestamp : last.createdAt) || "";
    const endpoint =
      kind === "orders" ? "/api/orders" : kind === "ledger" ? "/api/ledger" : "/api/audit";
    setLoadingMore(kind);
    try {
      const res = await fetch(
        `${endpoint}?limit=100&cursor=${encodeURIComponent(encodeListCursor(at, last.id))}`
      );
      const data = await res.json();
      if (!res.ok) {
        notifySaved(data.error || "Could not load more records.");
        return;
      }
      const merge = <T extends { id: string }>(prev: T[]) => {
        const seen = new Set(prev.map((x) => x.id));
        return [...prev, ...(data.items as T[]).filter((x) => !seen.has(x.id))];
      };
      if (kind === "orders") setOrders((prev) => merge(prev));
      else if (kind === "ledger") setLedger((prev) => merge(prev));
      else setImmutableAuditLogs((prev) => merge(prev));
    } catch {
      notifySaved("Network error while loading more records.");
    } finally {
      setLoadingMore(null);
    }
  }

  function renderLoadMore(kind: "orders" | "ledger" | "audit", loaded: number, total: number) {
    if (loaded >= total || loaded === 0) return null;
    return (
      <div className="flex items-center justify-between gap-3 p-4 border-t border-md-divider text-xs text-md-on-surface-variant">
        <span>
          Showing {loaded.toLocaleString()} of {total.toLocaleString()}
        </span>
        <Button
          variant="tonal"
          size="sm"
          disabled={loadingMore !== null}
          onClick={() => void loadMoreJournal(kind)}
        >
          {loadingMore === kind ? "Loading…" : "Load more"}
        </Button>
      </div>
    );
  }

  function exportPRACsv() {
    // Built on the server from every order, not just the rows loaded in this tab.
    const link = document.createElement("a");
    link.setAttribute("href", "/api/orders/export");
    link.setAttribute("download", "StackLyra_PRA_Sales_Tax_Register.csv");
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
        onAuthSuccess={({
          user,
          tenant: authTenant,
          activeSession: ses,
          sessionAuditLogs: logs,
        }) => {
          setCurrentUser(user);
          if (authTenant) setTenant(authTenant);
          setActiveSession(ses);
          setSessionAuditLogs(logs);
          if (!hasGranularPermission(user.role, "settings:pra:manage")) {
            setSettingsSubTab("APPEARANCE");
          } else {
            setSettingsSubTab("SAAS_SUBSCRIPTION");
          }
          const tid = authTenant?.id || user.tenantId || "ten-stacklyra";
          void hydrateTenantLocalCrashStore(tid);
          void fetchScopedState();
          if (user.isPlatformAdmin || tid === "ten-stacklyra") {
            void fetchPlatformTenantsIfOwner();
          }
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
        return totalOrderCount;
      case "purchasing":
        return supplierCount;
      case "inventory":
        return products.length;
      case "invoices":
        return erpInvoices.length;
      case "accounting":
        return totalLedgerCount;
      case "hr":
        return users.length + servers.length;
      default:
        return undefined;
    }
  };

  const renderFloorOpsSection = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-md-on-surface">
              Restaurant tables ({restaurantTables.length})
            </h3>
            <p className="text-xs text-md-on-surface-variant mt-0.5">
              Add or remove dining tables shown on the POS Terminal
            </p>
          </div>
          <StatusChip label="Dine-In" variant="primary" />
        </div>
        <form onSubmit={handleAddTable} className="flex gap-2">
          <CompactField
            value={newTableInput}
            onChange={setNewTableInput}
            placeholder="e.g. Table 1, Hall A-2, VIP-1"
            className="flex-1"
          />
          <Button type="submit" variant="filled" size="sm" icon={<Plus className="w-4 h-4" />}>
            Add table
          </Button>
        </form>
        {restaurantTables.length === 0 ? (
          <EmptyState
            title="No tables configured"
            subtitle="Add dining tables above to assign Dine-In orders in POS."
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            {restaurantTables.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-md-surface-container-low border border-md-outline-variant text-sm text-md-on-surface"
              >
                <span>{t}</span>
                <button
                  type="button"
                  aria-label={`Remove table ${t}`}
                  onClick={() => void handleRemoveTable(t)}
                  className="text-md-error hover:opacity-75"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
      </Card>

      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-md-on-surface">
              Waiters &amp; servers ({servers.length})
            </h3>
            <p className="text-xs text-md-on-surface-variant mt-0.5">
              Add or remove floor servers assignable on POS orders
            </p>
          </div>
          <StatusChip label="Floor Team" variant="success" />
        </div>
        <form onSubmit={handleAddServer} className="flex gap-2">
          <CompactField
            value={newServerInput}
            onChange={setNewServerInput}
            placeholder="e.g. Ahmed Ali, Counter Self"
            className="flex-1"
          />
          <Button type="submit" variant="filled" size="sm" icon={<Plus className="w-4 h-4" />}>
            Add server
          </Button>
        </form>
        {servers.length === 0 ? (
          <EmptyState
            title="No servers configured"
            subtitle="Add servers above so cashiers can tag orders cleanly."
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            {servers.map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-md-surface-container-low border border-md-outline-variant text-sm text-md-on-surface"
              >
                <span>{s}</span>
                <button
                  type="button"
                  aria-label={`Remove server ${s}`}
                  onClick={() => void handleRemoveServer(s)}
                  className="text-md-error hover:opacity-75"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
      </Card>
    </div>
  );

  const renderStaffProfilesSection = (showPasswordRotation: boolean) => (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-md-on-surface">
              Add Manager or Cashier profile
            </h2>
            <p className="text-xs text-md-on-surface-variant mt-0.5">
              Super Admin control: add or remove Manager, Cashier, or Admin workspace profiles.
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
              label="Hierarchy role"
              value={newProfileRole}
              onChange={(v) => setNewProfileRole(v as UserRole)}
              options={[
                { value: "CASHIER", label: "CASHIER (POS Only)" },
                { value: "MANAGER", label: "MANAGER (Floor Ops)" },
                { value: "ADMIN", label: "ADMIN (Super Admin)" },
              ]}
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
            <OutlinedTextField
              label={newProfileRole === "ADMIN" ? "Username" : "Username (optional)"}
              mono
              required={newProfileRole === "ADMIN"}
              placeholder="Auto-filled from name if blank"
              value={newProfileUsername}
              onChange={setNewProfileUsername}
            />
            <OutlinedTextField
              label="Job title (optional)"
              placeholder="e.g. Evening Cashier"
              value={newProfileTitle}
              onChange={setNewProfileTitle}
            />
            <OutlinedTextField
              label={newProfileRole === "ADMIN" ? "Work email" : "Work email (optional)"}
              type="email"
              required={newProfileRole === "ADMIN"}
              placeholder="name@stacklyra.com"
              value={newProfileEmail}
              onChange={setNewProfileEmail}
            />
          </div>
          <Button
            type="submit"
            variant="filled"
            disabled={savingProfile}
            icon={<Plus className="w-4 h-4" strokeWidth={1.8} />}
          >
            {savingProfile ? "Saving profile…" : `Add ${newProfileRole.toLowerCase()} profile`}
          </Button>
        </form>
      </Card>

      {showPasswordRotation && (
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
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {users.map((u) => {
          const isSelf = u.id === currentUser.id;
          const adminCount = users.filter((x) => x.role === "ADMIN").length;
          const cannotRemove = isSelf || (u.role === "ADMIN" && adminCount <= 1);
          const isPasswordProfile = u.role === "ADMIN" || u.authType === "PASSWORD";
          return (
            <Card key={u.id} className="space-y-3 flex flex-col justify-between">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <StatusChip
                    label={u.role === "ADMIN" ? "OWNER / SUPER ADMIN" : u.role}
                    variant={
                      u.role === "ADMIN"
                        ? "primary"
                        : u.role === "MANAGER"
                        ? "success"
                        : "neutral"
                    }
                  />
                  <span className="font-mono text-xs text-md-on-surface-variant">
                    {isPasswordProfile ? "Password" : `PIN: ${u.pin || "****"}`}
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
                    ? "POS, Discounts & Menu/Stock edits (No Ledger or Deletes)"
                    : "POS Terminal & Read-only Catalog (No Ledger or Deletes)"}
                </div>
              </div>

              <div className="pt-2 border-t border-md-divider flex items-center justify-between">
                <span className="text-[11px] text-md-on-surface-variant">
                  {isSelf ? "Current signed-in user" : "Workspace profile"}
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
  );

  return (
    <div className="min-h-screen flex bg-md-surface text-md-on-surface">
      {/* =================================================================== */}
      {/* 1. MATERIAL 3 NAVIGATION DRAWER (≥1024px: 264px, 600-1023px: 80px)  */}
      {/* =================================================================== */}
      <aside className="hidden sm:flex flex-col justify-between shrink-0 sticky top-0 h-screen z-30 bg-md-surface-container-low border-r border-md-divider w-20 lg:w-[264px] p-3">
        <div className="space-y-4 overflow-y-auto">
          {/* Brand Row */}
          <div className="flex items-center gap-3 px-2 py-2">
            <StackLyraLogo size={40} className="shrink-0" />
            <div className="hidden lg:block min-w-0">
              <div className="font-medium text-base text-md-on-surface truncate leading-tight">
                {ERP_BRAND_CONFIG.productName}
              </div>
              <div className="text-xs text-md-on-surface-variant truncate">
                {tenant?.name || ERP_BRAND_CONFIG.workspaceSubtitle} ·{" "}
                {ERP_VERSION_TAG}
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
                  <StackLyraLogo size={40} className="shrink-0" />
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
            {(!isOnline || syncQueue.length > 0) && (
              <button
                type="button"
                onClick={() => void flushSyncQueue()}
                title="Click to sync pending offline changes"
                className={`px-2.5 py-1 rounded-full text-xs font-medium border flex items-center gap-1.5 transition ${
                  !isOnline
                    ? "bg-md-error-container text-md-on-error-container border-md-error/30"
                    : "bg-md-warning-container text-md-on-warning-container border-md-outline-variant"
                }`}
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${syncingQueue ? "animate-spin" : ""}`}
                />
                <span>
                  {!isOnline
                    ? `Offline${syncQueue.length > 0 ? ` (${syncQueue.length})` : ""}`
                    : syncingQueue
                    ? "Syncing…"
                    : `Sync ${syncQueue.length} queued`}
                </span>
              </button>
            )}
            <ThemeToggle />

            <Button
              variant="icon"
              aria-label="About StackLyra ERP and shortcuts"
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
              ordersSummary={summary?.orders}
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
                  {filteredProducts.length === 0 ? (
                    <Card className="flex flex-col items-center justify-center py-6 gap-3">
                      <EmptyState
                        title="No menu items available"
                        subtitle={
                          products.length === 0
                            ? "Add restaurant dishes in Menu & Material Stock to start billing."
                            : "No dishes match your active search or category filter."
                        }
                      />
                      {products.length === 0 && canManageInventory && (
                        <Button
                          variant="filled"
                          onClick={() => {
                            setInventoryTab("MENU");
                            setActiveNav("inventory");
                          }}
                        >
                          Add menu dishes
                        </Button>
                      )}
                    </Card>
                  ) : (
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
                  )}
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
                    <div className="space-y-2.5 pt-1">
                      <div className="grid grid-cols-2 gap-3">
                        <OutlinedTextField
                          label="Table"
                          value={tableNumber}
                          onChange={setTableNumber}
                          options={
                            restaurantTables.length > 0
                              ? restaurantTables.map((t) => ({
                                  value: t,
                                  label: t,
                                }))
                              : [{ value: "", label: "No tables added" }]
                          }
                        />
                        <OutlinedTextField
                          label="Server"
                          value={waiterName}
                          onChange={setWaiterName}
                          options={
                            servers.length > 0
                              ? servers.map((w) => ({ value: w, label: w }))
                              : [{ value: "", label: "No servers added" }]
                          }
                        />
                      </div>

                      {canManageInventory && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-md-on-surface-variant">
                            {restaurantTables.length} tables · {servers.length} servers
                          </span>
                          <button
                            type="button"
                            onClick={() => setManageFloorOpen((prev) => !prev)}
                            className="font-medium text-md-primary hover:underline"
                          >
                            {manageFloorOpen ? "Done editing" : "+ Manage tables & servers"}
                          </button>
                        </div>
                      )}

                      {manageFloorOpen && canManageInventory && (
                        <div className="p-3 rounded-xl bg-md-surface-container-low space-y-3 text-xs">
                          <div className="space-y-1.5">
                            <div className="font-medium text-md-on-surface">
                              Tables
                            </div>
                            <div className="flex gap-1.5">
                              <CompactField
                                value={newTableInput}
                                onChange={setNewTableInput}
                                placeholder="e.g. Table 1 or VIP-2"
                                className="flex-1"
                              />
                              <Button
                                type="button"
                                variant="tonal"
                                size="sm"
                                onClick={() => void handleAddTable()}
                              >
                                Add
                              </Button>
                            </div>
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {restaurantTables.map((t) => (
                                <span
                                  key={t}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-md-surface-container-lowest border border-md-outline-variant text-md-on-surface"
                                >
                                  <span>{t}</span>
                                  <button
                                    type="button"
                                    aria-label={`Remove table ${t}`}
                                    onClick={() => void handleRemoveTable(t)}
                                    className="text-md-error hover:opacity-75"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-1.5 pt-2 border-t border-md-divider">
                            <div className="font-medium text-md-on-surface">
                              Servers
                            </div>
                            <div className="flex gap-1.5">
                              <CompactField
                                value={newServerInput}
                                onChange={setNewServerInput}
                                placeholder="e.g. Ahmed Ali"
                                className="flex-1"
                              />
                              <Button
                                type="button"
                                variant="tonal"
                                size="sm"
                                onClick={() => void handleAddServer()}
                              >
                                Add
                              </Button>
                            </div>
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {servers.map((s) => (
                                <span
                                  key={s}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-md-surface-container-lowest border border-md-outline-variant text-md-on-surface"
                                >
                                  <span>{s}</span>
                                  <button
                                    type="button"
                                    aria-label={`Remove server ${s}`}
                                    onClick={() => void handleRemoveServer(s)}
                                    className="text-md-error hover:opacity-75"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
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
                        Cash ({praConfig.cashTaxRate}%): PKR{" "}
                        {cashComparison.grandTotal.toLocaleString()}
                      </span>
                      <span>
                        Card ({praConfig.cardTaxRate}%): PKR{" "}
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
                {orders.length === 0 ? (
                  <div className="p-6">
                    <EmptyState
                      title="No sales orders yet"
                      subtitle="Complete a sale in POS Terminal to see orders, tax breakdowns, and PRA receipts here."
                    />
                  </div>
                ) : (
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
                )}
                {renderLoadMore("orders", orders.length, totalOrderCount)}
              </Card>
            </div>
          )}

          {/* =============================================================== */}
          {/* SEPARATED RESTAURANT MENU & MATERIAL STOCK                      */}
          {/* =============================================================== */}
          {activeNav === "inventory" && (
            <div className="space-y-6">
              <PageHeader
                title={
                  inventoryTab === "MENU"
                    ? "Restaurant menu"
                    : "Material stock"
                }
                subtitle={
                  inventoryTab === "MENU"
                    ? "Add dishes, categories, prices, and photos (no stock tracking required)"
                    : "Track raw materials, ingredients, supplies, and reorder thresholds"
                }
                actions={
                  <SegmentedButton
                    value={inventoryTab}
                    onChange={(tab) => setInventoryTab(tab)}
                    options={[
                      { value: "MENU", label: `Menu (${products.length})` },
                      {
                        value: "STOCK",
                        label: `Material Stock (${stockMonitor.length})`,
                      },
                    ]}
                  />
                }
              />

              {inventoryTab === "MENU" ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {canManageInventory && (
                    <Card className="lg:col-span-4 space-y-4 h-fit">
                      <div className="flex items-center justify-between">
                        <h2 className="text-base font-semibold text-md-on-surface">
                          {editingProductId
                            ? `Edit dish (#${newProdCode})`
                            : "New menu dish"}
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
                          label="Dish name"
                          required
                          placeholder="e.g. Chicken Karahi"
                          value={newProdName}
                          onChange={setNewProdName}
                        />

                        <OutlinedTextField
                          label="Category"
                          placeholder="e.g. Karahi & Handi, BBQ, Drinks"
                          value={newProdCategory}
                          onChange={setNewProdCategory}
                        />

                        <div className="grid grid-cols-2 gap-3">
                          <OutlinedTextField
                            label="SKU / Code"
                            mono
                            placeholder="101"
                            value={newProdCode}
                            onChange={setNewProdCode}
                          />
                          <OutlinedTextField
                            label="Price (PKR)"
                            type="number"
                            required
                            value={newProdPrice}
                            onChange={setNewProdPrice}
                          />
                        </div>

                        <div className="p-3.5 rounded-xl bg-md-surface-container-low space-y-2.5">
                          <label className="text-xs font-medium text-md-on-surface-variant block">
                            Dish photo (file or URL)
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
                          {editingProductId ? "Save changes" : "Add to menu"}
                        </Button>
                      </form>
                    </Card>
                  )}

                  <Card
                    className={`${
                      canManageInventory ? "lg:col-span-8" : "lg:col-span-12"
                    } p-0! overflow-hidden`}
                  >
                    {products.length === 0 ? (
                      <div className="p-6">
                        <EmptyState
                          title="No menu items yet"
                          subtitle="Add your restaurant dishes on the left to make them available in POS Terminal."
                        />
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-md-divider bg-md-surface-container-low/60 text-xs font-medium text-md-on-surface-variant">
                              <th className="py-3.5 px-4">Photo</th>
                              <th className="py-3.5 px-3">Code</th>
                              <th className="py-3.5 px-3">Dish &amp; Category</th>
                              <th className="py-3.5 px-3">Kitchen</th>
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
                                    label={p.kitchenStation}
                                    variant="primary"
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
                    )}
                  </Card>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {canManageInventory && (
                    <Card className="lg:col-span-4 space-y-4 h-fit">
                      <div className="flex items-center justify-between">
                        <h2 className="text-base font-semibold text-md-on-surface">
                          {editingStockId ? "Edit material stock" : "Add raw material"}
                        </h2>
                        {editingStockId && (
                          <Button
                            variant="text"
                            size="sm"
                            onClick={() => {
                              setEditingStockId(null);
                              setNewStockName("");
                              setNewStockSku("");
                              setNewStockQty("0");
                              setNewStockTarget("25");
                              setNewStockUnit("Kg");
                            }}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>

                      <form onSubmit={handleSaveStockItem} className="space-y-4">
                        <OutlinedTextField
                          label="Material name"
                          required
                          placeholder="e.g. Basmati Rice, Cooking Oil"
                          value={newStockName}
                          onChange={setNewStockName}
                        />
                        <div className="grid grid-cols-2 gap-3">
                          <OutlinedTextField
                            label="SKU / Code"
                            mono
                            placeholder="MAT-01"
                            value={newStockSku}
                            onChange={setNewStockSku}
                          />
                          <OutlinedTextField
                            label="Unit"
                            placeholder="Kg, Ltr, Tins"
                            value={newStockUnit}
                            onChange={setNewStockUnit}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <OutlinedTextField
                            label="Current qty"
                            type="number"
                            required
                            value={newStockQty}
                            onChange={setNewStockQty}
                          />
                          <OutlinedTextField
                            label="Reorder target"
                            type="number"
                            required
                            value={newStockTarget}
                            onChange={setNewStockTarget}
                          />
                        </div>
                        <Button type="submit" variant="filled" className="w-full">
                          {editingStockId ? "Save material" : "Add material"}
                        </Button>
                      </form>
                    </Card>
                  )}

                  <Card
                    className={`${
                      canManageInventory ? "lg:col-span-8" : "lg:col-span-12"
                    } p-0! overflow-hidden`}
                  >
                    {stockMonitor.length === 0 ? (
                      <div className="p-6">
                        <EmptyState
                          title="No material stock entries yet"
                          subtitle="Add raw kitchen ingredients or supply items on the left to track inventory."
                        />
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-md-divider bg-md-surface-container-low/60 text-xs font-medium text-md-on-surface-variant">
                              <th className="py-3.5 px-4">SKU</th>
                              <th className="py-3.5 px-3">Material</th>
                              <th className="py-3.5 px-3">Level</th>
                              <th className="py-3.5 px-3 text-right">Qty on Hand</th>
                              <th className="py-3.5 px-4 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-md-divider">
                            {stockMonitor.map((stk) => {
                              const pct = stk.reorderTarget > 0
                                ? Math.round((stk.currentQty / stk.reorderTarget) * 100)
                                : 0;
                              return (
                                <tr
                                  key={stk.id}
                                  className="hover:bg-md-surface-container-low transition"
                                >
                                  <td className="py-3.5 px-4 font-mono text-xs text-md-primary font-medium">
                                    {stk.sku}
                                  </td>
                                  <td className="py-3.5 px-3 font-medium text-md-on-surface">
                                    {stk.name}
                                  </td>
                                  <td className="py-3.5 px-3 w-44">
                                    <div className="space-y-1">
                                      <ProgressBar
                                        value={stk.currentQty}
                                        max={stk.reorderTarget}
                                      />
                                      <div className="text-[11px] font-mono text-md-on-surface-variant">
                                        {pct}% of {stk.reorderTarget} {stk.unit}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-3.5 px-3 text-right font-mono tabular-nums">
                                    {stk.currentQty} {stk.unit}
                                  </td>
                                  <td className="py-3.5 px-4 text-right">
                                    <div className="inline-flex items-center gap-1">
                                      {canManageInventory && (
                                        <>
                                          <Button
                                            variant="tonal"
                                            size="sm"
                                            onClick={() =>
                                              void handleAdjustStockQty(stk.id, -1)
                                            }
                                            className="px-2.5!"
                                          >
                                            -1
                                          </Button>
                                          <Button
                                            variant="tonal"
                                            size="sm"
                                            onClick={() =>
                                              void handleAdjustStockQty(stk.id, 1)
                                            }
                                            className="px-2.5!"
                                          >
                                            +1
                                          </Button>
                                          <Button
                                            variant="icon"
                                            aria-label="Edit material"
                                            onClick={() => {
                                              setEditingStockId(stk.id);
                                              setNewStockName(stk.name);
                                              setNewStockSku(stk.sku);
                                              setNewStockQty(String(stk.currentQty));
                                              setNewStockTarget(
                                                String(stk.reorderTarget)
                                              );
                                              setNewStockUnit(stk.unit);
                                            }}
                                            className="w-9! h-9!"
                                          >
                                            <Pencil className="w-4 h-4" strokeWidth={1.8} />
                                          </Button>
                                        </>
                                      )}
                                      {canArchiveInventory && (
                                        <Button
                                          variant="icon"
                                          aria-label="Remove material"
                                          onClick={() =>
                                            void handleDeleteStockItem(
                                              stk.id,
                                              stk.name
                                            )
                                          }
                                          className="w-9! h-9!"
                                        >
                                          <Trash2 className="w-4 h-4" strokeWidth={1.8} />
                                        </Button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Card>
                </div>
              )}
            </div>
          )}

          {/* =============================================================== */}
          {/* PEOPLE, STAFF PROFILES & FLOOR OPS (TABLES & SERVERS)           */}
          {/* =============================================================== */}
          {activeNav === "hr" && (
            <div className="space-y-6">
              <PageHeader
                title="People, staff & floor team"
                subtitle="Add or remove Manager/Cashier PIN profiles, dining tables, and floor servers"
              />

              {canManageUsers && renderStaffProfilesSection(false)}

              {canManageInventory && renderFloorOpsSection()}
            </div>
          )}

          {/* =============================================================== */}
          {/* ACCOUNTING & DOUBLE-ENTRY KHATA LEDGER (SUPER ADMIN ONLY)       */}
          {/* =============================================================== */}
          {(activeNav === "accounting" || activeNav === "purchasing") &&
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
                    {totalLedgerCount.toLocaleString()} entries
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
                                {entry.isReversed ? (
                                  <StatusChip
                                    label={`Reversed${entry.reversedByVoucherNo ? ` · ${entry.reversedByVoucherNo}` : ""}`}
                                    variant="neutral"
                                  />
                                ) : entry.paymentMode === "REVERSAL_NOTE" || entry.reversesEntryId ? (
                                  <StatusChip label="Reversal" variant="neutral" />
                                ) : (
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
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {renderLoadMore("ledger", ledger.length, totalLedgerCount)}
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
                subtitle={`Shift drawer reconciliation, fiscal period locking, and Cash (${praConfig.cashTaxRate}%) vs Card (${praConfig.cardTaxRate}%) tax calculator`}
              />

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Cashier Shift Reconciliation */}
                <Card className="lg:col-span-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold text-md-on-surface">
                      Cashier shift &amp; drawer reconciliation
                    </h2>
                    <StatusChip
                      label={cashierShifts[0] ? `Shift ${cashierShifts[0].status}` : "No Shift Open"}
                      variant={cashierShifts[0] ? "success" : "neutral"}
                    />
                  </div>

                  {cashierShifts[0] ? (
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
                  ) : (
                    <form onSubmit={handleOpenShift} className="space-y-4">
                      <p className="text-xs text-md-on-surface-variant">
                        No cashier register shift is open yet. Enter an opening cash drawer float to track register sales and Z-closing variance.
                      </p>
                      <div className="flex items-end gap-3">
                        <div className="flex-1">
                          <OutlinedTextField
                            label="Opening float (PKR)"
                            type="number"
                            value={openingFloatInput}
                            onChange={setOpeningFloatInput}
                          />
                        </div>
                        <Button type="submit" variant="filled" size="lg">
                          Open shift
                        </Button>
                      </div>
                    </form>
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

                {/* Fiscal Period Lock Management (Super Admin) */}
                {canViewLedger && (
                  <Card className="lg:col-span-12 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-base font-semibold text-md-on-surface">
                          Fiscal period locks
                        </h2>
                        <p className="text-xs text-md-on-surface-variant mt-0.5">
                          Locking a fiscal month blocks backdated POS bills, vouchers, and reversals in that period.
                        </p>
                      </div>
                      <StatusChip label={`${fiscalPeriods.length} periods`} variant="primary" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {fiscalPeriods.map((fp) => (
                        <div
                          key={fp.periodKey}
                          className="p-3.5 rounded-xl bg-md-surface-container-low flex items-center justify-between gap-3"
                        >
                          <div>
                            <div className="text-sm font-medium text-md-on-surface">
                              {fp.label}
                            </div>
                            <div className="text-xs font-mono text-md-on-surface-variant">
                              {fp.periodKey} · {fp.isLocked ? `Locked by ${fp.lockedBy || "Admin"}` : "Open for postings"}
                            </div>
                          </div>
                          <Button
                            variant={fp.isLocked ? "tonal" : "outlined"}
                            size="sm"
                            onClick={() => void handleToggleFiscalPeriod(fp.periodKey)}
                          >
                            {fp.isLocked ? "Unlock period" : "Lock period"}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* SETTINGS, SAAS BILLING, PRA e-IMS, JWT, POSTGRES & AUDIT LOG    */}
          {/* =============================================================== */}
          {activeNav === "settings" && (
            <div className="space-y-6 max-w-5xl">
              <PageHeader
                title="Settings, SaaS billing & PRA configuration"
                subtitle="Manage your organization subscription plan, Supabase PostgreSQL connection, Punjab Revenue Authority e-IMS, and audit logs"
              />

              <div className="flex flex-wrap gap-2">
                {(
                  [
                    {
                      id: "SAAS_SUBSCRIPTION",
                      label: "SaaS Plan & Billing",
                      visible: true,
                    },
                    {
                      id: "PRA_INTEGRATION",
                      label: "PRA e-IMS",
                      visible: canManagePra,
                    },
                    {
                      id: "TAX_RULES",
                      label: "Tax rules",
                      visible: canManagePra,
                    },
                    {
                      id: "MONGODB_DATABASE",
                      label: "PostgreSQL & Drizzle",
                      visible: canManagePra,
                    },
                    {
                      id: "RESTAURANT_PROFILES",
                      label: "Staff roles & profiles",
                      visible: canManageUsers,
                    },
                    {
                      id: "ERP_AUDIT_COMPLIANCE",
                      label: "Audit trail",
                      visible: canViewLedger,
                    },
                    {
                      id: "SESSION_JWT_MANAGER",
                      label: "JWT session",
                      visible: true,
                    },
                    {
                      id: "APPEARANCE",
                      label: "Appearance",
                      visible: true,
                    },
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

              {settingsSubTab === "SAAS_SUBSCRIPTION" && (
                <div className="space-y-6">
                  <Card className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <h2 className="text-base font-semibold text-md-on-surface">
                            {tenant?.name || "StackLyra Workspace"}
                          </h2>
                          <StatusChip
                            label={`Plan: ${(
                              tenant?.planId || "enterprise"
                            ).toUpperCase()}`}
                            variant="primary"
                          />
                          <StatusChip
                            label={tenant?.status || "ACTIVE"}
                            variant={
                              tenant?.status === "SUSPENDED"
                                ? "error"
                                : tenant?.status === "PAST_DUE"
                                ? "warning"
                                : "success"
                            }
                          />
                        </div>
                        <p className="text-xs text-md-on-surface-variant font-mono mt-1">
                          Workspace Slug: {tenant?.slug || "stacklyra"} · Tenant
                          ID: {tenant?.id || "ten-stacklyra"} · Invoice Prefix:{" "}
                          {tenant?.invoicePrefix || "SL"}
                        </p>
                      </div>
                      <div className="text-right text-xs text-md-on-surface-variant">
                        <div>Primary Domain: erp.stacklyra.com</div>
                        <div>Marketing &amp; Checkout: stacklyra.com</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="p-4 rounded-2xl bg-md-surface-container-low space-y-1.5">
                        <div className="text-xs text-md-on-surface-variant">
                          Staff seat quota
                        </div>
                        <div className="text-base font-mono font-semibold text-md-on-surface">
                          {users.length} /{" "}
                          {(tenant?.subscription?.maxSeats || 9999) > 500
                            ? "Unlimited"
                            : tenant?.subscription?.maxSeats}
                        </div>
                        <ProgressBar
                          value={users.length}
                          max={Math.min(
                            tenant?.subscription?.maxSeats || 15,
                            100
                          )}
                        />
                      </div>

                      <div className="p-4 rounded-2xl bg-md-surface-container-low space-y-1.5">
                        <div className="text-xs text-md-on-surface-variant">
                          Catalog items quota
                        </div>
                        <div className="text-base font-mono font-semibold text-md-on-surface">
                          {products.length} /{" "}
                          {(tenant?.subscription?.maxProducts || 99999) > 5000
                            ? "Unlimited"
                            : tenant?.subscription?.maxProducts}
                        </div>
                        <ProgressBar
                          value={products.length}
                          max={Math.min(
                            tenant?.subscription?.maxProducts || 150,
                            500
                          )}
                        />
                      </div>

                      <div className="p-4 rounded-2xl bg-md-surface-container-low space-y-1.5">
                        <div className="text-xs text-md-on-surface-variant">
                          Current billing period end
                        </div>
                        <div className="text-sm font-mono font-medium text-md-on-surface">
                          {tenant?.subscription?.currentPeriodEnd
                            ? new Date(
                                tenant.subscription.currentPeriodEnd
                              ).toLocaleDateString()
                            : "Active Annual"}
                        </div>
                        <div className="text-[11px] text-md-on-surface-variant">
                          Webhook endpoint: /api/saas/webhooks/billing
                        </div>
                      </div>
                    </div>

                    {isSuperAdmin && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                        {Object.values(SAAS_PLANS).map((plan) => {
                          const isCurrent = tenant?.planId === plan.planId;
                          return (
                            <div
                              key={plan.planId}
                              className={`p-4 rounded-2xl flex flex-col justify-between gap-3 ${
                                isCurrent
                                  ? "bg-md-primary-container/45 ring-2 ring-md-primary"
                                  : "bg-md-surface-container-low"
                              }`}
                            >
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold text-sm text-md-on-surface">
                                    {plan.name}
                                  </span>
                                  <span className="font-mono text-xs text-md-primary font-semibold">
                                    PKR {plan.monthlyPricePkr.toLocaleString()}/mo
                                  </span>
                                </div>
                                <p className="text-xs text-md-on-surface-variant">
                                  {plan.tagline}
                                </p>
                                <div className="text-[11px] font-mono text-md-on-surface-variant pt-1">
                                  Seats:{" "}
                                  {plan.maxSeats > 500
                                    ? "Unlimited"
                                    : plan.maxSeats}{" "}
                                  · Items:{" "}
                                  {plan.maxProducts > 5000
                                    ? "Unlimited"
                                    : plan.maxProducts}
                                </div>
                              </div>
                              <Button
                                variant={isCurrent ? "tonal" : "filled"}
                                size="sm"
                                disabled={isCurrent}
                                onClick={() =>
                                  void handleUpdateSubscriptionPlan(plan.planId)
                                }
                              >
                                {isCurrent
                                  ? "Current Active Plan"
                                  : `Switch to ${plan.name}`}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Card>

                  {(currentUser.isPlatformAdmin ||
                    tenant?.id === "ten-stacklyra") &&
                    platformTenants.length > 0 && (
                      <Card className="p-0! overflow-hidden">
                        <div className="p-4 border-b border-md-divider flex items-center justify-between">
                          <div>
                            <h3 className="text-base font-semibold text-md-on-surface">
                              StackLyra Platform Super-Admin Control Plane (
                              {platformTenants.length} organizations)
                            </h3>
                            <p className="text-xs text-md-on-surface-variant">
                              Manage all SaaS tenants, upgrade plans, or toggle
                              read-only suspension across erp.stacklyra.com
                            </p>
                          </div>
                          <StatusChip
                            label="Platform Owner (Saad)"
                            variant="primary"
                          />
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-sm">
                            <thead>
                              <tr className="border-b border-md-divider bg-md-surface-container-low/60 text-xs font-medium text-md-on-surface-variant">
                                <th className="py-3 px-4">Organization</th>
                                <th className="py-3 px-3">Slug / Prefix</th>
                                <th className="py-3 px-3">Owner</th>
                                <th className="py-3 px-3">Plan</th>
                                <th className="py-3 px-3">Status</th>
                                <th className="py-3 px-4 text-right">
                                  Platform Actions
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-md-divider">
                              {platformTenants.map((pt) => (
                                <tr key={pt.id}>
                                  <td className="py-3 px-4 font-medium text-md-on-surface">
                                    {pt.name}
                                  </td>
                                  <td className="py-3 px-3 font-mono text-xs text-md-primary">
                                    {pt.slug} ({pt.invoicePrefix})
                                  </td>
                                  <td className="py-3 px-3 text-xs text-md-on-surface-variant">
                                    {pt.ownerEmail}
                                  </td>
                                  <td className="py-3 px-3">
                                    <StatusChip
                                      label={pt.planId.toUpperCase()}
                                      variant="primary"
                                    />
                                  </td>
                                  <td className="py-3 px-3">
                                    <StatusChip
                                      label={pt.status}
                                      variant={
                                        pt.status === "SUSPENDED"
                                          ? "error"
                                          : "success"
                                      }
                                    />
                                  </td>
                                  <td className="py-3 px-4 text-right">
                                    <div className="inline-flex items-center gap-1.5">
                                      <Button
                                        variant="tonal"
                                        size="sm"
                                        onClick={() =>
                                          void handleUpdateSubscriptionPlan(
                                            pt.planId === "starter"
                                              ? "growth"
                                              : pt.planId === "growth"
                                              ? "enterprise"
                                              : "starter",
                                            pt.id,
                                            "ACTIVE"
                                          )
                                        }
                                      >
                                        Cycle Plan
                                      </Button>
                                      {pt.id !== "ten-stacklyra" && (
                                        <Button
                                          variant="outlined"
                                          size="sm"
                                          onClick={() =>
                                            void handleUpdateSubscriptionPlan(
                                              pt.planId,
                                              pt.id,
                                              pt.status === "SUSPENDED"
                                                ? "ACTIVE"
                                                : "SUSPENDED"
                                            )
                                          }
                                        >
                                          {pt.status === "SUSPENDED"
                                            ? "Activate"
                                            : "Suspend"}
                                        </Button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </Card>
                    )}
                </div>
              )}

              {settingsSubTab === "PRA_INTEGRATION" && canManagePra && (
                <Card className="space-y-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold text-md-on-surface">
                      Punjab Revenue Authority (PRA) e-IMS fiscal parameters
                    </h2>
                    <StatusChip
                      label={
                        praConfig.praLiveMode && praConfig.posId && praConfig.apiToken
                          ? "Live e-IMS Configured"
                          : "Local Fiscal / Sandbox"
                      }
                      variant={
                        praConfig.praLiveMode && praConfig.posId && praConfig.apiToken
                          ? "success"
                          : "warning"
                      }
                    />
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
                        Active HS256 JWT session
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
                      Supabase PostgreSQL &amp; Drizzle ORM configuration
                    </h2>
                    <StatusChip
                      label={
                        mongoConfig.dbName ||
                        "postgres (Supabase Transaction Pooler :6543)"
                      }
                      variant={mongoConfig.enabled ? "success" : "primary"}
                    />
                  </div>
                  <div className="p-3.5 rounded-xl bg-md-surface-container-low text-xs text-md-on-surface-variant space-y-1">
                    <div>{mongoConfig.lastStatus}</div>
                    <div className="text-[11px] opacity-80">
                      Multi-tenant isolation is enforced via composite{" "}
                      <code className="font-mono">(tenant_id, id)</code> keys
                      and transaction-scoped{" "}
                      <code className="font-mono">
                        SET LOCAL app.current_tenant
                      </code>{" "}
                      in Supabase PostgreSQL.
                    </div>
                  </div>
                  <form onSubmit={handleSaveMongoConfig} className="space-y-4">
                    <div className="grid grid-cols-1 gap-4">
                      <OutlinedTextField
                        label="Supabase PostgreSQL Connection URI (DATABASE_URL)"
                        mono
                        value={mongoConfig.uri}
                        onChange={(v) =>
                          setMongoConfig({ ...mongoConfig, uri: v })
                        }
                      />
                    </div>
                    <Button type="submit" variant="filled">
                      Test &amp; save Supabase PostgreSQL connection
                    </Button>
                  </form>
                </Card>
              )}

              {settingsSubTab === "RESTAURANT_PROFILES" &&
                canManageUsers &&
                renderStaffProfilesSection(true)}

              {settingsSubTab === "ERP_AUDIT_COMPLIANCE" && canViewLedger && (
                <Card className="p-0! overflow-hidden">
                  <div className="p-4 border-b border-md-divider">
                    <h2 className="text-base font-semibold text-md-on-surface">
                      Immutable domain audit trail ({totalAuditCount.toLocaleString()}{" "}
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
                  {renderLoadMore("audit", immutableAuditLogs.length, totalAuditCount)}
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
