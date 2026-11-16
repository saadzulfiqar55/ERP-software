import { CartItem, PaymentMethod, PRAConfig, TaxBreakdown } from "./types";

/**
 * Dynamic Pakistani Sales Tax & PRA Calculator
 * Supports:
 * - Restaurant GST: Cash (default 16%) vs Card/Digital (default 5%)
 * - Split Payment proportional tax calculation (Cash portion at 16%, Card portion at 5%)
 * - Exclusive, Inclusive, and Exempt item tax modes
 */
export function calculateSalesTax(
  items: CartItem[],
  paymentMethod: PaymentMethod,
  discountAmount: number,
  config: PRAConfig,
  includeServiceCharge: boolean = false,
  splitCashRatio: number = 0.5 // 0 to 1 when paymentMethod === "SPLIT"
): TaxBreakdown {
  const grossSubtotal = items.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0
  );

  const safeDiscount = Math.min(Math.max(0, discountAmount), grossSubtotal);
  const discountRatio = grossSubtotal > 0 ? (grossSubtotal - safeDiscount) / grossSubtotal : 1;

  // Determine applicable rate for standard items based on payment method
  let baseRate = config.cashTaxRate;
  let effectiveTaxRateLabel = `${config.cashTaxRate}% (Cash GST)`;

  if (paymentMethod === "CARD" || paymentMethod === "JAZZCASH_EASYPAISA") {
    baseRate = config.cardTaxRate;
    effectiveTaxRateLabel = `${config.cardTaxRate}% (Card/Digital PRA)`;
  } else if (paymentMethod === "SPLIT") {
    const clampedCashRatio = Math.min(1, Math.max(0, splitCashRatio));
    const cardRatio = 1 - clampedCashRatio;
    baseRate = Number(
      (config.cashTaxRate * clampedCashRatio + config.cardTaxRate * cardRatio).toFixed(2)
    );
    effectiveTaxRateLabel = `Split (${Math.round(clampedCashRatio * 100)}% Cash @ ${config.cashTaxRate}% / ${Math.round(cardRatio * 100)}% Card @ ${config.cardTaxRate}%)`;
  } else if (paymentMethod === "KHATA_CREDIT") {
    baseRate = config.cashTaxRate;
    effectiveTaxRateLabel = `${config.cashTaxRate}% (Credit/Khata GST)`;
  }

  let taxableAmount = 0;
  let exemptAmount = 0;
  let inclusiveTaxExtracted = 0;
  let exclusiveTaxAdded = 0;

  for (const item of items) {
    const lineRaw = item.unitPrice * item.quantity;
    const lineAfterDiscount = lineRaw * discountRatio;

    if (item.taxMode === "EXEMPT") {
      exemptAmount += lineAfterDiscount;
      continue;
    }

    // Use retail rate if explicitly configured and item is retail inclusive, otherwise restaurant PRA rate
    const itemRate = baseRate;

    if (item.taxMode === "INCLUSIVE") {
      // Price already includes tax: Net = Gross / (1 + r)
      const netAmount = lineAfterDiscount / (1 + itemRate / 100);
      const extractedTax = lineAfterDiscount - netAmount;
      taxableAmount += netAmount;
      inclusiveTaxExtracted += extractedTax;
    } else {
      // EXCLUSIVE: tax is added on top
      const addedTax = lineAfterDiscount * (itemRate / 100);
      taxableAmount += lineAfterDiscount;
      exclusiveTaxAdded += addedTax;
    }
  }

  const totalSalesTax = Math.round(inclusiveTaxExtracted + exclusiveTaxAdded);
  const netAfterDiscount = Math.round(grossSubtotal - safeDiscount);
  const serviceCharge = includeServiceCharge
    ? Math.round(netAfterDiscount * (config.serviceChargePercent / 100))
    : 0;

  const grandTotal = Math.round(netAfterDiscount + exclusiveTaxAdded + serviceCharge);

  // Split breakdown for PRA reporting
  let cashPortionTax = totalSalesTax;
  let cardPortionTax = 0;
  if (paymentMethod === "CARD" || paymentMethod === "JAZZCASH_EASYPAISA") {
    cashPortionTax = 0;
    cardPortionTax = totalSalesTax;
  } else if (paymentMethod === "SPLIT") {
    cashPortionTax = Math.round(totalSalesTax * splitCashRatio);
    cardPortionTax = totalSalesTax - cashPortionTax;
  }

  return {
    grossSubtotal: Math.round(grossSubtotal),
    discountAmount: Math.round(safeDiscount),
    taxableAmount: Math.round(taxableAmount),
    exemptAmount: Math.round(exemptAmount),
    inclusiveTaxExtracted: Math.round(inclusiveTaxExtracted),
    exclusiveTaxAdded: Math.round(exclusiveTaxAdded),
    totalSalesTax,
    effectiveTaxRateLabel,
    serviceCharge,
    grandTotal,
    cashPortionTax,
    cardPortionTax,
  };
}
