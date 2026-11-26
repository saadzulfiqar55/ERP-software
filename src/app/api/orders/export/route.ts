import { readErrorResponse, requireRequestActor } from "@/core/auth/request-actor";
import { readJournalPage } from "@/lib/db";

export const dynamic = "force-dynamic";

const HEADERS = [
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

function csvCell(value: unknown): string {
  let s = value === undefined || value === null ? "" : String(value);
  // Neutralise spreadsheet formula injection (=, +, -, @, tab, CR at the start of a cell).
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * GET /api/orders/export
 * Streams the full PRA sales-tax register as CSV, reading orders page by page.
 */
export async function GET() {
  let tenantId: string;
  try {
    const { tenant } = await requireRequestActor();
    tenantId = tenant.id;
  } catch (err) {
    return readErrorResponse(err);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(HEADERS.join(",") + "\n"));
        let cursor: string | null = null;
        do {
          const page = await readJournalPage(tenantId, "orders", { cursor, limit: 500 });
          const lines = page.items.map((o) => {
            const tb = (o.taxBreakdown || {}) as Record<string, unknown>;
            return [
              o.invoiceNumber,
              o.praInvoiceNumber,
              o.usin,
              o.createdAt,
              o.orderType,
              o.customerName || "Walk-in",
              o.buyerNtnCnic || "",
              o.paymentMethod,
              tb.taxableAmount,
              tb.totalSalesTax,
              tb.grandTotal,
              o.praSyncStatus,
            ]
              .map(csvCell)
              .join(",");
          });
          if (lines.length) controller.enqueue(encoder.encode(lines.join("\n") + "\n"));
          cursor = page.nextCursor;
        } while (cursor);
        controller.close();
      } catch (err) {
        console.error("[api] order export failed:", err);
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="StackLyra_PRA_Sales_Tax_Register.csv"',
      "Cache-Control": "no-store",
    },
  });
}
