import { NextResponse } from "next/server";
import { readDb, writeDb } from "@/lib/db";
import { buildPRAPayload, generatePRAInvoiceResponse } from "@/lib/pra-client";
import { LedgerEntry, Order } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const db = readDb();

    const nextSeq = db.orders.length + 1001;
    const invoiceNumber = `ALB-2026-${nextSeq}`;
    const usin = `USIN-${nextSeq}`;
    const createdAt = new Date().toISOString();

    const draftOrder: Omit<Order, "praInvoiceNumber" | "praQrPayload" | "praSyncStatus"> = {
      id: `ord-${Date.now()}`,
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
      items: body.items,
      discountAmount: body.discountAmount || 0,
      serviceCharge: body.serviceCharge || 0,
      paymentMethod: body.paymentMethod,
      cashPaid: body.cashPaid || 0,
      cardPaid: body.cardPaid || 0,
      changeReturned: body.changeReturned || 0,
      taxBreakdown: body.taxBreakdown,
      cashierName: body.cashierName || "Umar Farooq (Counter 1)",
    };

    const praPayload = buildPRAPayload(draftOrder, db.praConfig);
    const fiscalResult = generatePRAInvoiceResponse(
      usin,
      db.praConfig,
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

    // Deduct stock for RETAIL items & beverages
    db.products = db.products.map((product) => {
      const soldQty = draftOrder.items
        .filter((i) => i.productId === product.id)
        .reduce((acc, i) => acc + i.quantity, 0);

      if (soldQty > 0 && product.stockQty < 900) {
        return {
          ...product,
          stockQty: Math.max(0, product.stockQty - soldQty),
        };
      }
      return product;
    });

    // If paid on Customer Khata (Credit), record Double-Entry Ledger Debit
    if (draftOrder.paymentMethod === "KHATA_CREDIT" && draftOrder.khataAccountId) {
      const partyIndex = db.parties.findIndex((p) => p.id === draftOrder.khataAccountId);
      if (partyIndex !== -1) {
        const party = db.parties[partyIndex];
        const updatedBalance = party.currentBalance + draftOrder.taxBreakdown.grandTotal;
        db.parties[partyIndex] = {
          ...party,
          currentBalance: updatedBalance,
        };

        const ledgerEntry: LedgerEntry = {
          id: `led-${Date.now()}`,
          createdAt,
          partyId: party.id,
          partyName: party.name,
          partyType: party.type,
          voucherNo: invoiceNumber,
          description: `POS Credit Bill (${draftOrder.orderType}) — ${draftOrder.items.length} items`,
          paymentMode: "CREDIT_INVOICE",
          debit: draftOrder.taxBreakdown.grandTotal,
          credit: 0,
          balanceAfter: updatedBalance,
          relatedOrderId: newOrder.id,
        };
        db.ledger = [ledgerEntry, ...db.ledger];
      }
    }

    db.orders = [newOrder, ...db.orders];
    writeDb(db);

    return NextResponse.json({
      order: newOrder,
      praPayload,
      db,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create order" },
      { status: 400 }
    );
  }
}
