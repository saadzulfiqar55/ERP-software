import { DoubleEntryLine } from "@/lib/types";

/**
 * Minor-Unit (Paisa) Financial Math Engine
 * Prevents IEEE 754 floating-point precision bugs (0.1 + 0.2 !== 0.3).
 * All internal calculations run in integer paisa (1 PKR = 100 paisa).
 */
export function toMinorUnits(pkrAmount: number): number {
  if (!Number.isFinite(pkrAmount)) return 0;
  return Math.round(pkrAmount * 100);
}

export function fromMinorUnits(minorUnits: number): number {
  if (!Number.isFinite(minorUnits)) return 0;
  return Math.round(minorUnits / 100);
}

export function addMinor(...amountsMinor: number[]): number {
  return amountsMinor.reduce((acc, val) => acc + Math.round(val), 0);
}

export function subtractMinor(aMinor: number, bMinor: number): number {
  return Math.round(aMinor) - Math.round(bMinor);
}

export function multiplyMinorByRate(amountMinor: number, percentRate: number): number {
  // e.g. percentRate = 16 -> 16%
  return Math.round((Math.round(amountMinor) * percentRate) / 100);
}

/**
 * Enforces Double-Entry Accounting Invariant: Sum(Debits) === Sum(Credits)
 */
export function assertBalancedJournal(lines: DoubleEntryLine[]): void {
  const totalDebit = lines.reduce((sum, l) => sum + Math.round(l.debitMinor), 0);
  const totalCredit = lines.reduce((sum, l) => sum + Math.round(l.creditMinor), 0);

  if (totalDebit !== totalCredit) {
    throw new Error(
      `Unbalanced Double-Entry Journal rejected: Debits (${totalDebit}) !== Credits (${totalCredit})`
    );
  }
}
