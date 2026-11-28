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
 * Material 3 Expressive StatusChip (Soft expressive pill badge)
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
    neutral: "bg-md-secondary-container text-md-on-secondary-container",
    error: "bg-md-error-container text-md-on-error-container",
  }[variant];

  return (
    <span
      className={`border-0 inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold leading-none tracking-[0.01em] select-none ${styles}`}
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
 * Material 3 Expressive FilterChip
 * Morphs shape between rounded-xl (unselected) and full pill (selected) for high-clarity scanning.
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
      className={`border-0 h-9 px-4 inline-flex items-center gap-1.5 text-xs font-semibold tracking-[0.01em] select-none active:scale-[0.96] ${
        selected
          ? "rounded-full bg-md-primary text-md-on-primary shadow-[0_4px_12px_rgba(255,91,31,0.28)] hover:bg-md-primary-strong hover:-translate-y-px"
          : "rounded-xl bg-md-surface-container-low text-md-on-surface-variant hover:bg-md-surface-container-high hover:text-md-on-surface hover:-translate-y-px"
      }`}
    >
      {selected && (
        <Check className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} />
      )}
      <span>{label}</span>
      {count !== undefined && (
        <span className="tabular-nums opacity-80">({count})</span>
      )}
    </button>
  );
}

/**
 * Material 3 Expressive Connected Button Group / SegmentedButton
 * Uses StackLyra Deep Navy / Warm Apricot active pill contrast.
 */
export function SegmentedButton<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string; icon?: React.ReactNode }>;
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div
      role="group"
      className="border-0 inline-flex rounded-full p-1 bg-md-surface-container-low shadow-[inset_0_1px_2px_rgba(14,27,61,0.06)] gap-0.5"
    >
      {options.map((opt) => {
        const isSelected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={isSelected}
            className={`border-0 h-9 px-4 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 select-none active:scale-[0.97] ${
              isSelected
                ? "bg-md-on-surface text-md-surface shadow-[0_3px_10px_rgba(14,27,61,0.18)]"
                : "text-md-on-surface-variant hover:text-md-on-surface hover:bg-md-surface-container-lowest/80"
            }`}
          >
            {isSelected ? (
              <Check className="w-3.5 h-3.5 text-md-primary" strokeWidth={2.6} />
            ) : (
              opt.icon ?? null
            )}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
