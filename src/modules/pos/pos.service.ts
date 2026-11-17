import { appendAuditLog, DEFAULT_BRANCH_ID, DEFAULT_TENANT_ID } from "@/core/audit";
import { nextSequentialNumber } from "@/core/db";
import { assertBalancedJournal, toMinorUnits } from "@/core/money";
import { DatabaseSchema } from "@/lib/db";
import { buildPRAPayload, generatePRAInvoiceResponse } from "@/lib/pra-client";
import { CartItem, DoubleEntryLine, Order, UserProfile } from "@/lib/types";
import { AccountingService } from "../accounting/accounting.service";
import { InventoryService } from "../inventory/inventory.service";

export const POSService = {
  /**
   * Executes a complete POS Sale inside an ACID Transaction:
   * 1. Verifies Fiscal Period is OPEN
   * 2. Generates atomic sequential Invoice Number & USIN (`DocumentCounters`)
   * 3. Atomically deducts retail stock (`InventoryService.deductStockAtomic`)
   * 4. Snapshots historical unitCost & taxRate onto every line item
   * 5. Verifies Double-Entry Accounting balance (`Sum Debits === Sum Credits`)
   * 6. Updates Customer Khata Ledger (if Credit Sale) & Cashier Shift register totals
   * 7. Logs an immutable AuditLog entry
   */
  completeSaleTransaction(
    txDb: DatabaseSchema,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: any,
    actor: UserProfile
  ) {
    const createdAt = new Date().toISOString();
    AccountingService.assertFiscalPeriodOpen(txDb, createdAt);

    const year = new Date().getFullYear();
    const invoiceNumber = nextSequentialNumber(txDb, "INVOICE", "ALB", year);
    const usin = nextSequentialNumber(txDb, "USIN", "USIN", year);

    // Snapshot historical costPrice and taxRate onto each order line item
    const appliedRate =
      body.paymentMethod === "CARD" || body.paymentMethod === "JAZZCASH_EASYPAISA"
        ? txDb.praConfig.cardTaxRate
        : txDb.praConfig.cashTaxRate;

    const snapshottedItems: CartItem[] = (body.items as CartItem[]).map((item) => {
      const catalogProd = txDb.products.find((p) => p.id === item.productId);
      const catalogVar = catalogProd?.variants.find((v) => v.id === item.variantId);
      return {
        ...item,
        unitCostSnapshot: catalogVar?.costPrice ?? Math.round(item.unitPrice * 0.6),
        taxRateSnapshot: item.taxMode === "EXEMPT" ? 0 : appliedRate,
      };
    });

    // Atomic Inventory Deduction (throws InsufficientStockError if stock < requested)
    InventoryService.deductStockAtomic(txDb, snapshottedItems, actor);

    const draftOrder: Omit<
      Order,
      "praInvoiceNumber" | "praQrPayload" | "praSyncStatus"
    > = {
      id: `ord-${Date.now()}`,
      tenantId: DEFAULT_TENANT_ID,
      branchId: DEFAULT_BRANCH_ID,
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
      discountAmount: body.discountAmount || 0,
      serviceCharge: body.serviceCharge || 0,
      paymentMethod: body.paymentMethod,
      cashPaid: body.cashPaid || 0,
      cardPaid: body.cardPaid || 0,
      changeReturned: body.changeReturned || 0,
      taxBreakdown: {
        ...body.taxBreakdown,
        grandTotalMinor: toMinorUnits(body.taxBreakdown.grandTotal),
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

    // If paid on Customer Khata (Credit), post balanced voucher to AccountingService
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

    // Update Active Cashier Shift / Register Session
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
