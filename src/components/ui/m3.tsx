"use client";

import React from "react";
import { Check, Search, X } from "lucide-react";

/* ========================================================================== */
/* 1. BUTTON (Filled, Tonal, Outlined, Text, Icon) — Pill-Shaped              */
/* ========================================================================== */
export interface M3ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "filled" | "tonal" | "outlined" | "text" | "icon";
  size?: "sm" | "md" | "lg";
  icon?: React.ReactNode;
}

export function Button({
  variant = "filled",
  size = "md",
  icon,
  children,
  className = "",
  ...props
}: M3ButtonProps) {
  const sizeStyles =
    variant === "icon"
      ? "w-12 h-12 rounded-full justify-center p-0"
      : size === "sm"
      ? "h-9 px-4 text-xs gap-1.5 rounded-full"
      : size === "lg"
      ? "h-12 px-6 text-sm gap-2 rounded-full"
      : "h-10 px-5 text-sm gap-2 rounded-full";

  const variantStyles = {
    filled:
      "bg-md-primary hover:bg-md-primary-strong text-md-on-primary font-medium shadow-xs disabled:opacity-40",
    tonal:
      "bg-md-secondary-container hover:bg-md-primary-container text-md-on-secondary-container font-medium disabled:opacity-40",
    outlined:
      "bg-transparent border border-md-outline text-md-primary hover:bg-md-surface-container-low font-medium disabled:opacity-40",
    text: "bg-transparent hover:bg-md-surface-container-low text-md-primary font-medium px-3 disabled:opacity-40",
    icon: "bg-transparent hover:bg-md-surface-container-high text-md-on-surface-variant",
  }[variant];

  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center transition select-none ${sizeStyles} ${variantStyles} ${className}`}
      {...props}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </button>
  );
}

/* ========================================================================== */
/* 2. EXTENDED FAB (16px radius, primary-container, soft shadow)              */
/* ========================================================================== */
export function ExtendedFab({
  icon,
  label,
  onClick,
  collapsed = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  collapsed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`h-14 rounded-2xl bg-md-primary-container hover:bg-md-secondary-container text-md-on-primary-container font-medium text-sm shadow-sm hover:shadow-md inline-flex items-center transition ${
        collapsed ? "w-14 justify-center p-0" : "px-5 gap-3 w-full"
      }`}
    >
      <span className="shrink-0">{icon}</span>
      {!collapsed && <span>{label}</span>}
    </button>
  );
}

/* ========================================================================== */
/* 3. NAV ITEM (56px tall, pill-shaped, active = secondary-container)         */
/* ========================================================================== */
export function NavItem({
  icon,
  label,
  active,
  badgeCount,
  collapsed = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  badgeCount?: number;
  collapsed?: boolean;
  onClick?: () => void;
}) {
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? "page" : undefined}
        className="w-full py-2 flex flex-col items-center gap-1 group"
      >
        <div
          className={`w-14 h-8 rounded-full flex items-center justify-center transition ${
            active
              ? "bg-md-secondary-container text-md-on-secondary-container"
              : "text-md-on-surface-variant group-hover:bg-md-surface-container-high"
          }`}
        >
          {icon}
        </div>
        <span
          className={`text-[11px] leading-tight ${
            active
              ? "font-semibold text-md-on-secondary-container"
              : "font-medium text-md-on-surface-variant"
          }`}
        >
          {label}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`w-full h-14 px-4 rounded-full flex items-center justify-between transition ${
        active
          ? "bg-md-secondary-container text-md-on-secondary-container font-semibold"
          : "text-md-on-surface-variant hover:bg-md-surface-container-high font-medium"
      }`}
    >
      <div className="flex items-center gap-3.5 min-w-0">
        <span className="shrink-0">{icon}</span>
        <span className="text-sm truncate">{label}</span>
      </div>
      {badgeCount !== undefined && badgeCount > 0 && (
        <span className="text-xs font-medium tabular-nums px-2 py-0.5 rounded-full bg-md-surface-container-lowest text-md-on-surface-variant">
          {badgeCount}
        </span>
      )}
    </button>
  );
}

/* ========================================================================== */
/* 4. SEARCH BAR (56px tall pill, surface-container-high, Ctrl K hint)        */
/* ========================================================================== */
export function SearchBar({
  value,
  onChange,
  onOpenPalette,
  placeholder = "Search orders, customers, products…",
}: {
  value?: string;
  onChange?: (val: string) => void;
  onOpenPalette?: () => void;
  placeholder?: string;
}) {
  return (
    <div
      onClick={onOpenPalette}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" && onOpenPalette) onOpenPalette();
      }}
      className="h-14 w-full max-w-xl rounded-full bg-md-surface-container-high px-5 flex items-center justify-between gap-3 text-md-on-surface-variant hover:bg-md-surface-variant transition"
    >
      <div className="flex items-center gap-3.5 flex-1 min-w-0">
        <Search className="w-5 h-5 shrink-0 text-md-on-surface-variant" strokeWidth={1.8} />
        {onChange ? (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full bg-transparent text-sm text-md-on-surface placeholder:text-md-on-surface-variant outline-none"
          />
        ) : (
          <span className="text-sm truncate">{placeholder}</span>
        )}
      </div>
      <kbd className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-lg bg-md-surface-container-lowest text-md-on-surface-variant border border-md-outline-variant text-xs font-mono font-medium">
        Ctrl K
      </kbd>
    </div>
  );
}

/* ========================================================================== */
/* 5. CARD & STAT CARD (16px radius, 1px outline-variant border, flat)        */
/* ========================================================================== */
export function Card({
  children,
  className = "",
  variant = "outlined",
}: {
  children: React.ReactNode;
  className?: string;
  variant?: "outlined" | "tonal";
}) {
  const surfaceClass =
    variant === "tonal"
      ? "bg-md-surface-container-low"
      : "bg-md-surface-container-lowest border border-md-outline-variant";

  return (
    <div className={`rounded-2xl p-6 ${surfaceClass} ${className}`}>
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon,
  chipLabel,
  chipVariant,
  caption,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  chipLabel: string;
  chipVariant: StatusChipVariant;
  caption?: string;
}) {
  return (
    <Card className="flex flex-col justify-between gap-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-md-on-surface-variant">
          {label}
        </span>
        <div className="w-10 h-10 rounded-xl bg-md-primary-container text-md-on-primary-container flex items-center justify-center shrink-0">
          {icon}
        </div>
      </div>

      <div className="text-[32px] leading-[40px] font-normal text-md-on-surface tabular-nums tracking-tight">
        {value}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <StatusChip label={chipLabel} variant={chipVariant} />
        {caption && (
          <span className="text-xs text-md-on-surface-variant">{caption}</span>
        )}
      </div>
    </Card>
  );
}

/* ========================================================================== */
/* 6. STATUS CHIP & FILTER CHIP (8px radius)                                  */
/* ========================================================================== */
export type StatusChipVariant =
  | "success"
  | "primary"
  | "warning"
  | "neutral"
  | "error";

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
      className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium leading-none ${styles}`}
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
      className={`h-8 px-3 rounded-lg inline-flex items-center gap-1.5 text-xs font-medium transition ${
        selected
          ? "bg-md-secondary-container text-md-on-secondary-container border border-transparent"
          : "bg-transparent text-md-on-surface-variant border border-md-outline hover:bg-md-surface-container-low"
      }`}
    >
      {selected && <Check className="w-3.5 h-3.5 shrink-0" strokeWidth={2.2} />}
      <span>{label}</span>
      {count !== undefined && (
        <span className="tabular-nums opacity-80">({count})</span>
      )}
    </button>
  );
}

/* ========================================================================== */
/* 7. SEGMENTED BUTTON (Check icon on selected segment)                       */
/* ========================================================================== */
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
      className="inline-flex rounded-full border border-md-outline overflow-hidden bg-md-surface-container-lowest"
    >
      {options.map((opt, idx) => {
        const isSelected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={isSelected}
            className={`h-10 px-4 text-xs font-medium inline-flex items-center gap-1.5 transition ${
              idx > 0 ? "border-l border-md-outline" : ""
            } ${
              isSelected
                ? "bg-md-secondary-container text-md-on-secondary-container font-semibold"
                : "text-md-on-surface hover:bg-md-surface-container-low"
            }`}
          >
            {isSelected && <Check className="w-3.5 h-3.5" strokeWidth={2.2} />}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ========================================================================== */
/* 8. OUTLINED TEXT FIELD (Material 3 Notched Top Border Label, 4px radius)   */
/* ========================================================================== */
export function OutlinedTextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  helperText,
  errorText,
  readOnly = false,
  mono = false,
  multiline = false,
  rows = 3,
  options,
  required = false,
}: {
  label: string;
  value: string | number;
  onChange?: (val: string) => void;
  type?: "text" | "number" | "email" | "date";
  placeholder?: string;
  helperText?: string;
  errorText?: string;
  readOnly?: boolean;
  mono?: boolean;
  multiline?: boolean;
  rows?: number;
  options?: Array<{ value: string; label: string }>;
  required?: boolean;
}) {
  const hasError = Boolean(errorText);
  const borderClass = hasError
    ? "border-2 border-md-error focus-within:border-md-error"
    : "border border-md-outline focus-within:border-2 focus-within:border-md-primary";

  const labelColor = hasError
    ? "text-md-error"
    : "text-md-on-surface-variant group-focus-within:text-md-primary";

  return (
    <div className="group flex flex-col">
      <div
        className={`relative rounded bg-md-surface-container-lowest transition ${borderClass}`}
      >
        <label
          className={`absolute -top-2.5 left-2.5 px-1 bg-md-surface-container-lowest text-xs font-medium transition ${labelColor}`}
        >
          {label}
          {required ? " *" : ""}
        </label>

        {options ? (
          <select
            value={value}
            disabled={readOnly}
            onChange={(e) => onChange?.(e.target.value)}
            className={`w-full h-12 px-3.5 pt-1 bg-transparent text-sm text-md-on-surface outline-none ${
              mono ? "font-mono" : ""
            }`}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : multiline ? (
          <textarea
            rows={rows}
            value={value}
            readOnly={readOnly}
            placeholder={placeholder}
            onChange={(e) => onChange?.(e.target.value)}
            className="w-full p-3.5 bg-transparent text-sm text-md-on-surface outline-none resize-y"
          />
        ) : (
          <input
            type={type}
            value={value}
            readOnly={readOnly}
            placeholder={placeholder}
            onChange={(e) => onChange?.(e.target.value)}
            className={`w-full h-12 px-3.5 bg-transparent text-sm text-md-on-surface outline-none ${
              mono ? "font-mono" : ""
            } ${readOnly ? "text-md-on-surface-variant bg-md-surface-container-low/40" : ""}`}
          />
        )}
      </div>

      {(errorText || helperText) && (
        <span
          className={`mt-1 px-3 text-xs ${
            hasError ? "text-md-error font-medium" : "text-md-on-surface-variant"
          }`}
        >
          {errorText || helperText}
        </span>
      )}
    </div>
  );
}

/* ========================================================================== */
/* 9. MATERIAL 3 SWITCH (52x32px track, growing thumb + check icon)           */
/* ========================================================================== */
export function Switch({
  checked,
  onChange,
  label,
  helperText,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  helperText?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      {(label || helperText) && (
        <div>
          {label && (
            <div className="text-sm font-medium text-md-on-surface">{label}</div>
          )}
          {helperText && (
            <div className="text-xs text-md-on-surface-variant mt-0.5">
              {helperText}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label || "Toggle switch"}
        onClick={() => onChange(!checked)}
        className={`w-[52px] h-[32px] rounded-full p-1 flex items-center transition shrink-0 ${
          checked
            ? "bg-md-primary justify-end"
            : "bg-md-surface-container-high border-2 border-md-outline justify-start"
        }`}
      >
        <span
          className={`rounded-full flex items-center justify-center transition-all ${
            checked
              ? "w-6 h-6 bg-md-on-primary text-md-primary"
              : "w-4 h-4 bg-md-outline ml-0.5"
          }`}
        >
          {checked && <Check className="w-3.5 h-3.5" strokeWidth={2.5} />}
        </span>
      </button>
    </div>
  );
}

/* ========================================================================== */
/* 10. CHECKBOX, PROGRESS BAR, PAGE HEADER, AVATAR & SNACKBAR                 */
/* ========================================================================== */
export function Checkbox({
  checked,
  onChange,
  ariaLabel = "Select row",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={`w-[18px] h-[18px] rounded-xs flex items-center justify-center transition ${
        checked
          ? "bg-md-primary text-md-on-primary"
          : "border-2 border-md-on-surface-variant hover:border-md-on-surface bg-transparent"
      }`}
    >
      {checked && <Check className="w-3.5 h-3.5" strokeWidth={2.5} />}
    </button>
  );
}

export function ProgressBar({
  value,
  max,
}: {
  value: number;
  max: number;
}) {
  const ratio = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const barColor =
    ratio < 15
      ? "bg-md-error"
      : ratio < 35
      ? "bg-md-on-warning-container"
      : "bg-md-primary";

  return (
    <div className="w-full h-1.5 rounded-full bg-md-surface-container-high overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-300 ${barColor}`}
        style={{ width: `${ratio}%` }}
      />
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
      <div>
        <h1 className="text-[32px] leading-[40px] font-normal text-md-on-surface tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-md-on-surface-variant mt-1">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-3 flex-wrap">{actions}</div>}
    </div>
  );
}

export function Avatar({
  initials,
  size = "md",
  variant = "tertiary",
}: {
  initials: string;
  size?: "sm" | "md";
  variant?: "tertiary" | "primary";
}) {
  const sizeClass = size === "sm" ? "w-8 h-8 text-xs" : "w-10 h-10 text-sm";
  const colorClass =
    variant === "tertiary"
      ? "bg-md-tertiary text-md-on-primary"
      : "bg-md-primary-container text-md-on-primary-container";

  return (
    <div
      className={`rounded-full font-medium flex items-center justify-center shrink-0 select-none ${sizeClass} ${colorClass}`}
    >
      {initials}
    </div>
  );
}

export function EmptyState({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="py-12 px-4 text-center">
      <div className="text-base font-medium text-md-on-surface">{title}</div>
      {subtitle && (
        <div className="text-sm text-md-on-surface-variant mt-1">{subtitle}</div>
      )}
    </div>
  );
}

export function Snackbar({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  if (!message) return null;
  return (
    <div
      role="status"
      className="fixed bottom-6 left-6 z-50 h-12 px-4 rounded-xl bg-md-on-surface text-md-surface shadow-lg flex items-center gap-4 text-sm font-medium"
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss notification"
        className="p-1 rounded-full hover:bg-md-surface/15 text-md-surface"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
