"use client";

import React from "react";
import { Check } from "lucide-react";

export type StatusChipVariant =
  | "success"
  | "primary"
  | "warning"
  | "neutral"
  | "error";

/**
 * Reusable Material Design 3 StatusChip
 */
export function StatusChip({
  label,
  variant = "neutral",
}: {
  label: string;
  variant?: StatusChipVariant;
}) {
  const styles = {
    success: "bg-md-success-container text-md-on-success-container",
    primary: "bg-md-primary-container text-md-on-primary-container",
    warning: "bg-md-warning-container text-md-on-warning-container",
    neutral: "bg-md-surface-variant text-md-on-surface-variant",
    error: "bg-md-error-container text-md-on-error-container",
  }[variant];

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium leading-none tracking-[0.01em] select-none ${styles}`}
    >
      {label}
    </span>
  );
}

export function mapInvoiceStatusToChipVariant(
  status: string
): StatusChipVariant {
  switch (status.toUpperCase()) {
    case "PAID":
    case "SYNCED":
    case "APPROVED":
      return "success";
    case "SENT":
    case "SHIPPED":
      return "primary";
    case "PENDING":
    case "PROCESSING":
      return "warning";
    case "OVERDUE":
    case "CANCELLED":
    case "CRITICAL":
      return "error";
    default:
      return "neutral";
  }
}

/**
 * Reusable Material Design 3 FilterChip (soft outline-variant border when unselected, check icon when selected)
 */
export function FilterChip({
  label,
  count,
  selected,
  onClick,
}: {
  label: string;
  count?: number;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`h-8 px-3.5 rounded-lg inline-flex items-center gap-1.5 text-xs font-medium tracking-[0.01em] transition-all duration-200 select-none ${
        selected
          ? "bg-md-secondary-container text-md-on-secondary-container border border-md-primary/20 shadow-[0_1px_2px_rgba(16,28,43,0.06)]"
          : "bg-md-surface-container-lowest text-md-on-surface-variant border border-md-outline-variant/85 hover:bg-md-surface-container-low hover:border-md-outline/60 hover:text-md-on-surface"
      }`}
    >
      {selected && <Check className="w-3.5 h-3.5 shrink-0 text-md-primary" strokeWidth={2.2} />}
      <span>{label}</span>
      {count !== undefined && (
        <span className="tabular-nums opacity-75">({count})</span>
      )}
    </button>
  );
}

/**
 * Reusable Material Design 3 SegmentedButton (Pill group with soft dividers and check icon)
 */
export function SegmentedButton<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div
      role="group"
      className="inline-flex rounded-full border border-md-outline-variant/90 p-0.5 bg-md-surface-container-low shadow-[inset_0_1px_2px_rgba(25,28,32,0.04)]"
    >
      {options.map((opt) => {
        const isSelected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={isSelected}
            className={`h-9 px-4 rounded-full text-xs font-medium inline-flex items-center gap-1.5 transition-all duration-200 select-none ${
              isSelected
                ? "bg-md-secondary-container text-md-on-secondary-container font-semibold shadow-[0_1px_3px_rgba(16,28,43,0.10)]"
                : "text-md-on-surface-variant hover:text-md-on-surface hover:bg-md-surface-container-lowest/60"
            }`}
          >
            {isSelected && <Check className="w-3.5 h-3.5 text-md-primary" strokeWidth={2.2} />}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
