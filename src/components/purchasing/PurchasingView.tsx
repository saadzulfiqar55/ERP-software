"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ClipboardList,
  PackageCheck,
  Plus,
  Send,
  Share2,
  Trash2,
  Truck,
  Users,
} from "lucide-react";
import {
  Button,
  Card,
  Dialog,
  EmptyState,
  FilterChip,
  M3Select,
  OutlinedTextField,
  PageHeader,
  SegmentedButton,
  StatCard,
  StatusChip,
  type StatusChipVariant,
} from "@/components/ui/m3";
import type {
  GoodsReceipt,
  PurchaseItemKind,
  PurchaseOrder,
  PurchaseOrderStatus,
} from "@/lib/types";

// ---------------------------------------------------------------------------------------------
// Types mirroring GET /api/purchasing
// ---------------------------------------------------------------------------------------------

interface SupplierRow {
  id: string;
  name: string;
  phone: string;
  ntnOrCnic: string;
  balanceMinor: number | null;
}
interface MaterialRow {
  id: string;
  name: string;
  sku: string;
  unit: string;
  currentQty: number;
  reorderTarget: number;
  lastUnitCostMinor: number | null;
  avgUnitCostMinor: number | null;
}
interface ProductRow {
  id: string;
  code: string;
  name: string;
  unit: string;
  segment: string;
  stockQty: number;
  variants: { id: string; name: string; costPrice: number }[];
}
interface PurchasingData {
  purchaseOrders: PurchaseOrder[];
  goodsReceipts: GoodsReceipt[];
  suppliers: SupplierRow[];
  materials: MaterialRow[];
  products: ProductRow[];
  permissions: { canManage: boolean; canReceive: boolean; canViewBalances: boolean };
}

/** Editor line: quantities and prices are kept as typed strings until saved. */
interface DraftLine {
  key: string;
  id?: string;
  itemRef: string; // "MATERIAL:<id>" | "PRODUCT:<id>:<variantId>"
  qty: string;
  cost: string; // PKR per unit
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

const fmtPkr = (minor: number) =>
  `PKR ${(minor / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const fmtQty = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 3 });
const fmtDate = (iso?: string) =>
  iso
    ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";
const toMinor = (pkr: string) => Math.round(Number(pkr) * 100);
const newKey = () => Math.random().toString(36).slice(2, 10);

const STATUS_META: Record<PurchaseOrderStatus, { label: string; variant: StatusChipVariant }> = {
  DRAFT: { label: "Draft", variant: "neutral" },
  ORDERED: { label: "Ordered", variant: "primary" },
  PARTIALLY_RECEIVED: { label: "Part received", variant: "warning" },
  RECEIVED: { label: "Received", variant: "success" },
  CLOSED: { label: "Closed short", variant: "neutral" },
  CANCELLED: { label: "Cancelled", variant: "error" },
};

type OrderFilter = "ALL" | "OPEN" | "DRAFT" | "DONE" | "CANCELLED";
const FILTERS: Array<{ id: OrderFilter; label: string; match: (s: PurchaseOrderStatus) => boolean }> = [
  { id: "OPEN", label: "Awaiting delivery", match: (s) => s === "ORDERED" || s === "PARTIALLY_RECEIVED" },
  { id: "DRAFT", label: "Drafts", match: (s) => s === "DRAFT" },
  { id: "DONE", label: "Completed", match: (s) => s === "RECEIVED" || s === "CLOSED" },
  { id: "CANCELLED", label: "Cancelled", match: (s) => s === "CANCELLED" },
  { id: "ALL", label: "All", match: () => true },
];

const remainingValueMinor = (po: PurchaseOrder) =>
  po.lines.reduce(
    (s, l) => s + Math.round(Math.max(0, l.qtyOrdered - l.qtyReceived) * l.unitCostMinor),
    0
  );

function orderShareText(po: PurchaseOrder, businessName: string): string {
  const lines = po.lines
    .map((l) => `• ${l.name}: ${fmtQty(l.qtyOrdered)} ${l.unit} @ ${fmtPkr(l.unitCostMinor)}`)
    .join("\n");
  return [
    `Purchase order ${po.poNumber}`,
    `From: ${businessName}`,
    `To: ${po.supplierName}`,
    po.expectedDate ? `Deliver by: ${fmtDate(po.expectedDate)}` : "",
    "",
    lines,
    "",
    `Total: ${fmtPkr(po.totalMinor)}`,
    po.notes ? `Notes: ${po.notes}` : "",
  ]
    .filter((x) => x !== "")
    .join("\n");
}

async function postAction(body: Record<string, unknown>) {
  let res: Response;
  try {
    res = await fetch("/api/purchasing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    throw new Error(
      err instanceof DOMException && err.name === "TimeoutError"
        ? "The server took too long to answer. Refresh the page to check whether it was saved before trying again."
        : "No connection. Check your internet and try again."
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Only trust "nothing was saved" when the server said so; a gateway timeout (502/504) can
    // arrive after the change was committed.
    throw new Error(
      data.error ||
        (res.status === 502 || res.status === 503 || res.status === 504
          ? "The server didn't answer in time. Refresh the page to check whether it was saved before trying again."
          : `Something went wrong (error ${res.status}). Refresh the page to check before trying again.`)
    );
  }
  return data as PurchasingData & { message?: string; poId?: string; supplierId?: string };
}

// ---------------------------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------------------------

export function PurchasingView({
  businessName,
  newOrderSignal,
  onShowSnackbar,
  onStockChanged,
  onOpenOrdersCount,
  onOpenSupplierLedger,
}: {
  businessName: string;
  /** Increments when "New purchase order" is chosen elsewhere (e.g. the Create menu). */
  newOrderSignal?: number;
  onShowSnackbar: (message: string) => void;
  /** Called after goods are received so the rest of the app reloads stock, costs and khata. */
  onStockChanged: () => void;
  onOpenOrdersCount?: (count: number) => void;
  onOpenSupplierLedger?: () => void;
}) {
  const [data, setData] = useState<PurchasingData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState<"ORDERS" | "RECEIPTS" | "SUPPLIERS">("ORDERS");
  const [filter, setFilter] = useState<OrderFilter>("OPEN");
  const [busy, setBusy] = useState(false);

  // Dialog state
  const [editor, setEditor] = useState<null | {
    id?: string;
    poNumber?: string;
    supplierId: string;
    expectedDate: string;
    notes: string;
    lines: DraftLine[];
  }>(null);
  const [editorError, setEditorError] = useState("");
  const [supplierDialog, setSupplierDialog] = useState<null | {
    name: string;
    phone: string;
    ntn: string;
    thenOpenEditor: boolean;
    /** Lines to put in the new order once the supplier exists (e.g. a low-stock reorder). */
    pendingLines?: DraftLine[];
  }>(null);
  const [supplierError, setSupplierError] = useState("");
  const [receiving, setReceiving] = useState<null | {
    po: PurchaseOrder;
    qty: Record<string, string>;
    cost: Record<string, string>;
    billRef: string;
    notes: string;
    key: string;
  }>(null);
  const [receiveError, setReceiveError] = useState("");
  const [viewing, setViewing] = useState<PurchaseOrder | null>(null);
  const [confirm, setConfirm] = useState<null | { kind: "cancel" | "close"; po: PurchaseOrder }>(null);

  const apply = useCallback(
    (next: PurchasingData) => {
      setData(next);
      onOpenOrdersCount?.(
        next.purchaseOrders.filter((p) => p.status === "ORDERED" || p.status === "PARTIALLY_RECEIVED").length
      );
    },
    [onOpenOrdersCount]
  );

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const res = await fetch("/api/purchasing", { signal: AbortSignal.timeout(30_000) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not load purchasing.");
      apply(json as PurchasingData);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load purchasing.");
    }
  }, [apply]);

  useEffect(() => {
    void load();
  }, [load]);

  // ---- derived -------------------------------------------------------------------------------
  const orders = useMemo(() => data?.purchaseOrders ?? [], [data]);
  const filtered = useMemo(
    () => orders.filter((o) => FILTERS.find((f) => f.id === filter)!.match(o.status)),
    [orders, filter]
  );
  const openOrders = orders.filter((o) => o.status === "ORDERED" || o.status === "PARTIALLY_RECEIVED");
  const awaitingValue = openOrders.reduce((s, o) => s + remainingValueMinor(o), 0);
  const monthKey = new Date().toISOString().slice(0, 7);
  const receivedThisMonth = (data?.goodsReceipts ?? [])
    .filter((g) => g.receivedAt.slice(0, 7) === monthKey)
    .reduce((s, g) => s + g.totalMinor, 0);
  const payablesMinor = (data?.suppliers ?? []).reduce(
    (s, sp) => s + (sp.balanceMinor !== null && sp.balanceMinor < 0 ? -sp.balanceMinor : 0),
    0
  );
  const lowStock = (data?.materials ?? []).filter((m) => m.currentQty < m.reorderTarget);
  const onOrderMaterialIds = new Set(
    openOrders.flatMap((o) =>
      o.lines.filter((l) => l.itemKind === "MATERIAL" && l.qtyReceived < l.qtyOrdered).map((l) => l.itemId)
    )
  );
  const lowStockNotOnOrder = lowStock.filter((m) => !onOrderMaterialIds.has(m.id));

  const itemOptions = useMemo(() => {
    if (!data) return [];
    const mats = data.materials.map((m) => ({
      value: `MATERIAL:${m.id}`,
      label: `${m.name} · ${m.unit} (stock ${fmtQty(m.currentQty)})`,
    }));
    const prods = data.products.flatMap((p) =>
      p.variants.map((v) => ({
        value: `PRODUCT:${p.id}:${v.id}`,
        label: `${p.name}${p.variants.length > 1 ? ` (${v.name})` : ""} · #${p.code}${p.segment === "RETAIL" ? ` (stock ${fmtQty(p.stockQty)})` : ""}`,
      }))
    );
    return [...mats, ...prods];
  }, [data]);

  const defaultCostFor = (ref: string): string => {
    if (!data) return "";
    const [kind, id, variantId] = ref.split(":");
    if (kind === "MATERIAL") {
      const m = data.materials.find((x) => x.id === id);
      const c = m?.lastUnitCostMinor ?? m?.avgUnitCostMinor;
      return c ? String(c / 100) : "";
    }
    const v = data.products.find((p) => p.id === id)?.variants.find((x) => x.id === variantId);
    return v && v.costPrice ? String(v.costPrice) : "";
  };

  // ---- editor --------------------------------------------------------------------------------
  function openNewOrder(prefill?: DraftLine[], supplierId?: string) {
    if (data && data.suppliers.length === 0) {
      setSupplierError("");
      setSupplierDialog({ name: "", phone: "", ntn: "", thenOpenEditor: true, pendingLines: prefill });
      return;
    }
    setEditorError("");
    setEditor({
      supplierId: supplierId || data?.suppliers[0]?.id || "",
      expectedDate: "",
      notes: "",
      lines: prefill && prefill.length ? prefill : [{ key: newKey(), itemRef: "", qty: "", cost: "" }],
    });
  }

  useEffect(() => {
    if (newOrderSignal && data) openNewOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newOrderSignal, data !== null]);

  function openEditDraft(po: PurchaseOrder) {
    setEditorError("");
    setViewing(null);
    setEditor({
      id: po.id,
      poNumber: po.poNumber,
      supplierId: po.supplierId,
      expectedDate: po.expectedDate || "",
      notes: po.notes || "",
      lines: po.lines.map((l) => ({
        key: newKey(),
        id: l.id,
        itemRef: l.itemKind === "MATERIAL" ? `MATERIAL:${l.itemId}` : `PRODUCT:${l.itemId}:${l.variantId || ""}`,
        qty: String(l.qtyOrdered),
        cost: String(l.unitCostMinor / 100),
      })),
    });
  }

  function reorderLowStock() {
    openNewOrder(
      lowStockNotOnOrder.map((m) => ({
        key: newKey(),
        itemRef: `MATERIAL:${m.id}`,
        qty: String(Math.max(1, Math.ceil(m.reorderTarget * 2 - m.currentQty))),
        cost: m.lastUnitCostMinor ? String(m.lastUnitCostMinor / 100) : "",
      }))
    );
  }

  const editorTotal = editor
    ? editor.lines.reduce((s, l) => s + Math.round((Number(l.qty) || 0) * toMinor(l.cost || "0")), 0)
    : 0;

  async function saveEditor(place: boolean) {
    if (!editor) return;
    const used = editor.lines.filter((l) => l.itemRef || l.qty || l.cost);
    if (!editor.supplierId) return setEditorError("Choose a supplier.");
    if (used.length === 0) return setEditorError("Add at least one item.");
    for (const [i, l] of used.entries()) {
      if (!l.itemRef) return setEditorError(`Line ${i + 1}: choose an item.`);
      if (!(Number(l.qty) > 0)) return setEditorError(`Line ${i + 1}: enter a quantity above 0.`);
      if (l.cost === "" || !(Number(l.cost) >= 0)) return setEditorError(`Line ${i + 1}: enter the cost per unit (0 if free).`);
    }
    setBusy(true);
    setEditorError("");
    try {
      const next = await postAction({
        action: "SAVE_ORDER",
        id: editor.id,
        supplierId: editor.supplierId,
        expectedDate: editor.expectedDate || undefined,
        notes: editor.notes,
        place,
        lines: used.map((l) => {
          const [kind, itemId, variantId] = l.itemRef.split(":");
          return {
            id: l.id,
            itemKind: kind as PurchaseItemKind,
            itemId,
            variantId: variantId || undefined,
            qtyOrdered: Number(l.qty),
            unitCostMinor: toMinor(l.cost),
          };
        }),
      });
      apply(next);
      setEditor(null);
      setFilter(place ? "OPEN" : "DRAFT");
      setTab("ORDERS");
      onShowSnackbar(next.message || "Saved.");
    } catch (e) {
      setEditorError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  // ---- suppliers ---------------------------------------------------------------------------------
  async function saveSupplier() {
    if (!supplierDialog) return;
    if (!supplierDialog.name.trim()) return setSupplierError("Enter the supplier's name.");
    setBusy(true);
    setSupplierError("");
    try {
      const next = await postAction({
        action: "CREATE_SUPPLIER",
        name: supplierDialog.name,
        phone: supplierDialog.phone,
        ntnOrCnic: supplierDialog.ntn,
      });
      apply(next);
      const then = supplierDialog.thenOpenEditor;
      const pending = supplierDialog.pendingLines;
      setSupplierDialog(null);
      onShowSnackbar(next.message || "Supplier added.");
      if (then) {
        setEditorError("");
        setEditor((prev) =>
          prev
            ? { ...prev, supplierId: next.supplierId || prev.supplierId }
            : {
                supplierId: next.supplierId || "",
                expectedDate: "",
                notes: "",
                lines:
                  pending && pending.length
                    ? pending
                    : [{ key: newKey(), itemRef: "", qty: "", cost: "" }],
              }
        );
      } else if (editor && next.supplierId) {
        setEditor({ ...editor, supplierId: next.supplierId });
      }
    } catch (e) {
      setSupplierError(e instanceof Error ? e.message : "Could not add the supplier.");
    } finally {
      setBusy(false);
    }
  }

  // ---- receiving -----------------------------------------------------------------------------
  function openReceive(po: PurchaseOrder) {
    setViewing(null);
    setReceiveError("");
    const qty: Record<string, string> = {};
    const cost: Record<string, string> = {};
    for (const l of po.lines) {
      const remaining = Math.max(0, Math.round((l.qtyOrdered - l.qtyReceived) * 1000) / 1000);
      qty[l.id] = remaining > 0 ? String(remaining) : "";
      cost[l.id] = String(l.unitCostMinor / 100);
    }
    setReceiving({ po, qty, cost, billRef: "", notes: "", key: crypto.randomUUID() });
  }

  const receiveTotal = receiving
    ? receiving.po.lines.reduce(
        (s, l) => s + Math.round((Number(receiving.qty[l.id]) || 0) * toMinor(receiving.cost[l.id] || "0")),
        0
      )
    : 0;

  async function submitReceive() {
    if (!receiving) return;
    const lines = receiving.po.lines
      .filter((l) => Number(receiving.qty[l.id]) > 0)
      .map((l) => ({
        poLineId: l.id,
        qty: Number(receiving.qty[l.id]),
        unitCostMinor: toMinor(receiving.cost[l.id] || "0"),
      }));
    if (lines.length === 0) return setReceiveError("Enter the quantity that arrived for at least one item.");
    for (const l of receiving.po.lines) {
      const q = Number(receiving.qty[l.id] || 0);
      const remaining = l.qtyOrdered - l.qtyReceived;
      if (q < 0) return setReceiveError(`${l.name}: quantity can't be negative.`);
      if (q > remaining + 1e-9)
        return setReceiveError(`${l.name}: only ${fmtQty(remaining)} ${l.unit} still expected.`);
    }
    setBusy(true);
    setReceiveError("");
    try {
      const next = await postAction({
        action: "RECEIVE",
        poId: receiving.po.id,
        idempotencyKey: receiving.key,
        supplierInvoiceRef: receiving.billRef,
        notes: receiving.notes,
        lines,
      });
      apply(next);
      setReceiving(null);
      onShowSnackbar(`${next.message || "Goods received."} Stock updated.`);
      onStockChanged();
    } catch (e) {
      setReceiveError(e instanceof Error ? e.message : "Could not record the receipt.");
    } finally {
      setBusy(false);
    }
  }

  async function runSimple(action: "PLACE_ORDER" | "CANCEL_ORDER" | "CLOSE_ORDER", po: PurchaseOrder) {
    setBusy(true);
    try {
      const next = await postAction({ action, poId: po.id });
      apply(next);
      setViewing(next.purchaseOrders.find((p) => p.id === po.id) || null);
      onShowSnackbar(next.message || "Done.");
    } catch (e) {
      onShowSnackbar(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  // ---- render --------------------------------------------------------------------------------
  if (!data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Purchasing" subtitle="Order from suppliers and receive stock" />
        <Card>
          {loadError ? (
            <EmptyState
              icon={<AlertTriangle className="w-6 h-6" />}
              title="Purchasing could not be loaded"
              subtitle={loadError}
              action={<Button onClick={() => void load()}>Try again</Button>}
            />
          ) : (
            <div className="space-y-3 animate-pulse" aria-label="Loading purchasing">
              <div className="h-5 w-48 rounded bg-md-surface-container-high" />
              <div className="h-4 w-full rounded bg-md-surface-container-low" />
              <div className="h-4 w-5/6 rounded bg-md-surface-container-low" />
              <div className="h-4 w-2/3 rounded bg-md-surface-container-low" />
            </div>
          )}
        </Card>
      </div>
    );
  }

  const { canManage, canReceive, canViewBalances } = data.permissions;
  const supplierOptions = data.suppliers.map((s) => ({ value: s.id, label: s.name }));
  const viewingReceipts = viewing
    ? data.goodsReceipts.filter((g) => g.poId === viewing.id)
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchasing"
        subtitle="Order from suppliers, receive deliveries, and keep stock and costs up to date"
        actions={
          canManage ? (
            <>
              <Button
                variant="tonal"
                icon={<Users className="w-4 h-4" />}
                onClick={() => {
                  setSupplierError("");
                  setSupplierDialog({ name: "", phone: "", ntn: "", thenOpenEditor: false });
                }}
              >
                New supplier
              </Button>
              <Button icon={<Plus className="w-4 h-4" />} onClick={() => openNewOrder()}>
                New purchase order
              </Button>
            </>
          ) : undefined
        }
      />

      <div className={`grid grid-cols-1 sm:grid-cols-2 ${canViewBalances ? "xl:grid-cols-4" : "xl:grid-cols-3"} gap-5`}>
        <StatCard
          label="Awaiting delivery"
          value={String(openOrders.length)}
          icon={<Truck className="w-5 h-5" />}
          chipLabel={fmtPkr(awaitingValue)}
          chipVariant="primary"
          caption="still to arrive"
        />
        <StatCard
          label="Received this month"
          value={fmtPkr(receivedThisMonth)}
          icon={<PackageCheck className="w-5 h-5" />}
          chipLabel={(() => {
            const n = data.goodsReceipts.filter((g) => g.receivedAt.slice(0, 7) === monthKey).length;
            return `${n} deliver${n === 1 ? "y" : "ies"}`;
          })()}
          chipVariant="success"
        />
        <StatCard
          label="Low-stock materials"
          value={String(lowStock.length)}
          icon={<AlertTriangle className="w-5 h-5" />}
          chipLabel={`${lowStockNotOnOrder.length} not on order`}
          chipVariant={lowStockNotOnOrder.length ? "warning" : "success"}
        />
        {canViewBalances && (
          <StatCard
            label="Owed to suppliers"
            value={fmtPkr(payablesMinor)}
            icon={<Users className="w-5 h-5" />}
            chipLabel={`${data.suppliers.length} supplier${data.suppliers.length === 1 ? "" : "s"}`}
            chipVariant="neutral"
          />
        )}
      </div>

      {canManage && lowStockNotOnOrder.length > 0 && (
        <Card variant="tonal" className="flex flex-wrap items-center justify-between gap-4 md-anim-rise">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-md-warning-container text-md-on-warning-container flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-md-on-surface">
                {lowStockNotOnOrder.length} material{lowStockNotOnOrder.length === 1 ? " is" : "s are"} below the reorder level
              </div>
              <div className="text-xs text-md-on-surface-variant truncate">
                {lowStockNotOnOrder.slice(0, 4).map((m) => m.name).join(", ")}
                {lowStockNotOnOrder.length > 4 ? ` and ${lowStockNotOnOrder.length - 4} more` : ""}
              </div>
            </div>
          </div>
          <Button variant="filled" onClick={reorderLowStock}>
            Create reorder
          </Button>
        </Card>
      )}

      <SegmentedButton
        value={tab}
        onChange={setTab}
        options={[
          { value: "ORDERS", label: `Purchase orders (${orders.length})` },
          { value: "RECEIPTS", label: "Goods received" },
          { value: "SUPPLIERS", label: `Suppliers (${data.suppliers.length})` },
        ]}
      />

      {tab === "ORDERS" && (
        <Card className="p-0! overflow-hidden">
          <div className="flex flex-wrap gap-2 p-4 border-b border-md-divider">
            {FILTERS.map((f) => (
              <FilterChip
                key={f.id}
                label={`${f.label} (${orders.filter((o) => f.match(o.status)).length})`}
                selected={filter === f.id}
                onClick={() => setFilter(f.id)}
              />
            ))}
          </div>
          {filtered.length === 0 ? (
            <EmptyState
              icon={<ClipboardList className="w-6 h-6" />}
              title={orders.length === 0 ? "No purchase orders yet" : "Nothing here"}
              subtitle={
                orders.length === 0
                  ? "Create an order for a supplier. When the delivery arrives, receive it here and your stock and costs update automatically."
                  : "No orders match this filter."
              }
              action={
                orders.length === 0 && canManage ? (
                  <Button icon={<Plus className="w-4 h-4" />} onClick={() => openNewOrder()}>
                    New purchase order
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
            {/* Phones: one card per order with its main action in reach */}
            <ul className="sm:hidden divide-y divide-md-divider">
              {filtered.map((po) => {
                const open = po.status === "ORDERED" || po.status === "PARTIALLY_RECEIVED";
                return (
                  <li key={po.id} className="p-4 flex items-start gap-3" onClick={() => setViewing(po)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-md-primary font-medium">{po.poNumber}</span>
                        <StatusChip label={STATUS_META[po.status].label} variant={STATUS_META[po.status].variant} />
                      </div>
                      <div className="text-sm text-md-on-surface mt-1 truncate">{po.supplierName}</div>
                      <div className="text-xs text-md-on-surface-variant">
                        {po.lines.length} item{po.lines.length === 1 ? "" : "s"} · {fmtPkr(po.totalMinor)}
                        {po.expectedDate ? ` · by ${fmtDate(po.expectedDate)}` : ""}
                      </div>
                    </div>
                    <div onClick={(e) => e.stopPropagation()}>
                      {open && canReceive ? (
                        <Button size="sm" onClick={() => openReceive(po)}>
                          Receive
                        </Button>
                      ) : po.status === "DRAFT" && canManage ? (
                        <Button size="sm" variant="tonal" onClick={() => openEditDraft(po)}>
                          Edit
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="overflow-x-auto hidden sm:block">
              <table className="md-table w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-md-divider text-xs font-medium text-md-on-surface-variant">
                    <th className="py-3 px-4">Order</th>
                    <th className="py-3 px-3">Supplier</th>
                    <th className="py-3 px-3 hidden md:table-cell">Expected</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3 hidden sm:table-cell">Received</th>
                    <th className="py-3 px-3 text-right">Total</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-md-divider">
                  {filtered.map((po) => {
                    const ordered = po.lines.reduce((s, l) => s + l.qtyOrdered, 0);
                    const got = po.lines.reduce((s, l) => s + Math.min(l.qtyReceived, l.qtyOrdered), 0);
                    const pct = ordered > 0 ? Math.round((got / ordered) * 100) : 0;
                    const overdue =
                      po.expectedDate &&
                      (po.status === "ORDERED" || po.status === "PARTIALLY_RECEIVED") &&
                      po.expectedDate < new Date().toISOString().slice(0, 10);
                    return (
                      <tr key={po.id} className="cursor-pointer" onClick={() => setViewing(po)}>
                        <td className="py-3 px-4">
                          <div className="font-mono text-xs text-md-primary font-medium whitespace-nowrap">{po.poNumber}</div>
                          <div className="text-xs text-md-on-surface-variant">{fmtDate(po.createdAt)}</div>
                        </td>
                        <td className="py-3 px-3 min-w-36">
                          <div className="text-md-on-surface">{po.supplierName}</div>
                          <div className="text-xs text-md-on-surface-variant">
                            {po.lines.length} item{po.lines.length === 1 ? "" : "s"}
                          </div>
                        </td>
                        <td className={`py-3 px-3 hidden md:table-cell text-xs ${overdue ? "text-md-error font-medium" : "text-md-on-surface-variant"}`}>
                          {fmtDate(po.expectedDate)}
                          {overdue ? " · late" : ""}
                        </td>
                        <td className="py-3 px-3">
                          <StatusChip label={STATUS_META[po.status].label} variant={STATUS_META[po.status].variant} />
                        </td>
                        <td className="py-3 px-3 hidden sm:table-cell w-36">
                          {po.status === "DRAFT" || po.status === "CANCELLED" ? (
                            <span className="text-xs text-md-on-surface-variant">—</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 rounded-full bg-md-surface-container-high overflow-hidden">
                                <div className="h-full rounded-full bg-md-primary" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs tabular-nums text-md-on-surface-variant">{pct}%</span>
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                          {fmtPkr(po.totalMinor)}
                        </td>
                        <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          {(po.status === "ORDERED" || po.status === "PARTIALLY_RECEIVED") && canReceive ? (
                            <Button size="sm" icon={<PackageCheck className="w-4 h-4" />} onClick={() => openReceive(po)}>
                              Receive
                            </Button>
                          ) : po.status === "DRAFT" && canManage ? (
                            <Button size="sm" variant="tonal" onClick={() => openEditDraft(po)}>
                              Edit
                            </Button>
                          ) : (
                            <Button size="sm" variant="text" onClick={() => setViewing(po)}>
                              View
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
        </Card>
      )}

      {tab === "RECEIPTS" && (
        <Card className="p-0! overflow-hidden">
          {data.goodsReceipts.length === 0 ? (
            <EmptyState
              icon={<PackageCheck className="w-6 h-6" />}
              title="No deliveries received yet"
              subtitle="When a supplier delivers, open the order and choose Receive. Each delivery gets a goods received note (GRN)."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="md-table w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-md-divider text-xs font-medium text-md-on-surface-variant">
                    <th className="py-3 px-4">GRN</th>
                    <th className="py-3 px-3">Supplier</th>
                    <th className="py-3 px-3 hidden md:table-cell">Order</th>
                    <th className="py-3 px-3 hidden md:table-cell">Supplier bill</th>
                    <th className="py-3 px-3 hidden lg:table-cell">Items</th>
                    <th className="py-3 px-3 text-right">Value</th>
                    {canViewBalances && <th className="py-3 px-4 hidden sm:table-cell">Khata voucher</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-md-divider">
                  {data.goodsReceipts.map((g) => (
                    <tr key={g.id}>
                      <td className="py-3 px-4">
                        <div className="font-mono text-xs text-md-primary font-medium whitespace-nowrap">{g.grnNumber}</div>
                        <div className="text-xs text-md-on-surface-variant">
                          {fmtDate(g.receivedAt)} · {g.receivedBy}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-md-on-surface">{g.supplierName}</td>
                      <td className="py-3 px-3 hidden md:table-cell font-mono text-xs">{g.poNumber}</td>
                      <td className="py-3 px-3 hidden md:table-cell text-xs text-md-on-surface-variant">{g.supplierInvoiceRef || "—"}</td>
                      <td className="py-3 px-3 hidden lg:table-cell text-xs text-md-on-surface-variant max-w-xs truncate">
                        {g.lines.map((l) => `${fmtQty(l.qty)} ${l.unit} ${l.name}`).join(", ")}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-xs tabular-nums whitespace-nowrap">{fmtPkr(g.totalMinor)}</td>
                      {canViewBalances && (
                        <td className="py-3 px-4 hidden sm:table-cell font-mono text-xs text-md-on-surface-variant">
                          {g.ledgerVoucherNo || "—"}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.goodsReceipts.length >= 50 && (
                <div className="px-4 py-3 text-xs text-md-on-surface-variant border-t border-md-divider">
                  Showing the 50 most recent deliveries.
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {tab === "SUPPLIERS" && (
        <Card className="p-0! overflow-hidden">
          {data.suppliers.length === 0 ? (
            <EmptyState
              icon={<Users className="w-6 h-6" />}
              title="No suppliers yet"
              subtitle="Add the vendors you buy from. Their bills are tracked on their khata automatically when you receive goods."
              action={
                canManage ? (
                  <Button onClick={() => setSupplierDialog({ name: "", phone: "", ntn: "", thenOpenEditor: false })}>
                    Add supplier
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="md-table w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-md-divider text-xs font-medium text-md-on-surface-variant">
                    <th className="py-3 px-4">Supplier</th>
                    <th className="py-3 px-3 hidden sm:table-cell">Phone</th>
                    <th className="py-3 px-3">Open orders</th>
                    {canViewBalances && <th className="py-3 px-3 text-right">We owe</th>}
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-md-divider">
                  {data.suppliers.map((s) => {
                    const open = openOrders.filter((o) => o.supplierId === s.id).length;
                    return (
                      <tr key={s.id}>
                        <td className="py-3 px-4">
                          <div className="text-md-on-surface">{s.name}</div>
                          {s.ntnOrCnic && <div className="text-xs text-md-on-surface-variant">NTN/CNIC {s.ntnOrCnic}</div>}
                        </td>
                        <td className="py-3 px-3 hidden sm:table-cell text-xs text-md-on-surface-variant">{s.phone}</td>
                        <td className="py-3 px-3 text-xs">{open}</td>
                        {canViewBalances && (
                          <td className="py-3 px-3 text-right font-mono text-xs tabular-nums">
                            {s.balanceMinor !== null && s.balanceMinor < 0 ? fmtPkr(-s.balanceMinor) : fmtPkr(0)}
                          </td>
                        )}
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex gap-1">
                            {canViewBalances && onOpenSupplierLedger && (
                              <Button size="sm" variant="text" onClick={onOpenSupplierLedger}>
                                Khata
                              </Button>
                            )}
                            {canManage && (
                              <Button size="sm" variant="tonal" onClick={() => openNewOrder(undefined, s.id)}>
                                Order
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
      )}

      {/* ---- Order editor ---------------------------------------------------------------- */}
      <Dialog
        open={editor !== null}
        onClose={() => setEditor(null)}
        dismissible={!busy}
        size="xl"
        icon={<ClipboardList className="w-5 h-5" />}
        title={editor?.poNumber ? `Edit ${editor.poNumber}` : "New purchase order"}
        description="Choose the supplier and what you're ordering. Save as a draft, or place it to start waiting for delivery."
        footer={
          <>
            <span className="mr-auto text-sm text-md-on-surface">
              Total <span className="font-mono font-medium tabular-nums">{fmtPkr(editorTotal)}</span>
            </span>
            <Button variant="text" onClick={() => setEditor(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="outlined" onClick={() => void saveEditor(false)} disabled={busy}>
              Save draft
            </Button>
            <Button icon={<Send className="w-4 h-4" />} onClick={() => void saveEditor(true)} disabled={busy}>
              {busy ? "Saving…" : "Place order"}
            </Button>
          </>
        }
      >
        {editor && (
          <div className="space-y-5">
            {editorError && (
              <div role="alert" className="rounded-2xl p-3.5 text-sm bg-md-error-container text-md-on-error-container">
                {editorError}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-md-on-surface-variant block mb-1.5">Supplier</label>
                <div className="flex gap-2">
                  <div className="flex-1 min-w-0">
                    <M3Select
                      ariaLabel="Supplier"
                      value={editor.supplierId}
                      options={supplierOptions}
                      placeholder="Choose a supplier"
                      onChange={(v) => setEditor({ ...editor, supplierId: v })}
                    />
                  </div>
                  <Button
                    variant="tonal"
                    onClick={() => {
                      setSupplierError("");
                      setSupplierDialog({ name: "", phone: "", ntn: "", thenOpenEditor: false });
                    }}
                  >
                    New
                  </Button>
                </div>
              </div>
              <OutlinedTextField
                label="Deliver by (optional)"
                type="date"
                value={editor.expectedDate}
                onChange={(v) => setEditor({ ...editor, expectedDate: v })}
              />
            </div>

            <div className="rounded-2xl bg-md-surface-container-low p-3 sm:p-4 space-y-3">
              <div className="hidden md:grid grid-cols-[1fr_110px_130px_120px_40px] gap-3 px-1 text-xs font-medium text-md-on-surface-variant">
                <span>Item</span>
                <span>Quantity</span>
                <span>Cost / unit (PKR)</span>
                <span className="text-right">Line total</span>
                <span />
              </div>
              {editor.lines.map((line, idx) => {
                const unit = (() => {
                  const [kind, id] = line.itemRef.split(":");
                  if (kind === "MATERIAL") return data.materials.find((m) => m.id === id)?.unit;
                  if (kind === "PRODUCT") return data.products.find((p) => p.id === id)?.unit;
                  return undefined;
                })();
                const lineTotal = Math.round((Number(line.qty) || 0) * toMinor(line.cost || "0"));
                const update = (patch: Partial<DraftLine>) =>
                  setEditor({
                    ...editor,
                    lines: editor.lines.map((l) => (l.key === line.key ? { ...l, ...patch } : l)),
                  });
                return (
                  <div
                    key={line.key}
                    className="grid grid-cols-2 md:grid-cols-[1fr_110px_130px_120px_40px] gap-3 items-center rounded-xl bg-md-surface-container-lowest md:bg-transparent p-3 md:p-0 shadow-(--md-elevation-1) md:shadow-none"
                  >
                    <div className="col-span-2 md:col-span-1 min-w-0">
                      <M3Select
                        ariaLabel={`Item on line ${idx + 1}`}
                        value={line.itemRef}
                        options={itemOptions}
                        placeholder={itemOptions.length ? "Choose an item" : "Add materials or products first"}
                        minMenuWidth={320}
                        onChange={(v) => update({ itemRef: v, cost: line.cost || defaultCostFor(v) })}
                      />
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        aria-label={`Quantity on line ${idx + 1}`}
                        value={line.qty}
                        onChange={(e) => update({ qty: e.target.value })}
                        placeholder="Qty"
                        className="w-full h-11 rounded-xl border border-md-outline-variant/85 bg-md-surface-container-lowest px-3 pr-12 text-sm tabular-nums focus:border-md-primary outline-none"
                      />
                      {unit && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-md-on-surface-variant pointer-events-none">
                          {unit}
                        </span>
                      )}
                    </div>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      aria-label={`Cost per unit on line ${idx + 1}`}
                      value={line.cost}
                      onChange={(e) => update({ cost: e.target.value })}
                      placeholder="Cost"
                      className="w-full h-11 rounded-xl border border-md-outline-variant/85 bg-md-surface-container-lowest px-3 text-sm tabular-nums focus:border-md-primary outline-none"
                    />
                    <div className="text-right font-mono text-xs tabular-nums text-md-on-surface">
                      {fmtPkr(lineTotal)}
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove line ${idx + 1}`}
                      disabled={editor.lines.length === 1}
                      onClick={() => setEditor({ ...editor, lines: editor.lines.filter((l) => l.key !== line.key) })}
                      className="w-10 h-10 justify-self-end rounded-full flex items-center justify-center text-md-on-surface-variant hover:bg-md-error-container hover:text-md-on-error-container disabled:opacity-30 disabled:pointer-events-none"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
              <Button
                variant="text"
                size="sm"
                icon={<Plus className="w-4 h-4" />}
                onClick={() =>
                  setEditor({ ...editor, lines: [...editor.lines, { key: newKey(), itemRef: "", qty: "", cost: "" }] })
                }
              >
                Add item
              </Button>
              {itemOptions.length === 0 && (
                <p className="text-xs text-md-on-surface-variant px-1">
                  There is nothing to order yet. Add materials under Inventory → Material Stock, or products to your catalog.
                </p>
              )}
            </div>

            <OutlinedTextField
              label="Notes for the supplier (optional)"
              multiline
              rows={2}
              value={editor.notes}
              onChange={(v) => setEditor({ ...editor, notes: v })}
            />
          </div>
        )}
      </Dialog>

      {/* ---- New supplier ---------------------------------------------------------------- */}
      <Dialog
        open={supplierDialog !== null}
        onClose={() => setSupplierDialog(null)}
        dismissible={!busy}
        size="sm"
        icon={<Users className="w-5 h-5" />}
        title="New supplier"
        description="Bills from this supplier will be tracked on their khata."
        footer={
          <>
            <Button variant="text" onClick={() => setSupplierDialog(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void saveSupplier()} disabled={busy}>
              {busy ? "Saving…" : "Add supplier"}
            </Button>
          </>
        }
      >
        {supplierDialog && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void saveSupplier();
            }}
          >
            {supplierError && (
              <div role="alert" className="rounded-2xl p-3.5 text-sm bg-md-error-container text-md-on-error-container">
                {supplierError}
              </div>
            )}
            <OutlinedTextField
              label="Name"
              required
              placeholder="e.g. Al-Madina Traders"
              value={supplierDialog.name}
              onChange={(v) => setSupplierDialog({ ...supplierDialog, name: v })}
            />
            <OutlinedTextField
              label="Phone (optional)"
              placeholder="0300-1234567"
              value={supplierDialog.phone}
              onChange={(v) => setSupplierDialog({ ...supplierDialog, phone: v })}
            />
            <OutlinedTextField
              label="NTN / CNIC (optional)"
              value={supplierDialog.ntn}
              onChange={(v) => setSupplierDialog({ ...supplierDialog, ntn: v })}
            />
            <button type="submit" className="hidden" />
          </form>
        )}
      </Dialog>

      {/* ---- Receive goods ----------------------------------------------------------------- */}
      <Dialog
        open={receiving !== null}
        onClose={() => setReceiving(null)}
        dismissible={!busy}
        size="lg"
        icon={<PackageCheck className="w-5 h-5" />}
        title={receiving ? `Receive ${receiving.po.poNumber}` : "Receive goods"}
        description={
          receiving
            ? `Enter what actually arrived from ${receiving.po.supplierName}. Leave a line at 0 if it hasn't come yet; you can receive the rest later.`
            : undefined
        }
        footer={
          <>
            <span className="mr-auto text-sm text-md-on-surface">
              Delivery value <span className="font-mono font-medium tabular-nums">{fmtPkr(receiveTotal)}</span>
            </span>
            <Button variant="text" onClick={() => setReceiving(null)} disabled={busy}>
              Cancel
            </Button>
            <Button icon={<PackageCheck className="w-4 h-4" />} onClick={() => void submitReceive()} disabled={busy}>
              {busy ? "Recording…" : "Record delivery"}
            </Button>
          </>
        }
      >
        {receiving && (
          <div className="space-y-4">
            {receiveError && (
              <div role="alert" className="rounded-2xl p-3.5 text-sm bg-md-error-container text-md-on-error-container">
                {receiveError}
              </div>
            )}
            <div className="space-y-2">
              {receiving.po.lines.map((l) => {
                const remaining = Math.max(0, Math.round((l.qtyOrdered - l.qtyReceived) * 1000) / 1000);
                const done = remaining <= 0;
                const costChanged = toMinor(receiving.cost[l.id] || "0") !== l.unitCostMinor;
                return (
                  <div
                    key={l.id}
                    className={`rounded-2xl p-3.5 grid grid-cols-2 sm:grid-cols-[1fr_130px_130px] gap-3 items-center ${done ? "bg-md-surface-container-low/50 opacity-70" : "bg-md-surface-container-low"}`}
                  >
                    <div className="col-span-2 sm:col-span-1 min-w-0">
                      <div className="text-sm font-medium text-md-on-surface truncate">{l.name}</div>
                      <div className="text-xs text-md-on-surface-variant">
                        Ordered {fmtQty(l.qtyOrdered)} {l.unit}
                        {l.qtyReceived > 0 ? ` · already received ${fmtQty(l.qtyReceived)}` : ""}
                        {done ? " · complete" : ` · ${fmtQty(remaining)} to come`}
                      </div>
                    </div>
                    <label className="block">
                      <span className="text-[11px] text-md-on-surface-variant">Arrived now ({l.unit})</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={remaining}
                        step="any"
                        disabled={done}
                        value={receiving.qty[l.id] ?? ""}
                        onChange={(e) => setReceiving({ ...receiving, qty: { ...receiving.qty, [l.id]: e.target.value } })}
                        className="mt-0.5 w-full h-10 rounded-xl border border-md-outline-variant/85 bg-md-surface-container-lowest px-3 text-sm tabular-nums focus:border-md-primary outline-none disabled:opacity-50"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] text-md-on-surface-variant">Cost / unit (PKR)</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        disabled={done}
                        value={receiving.cost[l.id] ?? ""}
                        onChange={(e) => setReceiving({ ...receiving, cost: { ...receiving.cost, [l.id]: e.target.value } })}
                        className={`mt-0.5 w-full h-10 rounded-xl border bg-md-surface-container-lowest px-3 text-sm tabular-nums focus:border-md-primary outline-none disabled:opacity-50 ${costChanged ? "border-md-on-warning-container" : "border-md-outline-variant/85"}`}
                      />
                      {costChanged && (
                        <span className="text-[11px] text-md-on-warning-container">Ordered at {fmtPkr(l.unitCostMinor)}</span>
                      )}
                    </label>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <OutlinedTextField
                label="Supplier bill / challan no. (optional)"
                value={receiving.billRef}
                onChange={(v) => setReceiving({ ...receiving, billRef: v })}
              />
              <OutlinedTextField
                label="Notes (optional)"
                placeholder="e.g. 2 bags damaged"
                value={receiving.notes}
                onChange={(v) => setReceiving({ ...receiving, notes: v })}
              />
            </div>
            <p className="text-xs text-md-on-surface-variant">
              Recording this adds the quantities to stock, updates average cost
              {canViewBalances ? ", and adds the bill to the supplier's khata" : ""}. It can't be edited afterwards.
            </p>
          </div>
        )}
      </Dialog>

      {/* ---- Order details ----------------------------------------------------------------- */}
      <Dialog
        open={viewing !== null}
        onClose={() => setViewing(null)}
        size="lg"
        icon={<ClipboardList className="w-5 h-5" />}
        title={viewing ? `${viewing.poNumber} · ${viewing.supplierName}` : ""}
        description={
          viewing
            ? `${STATUS_META[viewing.status].label} · created ${fmtDate(viewing.createdAt)} by ${viewing.createdBy}${viewing.expectedDate ? ` · deliver by ${fmtDate(viewing.expectedDate)}` : ""}`
            : undefined
        }
        footer={
          viewing ? (
            <>
              <Button
                variant="text"
                icon={<Share2 className="w-4 h-4" />}
                onClick={() => {
                  const text = orderShareText(viewing, businessName);
                  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
                }}
                className="mr-auto"
              >
                Send on WhatsApp
              </Button>
              {canManage && (viewing.status === "DRAFT" || viewing.status === "ORDERED") && (
                <Button variant="text" className="text-md-error!" onClick={() => setConfirm({ kind: "cancel", po: viewing })}>
                  Cancel order
                </Button>
              )}
              {canManage && viewing.status === "PARTIALLY_RECEIVED" && (
                <Button variant="text" onClick={() => setConfirm({ kind: "close", po: viewing })}>
                  Close order
                </Button>
              )}
              {canManage && viewing.status === "DRAFT" && (
                <>
                  <Button variant="outlined" onClick={() => openEditDraft(viewing)}>
                    Edit
                  </Button>
                  <Button icon={<Send className="w-4 h-4" />} disabled={busy} onClick={() => void runSimple("PLACE_ORDER", viewing)}>
                    Place order
                  </Button>
                </>
              )}
              {canReceive && (viewing.status === "ORDERED" || viewing.status === "PARTIALLY_RECEIVED") && (
                <Button icon={<PackageCheck className="w-4 h-4" />} onClick={() => openReceive(viewing)}>
                  Receive
                </Button>
              )}
            </>
          ) : undefined
        }
      >
        {viewing && (
          <div className="space-y-5">
            <div className="rounded-2xl overflow-hidden shadow-(--md-elevation-1)">
              <table className="md-table w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-md-on-surface-variant">
                    <th className="py-2.5 px-3 font-medium">Item</th>
                    <th className="py-2.5 px-3 font-medium text-right">Ordered</th>
                    <th className="py-2.5 px-3 font-medium text-right">Received</th>
                    <th className="py-2.5 px-3 font-medium text-right hidden sm:table-cell">Cost</th>
                    <th className="py-2.5 px-3 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-md-divider">
                  {viewing.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="py-2.5 px-3 text-md-on-surface">{l.name}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">
                        {fmtQty(l.qtyOrdered)} {l.unit}
                      </td>
                      <td className={`py-2.5 px-3 text-right tabular-nums ${l.qtyReceived >= l.qtyOrdered ? "text-md-on-success-container" : ""}`}>
                        {fmtQty(l.qtyReceived)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums hidden sm:table-cell">{fmtPkr(l.unitCostMinor)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums">
                        {fmtPkr(Math.round(l.qtyOrdered * l.unitCostMinor))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span>
                Order total <b className="font-mono tabular-nums">{fmtPkr(viewing.totalMinor)}</b>
              </span>
              <span>
                Received so far <b className="font-mono tabular-nums">{fmtPkr(viewing.receivedValueMinor)}</b>
              </span>
            </div>
            {viewing.notes && (
              <div className="text-sm text-md-on-surface-variant">
                <span className="font-medium text-md-on-surface">Notes: </span>
                {viewing.notes}
              </div>
            )}
            {viewing.cancelReason && (
              <div className="text-sm text-md-error">Cancelled: {viewing.cancelReason}</div>
            )}
            {viewing.grnIds.length > 0 && (
              <div>
                <div className="text-sm font-medium text-md-on-surface mb-2">Deliveries</div>
                <ul className="space-y-1.5">
                  {viewingReceipts.map((g) => (
                    <li key={g.id} className="rounded-xl bg-md-surface-container-low px-3 py-2 text-xs flex flex-wrap justify-between gap-2">
                      <span>
                        <span className="font-mono font-medium text-md-primary">{g.grnNumber}</span> · {fmtDate(g.receivedAt)} · {g.receivedBy}
                        {g.supplierInvoiceRef ? ` · bill ${g.supplierInvoiceRef}` : ""}
                      </span>
                      <span className="font-mono tabular-nums">{fmtPkr(g.totalMinor)}</span>
                    </li>
                  ))}
                  {viewingReceipts.length < viewing.grnIds.length && (
                    <li className="text-xs text-md-on-surface-variant">
                      {viewing.grnIds.length - viewingReceipts.length} older deliver{viewing.grnIds.length - viewingReceipts.length === 1 ? "y" : "ies"} not shown.
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}
      </Dialog>

      {/* ---- Confirm cancel / close ---------------------------------------------------------- */}
      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        dismissible={!busy}
        size="sm"
        icon={<AlertTriangle className="w-5 h-5" />}
        title={
          confirm?.kind === "cancel"
            ? `Cancel ${confirm.po.poNumber}?`
            : confirm
            ? `Close ${confirm.po.poNumber}?`
            : ""
        }
        description={
          confirm?.kind === "cancel"
            ? "The order stays on record as cancelled. Tell the supplier you no longer need it."
            : "Use this when the supplier won't deliver the rest. Goods already received stay in stock; the missing quantities are no longer expected."
        }
        footer={
          confirm ? (
            <>
              <Button variant="text" onClick={() => setConfirm(null)} disabled={busy}>
                Keep order
              </Button>
              <Button
                className={confirm.kind === "cancel" ? "bg-md-error! text-md-surface!" : ""}
                disabled={busy}
                onClick={() => void runSimple(confirm.kind === "cancel" ? "CANCEL_ORDER" : "CLOSE_ORDER", confirm.po)}
              >
                {confirm.kind === "cancel" ? "Cancel order" : "Close order"}
              </Button>
            </>
          ) : undefined
        }
      />
    </div>
  );
}
