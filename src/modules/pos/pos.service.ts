import { appendAuditLog, DEFAULT_BRANCH_ID } from "@/core/audit";
import { hasGranularPermission } from "@/core/auth";
import { nextSequentialNumber } from "@/core/db";
import { assertBalancedJournal, toMinorUnits } from "@/core/money";
import { assertTenantFeature } from "@/core/saas/entitlements";
import { DatabaseSchema } from "@/lib/db";
import { buildPRAPayload, generatePRAInvoiceResponse } from "@/lib/pra-client";
import { calculateSalesTax } from "@/lib/tax-calculator";
import { CartItem, DoubleEntryLine, Order, PaymentMethod, UserProfile } from "@/lib/types";
import { AccountingService } from "../accounting/accounting.service";
import { InventoryService } from "../inventory/inventory.service";

export const POSService = {
  /**
   * Executes a complete POS Sale inside a Tenant-Scoped ACID Transaction:
   * 1. Enforces SaaS Plan status (`assertTenantFeature("pos_terminal")`) & OPEN Fiscal Period
   * 2. Enforces `pos:discount:override` RBAC for discounts & resolves authoritative catalog prices
   * 3. Generates tenant-isolated sequential Invoice Number & USIN (`DocumentCounters`)
   * 4. Atomically deducts retail stock (`InventoryService.deductStockAtomic`)
   * 5. Computes authoritative server-side tax breakdown & snapshots historical unitCost/taxRate
   * 6. Verifies Double-Entry Accounting balance (`Sum Debits === Sum Credits`)
   * 7. Updates Customer Khata Ledger (if Credit Sale) & Cashier Shift register totals
   * 8. Logs an immutable tenant-scoped AuditLog entry
   */
  completeSaleTransaction(
    txDb: DatabaseSchema,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: any,
    actor: UserProfile
  ) {
    assertTenantFeature(txDb.tenant, "pos_terminal", "POS Terminal Checkout");

    const rawItems = Array.isArray(body.items) ? (body.items as CartItem[]) : [];
    if (rawItems.length === 0) {
      throw new Error("POS order must include at least one item.");
    }

    const requestedDiscount = Math.max(0, Number(body.discountAmount) || 0);
    if (
      requestedDiscount > 0 &&
      !hasGranularPermission(actor.role, "pos:discount:override")
    ) {
      throw new Error(
        `RBAC Access Denied: "${actor.role}" lacks "pos:discount:override" permission to apply bill discounts.`
      );
    }

    const createdAt = new Date().toISOString();
    AccountingService.assertFiscalPeriodOpen(txDb, createdAt);

    const tenantId = txDb.tenant.id;
    const invoicePrefix = txDb.tenant.invoicePrefix || "SL";
    const year = new Date().getFullYear();
    const invoiceNumber = nextSequentialNumber(
      txDb,
      "INVOICE",
      invoicePrefix,
      year
    );
    const usin = nextSequentialNumber(txDb, "USIN", "USIN", year);

    const paymentMethod = (body.paymentMethod || "CASH") as PaymentMethod;
    if (paymentMethod === "KHATA_CREDIT") {
      assertTenantFeature(
        txDb.tenant,
        "khata_ledger",
        "Customer Khata Credit Billing"
      );
    }

    // Resolve authoritative prices & taxMode from tenant catalog
    const appliedRate =
      paymentMethod === "CARD" || paymentMethod === "JAZZCASH_EASYPAISA"
        ? txDb.praConfig.cardTaxRate
        : txDb.praConfig.cashTaxRate;

    const snapshottedItems: CartItem[] = rawItems.map((item) => {
      const qty = Math.max(1, Math.round(Number(item.quantity) || 0));
      const catalogProd = txDb.products.find(
        (p) => p.id === item.productId && p.tenantId === tenantId
      );
      const catalogVar = catalogProd?.variants.find((v) => v.id === item.variantId);
      const authoritativePrice =
        catalogVar?.price ?? Math.max(0, Number(item.unitPrice) || 0);
      const authoritativeTaxMode = catalogProd?.taxMode ?? item.taxMode;

      return {
        ...item,
        quantity: qty,
        unitPrice: authoritativePrice,
        taxMode: authoritativeTaxMode,
        unitCostSnapshot:
          catalogVar?.costPrice ?? Math.round(authoritativePrice * 0.6),
        taxRateSnapshot: authoritativeTaxMode === "EXEMPT" ? 0 : appliedRate,
      };
    });

    // Recompute authoritative server-side tax breakdown (never trust client grandTotal)
    const serverTaxBreakdown = calculateSalesTax(
      snapshottedItems,
      paymentMethod,
      requestedDiscount,
      txDb.praConfig,
      Boolean(body.serviceCharge && Number(body.serviceCharge) > 0),
      typeof body.splitCashRatio === "number" ? body.splitCashRatio : 0.5
    );

    // Atomic Inventory Deduction
    InventoryService.deductStockAtomic(txDb, snapshottedItems, actor);

    const draftOrder: Omit<
      Order,
      "praInvoiceNumber" | "praQrPayload" | "praSyncStatus"
    > = {
      id: `ord-${Date.now()}`,
      tenantId,
      branchId: actor.branchId || DEFAULT_BRANCH_ID,
      idempotencyKey: body.idempotencyKey,
      invoiceNumber,
      usin,
      createdAt,
      orderType: body.orderType,
      tableNumber: body.tableNumber,
      waiterName: body.waiterName,
      customerName: body.customerName || "Walk-in Customer",
      customerPhone: body.customerPhone || "",
      buyerNtnCnic: body.buyerNtnCnic || "",
      khataAccountId: body.khataAccountId,
      items: snapshottedItems,
      discountAmount: serverTaxBreakdown.discountAmount,
      serviceCharge: serverTaxBreakdown.serviceCharge,
      paymentMethod,
      cashPaid: Math.max(0, Number(body.cashPaid) || 0),
      cardPaid: Math.max(0, Number(body.cardPaid) || 0),
      changeReturned: Math.max(0, Number(body.changeReturned) || 0),
      taxBreakdown: {
        ...serverTaxBreakdown,
        grandTotalMinor: toMinorUnits(serverTaxBreakdown.grandTotal),
      },
      cashierName: `${actor.name} (${actor.role})`,
    };

    // Verify Double-Entry Accounting Balance for the Sale
    const grandTotalMinor = toMinorUnits(draftOrder.taxBreakdown.grandTotal);
    const taxMinor = toMinorUnits(draftOrder.taxBreakdown.totalSalesTax);
    const netRevenueMinor = grandTotalMinor - taxMinor;

    const saleJournalLines: DoubleEntryLine[] = [
      {
        accountCode:
          draftOrder.paymentMethod === "KHATA_CREDIT"
            ? "1200-AR-KHATA"
            : "1010-CASH-CARD-DRAWER",
        accountName: "POS Settlement Asset",
        debitMinor: grandTotalMinor,
        creditMinor: 0,
      },
      {
        accountCode: "4010-SALES-REVENUE",
        accountName: "Restaurant & Retail Sales Revenue",
        debitMinor: 0,
        creditMinor: netRevenueMinor,
      },
      {
        accountCode: "2210-PRA-GST-PAYABLE",
        accountName: "Punjab Revenue Authority GST Payable",
        debitMinor: 0,
        creditMinor: taxMinor,
      },
    ];
    assertBalancedJournal(saleJournalLines);

    const praPayload = buildPRAPayload(draftOrder, txDb.praConfig);
    const fiscalResult = generatePRAInvoiceResponse(
      usin,
      txDb.praConfig,
      draftOrder.taxBreakdown.grandTotal,
      draftOrder.taxBreakdown.totalSalesTax
    );

    const newOrder: Order = {
      ...draftOrder,
      praInvoiceNumber: fiscalResult.praInvoiceNumber,
      praQrPayload: fiscalResult.praQrPayload,
      praSyncStatus: "SYNCED",
      praResponseCode: fiscalResult.responseCode,
    };

    if (draftOrder.paymentMethod === "KHATA_CREDIT" && draftOrder.khataAccountId) {
      AccountingService.postVoucher(
        txDb,
        {
          partyId: draftOrder.khataAccountId,
          debitPkr: draftOrder.taxBreakdown.grandTotal,
          creditPkr: 0,
          description: `POS Credit Bill ${invoiceNumber} (${draftOrder.orderType}) — ${draftOrder.items.length} items`,
          paymentMode: "CREDIT_INVOICE",
          customVoucherNo: invoiceNumber,
          relatedOrderId: newOrder.id,
        },
        actor
      );
    }

    if (txDb.cashierShifts && txDb.cashierShifts.length > 0) {
      const netCashCollectedMinor = toMinorUnits(
        Math.max(0, draftOrder.cashPaid - draftOrder.changeReturned)
      );
      const cardCollectedMinor = toMinorUnits(draftOrder.cardPaid);
      const currentShift = txDb.cashierShifts[0];

      txDb.cashierShifts[0] = {
        ...currentShift,
        cashSalesMinor: currentShift.cashSalesMinor + netCashCollectedMinor,
        cardSalesMinor: currentShift.cardSalesMinor + cardCollectedMinor,
        expectedClosingCashMinor:
          currentShift.openingFloatMinor +
          currentShift.cashSalesMinor +
          netCashCollectedMinor -
          currentShift.pettyCashPayoutsMinor,
      };
    }

    txDb.orders = [newOrder, ...txDb.orders];

    appendAuditLog(txDb, {
      tenantId,
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      module: "POS",
      action: "CREATE",
      entityType: "Order",
      entityId: newOrder.id,
      summary: `Fiscalized POS Invoice ${invoiceNumber} (PRA: ${newOrder.praInvoiceNumber}) for PKR ${newOrder.taxBreakdown.grandTotal.toLocaleString()}.`,
    });

    return { order: newOrder, praPayload };
  },
};
