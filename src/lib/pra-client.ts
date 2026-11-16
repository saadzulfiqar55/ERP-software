import { Order, PRAConfig } from "./types";

export interface PRAFiscalPayload {
  InvoiceNumber: string;
  POSID: string;
  USIN: string;
  DateTime: string;
  BuyerNTN: string;
  BuyerCNIC: string;
  BuyerName: string;
  BuyerPhoneNumber: string;
  TotalBillAmount: number;
  TotalQuantity: number;
  TotalSaleValue: number;
  TotalTaxCharged: number;
  Discount: number;
  FurtherTax: number;
  PaymentMode: number; // 1 = Cash, 2 = Card, 5 = Mixed/Split, 6 = Digital/QR
  RefUSIN: string | null;
  InvoiceType: number; // 1 = New, 3 = Credit Note
  Items: Array<{
    ItemCode: string;
    ItemName: string;
    Quantity: number;
    PCTCode: string;
    TaxRate: number;
    SaleValue: number;
    TotalAmount: number;
    TaxCharged: number;
    Discount: number;
    FurtherTax: number;
    InvoiceType: number;
    RefUSIN: string | null;
  }>;
}

/**
 * Formats an Order into the official Punjab Revenue Authority (PRA) e-IMS JSON schema
 */
export function buildPRAPayload(
  order: Omit<Order, "praInvoiceNumber" | "praQrPayload" | "praSyncStatus">,
  config: PRAConfig
): PRAFiscalPayload {
  const paymentModeMap: Record<string, number> = {
    CASH: 1,
    CARD: 2,
    JAZZCASH_EASYPAISA: 6,
    SPLIT: 5,
    KHATA_CREDIT: 1,
  };

  const totalQty = order.items.reduce((acc, i) => acc + i.quantity, 0);
  const appliedRate =
    order.paymentMethod === "CARD" || order.paymentMethod === "JAZZCASH_EASYPAISA"
      ? config.cardTaxRate
      : config.cashTaxRate;

  return {
    InvoiceNumber: "",
    POSID: config.posId,
    USIN: order.usin,
    DateTime: order.createdAt.replace("T", " ").slice(0, 19),
    BuyerNTN: order.buyerNtnCnic || "",
    BuyerCNIC: "",
    BuyerName: order.customerName || "Walk-in Customer",
    BuyerPhoneNumber: order.customerPhone || "",
    TotalBillAmount: order.taxBreakdown.grandTotal,
    TotalQuantity: totalQty,
    TotalSaleValue: order.taxBreakdown.taxableAmount + order.taxBreakdown.exemptAmount,
    TotalTaxCharged: order.taxBreakdown.totalSalesTax,
    Discount: order.discountAmount,
    FurtherTax: 0,
    PaymentMode: paymentModeMap[order.paymentMethod] || 1,
    RefUSIN: null,
    InvoiceType: 1,
    Items: order.items.map((item) => {
      const lineGross = item.unitPrice * item.quantity;
      const itemRate = item.taxMode === "EXEMPT" ? 0 : appliedRate;
      const itemTax =
        item.taxMode === "EXEMPT"
          ? 0
          : item.taxMode === "INCLUSIVE"
          ? Math.round(lineGross - lineGross / (1 + itemRate / 100))
          : Math.round(lineGross * (itemRate / 100));
      const saleValue =
        item.taxMode === "INCLUSIVE" ? lineGross - itemTax : lineGross;

      return {
        ItemCode: item.code,
        ItemName: `${item.name} (${item.variantName})`,
        Quantity: item.quantity,
        PCTCode: item.segment === "RESTAURANT" ? "9801.2000" : "2106.9090",
        TaxRate: itemRate,
        SaleValue: saleValue,
        TotalAmount: saleValue + itemTax,
        TaxCharged: itemTax,
        Discount: 0,
        FurtherTax: 0,
        InvoiceType: 1,
        RefUSIN: null,
      };
    }),
  };
}

/**
 * Generates a deterministic PRA Fiscal Invoice Number & Verification QR string
 */
export function generatePRAInvoiceResponse(
  usin: string,
  config: PRAConfig,
  grandTotal: number,
  taxAmount: number
) {
  const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  const suffix = usin.replace(/\D/g, "").slice(-6).padStart(6, "0");
  const praInvoiceNumber = `${config.posId}-${datePart}-${suffix}`;
  const praQrPayload = `https://e.pra.punjab.gov.pk/verify?inv=${praInvoiceNumber}&ntn=${config.ntn}&amt=${grandTotal}&tax=${taxAmount}`;

  return {
    praInvoiceNumber,
    praQrPayload,
    responseCode: "100",
  };
}
