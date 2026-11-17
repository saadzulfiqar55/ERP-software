/**
 * Money & Date Formatters (Integer Minor-Unit / Cents / Paisa Based)
 * Never uses floating-point math for currency calculations.
 */
export function formatMinorMoney(
  amountMinor: number,
  currency: "PKR" | "USD" = "PKR"
): string {
  const safeMinor = Math.round(Number.isFinite(amountMinor) ? amountMinor : 0);
  const majorUnits = Math.trunc(safeMinor / 100);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(majorUnits);
}

export function formatMajorMoney(
  amountMajor: number,
  currency: "PKR" | "USD" = "PKR"
): string {
  return formatMinorMoney(Math.round(amountMajor * 100), currency);
}

export function formatIsoDate(isoDate: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(isoDate));
  } catch {
    return isoDate;
  }
}

export function calculateDueDate(
  issueDateIso: string,
  terms: "NET_30" | "NET_15" | "DUE_ON_RECEIPT"
): string {
  const base = new Date(issueDateIso || Date.now());
  const daysToAdd = terms === "NET_30" ? 30 : terms === "NET_15" ? 15 : 0;
  base.setDate(base.getDate() + daysToAdd);
  return base.toISOString().slice(0, 10);
}
