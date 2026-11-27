import { appendAuditLog, DEFAULT_BRANCH_ID } from "@/core/audit";
import { nextSequentialNumber } from "@/core/db";
import { assertBalancedJournal, fromMinorUnits } from "@/core/money";
import { assertTenantFeature, hasTenantFeature } from "@/core/saas/entitlements";
import { DatabaseSchema } from "@/lib/db";
import {
  DoubleEntryLine,
  GoodsReceipt,
  GoodsReceiptLine,
  LedgerEntry,
  PartyAccount,
  PurchaseItemKind,
  PurchaseOrder,
  PurchaseOrderLine,
  UserProfile,
} from "@/lib/types";
import { AccountingService } from "@/modules/accounting/accounting.service";

/** Thrown for anything the user can fix (bad quantity, wrong status, missing item). */
export class PurchasingError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "PurchasingError";
  }
}

export const MAX_PO_LINES = 200;
const MAX_QTY = 1_000_000;
const MAX_UNIT_COST_MINOR = 100_000_000_00; // PKR 100 million per unit

export interface PurchaseLineInput {
  id?: string;
  itemKind: PurchaseItemKind;
  itemId: string;
  variantId?: string;
  qtyOrdered: number;
  unitCostMinor: number;
}

export interface ReceiveLineInput {
  poLineId: string;
  qty: number;
  /** Actual cost per unit on the supplier's bill; defaults to the PO price. */
  unitCostMinor?: number;
}

const rid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Quantities are kept to 3 decimals (kg, litres) to avoid float drift. */
const roundQty = (n: number) => Math.round(n * 1000) / 1000;

function assertQty(qty: unknown, label: string): number {
  const n = Number(qty);
  if (!Number.isFinite(n) || n <= 0) throw new PurchasingError(`${label} must be more than 0.`);
  if (n > MAX_QTY) throw new PurchasingError(`${label} is too large.`);
  return roundQty(n);
}

function assertCost(cost: unknown, label: string): number {
  const n = Number(cost);
  if (!Number.isFinite(n) || n < 0) throw new PurchasingError(`${label} must be zero or more.`);
  if (n > MAX_UNIT_COST_MINOR) throw new PurchasingError(`${label} is too large.`);
  return Math.round(n);
}

const lineValueMinor = (qty: number, unitCostMinor: number) => Math.round(qty * unitCostMinor);

function findOrder(txDb: DatabaseSchema, poId: string): { index: number; po: PurchaseOrder } {
  const index = (txDb.purchaseOrders || []).findIndex((p) => p.id === poId);
  if (index === -1) throw new PurchasingError("Purchase order not found.", 404);
  return { index, po: txDb.purchaseOrders[index] };
}

function findSupplier(txDb: DatabaseSchema, supplierId: string): PartyAccount {
  const supplier = txDb.parties.find(
    (p) => p.id === supplierId && p.type === "SUPPLIER" && !p.isArchived
  );
  if (!supplier) throw new PurchasingError("Choose a supplier (it may have been archived).");
  return supplier;
}

function audit(
  txDb: DatabaseSchema,
  actor: UserProfile,
  action: "CREATE" | "UPDATE" | "REVERSE_VOID",
  entityType: string,
  entityId: string,
  summary: string
) {
  appendAuditLog(txDb, {
    tenantId: txDb.tenant.id,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    module: "PURCHASING",
    action,
    entityType,
    entityId,
    summary,
  });
}

const pkr = (minor: number) =>
  `PKR ${fromMinorUnits(minor).toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;

export const PurchasingService = {
  createSupplier(
    txDb: DatabaseSchema,
    input: { name: string; phone?: string; ntnOrCnic?: string; notes?: string },
    actor: UserProfile
  ): PartyAccount {
    const name = String(input.name || "").trim();
    if (!name) throw new PurchasingError("Supplier name is required.");
    if (name.length > 120) throw new PurchasingError("Supplier name is too long.");
    const duplicate = txDb.parties.find(
      (p) => p.type === "SUPPLIER" && !p.isArchived && p.name.toLowerCase() === name.toLowerCase()
    );
    if (duplicate) throw new PurchasingError(`A supplier named "${duplicate.name}" already exists.`, 409);
    const supplier: PartyAccount = {
      id: rid("party"),
      tenantId: txDb.tenant.id,
      branchId: actor.branchId || DEFAULT_BRANCH_ID,
      name,
      nameUrdu: "",
      type: "SUPPLIER",
      phone: String(input.phone || "").trim() || "-",
      ntnOrCnic: String(input.ntnOrCnic || "").trim(),
      creditLimit: 0,
      currentBalance: 0,
      currentBalanceMinor: 0,
      notes: String(input.notes || "").trim(),
      isArchived: false,
    };
    txDb.parties = [supplier, ...txDb.parties];
    audit(txDb, actor, "CREATE", "Supplier", supplier.id, `Added supplier "${name}".`);
    return supplier;
  },

  /** Validates lines against the catalog / material stock and snapshots names and units. */
  buildLines(txDb: DatabaseSchema, input: PurchaseLineInput[], previous: PurchaseOrderLine[] = []) {
    if (!Array.isArray(input) || input.length === 0) {
      throw new PurchasingError("Add at least one item to the order.");
    }
    if (input.length > MAX_PO_LINES) {
      throw new PurchasingError(`An order can have at most ${MAX_PO_LINES} lines.`);
    }
    return input.map((raw, i): PurchaseOrderLine => {
      const label = `Line ${i + 1}`;
      let name: string;
      let unit: string;
      let variantId: string | undefined;
      if (raw.itemKind === "MATERIAL") {
        const item = (txDb.stockMonitor || []).find((s) => s.id === raw.itemId);
        if (!item) throw new PurchasingError(`${label}: material not found.`);
        name = item.name;
        unit = item.unit;
      } else if (raw.itemKind === "PRODUCT") {
        const product = txDb.products.find((p) => p.id === raw.itemId && !p.isArchived);
        if (!product) throw new PurchasingError(`${label}: product not found or archived.`);
        const variant =
          product.variants.find((v) => v.id === raw.variantId) || product.variants[0];
        variantId = variant?.id;
        name =
          product.variants.length > 1 && variant ? `${product.name} (${variant.name})` : product.name;
        unit = product.unit;
      } else {
        throw new PurchasingError(`${label}: unknown item type.`);
      }
      const prev = previous.find((l) => l.id === raw.id);
      return {
        id: prev?.id || rid("pol"),
        itemKind: raw.itemKind,
        itemId: raw.itemId,
        variantId,
        name,
        unit,
        qtyOrdered: assertQty(raw.qtyOrdered, `${label} quantity`),
        qtyReceived: prev?.qtyReceived || 0,
        unitCostMinor: assertCost(raw.unitCostMinor, `${label} cost`),
      };
    });
  },

  /** Creates a new order or replaces a DRAFT's contents. `place` sends it straight to ORDERED. */
  saveOrder(
    txDb: DatabaseSchema,
    input: {
      id?: string;
      supplierId: string;
      lines: PurchaseLineInput[];
      expectedDate?: string;
      notes?: string;
      place?: boolean;
    },
    actor: UserProfile
  ): PurchaseOrder {
    assertTenantFeature(txDb.tenant, "inventory_catalog", "Inventory & Purchasing");
    const supplier = findSupplier(txDb, input.supplierId);
    const now = new Date().toISOString();
    const expectedDate =
      input.expectedDate && /^\d{4}-\d{2}-\d{2}$/.test(input.expectedDate)
        ? input.expectedDate
        : undefined;
    const notes = String(input.notes || "").trim().slice(0, 1000) || undefined;

    if (input.id) {
      const { index, po } = findOrder(txDb, input.id);
      if (po.status !== "DRAFT") {
        throw new PurchasingError(
          `${po.poNumber} has already been sent to the supplier and can no longer be edited. Cancel it and create a new order instead.`,
          409
        );
      }
      const lines = this.buildLines(txDb, input.lines, po.lines);
      const updated: PurchaseOrder = {
        ...po,
        supplierId: supplier.id,
        supplierName: supplier.name,
        lines,
        totalMinor: lines.reduce((s, l) => s + lineValueMinor(l.qtyOrdered, l.unitCostMinor), 0),
        expectedDate,
        notes,
        updatedAt: now,
        ...(input.place ? { status: "ORDERED" as const, orderedAt: now } : {}),
      };
      txDb.purchaseOrders[index] = updated;
      audit(
        txDb,
        actor,
        "UPDATE",
        "PurchaseOrder",
        updated.id,
        input.place
          ? `Placed ${updated.poNumber} with ${supplier.name} (${pkr(updated.totalMinor)}).`
          : `Updated draft ${updated.poNumber}.`
      );
      return updated;
    }

    const lines = this.buildLines(txDb, input.lines);
    const po: PurchaseOrder = {
      id: rid("po"),
      tenantId: txDb.tenant.id,
      branchId: actor.branchId || DEFAULT_BRANCH_ID,
      poNumber: nextSequentialNumber(txDb, "PURCHASE_ORDER", "PO"),
      supplierId: supplier.id,
      supplierName: supplier.name,
      status: input.place ? "ORDERED" : "DRAFT",
      lines,
      totalMinor: lines.reduce((s, l) => s + lineValueMinor(l.qtyOrdered, l.unitCostMinor), 0),
      receivedValueMinor: 0,
      expectedDate,
      notes,
      createdAt: now,
      createdBy: actor.name,
      updatedAt: now,
      orderedAt: input.place ? now : undefined,
      grnIds: [],
    };
    txDb.purchaseOrders = [po, ...(txDb.purchaseOrders || [])];
    audit(
      txDb,
      actor,
      "CREATE",
      "PurchaseOrder",
      po.id,
      `${input.place ? "Placed" : "Drafted"} ${po.poNumber} with ${supplier.name}: ${lines.length} line(s), ${pkr(po.totalMinor)}.`
    );
    return po;
  },

  placeOrder(txDb: DatabaseSchema, poId: string, actor: UserProfile): PurchaseOrder {
    const { index, po } = findOrder(txDb, poId);
    if (po.status !== "DRAFT") throw new PurchasingError(`${po.poNumber} is already ${po.status.toLowerCase().replace("_", " ")}.`, 409);
    findSupplier(txDb, po.supplierId);
    const now = new Date().toISOString();
    const updated: PurchaseOrder = { ...po, status: "ORDERED", orderedAt: now, updatedAt: now };
    txDb.purchaseOrders[index] = updated;
    audit(txDb, actor, "UPDATE", "PurchaseOrder", po.id, `Placed ${po.poNumber} with ${po.supplierName} (${pkr(po.totalMinor)}).`);
    return updated;
  },

  /** Cancels an order nothing has been received against yet. */
  cancelOrder(txDb: DatabaseSchema, poId: string, reason: string, actor: UserProfile): PurchaseOrder {
    const { index, po } = findOrder(txDb, poId);
    if (po.status !== "DRAFT" && po.status !== "ORDERED") {
      throw new PurchasingError(
        po.status === "PARTIALLY_RECEIVED"
          ? `Goods have already been received on ${po.poNumber}. Use "Close order" to stop waiting for the rest.`
          : `${po.poNumber} is already ${po.status.toLowerCase().replace("_", " ")}.`,
        409
      );
    }
    const now = new Date().toISOString();
    const cancelReason = String(reason || "").trim().slice(0, 500) || undefined;
    const updated: PurchaseOrder = { ...po, status: "CANCELLED", cancelledAt: now, cancelReason, updatedAt: now };
    txDb.purchaseOrders[index] = updated;
    audit(txDb, actor, "REVERSE_VOID", "PurchaseOrder", po.id, `Cancelled ${po.poNumber}${cancelReason ? `: ${cancelReason}` : ""}.`);
    return updated;
  },

  /** Short-closes a partly received order: the remaining quantities are no longer expected. */
  closeOrder(txDb: DatabaseSchema, poId: string, actor: UserProfile): PurchaseOrder {
    const { index, po } = findOrder(txDb, poId);
    if (po.status !== "PARTIALLY_RECEIVED") {
      throw new PurchasingError(
        po.status === "ORDERED" ? `Nothing has been received on ${po.poNumber}; cancel it instead.` : `${po.poNumber} cannot be closed now.`,
        409
      );
    }
    const now = new Date().toISOString();
    const updated: PurchaseOrder = { ...po, status: "CLOSED", completedAt: now, updatedAt: now };
    txDb.purchaseOrders[index] = updated;
    const outstanding = po.lines.filter((l) => l.qtyReceived < l.qtyOrdered).length;
    audit(txDb, actor, "UPDATE", "PurchaseOrder", po.id, `Closed ${po.poNumber} short (${outstanding} line(s) not delivered).`);
    return updated;
  },

  /**
   * Posts a goods received note: raises stock on hand, updates moving-average cost, marks the
   * PO lines received and, when the khata ledger is enabled, credits the supplier's account
   * with the bill (Dr Inventory / Cr Supplier). All in the caller's transaction.
   */
  receive(
    txDb: DatabaseSchema,
    input: {
      poId: string;
      lines: ReceiveLineInput[];
      supplierInvoiceRef?: string;
      notes?: string;
    },
    actor: UserProfile
  ): { grn: GoodsReceipt; po: PurchaseOrder; ledgerEntry?: LedgerEntry } {
    const { index, po } = findOrder(txDb, input.poId);
    if (po.status !== "ORDERED" && po.status !== "PARTIALLY_RECEIVED") {
      throw new PurchasingError(
        po.status === "DRAFT"
          ? `${po.poNumber} is still a draft. Place the order before receiving goods.`
          : `${po.poNumber} is ${po.status.toLowerCase().replace("_", " ")}; nothing more can be received.`,
        409
      );
    }
    const nowIso = new Date().toISOString();
    AccountingService.assertFiscalPeriodOpen(txDb, nowIso);

    const requested = (Array.isArray(input.lines) ? input.lines : []).filter(
      (l) => Number(l.qty) > 0
    );
    if (requested.length === 0) throw new PurchasingError("Enter the quantity received for at least one item.");
    const seen = new Set<string>();

    const grnLines: GoodsReceiptLine[] = [];
    const nextLines = po.lines.map((l) => ({ ...l }));

    for (const req of requested) {
      if (seen.has(req.poLineId)) throw new PurchasingError("The same order line appears twice.");
      seen.add(req.poLineId);
      const line = nextLines.find((l) => l.id === req.poLineId);
      if (!line) throw new PurchasingError("An item is not on this purchase order.");
      const qty = assertQty(req.qty, `${line.name} quantity`);
      const remaining = roundQty(line.qtyOrdered - line.qtyReceived);
      if (qty > remaining + 1e-9) {
        throw new PurchasingError(
          `${line.name}: only ${remaining} ${line.unit} still expected, but ${qty} entered. Edit the quantity or raise a new order for the extra.`
        );
      }
      const unitCostMinor =
        req.unitCostMinor === undefined || req.unitCostMinor === null
          ? line.unitCostMinor
          : assertCost(req.unitCostMinor, `${line.name} cost`);

      let stockBefore = 0;
      let stockAfter = 0;
      if (line.itemKind === "MATERIAL") {
        const items = txDb.stockMonitor || [];
        const i = items.findIndex((s) => s.id === line.itemId);
        if (i === -1) throw new PurchasingError(`${line.name} was removed from material stock; add it back before receiving.`);
        const item = items[i];
        stockBefore = item.currentQty;
        stockAfter = roundQty(item.currentQty + qty);
        const prevQty = Math.max(0, item.currentQty);
        const prevAvg = item.avgUnitCostMinor ?? unitCostMinor;
        const avg = Math.round((prevQty * prevAvg + qty * unitCostMinor) / (prevQty + qty));
        items[i] = {
          ...item,
          currentQty: stockAfter,
          avgUnitCostMinor: avg,
          lastUnitCostMinor: unitCostMinor,
          lastSupplierId: po.supplierId,
        };
        txDb.stockMonitor = items;
      } else {
        const pi = txDb.products.findIndex((p) => p.id === line.itemId);
        if (pi === -1) throw new PurchasingError(`${line.name} is no longer in the catalog.`);
        const product = txDb.products[pi];
        stockBefore = product.stockQty;
        stockAfter = roundQty(product.stockQty + qty);
        const prevQty = Math.max(0, product.stockQty);
        txDb.products[pi] = {
          ...product,
          stockQty: stockAfter,
          variants: product.variants.map((v) => {
            if (v.id !== line.variantId) return v;
            const prevCost = Number.isFinite(v.costPrice) ? v.costPrice : fromMinorUnits(unitCostMinor);
            const avgMinor = Math.round(
              (prevQty * Math.round(prevCost * 100) + qty * unitCostMinor) / (prevQty + qty)
            );
            return { ...v, costPrice: fromMinorUnits(avgMinor) };
          }),
        };
      }

      line.qtyReceived = roundQty(line.qtyReceived + qty);
      grnLines.push({
        poLineId: line.id,
        itemKind: line.itemKind,
        itemId: line.itemId,
        variantId: line.variantId,
        name: line.name,
        unit: line.unit,
        qty,
        unitCostMinor,
        lineTotalMinor: lineValueMinor(qty, unitCostMinor),
        stockBefore,
        stockAfter,
      });
    }

    const totalMinor = grnLines.reduce((s, l) => s + l.lineTotalMinor, 0);
    const grn: GoodsReceipt = {
      id: rid("grn"),
      tenantId: txDb.tenant.id,
      branchId: actor.branchId || DEFAULT_BRANCH_ID,
      grnNumber: nextSequentialNumber(txDb, "GRN", "GRN"),
      poId: po.id,
      poNumber: po.poNumber,
      supplierId: po.supplierId,
      supplierName: po.supplierName,
      supplierInvoiceRef: String(input.supplierInvoiceRef || "").trim().slice(0, 80) || undefined,
      receivedAt: nowIso,
      receivedBy: actor.name,
      lines: grnLines,
      totalMinor,
      notes: String(input.notes || "").trim().slice(0, 1000) || undefined,
    };

    // Supplier liability on the khata (skipped when the plan has no ledger, or the bill is 0).
    let ledgerEntry: LedgerEntry | undefined;
    const partyIndex = txDb.parties.findIndex((p) => p.id === po.supplierId && !p.isArchived);
    if (totalMinor > 0 && partyIndex !== -1 && hasTenantFeature(txDb.tenant, "khata_ledger")) {
      const party = txDb.parties[partyIndex];
      const journalLines: DoubleEntryLine[] = [
        { accountCode: "1300-INVENTORY", accountName: "Inventory / Purchases", debitMinor: totalMinor, creditMinor: 0 },
        { accountCode: `PARTY:${party.id}`, accountName: party.name, debitMinor: 0, creditMinor: totalMinor },
      ];
      assertBalancedJournal(journalLines);
      const prevBalanceMinor = party.currentBalanceMinor ?? Math.round(party.currentBalance * 100);
      const nextBalanceMinor = prevBalanceMinor - totalMinor;
      txDb.parties[partyIndex] = {
        ...party,
        currentBalance: fromMinorUnits(nextBalanceMinor),
        currentBalanceMinor: nextBalanceMinor,
      };
      const voucherNo = nextSequentialNumber(txDb, "VOUCHER", "VCH");
      ledgerEntry = {
        id: rid("led"),
        tenantId: txDb.tenant.id,
        branchId: actor.branchId || DEFAULT_BRANCH_ID,
        createdAt: nowIso,
        partyId: party.id,
        partyName: party.name,
        partyType: party.type,
        voucherNo,
        description: `Goods received ${grn.grnNumber} against ${po.poNumber}${grn.supplierInvoiceRef ? ` (bill ${grn.supplierInvoiceRef})` : ""}`,
        paymentMode: "CREDIT_INVOICE",
        debit: 0,
        credit: fromMinorUnits(totalMinor),
        balanceAfter: fromMinorUnits(nextBalanceMinor),
        debitMinor: 0,
        creditMinor: totalMinor,
        balanceAfterMinor: nextBalanceMinor,
        journalLines,
        isImmutable: true,
      };
      txDb.ledger = [ledgerEntry, ...txDb.ledger];
      grn.ledgerEntryId = ledgerEntry.id;
      grn.ledgerVoucherNo = voucherNo;
    }

    const fullyReceived = nextLines.every((l) => l.qtyReceived >= l.qtyOrdered - 1e-9);
    const updated: PurchaseOrder = {
      ...po,
      lines: nextLines,
      status: fullyReceived ? "RECEIVED" : "PARTIALLY_RECEIVED",
      receivedValueMinor: po.receivedValueMinor + totalMinor,
      grnIds: [...po.grnIds, grn.id],
      updatedAt: nowIso,
      completedAt: fullyReceived ? nowIso : po.completedAt,
    };
    txDb.purchaseOrders[index] = updated;
    txDb.goodsReceipts = [grn, ...(txDb.goodsReceipts || [])];

    audit(
      txDb,
      actor,
      "CREATE",
      "GoodsReceipt",
      grn.id,
      `Received ${grn.grnNumber} against ${po.poNumber} from ${po.supplierName}: ${grnLines
        .map((l) => `${l.qty} ${l.unit} ${l.name}`)
        .join(", ")} (${pkr(totalMinor)})${ledgerEntry ? `; supplier credited via ${ledgerEntry.voucherNo}` : ""}.`
    );
    return { grn, po: updated, ledgerEntry };
  },
};
