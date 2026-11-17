"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Barcode,
  BookOpen,
  Calculator,
  Camera,
  CheckCircle2,
  Database,
  Download,
  Flame,
  ImageIcon,
  KeyRound,
  LayoutGrid,
  LogOut,
  Package,
  Pencil,
  Printer,
  Receipt,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Trash2,
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
} from "@/lib/types";
import {
  INITIAL_LEDGER,
  INITIAL_ORDERS,
  INITIAL_PARTIES,
  INITIAL_PRA_CONFIG,
  INITIAL_PRODUCTS,
  INITIAL_USERS,
} from "@/lib/seed-data";
import { calculateSalesTax } from "@/lib/tax-calculator";
import { MONGOOSE_SCHEMA_REFERENCE } from "@/lib/mongodb";
import ReceiptModal from "@/components/ReceiptModal";
import DishVisual from "@/components/DishVisual";
import AuthScreen from "@/components/AuthScreen";

type SidebarSection =
  | "POS_TERMINAL"
  | "ORDERS_INVOICES"
  | "TAX_CALCULATOR"
  | "KHATA_LEDGER"
  | "MENU_INVENTORY"
  | "Z_REPORT"
  | "SETTINGS_PRA";

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

export default function AlbarkaModernPOS() {
  // Authentication & Single-Session State
  const [users, setUsers] = useState<UserProfile[]>(INITIAL_USERS);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [sessionAuditLogs, setSessionAuditLogs] = useState<SessionAuditLog[]>([]);
  const [authChecking, setAuthChecking] = useState<boolean>(true);

  // Navigation State
  const [activeSection, setActiveSection] = useState<SidebarSection>("POS_TERMINAL");
  const [settingsSubTab, setSettingsSubTab] = useState<
    | "PRA_INTEGRATION"
    | "TAX_RULES"
    | "SESSION_JWT_MANAGER"
    | "MONGODB_DATABASE"
    | "RESTAURANT_PROFILES"
    | "ERP_AUDIT_COMPLIANCE"
  >("PRA_INTEGRATION");

  // Persistent App Data State
  const [praConfig, setPraConfig] = useState<PRAConfig>(INITIAL_PRA_CONFIG);
  const [mongoConfig, setMongoConfig] = useState<MongoDBConfig>({
    enabled: false,
    uri: "mongodb://127.0.0.1:27017/albarka_pos",
    dbName: "albarka_pos",
    lastStatus: "Local JSON File Store Active (data/albarka-db.json) — MongoDB Ready",
  });
  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [orders, setOrders] = useState<Order[]>(INITIAL_ORDERS);
  const [parties, setParties] = useState<PartyAccount[]>(INITIAL_PARTIES);
  const [ledger, setLedger] = useState<LedgerEntry[]>(INITIAL_LEDGER);
  const [immutableAuditLogs, setImmutableAuditLogs] = useState<ImmutableAuditLog[]>([]);
  const [cashierShifts, setCashierShifts] = useState<CashierShift[]>([]);
  const [fiscalPeriods, setFiscalPeriods] = useState<FiscalPeriod[]>([]);
  const [countedCashInput, setCountedCashInput] = useState<string>("");
  const [savedBanner, setSavedBanner] = useState<string>("");

  // POS Filters & Search
  const [segmentFilter, setSegmentFilter] = useState<"ALL" | BusinessSegment>("ALL");
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
  const [selectedKhataId, setSelectedKhataId] = useState<string>(INITIAL_PARTIES[0].id);
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
  const [activeReceiptOrder, setActiveReceiptOrder] = useState<Order | null>(null);
  const [submittingOrder, setSubmittingOrder] = useState<boolean>(false);

  // Standalone Sales Tax Calculator state
  const [calcAmount, setCalcAmount] = useState<number>(5000);
  const [calcTaxMode, setCalcTaxMode] = useState<"EXCLUSIVE" | "INCLUSIVE">("EXCLUSIVE");
  const [calcDiscount, setCalcDiscount] = useState<number>(0);

  // Ledger / Khata Form State
  const [ledgerPartyFilter, setLedgerPartyFilter] = useState<"ALL" | PartyType>("ALL");
  const [selectedPartyId, setSelectedPartyId] = useState<string>(INITIAL_PARTIES[0].id);
  const [voucherType, setVoucherType] = useState<
    "CUSTOMER_RECEIPT" | "SUPPLIER_BILL" | "SUPPLIER_PAYMENT" | "EXPENSE_VOUCHER"
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

  // New / Edit Product Form (including Image Upload / URL)
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [newProdName, setNewProdName] = useState<string>("");
  const [newProdCode, setNewProdCode] = useState<string>("");
  const [newProdSegment, setNewProdSegment] = useState<BusinessSegment>("RESTAURANT");
  const [newProdCategory, setNewProdCategory] = useState<string>("Karahi & Handi");
  const [newProdPrice, setNewProdPrice] = useState<string>("");
  const [newProdStock, setNewProdStock] = useState<string>("100");
  const [newProdImageUrl, setNewProdImageUrl] = useState<string>("");

  // Load State + Verify JWT Cookie Session on Mount
  useEffect(() => {
    async function initApp() {
      try {
        const [stateRes, authRes] = await Promise.all([
          fetch("/api/state"),
          fetch("/api/auth"),
        ]);
        if (stateRes.ok) {
          const data = await stateRes.json();
          setPraConfig(data.praConfig);
          if (data.mongoConfig) setMongoConfig(data.mongoConfig);
          setProducts(data.products);
          setOrders(data.orders);
          setParties(data.parties);
          setLedger(data.ledger);
          if (data.users) setUsers(data.users);
          if (data.immutableAuditLogs) setImmutableAuditLogs(data.immutableAuditLogs);
          if (data.cashierShifts) setCashierShifts(data.cashierShifts);
          if (data.fiscalPeriods) setFiscalPeriods(data.fiscalPeriods);
        }
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
    setSavedBanner(msg);
    setTimeout(() => setSavedBanner(""), 4000);
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

  // Update Image for an Existing Product
  async function handleUpdateProductImage(productId: string, imageUrl: string) {
    // Optimistically update UI
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

  // Handle New Product Form Image File Selection
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
  }, [cart, paymentMethod, discountAmount, praConfig, includeServiceCharge, splitCashRatio]);

  const cashComparison = useMemo(
    () => calculateSalesTax(cart, "CASH", discountAmount, praConfig, includeServiceCharge),
    [cart, discountAmount, praConfig, includeServiceCharge]
  );
  const cardComparison = useMemo(
    () => calculateSalesTax(cart, "CARD", discountAmount, praConfig, includeServiceCharge),
    [cart, discountAmount, praConfig, includeServiceCharge]
  );

  function addToCart(product: Product, variant: ProductVariant) {
    setCart((prev) => {
      const existingIndex = prev.findIndex(
        (item) => item.productId === product.id && item.variantId === variant.id
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
      prev.map((item) => (item.cartItemId === cartItemId ? { ...item, notes } : item))
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
    } else if (paymentMethod === "CARD" || paymentMethod === "JAZZCASH_EASYPAISA") {
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
      idempotencyKey: `pos-sale-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      orderType,
      tableNumber: orderType === "DINE_IN" ? tableNumber : undefined,
      waiterName: orderType === "DINE_IN" ? waiterName : undefined,
      customerName:
        khataParty?.name || customerName || (orderType === "DINE_IN" ? tableNumber : "Walk-in"),
      customerPhone,
      buyerNtnCnic: khataParty?.ntnOrCnic || buyerNtnCnic,
      khataAccountId: paymentMethod === "KHATA_CREDIT" ? selectedKhataId : undefined,
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
        if (data.db.immutableAuditLogs) setImmutableAuditLogs(data.db.immutableAuditLogs);
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
      defaultDesc = "Daily Restaurant Galla Expense Voucher";
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
      notifySaved(`Deleted Khata account "${partyName}".`);
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
      if (data.db.immutableAuditLogs) setImmutableAuditLogs(data.db.immutableAuditLogs);
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
      if (data.db.immutableAuditLogs) setImmutableAuditLogs(data.db.immutableAuditLogs);
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
      if (data.db.immutableAuditLogs) setImmutableAuditLogs(data.db.immutableAuditLogs);
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
      if (data.immutableAuditLogs) setImmutableAuditLogs(data.immutableAuditLogs);
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
    if (res.ok) {
      const data = await res.json();
      setMongoConfig(data.mongoConfig);
      notifySaved(data.mongoConfig.lastStatus);
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
                  name: newProdSegment === "RETAIL" ? "Standard Pack" : "Full Portion",
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
    if (res.ok) {
      const data = await res.json();
      setProducts(data.products);
      if (editingProductId === productId) cancelEditingProduct();
      notifySaved(`Deleted "${productName}" from menu catalog.`);
    }
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
    return (
      <div className="min-h-screen bg-[#edf2f4] flex items-center justify-center text-[#2b2d42] font-semibold text-base">
        Verifying HS256 JWT Session Lock...
      </div>
    );
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
        }}
      />
    );
  }

  const totalSalesRevenue = orders.reduce((s, o) => s + o.taxBreakdown.grandTotal, 0);
  const totalPraTaxCollected = orders.reduce((s, o) => s + o.taxBreakdown.totalSalesTax, 0);
  const totalReceivables = parties
    .filter((p) => p.type === "CUSTOMER" && p.currentBalance > 0)
    .reduce((s, p) => s + p.currentBalance, 0);
  const totalPayables = parties
    .filter((p) => p.type === "SUPPLIER" && p.currentBalance < 0)
    .reduce((s, p) => s + Math.abs(p.currentBalance), 0);

  const sidebarNavItems: Array<{
    id: SidebarSection;
    label: string;
    subtitle: string;
    Icon: React.ComponentType<{ className?: string }>;
    badge?: string;
  }> = [
    {
      id: "POS_TERMINAL",
      label: "POS Terminal",
      subtitle: "Desi Dining & Retail",
      Icon: LayoutGrid,
      badge: `${cart.length}`,
    },
    {
      id: "ORDERS_INVOICES",
      label: "Orders & PRA Bills",
      subtitle: "Receipts, KOT & CSV",
      Icon: Receipt,
      badge: `${orders.length}`,
    },
    {
      id: "TAX_CALCULATOR",
      label: "Sales Tax Calculator",
      subtitle: "Cash 16% vs Card 5%",
      Icon: Calculator,
    },
    {
      id: "KHATA_LEDGER",
      label: "Khata & Ledger",
      subtitle: "Customers & Suppliers",
      Icon: BookOpen,
    },
    {
      id: "MENU_INVENTORY",
      label: "Menu & Inventory",
      subtitle: "Dishes, Photos & Stock",
      Icon: Package,
    },
    {
      id: "Z_REPORT",
      label: "Z-Report & Closing",
      subtitle: "Daily Cash & Analytics",
      Icon: BarChart3,
    },
    {
      id: "SETTINGS_PRA",
      label: "Settings & PRA",
      subtitle: "PRA, JWT & MongoDB",
      Icon: Settings,
    },
  ];

  return (
    <div className="min-h-screen flex bg-[#edf2f4] text-[#2b2d42]">
      {/* =================================================================== */}
      {/* LEFT SIDEBAR NAVIGATION (--space-indigo: #2b2d42)                   */}
      {/* =================================================================== */}
      <aside className="w-72 bg-[#2b2d42] text-white flex flex-col justify-between shrink-0 sticky top-0 h-screen z-30 border-r border-[#1e2030]">
        <div className="p-5 space-y-6 overflow-y-auto">
          {/* Brand Header */}
          <div className="flex items-center gap-3.5 pb-4 border-b border-white/15">
            <div className="w-11 h-11 rounded-xl bg-[#ef233c] text-white flex items-center justify-center font-bold text-lg shrink-0">
              AB
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base text-white tracking-tight">
                  Albarka POS
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-[#ef233c] text-white">
                  Hybrid
                </span>
              </div>
              <p className="text-xs text-[#cbd5e1] mt-0.5">Restaurant & Retail ERP</p>
            </div>
          </div>

          {/* Navigation Menu */}
          <div className="space-y-1.5">
            <div className="px-3 pb-1.5 text-xs font-semibold uppercase tracking-wider text-[#94a3b8]">
              POS & ERP Modules
            </div>
            {sidebarNavItems.map((item) => {
              const Icon = item.Icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-left transition ${
                    isActive
                      ? "bg-[#ef233c] text-white"
                      : "text-[#e2e8f0] hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                        isActive ? "bg-[#d80032] text-white" : "bg-white/10 text-white"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold leading-snug">{item.label}</div>
                      <div
                        className={`text-xs ${
                          isActive ? "text-white/90" : "text-[#cbd5e1]"
                        }`}
                      >
                        {item.subtitle}
                      </div>
                    </div>
                  </div>
                  {item.badge && (
                    <span
                      className={`text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full ${
                        isActive ? "bg-white text-[#d80032]" : "bg-white/15 text-white"
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* PRA Live Fiscal Status Card */}
          <div className="p-4 rounded-xl bg-white/8 border border-white/15 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#ef233c]" />
                PRA e-IMS Fiscal
              </span>
              <span className="w-2 h-2 rounded-full bg-[#ef233c]" />
            </div>
            <div className="text-xs text-[#cbd5e1] font-mono">
              POS ID: <strong className="text-white">{praConfig.posId}</strong>
            </div>
            <div className="flex items-center justify-between text-xs text-white pt-1.5 border-t border-white/15 font-medium">
              <span>Cash GST: {praConfig.cashTaxRate}%</span>
              <span>Card GST: {praConfig.cardTaxRate}%</span>
            </div>
          </div>
        </div>

        {/* Bottom Single-Active-Profile Session Card */}
        <div className="p-4 border-t border-white/15 bg-[#222436] space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl font-bold text-sm flex items-center justify-center text-white bg-[#ef233c] shrink-0">
              {currentUser.avatarInitials}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white truncate">
                {currentUser.name}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-[#ef233c] text-white">
                  {currentUser.role}
                </span>
                <span className="text-xs font-mono text-[#cbd5e1]">
                  {activeSession?.sessionId || "JWT-ACTIVE"}
                </span>
              </div>
            </div>
          </div>

          <div className="text-xs text-[#cbd5e1] flex items-center justify-between bg-white/8 px-3 py-1.5 rounded-lg">
            <span>Single-Profile Lock:</span>
            <span className="text-white font-semibold">1 Active Session</span>
          </div>

          <button
            onClick={handleLogoutSession}
            className="w-full py-2.5 rounded-xl bg-[#ef233c] hover:bg-[#d80032] text-white font-semibold text-xs flex items-center justify-center gap-2 transition"
          >
            <LogOut className="w-4 h-4" />
            End Session & Sign Out
          </button>
        </div>
      </aside>

      {/* =================================================================== */}
      {/* RIGHT MAIN WORKSPACE (--platinum: #edf2f4)                          */}
      {/* =================================================================== */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Workspace Header */}
        <header className="sticky top-0 z-20 bg-white border-b border-[#d4dce4] px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-bold text-[#2b2d42] tracking-tight">
              {sidebarNavItems.find((i) => i.id === activeSection)?.label}
            </h2>
            <span className="text-sm text-[#8d99ae]">•</span>
            <span className="text-sm font-medium text-[#4a4e69]">
              {praConfig.restaurantName}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {savedBanner && (
              <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#2b2d42] text-white text-xs font-semibold animate-panel">
                <CheckCircle2 className="w-4 h-4 text-[#ef233c]" />
                {savedBanner}
              </div>
            )}

            {/* Active JWT Session Indicator Button */}
            <button
              onClick={() => {
                setActiveSection("SETTINGS_PRA");
                setSettingsSubTab("SESSION_JWT_MANAGER");
              }}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#edf2f4] hover:bg-[#e2e8f0] border border-[#d4dce4] text-[#2b2d42] text-xs font-semibold transition"
            >
              <KeyRound className="w-4 h-4 text-[#ef233c]" />
              JWT: {activeSession?.sessionId || "Active"} ({currentUser.role})
            </button>

            <button
              onClick={() => {
                setActiveSection("SETTINGS_PRA");
                setSettingsSubTab("PRA_INTEGRATION");
              }}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#2b2d42] hover:bg-[#ef233c] text-white text-xs font-semibold transition"
            >
              <Settings className="w-4 h-4" />
              PRA Settings
            </button>
          </div>
        </header>

        {/* Main Content Body */}
        <main className="p-6 flex-1">
          {/* ================================================================= */}
          {/* SECTION 1: POS TERMINAL                                           */}
          {/* ================================================================= */}
          {activeSection === "POS_TERMINAL" && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
              {/* LEFT 8 COLS: VISUAL MENU CARDS & FILTERS */}
              <div className="xl:col-span-8 space-y-5">
                <div className="pos-card rounded-2xl p-4 space-y-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    {/* Segment Filter */}
                    <div className="flex items-center gap-1.5 bg-[#edf2f4] p-1 rounded-xl border border-[#d4dce4]">
                      <button
                        onClick={() => setSegmentFilter("ALL")}
                        className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
                          segmentFilter === "ALL"
                            ? "bg-[#2b2d42] text-white"
                            : "text-[#2b2d42] hover:bg-white"
                        }`}
                      >
                        All Hybrid ({products.length})
                      </button>
                      <button
                        onClick={() => setSegmentFilter("RESTAURANT")}
                        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
                          segmentFilter === "RESTAURANT"
                            ? "bg-[#ef233c] text-white"
                            : "text-[#2b2d42] hover:bg-white"
                        }`}
                      >
                        <Flame className="w-3.5 h-3.5" />
                        Desi Restaurant
                      </button>
                      <button
                        onClick={() => setSegmentFilter("RETAIL")}
                        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
                          segmentFilter === "RETAIL"
                            ? "bg-[#2b2d42] text-white"
                            : "text-[#2b2d42] hover:bg-white"
                        }`}
                      >
                        <ShoppingBag className="w-3.5 h-3.5" />
                        Retail & Sweets
                      </button>
                    </div>

                    {/* Barcode / Quick SKU Input */}
                    <form
                      onSubmit={handleBarcodeScan}
                      className="flex items-center gap-2 flex-1 max-w-sm"
                    >
                      <div className="relative flex-1">
                        <Barcode className="w-4 h-4 text-[#ef233c] absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={barcodeInput}
                          onChange={(e) => setBarcodeInput(e.target.value)}
                          placeholder="Scan barcode or SKU (101, 501)..."
                          className="w-full bg-[#f8fafc] border border-[#d4dce4] focus:border-[#2b2d42] focus:bg-white rounded-xl pl-10 pr-3 py-2 text-sm text-[#2b2d42] outline-none transition"
                        />
                      </div>
                      <button
                        type="submit"
                        className="px-4 py-2 rounded-xl bg-[#ef233c] hover:bg-[#d80032] text-white text-sm font-semibold transition"
                      >
                        Add
                      </button>
                    </form>
                  </div>

                  {/* Search + Category Pills */}
                  <div className="flex flex-wrap items-center gap-2.5 pt-1">
                    <div className="relative w-full sm:w-64">
                      <Search className="w-4 h-4 text-[#4a4e69] absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search Karahi, BBQ, Pulao, Halwa..."
                        className="w-full bg-[#f8fafc] border border-[#d4dce4] focus:border-[#2b2d42] focus:bg-white rounded-xl pl-9 pr-3 py-2 text-sm text-[#2b2d42] outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-2 overflow-x-auto pb-1">
                      {categories.map((cat) => (
                        <button
                          key={cat}
                          onClick={() => setCategoryFilter(cat)}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition border ${
                            categoryFilter === cat
                              ? "bg-[#ef233c] border-[#ef233c] text-white"
                              : "bg-[#f8fafc] border-[#d4dce4] text-[#2b2d42] hover:bg-white"
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Menu Cards Grid with Top Image Box & Rich Hover Effects */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredProducts.map((product) => (
                    <div
                      key={product.id}
                      onClick={() => {
                        if (product.variants.length > 0) {
                          addToCart(product, product.variants[0]);
                        }
                      }}
                      className="pos-menu-card group rounded-2xl p-4 flex flex-col justify-between cursor-pointer"
                    >
                      <div>
                        {/* Top Box: Menu Image or Clean Placeholder */}
                        <DishVisual
                          product={product}
                          canEditImage={currentUser.permissions.canManageMenuPricing}
                          onImageUpload={handleUpdateProductImage}
                        />
                        <div className="mt-3.5 px-0.5">
                          <div className="text-xs font-medium text-[#4a4e69] group-hover:text-[#ef233c] transition-colors duration-300">
                            {product.category}
                          </div>
                          <h3 className="font-semibold text-base text-[#2b2d42] group-hover:text-[#d80032] leading-snug mt-0.5 transition-colors duration-300">
                            {product.name}
                          </h3>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-[#e2e8f0] group-hover:border-[#ef233c]/20 grid grid-cols-1 gap-2 transition-colors duration-300">
                        {product.variants.map((variant) => (
                          <button
                            key={variant.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              addToCart(product, variant);
                            }}
                            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#f4f7f9] hover:bg-[#ef233c] active:scale-[0.98] text-[#2b2d42] hover:text-white border border-[#d4dce4] hover:border-[#ef233c] hover:shadow-md transition-all duration-250 text-sm font-semibold group/btn cursor-pointer"
                          >
                            <span>{variant.name}</span>
                            <span className="font-mono font-bold text-[#d80032] group-hover/btn:text-white transition-colors duration-200">
                              PKR {variant.price.toLocaleString()} +
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* RIGHT 4 COLS: BILLING TICKET & PRA TAX ENGINE */}
              <div className="xl:col-span-4 pos-card rounded-2xl p-5 space-y-4 sticky top-24">
                <div className="grid grid-cols-4 gap-1 bg-[#edf2f4] p-1 rounded-xl border border-[#d4dce4]">
                  {(
                    [
                      { id: "DINE_IN", label: "Dine-In" },
                      { id: "TAKEAWAY", label: "Takeaway" },
                      { id: "DELIVERY", label: "Delivery" },
                      { id: "RETAIL_COUNTER", label: "Retail" },
                    ] as const
                  ).map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => setOrderType(mode.id)}
                      className={`py-2 rounded-lg text-xs font-semibold transition ${
                        orderType === mode.id
                          ? "bg-[#2b2d42] text-white"
                          : "text-[#2b2d42] hover:bg-white"
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>

                {orderType === "DINE_IN" ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-[#4a4e69] block mb-1">
                        Dining Table
                      </label>
                      <select
                        value={tableNumber}
                        onChange={(e) => setTableNumber(e.target.value)}
                        className="w-full bg-[#f8fafc] border border-[#d4dce4] rounded-xl px-3 py-2 text-sm text-[#2b2d42] font-medium"
                      >
                        {RESTAURANT_TABLES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-[#4a4e69] block mb-1">
                        Waiter / Server
                      </label>
                      <select
                        value={waiterName}
                        onChange={(e) => setWaiterName(e.target.value)}
                        className="w-full bg-[#f8fafc] border border-[#d4dce4] rounded-xl px-3 py-2 text-sm text-[#2b2d42] font-medium"
                      >
                        {WAITERS.map((w) => (
                          <option key={w} value={w}>
                            {w}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Customer Name"
                      className="bg-[#f8fafc] border border-[#d4dce4] rounded-xl px-3 py-2 text-sm text-[#2b2d42]"
                    />
                    <input
                      type="text"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="Phone (0300-...)"
                      className="bg-[#f8fafc] border border-[#d4dce4] rounded-xl px-3 py-2 text-sm text-[#2b2d42]"
                    />
                  </div>
                )}

                {/* Cart Items */}
                <div className="border-t border-b border-[#d4dce4] py-3 max-h-68 overflow-y-auto space-y-2.5">
                  {cart.length === 0 ? (
                    <div className="text-center py-8 text-[#4a4e69] text-sm">
                      No items in bill. Tap any dish card or scan a retail barcode.
                    </div>
                  ) : (
                    cart.map((item) => (
                      <div
                        key={item.cartItemId}
                        className="bg-[#f8fafc] border border-[#d4dce4] rounded-xl p-3 text-sm space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-semibold text-[#2b2d42] leading-snug">
                              {item.name}{" "}
                              <span className="text-[#d80032] font-medium text-xs">
                                [{item.variantName}]
                              </span>
                            </div>
                            <div className="text-xs text-[#4a4e69] mt-0.5 font-mono">
                              PKR {item.unitPrice.toLocaleString()} × {item.quantity} •{" "}
                              {item.taxMode}
                            </div>
                          </div>
                          <div className="font-mono font-bold text-sm text-[#2b2d42]">
                            {(item.unitPrice * item.quantity).toLocaleString()}
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-1">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => updateQuantity(item.cartItemId, -1)}
                              className="w-7 h-7 rounded-lg bg-white border border-[#d4dce4] hover:bg-[#2b2d42] hover:text-white text-[#2b2d42] font-bold"
                            >
                              -
                            </button>
                            <span className="w-7 text-center font-mono font-semibold text-[#2b2d42]">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() => updateQuantity(item.cartItemId, 1)}
                              className="w-7 h-7 rounded-lg bg-white border border-[#d4dce4] hover:bg-[#2b2d42] hover:text-white text-[#2b2d42] font-bold"
                            >
                              +
                            </button>
                          </div>

                          {item.segment === "RESTAURANT" && (
                            <select
                              value={item.notes || ""}
                              onChange={(e) => updateItemNote(item.cartItemId, e.target.value)}
                              className="bg-white border border-[#d4dce4] rounded-lg px-2.5 py-1 text-xs text-[#2b2d42]"
                            >
                              <option value="">Chef Note...</option>
                              {QUICK_CHEF_NOTES.map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </select>
                          )}

                          <button
                            onClick={() => updateQuantity(item.cartItemId, -item.quantity)}
                            className="text-[#4a4e69] hover:text-[#d80032] p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Payment Mode Selector */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#2b2d42]">
                      Payment Mode (Dynamic PRA Tax)
                    </span>
                    <span className="text-xs font-semibold text-white bg-[#2b2d42] px-2.5 py-0.5 rounded-md">
                      Card {praConfig.cardTaxRate}% | Cash {praConfig.cashTaxRate}%
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => setPaymentMethod("CASH")}
                      className={`p-2.5 rounded-xl border text-left transition ${
                        paymentMethod === "CASH"
                          ? "bg-[#2b2d42] border-[#2b2d42] text-white"
                          : "bg-[#f8fafc] border-[#d4dce4] text-[#2b2d42] hover:bg-white"
                      }`}
                    >
                      <div className="text-xs font-semibold">Cash Payment</div>
                      <div className="text-xs opacity-85 font-mono mt-0.5">
                        {praConfig.cashTaxRate}% GST
                      </div>
                    </button>

                    <button
                      onClick={() => setPaymentMethod("CARD")}
                      className={`p-2.5 rounded-xl border text-left transition ${
                        paymentMethod === "CARD"
                          ? "bg-[#ef233c] border-[#ef233c] text-white"
                          : "bg-[#f8fafc] border-[#d4dce4] text-[#2b2d42] hover:bg-white"
                      }`}
                    >
                      <div className="text-xs font-semibold">Bank Card</div>
                      <div className="text-xs opacity-90 font-mono mt-0.5">
                        {praConfig.cardTaxRate}% GST
                      </div>
                    </button>

                    <button
                      onClick={() => setPaymentMethod("JAZZCASH_EASYPAISA")}
                      className={`p-2.5 rounded-xl border text-left transition ${
                        paymentMethod === "JAZZCASH_EASYPAISA"
                          ? "bg-[#ef233c] border-[#ef233c] text-white"
                          : "bg-[#f8fafc] border-[#d4dce4] text-[#2b2d42] hover:bg-white"
                      }`}
                    >
                      <div className="text-xs font-semibold">Raast / QR</div>
                      <div className="text-xs opacity-90 font-mono mt-0.5">
                        {praConfig.cardTaxRate}% Digital
                      </div>
                    </button>

                    <button
                      onClick={() => setPaymentMethod("SPLIT")}
                      className={`p-2.5 rounded-xl border text-left transition ${
                        paymentMethod === "SPLIT"
                          ? "bg-[#2b2d42] border-[#2b2d42] text-white"
                          : "bg-[#f8fafc] border-[#d4dce4] text-[#2b2d42] hover:bg-white"
                      }`}
                    >
                      <div className="text-xs font-semibold">Split Bill</div>
                      <div className="text-xs opacity-85 mt-0.5">Cash + Card</div>
                    </button>

                    <button
                      onClick={() => setPaymentMethod("KHATA_CREDIT")}
                      className={`col-span-2 p-2.5 rounded-xl border text-left transition ${
                        paymentMethod === "KHATA_CREDIT"
                          ? "bg-[#2b2d42] border-[#2b2d42] text-white"
                          : "bg-[#f8fafc] border-[#d4dce4] text-[#2b2d42] hover:bg-white"
                      }`}
                    >
                      <div className="text-xs font-semibold">Customer Khata (Credit)</div>
                      <div className="text-xs opacity-85 mt-0.5">Post directly to Party Ledger</div>
                    </button>
                  </div>

                  {paymentMethod === "SPLIT" && (
                    <div className="p-3 rounded-xl bg-[#f8fafc] border border-[#d4dce4] space-y-1.5">
                      <div className="flex justify-between text-xs font-semibold text-[#2b2d42]">
                        <span>Cash Portion: {Math.round(splitCashRatio * 100)}%</span>
                        <span>Card Portion: {Math.round((1 - splitCashRatio) * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0.1}
                        max={0.9}
                        step={0.1}
                        value={splitCashRatio}
                        onChange={(e) => setSplitCashRatio(Number(e.target.value))}
                        className="w-full accent-[#ef233c]"
                      />
                    </div>
                  )}

                  {paymentMethod === "KHATA_CREDIT" && (
                    <div className="p-3 rounded-xl bg-[#f8fafc] border border-[#2b2d42] space-y-1.5">
                      <label className="text-xs text-[#2b2d42] font-semibold block">
                        Select Customer Khata Account:
                      </label>
                      <select
                        value={selectedKhataId}
                        onChange={(e) => setSelectedKhataId(e.target.value)}
                        className="w-full bg-white border border-[#d4dce4] rounded-lg px-3 py-2 text-xs text-[#2b2d42] font-medium"
                      >
                        {parties
                          .filter((p) => p.type === "CUSTOMER")
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} (Bal: PKR {p.currentBalance.toLocaleString()})
                            </option>
                          ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Discount & Cash Received */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-[#4a4e69] block mb-1">
                      Discount (PKR)
                    </label>
                    <input
                      type="number"
                      min={0}
                      disabled={!currentUser.permissions.canApproveDiscounts}
                      value={discountAmount || ""}
                      onChange={(e) => setDiscountAmount(Number(e.target.value) || 0)}
                      placeholder={
                        currentUser.permissions.canApproveDiscounts ? "0" : "Manager/Admin Only"
                      }
                      className="w-full bg-[#f8fafc] border border-[#d4dce4] disabled:opacity-60 rounded-xl px-3 py-2 text-sm font-mono text-[#2b2d42]"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-[#4a4e69] block mb-1">
                      Cash Tendered
                    </label>
                    <input
                      type="number"
                      value={cashTendered}
                      onChange={(e) => setCashTendered(e.target.value)}
                      placeholder={`${liveTaxBreakdown.grandTotal}`}
                      className="w-full bg-[#f8fafc] border border-[#d4dce4] rounded-xl px-3 py-2 text-sm font-mono text-[#2b2d42]"
                    />
                  </div>
                </div>

                {/* Totals & Tax Summary Box */}
                <div className="bg-[#f8fafc] border border-[#d4dce4] rounded-xl p-4 space-y-2 text-sm">
                  <div className="flex justify-between text-[#4a4e69]">
                    <span>Gross Subtotal:</span>
                    <span className="font-mono font-semibold text-[#2b2d42]">
                      PKR {liveTaxBreakdown.grossSubtotal.toLocaleString()}
                    </span>
                  </div>
                  {liveTaxBreakdown.discountAmount > 0 && (
                    <div className="flex justify-between text-[#d80032] font-semibold">
                      <span>Discount:</span>
                      <span className="font-mono">
                        - PKR {liveTaxBreakdown.discountAmount.toLocaleString()}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-[#2b2d42] font-medium">
                    <span>PRA GST ({liveTaxBreakdown.effectiveTaxRateLabel}):</span>
                    <span className="font-mono font-semibold text-[#d80032]">
                      + PKR {liveTaxBreakdown.totalSalesTax.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-[#d4dce4] text-base font-bold text-[#2b2d42]">
                    <span>Total Payable:</span>
                    <span className="font-mono text-lg text-[#ef233c]">
                      PKR {liveTaxBreakdown.grandTotal.toLocaleString()}
                    </span>
                  </div>

                  <div className="pt-2 mt-1 border-t border-[#e2e8f0] flex items-center justify-between text-xs text-[#4a4e69]">
                    <span>
                      Cash (16%):{" "}
                      <strong className="font-mono text-[#2b2d42]">
                        PKR {cashComparison.grandTotal.toLocaleString()}
                      </strong>
                    </span>
                    <span>
                      Card (5%):{" "}
                      <strong className="font-mono text-[#d80032]">
                        PKR {cardComparison.grandTotal.toLocaleString()}
                      </strong>
                    </span>
                  </div>
                </div>

                {/* Fiscalize & Print Button */}
                <button
                  onClick={handleCheckout}
                  disabled={cart.length === 0 || submittingOrder}
                  className="w-full py-3.5 rounded-xl bg-[#ef233c] hover:bg-[#d80032] disabled:opacity-40 text-white font-semibold text-sm flex items-center justify-center gap-2 transition"
                >
                  <Printer className="w-4 h-4" />
                  {submittingOrder
                    ? "Fiscalizing with PRA..."
                    : `Complete & Print PRA Bill (PKR ${liveTaxBreakdown.grandTotal.toLocaleString()})`}
                </button>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* SECTION 2: ORDERS & PRA INVOICES REGISTER                         */}
          {/* ================================================================= */}
          {activeSection === "ORDERS_INVOICES" && (
            <div className="pos-card rounded-2xl p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-[#2b2d42]">
                    PRA Fiscalized Orders & Invoice Register
                  </h3>
                  <p className="text-sm text-[#4a4e69] mt-0.5">
                    Reprint 80mm thermal receipts, Kitchen KOT slips, or export your monthly
                    Punjab Revenue Authority return CSV
                  </p>
                </div>
                <button
                  onClick={exportPRACsv}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#ef233c] hover:bg-[#d80032] text-white text-xs font-semibold transition"
                >
                  <Download className="w-4 h-4" />
                  Export Monthly PRA CSV
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-white bg-[#2b2d42]">
                      <th className="py-3 px-4 rounded-l-xl font-semibold">Invoice #</th>
                      <th className="py-3 px-4 font-semibold">PRA Fiscal Invoice #</th>
                      <th className="py-3 px-4 font-semibold">Date & Time</th>
                      <th className="py-3 px-4 font-semibold">Order Mode</th>
                      <th className="py-3 px-4 font-semibold">Payment</th>
                      <th className="py-3 px-4 text-right font-semibold">Taxable</th>
                      <th className="py-3 px-4 text-right font-semibold">PRA GST</th>
                      <th className="py-3 px-4 text-right font-semibold">Grand Total</th>
                      <th className="py-3 px-4 text-center rounded-r-xl font-semibold">
                        Receipt / KOT
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e2e8f0]">
                    {orders.map((ord) => (
                      <tr key={ord.id} className="hover:bg-[#f8fafc]">
                        <td className="py-3.5 px-4 font-mono font-semibold text-[#2b2d42]">
                          {ord.invoiceNumber}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-[#d80032] font-semibold">
                          {ord.praInvoiceNumber}
                        </td>
                        <td className="py-3.5 px-4 text-[#4a4e69] text-xs">
                          {new Date(ord.createdAt).toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4 font-medium text-[#2b2d42]">
                          {ord.orderType.replace("_", " ")}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="px-2.5 py-1 rounded-md bg-[#edf2f4] text-[#2b2d42] font-semibold text-xs">
                            {ord.paymentMethod}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-[#2b2d42]">
                          PKR {ord.taxBreakdown.taxableAmount.toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-[#d80032] font-semibold">
                          PKR {ord.taxBreakdown.totalSalesTax.toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-[#2b2d42]">
                          PKR {ord.taxBreakdown.grandTotal.toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <button
                            onClick={() => setActiveReceiptOrder(ord)}
                            className="px-3.5 py-1.5 rounded-lg bg-[#ef233c] hover:bg-[#d80032] text-white text-xs font-semibold transition"
                          >
                            Open Slip & QR
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* SECTION 3: STANDALONE SALES TAX CALCULATOR                        */}
          {/* ================================================================= */}
          {activeSection === "TAX_CALCULATOR" && (
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="pos-card rounded-2xl p-6 space-y-5">
                <div>
                  <h3 className="text-lg font-bold text-[#2b2d42] flex items-center gap-2">
                    <Calculator className="w-5 h-5 text-[#ef233c]" />
                    PRA Restaurant & Retail Sales Tax Calculator
                  </h3>
                  <p className="text-sm text-[#4a4e69] mt-1">
                    Simulate Punjab Revenue Authority GST for Cash ({praConfig.cashTaxRate}%) vs
                    Bank Card / Digital ({praConfig.cardTaxRate}%)
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-[#2b2d42] block mb-1.5">
                      Gross Bill Amount (PKR)
                    </label>
                    <input
                      type="number"
                      value={calcAmount}
                      onChange={(e) => setCalcAmount(Number(e.target.value) || 0)}
                      className="w-full bg-[#f8fafc] border border-[#d4dce4] rounded-xl px-3.5 py-2.5 text-sm font-mono font-semibold text-[#2b2d42]"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-[#2b2d42] block mb-1.5">
                      Discount (PKR)
                    </label>
                    <input
                      type="number"
                      value={calcDiscount}
                      onChange={(e) => setCalcDiscount(Number(e.target.value) || 0)}
                      className="w-full bg-[#f8fafc] border border-[#d4dce4] rounded-xl px-3.5 py-2.5 text-sm font-mono font-semibold text-[#2b2d42]"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-[#2b2d42] block mb-1.5">
                      Tax Mode
                    </label>
                    <select
                      value={calcTaxMode}
                      onChange={(e) =>
                        setCalcTaxMode(e.target.value as "EXCLUSIVE" | "INCLUSIVE")
                      }
                      className="w-full bg-[#f8fafc] border border-[#d4dce4] rounded-xl px-3.5 py-2.5 text-sm font-medium text-[#2b2d42]"
                    >
                      <option value="EXCLUSIVE">Tax Exclusive (+GST Added on Top)</option>
                      <option value="INCLUSIVE">Tax Inclusive (Extract GST from MRP)</option>
                    </select>
                  </div>
                </div>

                {(() => {
                  const netBill = Math.max(0, calcAmount - calcDiscount);
                  const cashRate = praConfig.cashTaxRate / 100;
                  const cardRate = praConfig.cardTaxRate / 100;

                  const cashTax =
                    calcTaxMode === "EXCLUSIVE"
                      ? Math.round(netBill * cashRate)
                      : Math.round(netBill - netBill / (1 + cashRate));
                  const cashTotal =
                    calcTaxMode === "EXCLUSIVE" ? netBill + cashTax : netBill;

                  const cardTax =
                    calcTaxMode === "EXCLUSIVE"
                      ? Math.round(netBill * cardRate)
                      : Math.round(netBill - netBill / (1 + cardRate));
                  const cardTotal =
                    calcTaxMode === "EXCLUSIVE" ? netBill + cardTax : netBill;

                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
                      <div className="bg-[#f8fafc] border border-[#d4dce4] rounded-2xl p-5 space-y-2.5">
                        <div className="text-xs font-bold text-[#2b2d42] uppercase tracking-wider">
                          Option A: Cash Payment ({praConfig.cashTaxRate}% PRA GST)
                        </div>
                        <div className="flex justify-between text-sm text-[#4a4e69]">
                          <span>Net Taxable Value:</span>
                          <span className="font-mono font-semibold text-[#2b2d42]">
                            PKR {(cashTotal - cashTax).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm text-[#d80032] font-semibold">
                          <span>PRA Sales Tax ({praConfig.cashTaxRate}%):</span>
                          <span className="font-mono">PKR {cashTax.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-base font-bold text-[#2b2d42] pt-2.5 border-t border-[#d4dce4]">
                          <span>Total Payable by Customer:</span>
                          <span className="font-mono">PKR {cashTotal.toLocaleString()}</span>
                        </div>
                      </div>

                      <div className="bg-[#2b2d42] text-white rounded-2xl p-5 space-y-2.5">
                        <div className="text-xs font-bold text-[#ef233c] uppercase tracking-wider">
                          Option B: Card / Digital ({praConfig.cardTaxRate}% PRA GST)
                        </div>
                        <div className="flex justify-between text-sm text-[#cbd5e1]">
                          <span>Net Taxable Value:</span>
                          <span className="font-mono font-semibold text-white">
                            PKR {(cardTotal - cardTax).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm text-[#ef233c] font-semibold">
                          <span>PRA Sales Tax ({praConfig.cardTaxRate}%):</span>
                          <span className="font-mono">PKR {cardTax.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-base font-bold text-white pt-2.5 border-t border-white/15">
                          <span>Total Payable by Customer:</span>
                          <span className="font-mono text-[#ef233c]">
                            PKR {cardTotal.toLocaleString()}
                          </span>
                        </div>
                        <div className="text-xs font-medium text-[#e2e8f0] pt-1">
                          Customer saves PKR {(cashTax - cardTax).toLocaleString()} when paying by
                          Card!
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* SECTION 4: KHATA & LEDGER BOOK                                    */}
          {/* ================================================================= */}
          {activeSection === "KHATA_LEDGER" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="pos-card rounded-2xl p-5">
                  <div className="text-xs font-semibold text-[#4a4e69]">
                    Customer Khata Receivables (Credit Sales)
                  </div>
                  <div className="text-2xl font-bold text-[#2b2d42] font-mono mt-1.5">
                    PKR {totalReceivables.toLocaleString()}
                  </div>
                </div>
                <div className="pos-card rounded-2xl p-5">
                  <div className="text-xs font-semibold text-[#4a4e69]">
                    Supplier Payables (Meat, Poultry & Grocery)
                  </div>
                  <div className="text-2xl font-bold text-[#d80032] font-mono mt-1.5">
                    PKR {totalPayables.toLocaleString()}
                  </div>
                </div>
                <div className="pos-card rounded-2xl p-5">
                  <div className="text-xs font-semibold text-[#4a4e69]">
                    Recorded Khata Vouchers
                  </div>
                  <div className="text-2xl font-bold text-[#2b2d42] font-mono mt-1.5">
                    {ledger.length} Entries
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-5 space-y-4">
                  <div className="pos-card rounded-2xl p-5 space-y-3.5">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-base text-[#2b2d42]">
                        Party Khata Accounts
                      </h3>
                      <div className="flex gap-1 bg-[#edf2f4] p-1 rounded-xl border border-[#d4dce4]">
                        {(["ALL", "CUSTOMER", "SUPPLIER"] as const).map((t) => (
                          <button
                            key={t}
                            onClick={() => setLedgerPartyFilter(t)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                              ledgerPartyFilter === t
                                ? "bg-[#2b2d42] text-white"
                                : "text-[#2b2d42]"
                            }`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2.5 max-h-84 overflow-y-auto">
                      {parties
                        .filter(
                          (p) => ledgerPartyFilter === "ALL" || p.type === ledgerPartyFilter
                        )
                        .map((party) => (
                          <div
                            key={party.id}
                            onClick={() => setSelectedPartyId(party.id)}
                            className={`p-3.5 rounded-xl border cursor-pointer transition ${
                              selectedPartyId === party.id
                                ? "bg-[#f8fafc] border-[#ef233c] ring-1 ring-[#ef233c]"
                                : "bg-white border-[#d4dce4] hover:border-[#2b2d42]"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-sm text-[#2b2d42]">
                                {party.name}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-[#edf2f4] text-[#2b2d42]">
                                  {party.type}
                                </span>
                                <button
                                  type="button"
                                  title="Edit Party Account"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startEditingParty(party);
                                  }}
                                  className="p-1.5 rounded-lg bg-[#edf2f4] hover:bg-[#2b2d42] text-[#2b2d42] hover:text-white transition"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  title="Delete Party Account"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteParty(party.id, party.name);
                                  }}
                                  className="p-1.5 rounded-lg bg-[#edf2f4] hover:bg-[#ef233c] text-[#4a4e69] hover:text-white transition"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                            <div className="flex items-center justify-between mt-1.5 text-xs">
                              <span className="text-[#4a4e69]">{party.phone}</span>
                              <span
                                className={`font-mono font-semibold ${
                                  party.currentBalance >= 0
                                    ? "text-[#2b2d42]"
                                    : "text-[#d80032]"
                                }`}
                              >
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
                  </div>

                  <form
                    onSubmit={handleCreateParty}
                    className="pos-card rounded-2xl p-5 space-y-3.5"
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-xs uppercase tracking-wider text-[#ef233c]">
                        {editingPartyId ? "Edit Khata Account" : "+ Open New Khata Account"}
                      </h4>
                      {editingPartyId && (
                        <button
                          type="button"
                          onClick={cancelEditingParty}
                          className="text-xs font-semibold text-[#4a4e69] hover:text-[#2b2d42] flex items-center gap-1"
                        >
                          <X className="w-3.5 h-3.5" /> Cancel
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="text"
                        required
                        value={newPartyName}
                        onChange={(e) => setNewPartyName(e.target.value)}
                        placeholder="Party / Company Name"
                        className="sm:col-span-2 bg-[#f8fafc] border border-[#d4dce4] rounded-xl px-3.5 py-2 text-sm text-[#2b2d42]"
                      />
                      <select
                        value={newPartyType}
                        onChange={(e) => setNewPartyType(e.target.value as PartyType)}
                        className="bg-[#f8fafc] border border-[#d4dce4] rounded-xl px-3 py-2 text-sm text-[#2b2d42]"
                      >
                        <option value="CUSTOMER">Customer Khata</option>
                        <option value="SUPPLIER">Supplier / Vendor</option>
                        <option value="EXPENSE_HEAD">Daily Expense</option>
                      </select>
                      <input
                        type="text"
                        value={newPartyPhone}
                        onChange={(e) => setNewPartyPhone(e.target.value)}
                        placeholder="Phone (0300-...)"
                        className="bg-[#f8fafc] border border-[#d4dce4] rounded-xl px-3 py-2 text-sm text-[#2b2d42]"
                      />
                      <div className="sm:col-span-2">
                        <label className="text-xs font-semibold text-[#4a4e69] block mb-1">
                          {editingPartyId ? "Current Balance (PKR)" : "Opening Balance (PKR)"}
                        </label>
                        <input
                          type="number"
                          value={newPartyOpening}
                          onChange={(e) => setNewPartyOpening(e.target.value)}
                          className="w-full bg-[#f8fafc] border border-[#d4dce4] rounded-xl px-3.5 py-2 text-sm font-mono text-[#2b2d42]"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="w-full py-2.5 rounded-xl bg-[#2b2d42] hover:bg-[#ef233c] text-white text-sm font-semibold transition"
                    >
                      {editingPartyId ? "Save Khata Account Changes" : "Create Khata Account"}
                    </button>
                  </form>
                </div>

                <div className="lg:col-span-7 space-y-4">
                  <form
                    onSubmit={handlePostVoucher}
                    className="pos-card rounded-2xl p-5 space-y-3.5"
                  >
                    <h3 className="font-bold text-base text-[#2b2d42]">
                      Record Cash / Bank Khata Voucher
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <select
                        value={selectedPartyId}
                        onChange={(e) => setSelectedPartyId(e.target.value)}
                        className="bg-[#f8fafc] border border-[#d4dce4] rounded-xl px-3 py-2 text-sm text-[#2b2d42] font-medium"
                      >
                        {parties.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>

                      <select
                        value={voucherType}
                        onChange={(e) =>
                          setVoucherType(e.target.value as typeof voucherType)
                        }
                        className="bg-[#f8fafc] border border-[#d4dce4] rounded-xl px-3 py-2 text-sm text-[#2b2d42] font-medium"
                      >
                        <option value="CUSTOMER_RECEIPT">Customer Payment Received</option>
                        <option value="SUPPLIER_BILL">Supplier Purchase Bill (GRN)</option>
                        <option value="SUPPLIER_PAYMENT">Supplier Cash/Bank Payout</option>
                        <option value="EXPENSE_VOUCHER">Daily Petty Expense</option>
                      </select>

                      <input
                        type="number"
                        required
                        min={1}
                        value={voucherAmount}
                        onChange={(e) => setVoucherAmount(e.target.value)}
                        placeholder="Amount (PKR)"
                        className="bg-[#f8fafc] border border-[#d4dce4] rounded-xl px-3 py-2 text-sm font-mono text-[#2b2d42]"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <input
                        type="text"
                        value={voucherDesc}
                        onChange={(e) => setVoucherDesc(e.target.value)}
                        placeholder="Narration / Bill Ref / Bank Name..."
                        className="sm:col-span-2 bg-[#f8fafc] border border-[#d4dce4] rounded-xl px-3 py-2 text-sm text-[#2b2d42]"
                      />
                      <button
                        type="submit"
                        className="py-2.5 px-4 rounded-xl bg-[#ef233c] hover:bg-[#d80032] text-white font-semibold text-sm transition"
                      >
                        Post Voucher
                      </button>
                    </div>
                  </form>

                  {/* Edit Voucher Form (Appears when editing a Ledger Entry) */}
                  {editingEntryId && (
                    <form
                      onSubmit={handleSaveEditedEntry}
                      className="pos-card rounded-2xl p-5 border-2 border-[#ef233c] space-y-3.5 animate-panel"
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-sm text-[#2b2d42]">
                          Edit Ledger Voucher ({editEntryVoucherNo})
                        </h4>
                        <button
                          type="button"
                          onClick={() => setEditingEntryId(null)}
                          className="text-xs font-semibold text-[#4a4e69] hover:text-[#2b2d42] flex items-center gap-1"
                        >
                          <X className="w-4 h-4" /> Cancel
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <div>
                          <label className="text-xs font-semibold text-[#4a4e69] block mb-1">
                            Voucher #
                          </label>
                          <input
                            type="text"
                            required
                            value={editEntryVoucherNo}
                            onChange={(e) => setEditEntryVoucherNo(e.target.value)}
                            className="w-full bg-[#f8fafc] border border-[#d4dce4] rounded-xl px-3 py-2 text-sm font-mono text-[#2b2d42]"
                          />
                        </div>
                        <div className="sm:col-span-1">
                          <label className="text-xs font-semibold text-[#4a4e69] block mb-1">
                            Debit (PKR)
                          </label>
                          <input
                            type="number"
                            value={editEntryDebit}
                            onChange={(e) => setEditEntryDebit(e.target.value)}
                            className="w-full bg-[#f8fafc] border border-[#d4dce4] rounded-xl px-3 py-2 text-sm font-mono text-[#2b2d42]"
                          />
                        </div>
                        <div className="sm:col-span-1">
                          <label className="text-xs font-semibold text-[#4a4e69] block mb-1">
                            Credit (PKR)
                          </label>
                          <input
                            type="number"
                            value={editEntryCredit}
                            onChange={(e) => setEditEntryCredit(e.target.value)}
                            className="w-full bg-[#f8fafc] border border-[#d4dce4] rounded-xl px-3 py-2 text-sm font-mono text-[#2b2d42]"
                          />
                        </div>
                        <div className="flex items-end">
                          <button
                            type="submit"
                            className="w-full py-2 px-4 rounded-xl bg-[#2b2d42] hover:bg-[#ef233c] text-white font-semibold text-sm transition"
                          >
                            Update Voucher
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-[#4a4e69] block mb-1">
                          Description / Narration
                        </label>
                        <input
                          type="text"
                          required
                          value={editEntryDesc}
                          onChange={(e) => setEditEntryDesc(e.target.value)}
                          className="w-full bg-[#f8fafc] border border-[#d4dce4] rounded-xl px-3 py-2 text-sm text-[#2b2d42]"
                        />
                      </div>
                    </form>
                  )}

                  <div className="pos-card rounded-2xl p-5">
                    <h3 className="font-bold text-base text-[#2b2d42] mb-3.5">
                      Double-Entry Khata Statement
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="text-white bg-[#2b2d42]">
                            <th className="py-3 px-3 rounded-l-lg font-semibold">Voucher #</th>
                            <th className="py-3 px-3 font-semibold">Party</th>
                            <th className="py-3 px-3 font-semibold">Description</th>
                            <th className="py-3 px-3 text-right font-semibold">Debit</th>
                            <th className="py-3 px-3 text-right font-semibold">Credit</th>
                            <th className="py-3 px-3 text-right font-semibold">Balance</th>
                            <th className="py-3 px-3 text-right rounded-r-lg font-semibold">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#e2e8f0]">
                          {ledger.map((entry) => (
                            <tr key={entry.id} className="hover:bg-[#f8fafc]">
                              <td className="py-3 px-3 font-mono font-semibold text-[#d80032]">
                                {entry.voucherNo}
                              </td>
                              <td className="py-3 px-3 font-semibold text-[#2b2d42]">
                                {entry.partyName}
                              </td>
                              <td className="py-3 px-3 text-[#4a4e69]">
                                {entry.description}
                              </td>
                              <td className="py-3 px-3 text-right font-mono text-[#2b2d42] font-semibold">
                                {entry.debit > 0 ? entry.debit.toLocaleString() : "-"}
                              </td>
                              <td className="py-3 px-3 text-right font-mono text-[#d80032] font-semibold">
                                {entry.credit > 0 ? entry.credit.toLocaleString() : "-"}
                              </td>
                              <td className="py-3 px-3 text-right font-mono font-bold text-[#2b2d42]">
                                PKR {entry.balanceAfter.toLocaleString()}
                              </td>
                              <td className="py-3 px-3 text-right">
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    title="Post Append-Only Credit Note / Reversal"
                                    onClick={() => handleReverseEntry(entry.id, entry.voucherNo)}
                                    className="px-2 py-1 rounded-lg bg-[#edf2f4] hover:bg-[#2b2d42] text-[#2b2d42] hover:text-white text-xs font-semibold transition"
                                  >
                                    Reverse
                                  </button>
                                  <button
                                    type="button"
                                    title="Edit Voucher"
                                    onClick={() => startEditingEntry(entry)}
                                    className="p-1.5 rounded-lg bg-[#edf2f4] hover:bg-[#2b2d42] text-[#2b2d42] hover:text-white transition"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    title="Void Voucher"
                                    onClick={() => handleDeleteEntry(entry.id, entry.voucherNo)}
                                    className="p-1.5 rounded-lg bg-[#edf2f4] hover:bg-[#ef233c] text-[#4a4e69] hover:text-white transition"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* SECTION 5: MENU, IMAGES & INVENTORY                               */}
          {/* ================================================================= */}
          {activeSection === "MENU_INVENTORY" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <form
                onSubmit={handleAddProduct}
                className="lg:col-span-4 pos-card rounded-2xl p-5 space-y-4 h-fit"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-base text-[#2b2d42]">
                    {editingProductId
                      ? `Edit Menu Item (#${newProdCode})`
                      : "+ Add New Dish or Retail Product"}
                  </h3>
                  {editingProductId && (
                    <button
                      type="button"
                      onClick={cancelEditingProduct}
                      className="text-xs font-semibold text-[#4a4e69] hover:text-[#2b2d42] flex items-center gap-1"
                    >
                      <X className="w-4 h-4" /> Cancel
                    </button>
                  )}
                </div>

                <input
                  type="text"
                  required
                  value={newProdName}
                  onChange={(e) => setNewProdName(e.target.value)}
                  placeholder="Item Name (e.g. Chicken Achari Handi)"
                  className="w-full bg-[#f8fafc] border border-[#d4dce4] rounded-xl px-3.5 py-2.5 text-sm text-[#2b2d42]"
                />

                <div className="grid grid-cols-2 gap-2.5">
                  <select
                    value={newProdSegment}
                    onChange={(e) => setNewProdSegment(e.target.value as BusinessSegment)}
                    className="bg-[#f8fafc] border border-[#d4dce4] rounded-xl px-3 py-2.5 text-sm text-[#2b2d42]"
                  >
                    <option value="RESTAURANT">Restaurant Dish (KOT)</option>
                    <option value="RETAIL">Retail Counter (Barcode)</option>
                  </select>
                  <input
                    type="text"
                    value={newProdCategory}
                    onChange={(e) => setNewProdCategory(e.target.value)}
                    placeholder="Category"
                    className="bg-[#f8fafc] border border-[#d4dce4] rounded-xl px-3 py-2.5 text-sm text-[#2b2d42]"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <input
                    type="text"
                    value={newProdCode}
                    onChange={(e) => setNewProdCode(e.target.value)}
                    placeholder="SKU Code"
                    className="bg-[#f8fafc] border border-[#d4dce4] rounded-xl px-3 py-2.5 text-sm font-mono text-[#2b2d42]"
                  />
                  <input
                    type="number"
                    required
                    value={newProdPrice}
                    onChange={(e) => setNewProdPrice(e.target.value)}
                    placeholder="Price PKR"
                    className="bg-[#f8fafc] border border-[#d4dce4] rounded-xl px-3 py-2.5 text-sm font-mono text-[#2b2d42]"
                  />
                  <input
                    type="number"
                    value={newProdStock}
                    onChange={(e) => setNewProdStock(e.target.value)}
                    placeholder="Stock Qty"
                    className="bg-[#f8fafc] border border-[#d4dce4] rounded-xl px-3 py-2.5 text-sm font-mono text-[#2b2d42]"
                  />
                </div>

                {/* Menu Item Photo Upload + Image URL Input */}
                <div className="p-3.5 rounded-xl bg-[#f8fafc] border border-[#d4dce4] space-y-2.5">
                  <label className="text-xs font-semibold text-[#2b2d42] flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-[#ef233c]" />
                    Menu Card Image (Upload File or Paste URL)
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleNewProdImageFile}
                    className="w-full text-xs text-[#4a4e69] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#2b2d42] file:text-white hover:file:bg-[#ef233c]"
                  />
                  <input
                    type="text"
                    value={newProdImageUrl}
                    onChange={(e) => setNewProdImageUrl(e.target.value)}
                    placeholder="Or paste image URL (https://...)"
                    className="w-full bg-white border border-[#d4dce4] rounded-lg px-3 py-2 text-xs text-[#2b2d42]"
                  />
                  {newProdImageUrl && (
                    <div className="relative h-28 w-full rounded-lg overflow-hidden border border-[#d4dce4]">
                      <img
                        src={newProdImageUrl}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={!currentUser.permissions.canManageMenuPricing}
                  className="w-full py-2.5 rounded-xl bg-[#ef233c] hover:bg-[#d80032] disabled:opacity-50 text-white font-semibold text-sm transition"
                >
                  {!currentUser.permissions.canManageMenuPricing
                    ? "Admin / Manager Required"
                    : editingProductId
                    ? "Save Menu Item Changes"
                    : "Save to Hybrid Menu"}
                </button>
              </form>

              <div className="lg:col-span-8 pos-card rounded-2xl p-5">
                <h3 className="font-bold text-base text-[#2b2d42] mb-3.5">
                  Active Hybrid Catalog ({products.length} Items)
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-white bg-[#2b2d42]">
                        <th className="py-3 px-3 rounded-l-lg font-semibold">Image</th>
                        <th className="py-3 px-3 font-semibold">Code</th>
                        <th className="py-3 px-3 font-semibold">Dish / Product</th>
                        <th className="py-3 px-3 font-semibold">Segment</th>
                        <th className="py-3 px-3 font-semibold">Portions & Prices</th>
                        <th className="py-3 px-3 text-right rounded-r-lg font-semibold">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e2e8f0]">
                      {products.map((p) => (
                        <tr key={p.id} className="hover:bg-[#f8fafc]">
                          <td className="py-3 px-3">
                            {p.imageUrl ? (
                              <img
                                src={p.imageUrl}
                                alt={p.name}
                                className="w-14 h-10 rounded-lg object-cover border border-[#d4dce4]"
                              />
                            ) : (
                              <div className="w-14 h-10 rounded-lg bg-[#edf2f4] border border-[#d4dce4] flex items-center justify-center text-[#8d99ae]">
                                <ImageIcon className="w-4 h-4" />
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3 font-mono font-semibold text-[#2b2d42]">
                            #{p.code}
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-semibold text-[#2b2d42]">{p.name}</div>
                            <div className="text-xs text-[#4a4e69]">{p.category}</div>
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`px-2.5 py-0.5 rounded-md text-xs font-semibold ${
                                p.segment === "RESTAURANT"
                                  ? "bg-[#ef233c] text-white"
                                  : "bg-[#2b2d42] text-white"
                              }`}
                            >
                              {p.segment}
                            </span>
                          </td>
                          <td className="py-3 px-3 space-y-0.5">
                            {p.variants.map((v) => (
                              <div key={v.id} className="text-xs">
                                {v.name}:{" "}
                                <strong className="font-mono text-[#2b2d42]">
                                  PKR {v.price.toLocaleString()}
                                </strong>
                              </div>
                            ))}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <label
                                title="Upload / Replace Photo"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#edf2f4] hover:bg-[#2b2d42] text-[#2b2d42] hover:text-white text-xs font-semibold cursor-pointer transition"
                              >
                                <Camera className="w-3.5 h-3.5 text-[#ef233c]" />
                                <span>Photo</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    const reader = new FileReader();
                                    reader.onload = () => {
                                      if (typeof reader.result === "string") {
                                        handleUpdateProductImage(p.id, reader.result);
                                      }
                                    };
                                    reader.readAsDataURL(file);
                                  }}
                                />
                              </label>
                              <button
                                type="button"
                                title="Edit Menu Item"
                                onClick={() => startEditingProduct(p)}
                                className="p-1.5 rounded-lg bg-[#edf2f4] hover:bg-[#2b2d42] text-[#2b2d42] hover:text-white transition"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                title="Delete Menu Item"
                                onClick={() => handleDeleteProduct(p.id, p.name)}
                                className="p-1.5 rounded-lg bg-[#edf2f4] hover:bg-[#ef233c] text-[#4a4e69] hover:text-white transition"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* SECTION 6: DAILY Z-REPORT, REGISTER SHIFT & FISCAL PERIOD LOCKS   */}
          {/* ================================================================= */}
          {activeSection === "Z_REPORT" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="pos-card rounded-2xl p-5">
                  <div className="text-xs font-semibold text-[#4a4e69]">
                    Gross Shift Sales (Z-Report)
                  </div>
                  <div className="text-2xl font-bold text-[#2b2d42] font-mono mt-1.5">
                    PKR {totalSalesRevenue.toLocaleString()}
                  </div>
                  <div className="text-xs text-[#ef233c] font-semibold mt-1">
                    {orders.length} Fiscalized Invoices
                  </div>
                </div>

                <div className="pos-card rounded-2xl p-5">
                  <div className="text-xs font-semibold text-[#4a4e69]">
                    Physical Cash in Drawer
                  </div>
                  <div className="text-2xl font-bold text-[#2b2d42] font-mono mt-1.5">
                    PKR{" "}
                    {orders
                      .reduce((s, o) => s + (o.cashPaid - o.changeReturned), 0)
                      .toLocaleString()}
                  </div>
                </div>

                <div className="pos-card rounded-2xl p-5">
                  <div className="text-xs font-semibold text-[#4a4e69]">
                    Card & Raast Settlements
                  </div>
                  <div className="text-2xl font-bold text-[#2b2d42] font-mono mt-1.5">
                    PKR {orders.reduce((s, o) => s + o.cardPaid, 0).toLocaleString()}
                  </div>
                </div>

                <div className="pos-card rounded-2xl p-5">
                  <div className="text-xs font-semibold text-[#4a4e69]">
                    Total PRA GST Collected
                  </div>
                  <div className="text-2xl font-bold text-[#d80032] font-mono mt-1.5">
                    PKR {totalPraTaxCollected.toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Cashier Shift & Register Drawer Reconciliation (Checklist Section 6) */}
                <div className="lg:col-span-7 pos-card rounded-2xl p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-[#e2e8f0] pb-3.5">
                    <div>
                      <h3 className="font-bold text-base text-[#2b2d42]">
                        Cashier Shift & Register Drawer Reconciliation
                      </h3>
                      <p className="text-xs text-[#4a4e69] mt-0.5">
                        Minor-Unit (Paisa) precision tracking of opening float, cash sales, and
                        drawer variance
                      </p>
                    </div>
                    <span className="px-3 py-1 rounded-md bg-[#2b2d42] text-white text-xs font-semibold">
                      Shift OPEN
                    </span>
                  </div>

                  {cashierShifts[0] && (
                    <div className="space-y-4 text-sm">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div className="p-3.5 rounded-xl bg-[#f8fafc] border border-[#d4dce4]">
                          <div className="text-xs text-[#4a4e69]">Opening Float</div>
                          <div className="font-mono font-bold text-[#2b2d42] mt-1">
                            PKR {(cashierShifts[0].openingFloatMinor / 100).toLocaleString()}
                          </div>
                        </div>
                        <div className="p-3.5 rounded-xl bg-[#f8fafc] border border-[#d4dce4]">
                          <div className="text-xs text-[#4a4e69]">Shift Cash Sales</div>
                          <div className="font-mono font-bold text-[#2b2d42] mt-1">
                            PKR {(cashierShifts[0].cashSalesMinor / 100).toLocaleString()}
                          </div>
                        </div>
                        <div className="p-3.5 rounded-xl bg-[#2b2d42] text-white">
                          <div className="text-xs text-[#cbd5e1]">Expected Closing Cash</div>
                          <div className="font-mono font-bold text-[#ef233c] mt-1">
                            PKR{" "}
                            {(cashierShifts[0].expectedClosingCashMinor / 100).toLocaleString()}
                          </div>
                        </div>
                      </div>

                      <form
                        onSubmit={handleReconcileShift}
                        className="flex flex-wrap items-end gap-3 pt-2"
                      >
                        <div className="flex-1 min-w-[200px]">
                          <label className="text-xs font-semibold text-[#2b2d42] block mb-1">
                            Counted Physical Cash in Drawer (PKR)
                          </label>
                          <input
                            type="number"
                            required
                            value={countedCashInput}
                            onChange={(e) => setCountedCashInput(e.target.value)}
                            placeholder={`${cashierShifts[0].expectedClosingCashMinor / 100}`}
                            className="w-full bg-[#f8fafc] border border-[#d4dce4] rounded-xl px-3.5 py-2 text-sm font-mono text-[#2b2d42]"
                          />
                        </div>
                        <button
                          type="submit"
                          className="px-5 py-2.5 rounded-xl bg-[#ef233c] hover:bg-[#d80032] text-white text-xs font-semibold transition"
                        >
                          Verify & Reconcile Drawer
                        </button>
                      </form>

                      {cashierShifts[0].varianceMinor !== undefined && (
                        <div className="p-3.5 rounded-xl bg-[#f8fafc] border border-[#d4dce4] flex items-center justify-between text-xs">
                          <span className="font-semibold text-[#2b2d42]">
                            Counted: PKR{" "}
                            {(
                              (cashierShifts[0].countedClosingCashMinor || 0) / 100
                            ).toLocaleString()}
                          </span>
                          <span
                            className={`font-mono font-bold ${
                              cashierShifts[0].varianceMinor === 0
                                ? "text-[#2b2d42]"
                                : "text-[#d80032]"
                            }`}
                          >
                            Variance: PKR {(cashierShifts[0].varianceMinor / 100).toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Fiscal Period Locking Control (Checklist Section 5) */}
                <div className="lg:col-span-5 pos-card rounded-2xl p-6 space-y-4">
                  <div>
                    <h3 className="font-bold text-base text-[#2b2d42]">
                      Fiscal Period Locking Control
                    </h3>
                    <p className="text-xs text-[#4a4e69] mt-0.5">
                      Lock closed accounting months to block backdated invoices or ledger mutations
                    </p>
                  </div>

                  <div className="space-y-3">
                    {fiscalPeriods.map((fp) => (
                      <div
                        key={fp.periodKey}
                        className="p-4 rounded-xl bg-[#f8fafc] border border-[#d4dce4] flex items-center justify-between gap-3"
                      >
                        <div>
                          <div className="font-semibold text-sm text-[#2b2d42]">
                            {fp.label}
                          </div>
                          <div className="text-xs font-mono text-[#4a4e69] mt-0.5">
                            Period Key: {fp.periodKey} • Status:{" "}
                            <strong
                              className={fp.isLocked ? "text-[#d80032]" : "text-[#2b2d42]"}
                            >
                              {fp.isLocked ? "LOCKED (Immutable)" : "OPEN"}
                            </strong>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleToggleFiscalPeriod(fp.periodKey)}
                          className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
                            fp.isLocked
                              ? "bg-[#2b2d42] text-white hover:bg-[#ef233c]"
                              : "bg-[#ef233c] text-white hover:bg-[#d80032]"
                          }`}
                        >
                          {fp.isLocked ? "Unlock Period" : "Lock Period"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* SECTION 7: DEDICATED SETTINGS, PRA, JWT SESSION & MONGODB         */}
          {/* ================================================================= */}
          {activeSection === "SETTINGS_PRA" && (
            <div className="max-w-5xl mx-auto space-y-6">
              <div className="pos-card rounded-2xl p-2 flex flex-wrap gap-2">
                {(
                  [
                    {
                      id: "PRA_INTEGRATION",
                      label: "1. PRA e-IMS Integration",
                    },
                    {
                      id: "TAX_RULES",
                      label: "2. Sales Tax & Tariffs",
                    },
                    {
                      id: "SESSION_JWT_MANAGER",
                      label: "3. JWT Session & Single-Login Lock",
                    },
                    {
                      id: "MONGODB_DATABASE",
                      label: "4. Database & MongoDB",
                    },
                    {
                      id: "RESTAURANT_PROFILES",
                      label: "5. Restaurant & Staff Roles",
                    },
                    {
                      id: "ERP_AUDIT_COMPLIANCE",
                      label: "6. Immutable Audit Log & ERP Architecture",
                    },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setSettingsSubTab(tab.id)}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
                      settingsSubTab === tab.id
                        ? "bg-[#ef233c] text-white"
                        : "text-[#2b2d42] hover:bg-[#edf2f4]"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* SUB-TAB 1: PRA e-IMS INTEGRATION */}
              {settingsSubTab === "PRA_INTEGRATION" && (
                <form
                  onSubmit={handleSavePraConfig}
                  className="pos-card rounded-2xl p-6 space-y-5"
                >
                  <div className="flex items-center justify-between border-b border-[#e2e8f0] pb-4">
                    <div>
                      <h3 className="text-lg font-bold text-[#2b2d42]">
                        Punjab Revenue Authority (PRA) e-IMS Configuration
                      </h3>
                      <p className="text-sm text-[#4a4e69] mt-0.5">
                        Configure your official POS Registration ID, IMS endpoint URL, and bearer
                        token
                      </p>
                    </div>
                    <span className="px-3 py-1 rounded-md bg-[#2b2d42] text-white text-xs font-semibold">
                      Connected (Code 100)
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <label className="font-semibold text-[#2b2d42] block mb-1.5">
                        Official PRA POS Registration ID
                      </label>
                      <input
                        type="text"
                        disabled={!currentUser.permissions.canEditPraSettings}
                        value={praConfig.posId}
                        onChange={(e) =>
                          setPraConfig({ ...praConfig, posId: e.target.value })
                        }
                        className="w-full bg-[#f8fafc] border border-[#d4dce4] rounded-xl px-3.5 py-2.5 font-mono font-semibold text-[#d80032]"
                      />
                    </div>

                    <div>
                      <label className="font-semibold text-[#2b2d42] block mb-1.5">
                        PRA API Security Token / Bearer Key
                      </label>
                      <input
                        type="text"
                        disabled={!currentUser.permissions.canEditPraSettings}
                        value={praConfig.apiToken}
                        onChange={(e) =>
                          setPraConfig({ ...praConfig, apiToken: e.target.value })
                        }
                        className="w-full bg-[#f8fafc] border border-[#d4dce4] rounded-xl px-3.5 py-2.5 font-mono text-[#2b2d42]"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="font-semibold text-[#2b2d42] block mb-1.5">
                        PRA IMS Production / Local Fiscal Service Endpoint URL
                      </label>
                      <input
                        type="text"
                        disabled={!currentUser.permissions.canEditPraSettings}
                        value={praConfig.imsEndpointUrl}
                        onChange={(e) =>
                          setPraConfig({ ...praConfig, imsEndpointUrl: e.target.value })
                        }
                        className="w-full bg-[#f8fafc] border border-[#d4dce4] rounded-xl px-3.5 py-2.5 font-mono text-[#2b2d42]"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={!currentUser.permissions.canEditPraSettings}
                    className="px-6 py-2.5 rounded-xl bg-[#ef233c] hover:bg-[#d80032] disabled:opacity-50 text-white font-semibold text-sm transition"
                  >
                    Save PRA Integration Settings
                  </button>
                </form>
              )}

              {/* SUB-TAB 2: TAX & TARIFF RULES */}
              {settingsSubTab === "TAX_RULES" && (
                <form
                  onSubmit={handleSavePraConfig}
                  className="pos-card rounded-2xl p-6 space-y-5"
                >
                  <div>
                    <h3 className="text-lg font-bold text-[#2b2d42]">
                      Sales Tax Tariff & Service Charge Rules
                    </h3>
                    <p className="text-sm text-[#4a4e69] mt-0.5">
                      Configure the GST rates automatically applied when the cashier selects Cash
                      vs Bank Card
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                    <div>
                      <label className="font-semibold text-[#2b2d42] block mb-1.5">
                        Cash Payment PRA GST Rate (%)
                      </label>
                      <input
                        type="number"
                        disabled={!currentUser.permissions.canEditPraSettings}
                        value={praConfig.cashTaxRate}
                        onChange={(e) =>
                          setPraConfig({
                            ...praConfig,
                            cashTaxRate: Number(e.target.value),
                          })
                        }
                        className="w-full bg-[#f8fafc] border border-[#d4dce4] rounded-xl px-3.5 py-2.5 font-mono font-semibold text-[#2b2d42]"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-[#2b2d42] block mb-1.5">
                        Card / Digital PRA GST Rate (%)
                      </label>
                      <input
                        type="number"
                        disabled={!currentUser.permissions.canEditPraSettings}
                        value={praConfig.cardTaxRate}
                        onChange={(e) =>
                          setPraConfig({
                            ...praConfig,
                            cardTaxRate: Number(e.target.value),
                          })
                        }
                        className="w-full bg-[#f8fafc] border border-[#d4dce4] rounded-xl px-3.5 py-2.5 font-mono font-semibold text-[#d80032]"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-[#2b2d42] block mb-1.5">
                        Dine-In Service Charge (%)
                      </label>
                      <input
                        type="number"
                        disabled={!currentUser.permissions.canEditPraSettings}
                        value={praConfig.serviceChargePercent}
                        onChange={(e) =>
                          setPraConfig({
                            ...praConfig,
                            serviceChargePercent: Number(e.target.value),
                          })
                        }
                        className="w-full bg-[#f8fafc] border border-[#d4dce4] rounded-xl px-3.5 py-2.5 font-mono font-semibold text-[#2b2d42]"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={!currentUser.permissions.canEditPraSettings}
                    className="px-6 py-2.5 rounded-xl bg-[#ef233c] hover:bg-[#d80032] disabled:opacity-50 text-white font-semibold text-sm transition"
                  >
                    Update Tax Rules
                  </button>
                </form>
              )}

              {/* SUB-TAB 3: JWT SESSION & SINGLE-LOGIN LOCK MANAGER */}
              {settingsSubTab === "SESSION_JWT_MANAGER" && (
                <div className="space-y-5">
                  <div className="pos-card rounded-2xl p-6 space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e2e8f0] pb-4">
                      <div>
                        <h3 className="text-lg font-bold text-[#2b2d42] flex items-center gap-2">
                          <KeyRound className="w-5 h-5 text-[#ef233c]" />
                          Active HS256 JWT Session & Single-Profile Lock
                        </h3>
                        <p className="text-sm text-[#4a4e69] mt-0.5">
                          Strictly enforces one logged-in profile at a single time via HTTP-Only
                          signed JWT cookie + Server Session Lock
                        </p>
                      </div>

                      <div className="flex gap-2.5">
                        <button
                          onClick={handleRefreshSession}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2b2d42] hover:opacity-90 text-white text-xs font-semibold"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Rotate & Extend JWT (+12h)
                        </button>
                        <button
                          onClick={handleLogoutSession}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#ef233c] hover:bg-[#d80032] text-white text-xs font-semibold"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          Revoke Session & Sign Out
                        </button>
                      </div>
                    </div>

                    {activeSession && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div className="p-4 rounded-xl bg-[#f8fafc] border border-[#d4dce4] space-y-2">
                          <div className="text-xs font-bold text-[#2b2d42] uppercase tracking-wider">
                            Active Session Holder
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#4a4e69]">Session ID:</span>
                            <span className="font-mono font-semibold text-[#d80032]">
                              {activeSession.sessionId}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#4a4e69]">Profile:</span>
                            <span className="font-semibold text-[#2b2d42]">
                              {activeSession.userName} ({activeSession.userRole})
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#4a4e69]">Auth Method:</span>
                            <span className="font-mono font-semibold text-[#2b2d42]">
                              {activeSession.authMethod}
                            </span>
                          </div>
                        </div>

                        <div className="p-4 rounded-xl bg-[#2b2d42] text-white space-y-2">
                          <div className="text-xs font-bold text-[#ef233c] uppercase tracking-wider">
                            Signed HS256 JWT Token & Expiry
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-[#cbd5e1]">Issued At:</span>
                            <span className="font-mono">
                              {new Date(activeSession.issuedAt).toLocaleString()}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-[#cbd5e1]">Expires At:</span>
                            <span className="font-mono text-[#ef233c] font-semibold">
                              {new Date(activeSession.expiresAt).toLocaleString()}
                            </span>
                          </div>
                          <div className="pt-1">
                            <div className="text-xs text-[#cbd5e1]">
                              HTTP-Only Cookie Signature Preview:
                            </div>
                            <code className="text-xs font-mono text-white break-all">
                              {activeSession.jwtTokenPreview}
                            </code>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Session Audit Trail */}
                  <div className="pos-card rounded-2xl p-6">
                    <h4 className="font-bold text-base text-[#2b2d42] mb-3.5">
                      Session & Login Security Audit Log
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="bg-[#2b2d42] text-white">
                            <th className="py-3 px-3.5 rounded-l-lg font-semibold">Timestamp</th>
                            <th className="py-3 px-3.5 font-semibold">Event</th>
                            <th className="py-3 px-3.5 font-semibold">Profile</th>
                            <th className="py-3 px-3.5 rounded-r-lg font-semibold">Details</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#e2e8f0]">
                          {sessionAuditLogs.map((log) => (
                            <tr key={log.id} className="hover:bg-[#f8fafc]">
                              <td className="py-3 px-3.5 font-mono text-xs text-[#4a4e69]">
                                {new Date(log.timestamp).toLocaleTimeString()}
                              </td>
                              <td className="py-3 px-3.5 font-mono text-xs font-semibold text-[#d80032]">
                                {log.event}
                              </td>
                              <td className="py-3 px-3.5 font-semibold text-[#2b2d42]">
                                {log.userName} ({log.userRole})
                              </td>
                              <td className="py-3 px-3.5 text-[#4a4e69]">{log.details}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* SUB-TAB 4: DATABASE & MONGODB CONFIGURATION */}
              {settingsSubTab === "MONGODB_DATABASE" && (
                <div className="space-y-5">
                  <form
                    onSubmit={handleSaveMongoConfig}
                    className="pos-card rounded-2xl p-6 space-y-5"
                  >
                    <div className="flex items-center justify-between border-b border-[#e2e8f0] pb-4">
                      <div>
                        <h3 className="text-lg font-bold text-[#2b2d42] flex items-center gap-2">
                          <Database className="w-5 h-5 text-[#ef233c]" />
                          Database Engine & MongoDB Integration
                        </h3>
                        <p className="text-sm text-[#4a4e69] mt-0.5">
                          Dual-Mode Storage: Local JSON Store (`data/albarka-db.json`) with
                          automatic MongoDB cluster sync
                        </p>
                      </div>
                      <span className="px-3 py-1 rounded-md bg-[#2b2d42] text-white text-xs font-semibold">
                        {mongoConfig.enabled ? "MongoDB Connected" : "Local JSON + Mongo Ready"}
                      </span>
                    </div>

                    <div className="p-4 rounded-xl bg-[#f8fafc] border border-[#d4dce4] text-sm text-[#2b2d42]">
                      <strong>Current Storage Status:</strong> {mongoConfig.lastStatus}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div className="md:col-span-2">
                        <label className="font-semibold text-[#2b2d42] block mb-1.5">
                          MongoDB Connection URI (`mongodb://` or `mongodb+srv://`)
                        </label>
                        <input
                          type="text"
                          value={mongoConfig.uri}
                          onChange={(e) =>
                            setMongoConfig({ ...mongoConfig, uri: e.target.value })
                          }
                          placeholder="mongodb://127.0.0.1:27017/albarka_pos"
                          className="w-full bg-[#f8fafc] border border-[#d4dce4] rounded-xl px-3.5 py-2.5 font-mono text-[#2b2d42]"
                        />
                      </div>
                      <div>
                        <label className="font-semibold text-[#2b2d42] block mb-1.5">
                          Database Name
                        </label>
                        <input
                          type="text"
                          value={mongoConfig.dbName}
                          onChange={(e) =>
                            setMongoConfig({ ...mongoConfig, dbName: e.target.value })
                          }
                          className="w-full bg-[#f8fafc] border border-[#d4dce4] rounded-xl px-3.5 py-2.5 font-mono text-[#2b2d42]"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="px-6 py-2.5 rounded-xl bg-[#ef233c] hover:bg-[#d80032] text-white font-semibold text-sm transition"
                    >
                      Test & Save MongoDB Connection
                    </button>
                  </form>

                  <div className="bg-[#2b2d42] text-white rounded-2xl p-6 space-y-2">
                    <div className="text-xs font-bold text-[#ef233c] uppercase tracking-wider">
                      MongoDB Collections & Schema Architecture
                    </div>
                    <pre className="text-xs font-mono text-[#e2e8f0] overflow-x-auto leading-relaxed">
                      {MONGOOSE_SCHEMA_REFERENCE}
                    </pre>
                  </div>
                </div>
              )}

              {/* SUB-TAB 5: RESTAURANT HEADER & STAFF ROLES */}
              {settingsSubTab === "RESTAURANT_PROFILES" && (
                <div className="pos-card rounded-2xl p-6 space-y-5">
                  <div>
                    <h3 className="text-lg font-bold text-[#2b2d42]">
                      Authorized Staff Profiles (Single-Active-Session Enforced)
                    </h3>
                    <p className="text-sm text-[#4a4e69] mt-0.5">
                      Only one profile can hold an active session at a time. To switch profiles,
                      end the current session first.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {users.map((u) => {
                      const isActive = currentUser.id === u.id;
                      return (
                        <div
                          key={u.id}
                          className={`p-5 rounded-2xl border flex flex-col justify-between space-y-4 ${
                            isActive
                              ? "border-[#ef233c] bg-[#f8fafc] ring-1 ring-[#ef233c]"
                              : "border-[#d4dce4] bg-white"
                          }`}
                        >
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-[#2b2d42] text-white">
                                {u.role}
                              </span>
                              <span className="text-xs font-mono text-[#4a4e69]">
                                PIN: <strong className="text-[#2b2d42]">{u.pin}</strong>
                              </span>
                            </div>

                            <div>
                              <div className="font-bold text-base text-[#2b2d42]">
                                {u.name}
                              </div>
                              <div className="text-xs text-[#4a4e69]">{u.title}</div>
                            </div>

                            <div className="space-y-1.5 pt-2.5 border-t border-[#e2e8f0] text-xs text-[#4a4e69]">
                              <div>
                                • PRA Config:{" "}
                                <strong className="text-[#2b2d42]">
                                  {u.permissions.canEditPraSettings ? "Full Admin" : "Read-Only"}
                                </strong>
                              </div>
                              <div>
                                • Menu & Stock:{" "}
                                <strong className="text-[#2b2d42]">
                                  {u.permissions.canManageMenuPricing ? "Full Edit" : "View Only"}
                                </strong>
                              </div>
                              <div>
                                • Discounts:{" "}
                                <strong className="text-[#2b2d42]">
                                  {u.permissions.canApproveDiscounts ? "Approved" : "Restricted"}
                                </strong>
                              </div>
                            </div>
                          </div>

                          {isActive ? (
                            <div className="w-full py-2.5 rounded-xl bg-[#2b2d42] text-white text-center text-xs font-semibold">
                              Active Session Holder ({activeSession?.sessionId})
                            </div>
                          ) : (
                            <button
                              onClick={handleLogoutSession}
                              className="w-full py-2.5 rounded-xl bg-[#ef233c] hover:bg-[#d80032] text-white text-xs font-semibold transition"
                            >
                              Sign Out Current to Switch
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* SUB-TAB 6: IMMUTABLE AUDIT TRAIL & ERP ARCHITECTURE CHECKLIST */}
              {settingsSubTab === "ERP_AUDIT_COMPLIANCE" && (
                <div className="space-y-5">
                  <div className="pos-card rounded-2xl p-6 space-y-4">
                    <div>
                      <h3 className="text-lg font-bold text-[#2b2d42]">
                        Modern Secure ERP Architecture Verification
                      </h3>
                      <p className="text-sm text-[#4a4e69] mt-0.5">
                        Active Domain Service & Financial Integrity Guarantees (`src/core/*` &
                        `src/modules/*`)
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                      {[
                        "ACID Transaction Wrapper (withTransaction)",
                        "Minor-Unit Integer Paisa Math (src/core/money)",
                        "Atomic Anti-Overselling Stock Guard",
                        "Double-Entry Balanced Journal Verification",
                        "Append-Only Reversal / Credit Notes",
                        "Atomic Sequential Document Counters",
                        "Historical Cost & Tax Snapshotting on Orders",
                        "Granular RBAC + Branch ABAC Scoping",
                        "NoSQL Operator Sanitizer + Idempotency Keys",
                        "Soft Archiving Only (isArchived: true)",
                        "Fiscal Period Locking Control",
                        "Cashier Shift & Drawer Variance Tracking",
                      ].map((checkItem) => (
                        <div
                          key={checkItem}
                          className="p-3 rounded-xl bg-[#f8fafc] border border-[#d4dce4] flex items-center gap-2 font-semibold text-[#2b2d42]"
                        >
                          <CheckCircle2 className="w-4 h-4 text-[#ef233c] shrink-0" />
                          <span>{checkItem}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pos-card rounded-2xl p-6">
                    <h4 className="font-bold text-base text-[#2b2d42] mb-3.5">
                      Immutable Domain Audit Trail (`AuditLogs` Collection —{" "}
                      {immutableAuditLogs.length} Records)
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="bg-[#2b2d42] text-white">
                            <th className="py-3 px-3 rounded-l-lg font-semibold">Timestamp</th>
                            <th className="py-3 px-3 font-semibold">Module</th>
                            <th className="py-3 px-3 font-semibold">Action</th>
                            <th className="py-3 px-3 font-semibold">Actor</th>
                            <th className="py-3 px-3 rounded-r-lg font-semibold">Summary</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#e2e8f0]">
                          {immutableAuditLogs.map((aud) => (
                            <tr key={aud.id} className="hover:bg-[#f8fafc]">
                              <td className="py-3 px-3 font-mono text-xs text-[#4a4e69]">
                                {new Date(aud.timestamp).toLocaleTimeString()}
                              </td>
                              <td className="py-3 px-3">
                                <span className="px-2 py-0.5 rounded bg-[#edf2f4] text-[#2b2d42] font-mono text-xs font-semibold">
                                  {aud.module}
                                </span>
                              </td>
                              <td className="py-3 px-3 font-mono text-xs font-semibold text-[#d80032]">
                                {aud.action}
                              </td>
                              <td className="py-3 px-3 font-semibold text-[#2b2d42] text-xs">
                                {aud.actorName} ({aud.actorRole})
                              </td>
                              <td className="py-3 px-3 text-xs text-[#4a4e69]">{aud.summary}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* 80mm Thermal Receipt, KOT & PRA JSON Modal */}
      <ReceiptModal
        order={activeReceiptOrder}
        praConfig={praConfig}
        onClose={() => setActiveReceiptOrder(null)}
      />
    </div>
  );
}
