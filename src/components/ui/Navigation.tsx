"use client";

import React from "react";
import { Search, X } from "lucide-react";

/**
 * Reusable Material Design 3 Navigation Item (56px pill)
 */
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
          className={`w-14 h-8 rounded-full flex items-center justify-center transition-all duration-200 ${
            active
              ? "bg-md-secondary-container text-md-on-secondary-container shadow-[0_1px_2px_rgba(16,28,43,0.06)]"
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
      className={`w-full h-13 px-4 rounded-full flex items-center justify-between transition-all duration-200 ${
        active
          ? "bg-md-secondary-container text-md-on-secondary-container font-semibold shadow-[0_1px_3px_rgba(16,28,43,0.06)]"
          : "text-md-on-surface-variant hover:bg-md-surface-container-high/80 hover:text-md-on-surface font-medium"
      }`}
    >
      <div className="flex items-center gap-3.5 min-w-0">
        <span className="shrink-0">{icon}</span>
        <span className="text-sm truncate">{label}</span>
      </div>
      {badgeCount !== undefined && badgeCount > 0 && (
        <span
          className={`text-xs font-medium tabular-nums px-2.5 py-0.5 rounded-full ${
            active
              ? "bg-md-primary text-md-on-primary"
              : "bg-md-surface-container-lowest text-md-on-surface-variant border border-md-outline-variant/60"
          }`}
        >
          {badgeCount}
        </span>
      )}
    </button>
  );
}

/**
 * Reusable Material Design 3 Pill SearchBar (56px tall)
 */
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
      className="h-11 sm:h-13 w-full min-w-0 max-w-xl rounded-full bg-md-surface-container-low hover:bg-md-surface-container-high/70 border border-md-outline-variant/60 hover:border-md-outline-variant px-4 sm:px-5 flex items-center justify-between gap-3 text-md-on-surface-variant transition-all duration-200"
    >
      <div className="flex items-center gap-3.5 flex-1 min-w-0">
        <Search
          className="w-5 h-5 shrink-0 text-md-on-surface-variant"
          strokeWidth={1.8}
        />
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
      <kbd className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-lg bg-md-surface-container-lowest text-md-on-surface-variant border border-md-outline-variant/80 text-xs font-mono font-medium">
        Ctrl K
      </kbd>
    </div>
  );
}

/**
 * Reusable Linear ProgressBar (6px rounded)
 */
export function ProgressBar({ value, max }: { value: number; max: number }) {
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

/**
 * Reusable PageHeader
 */
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
      {actions && (
        <div className="flex items-center gap-3 flex-wrap">{actions}</div>
      )}
    </div>
  );
}

/**
 * Reusable Avatar
 */
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

/**
 * Reusable EmptyState
 */
export function EmptyState({
  title,
  subtitle,
  icon,
  action,
}: {
  title: string;
  subtitle?: string;
  /** Optional illustration icon shown in a tonal circle above the title */
  icon?: React.ReactNode;
  /** Optional next-step buttons, so an empty screen always says what to do */
  action?: React.ReactNode;
}) {
  return (
    <div className="py-12 px-4 text-center flex flex-col items-center md-anim-fade">
      {icon && (
        <div className="w-14 h-14 rounded-full bg-md-secondary-container text-md-on-secondary-container flex items-center justify-center mb-4">
          {icon}
        </div>
      )}
      <div className="text-base font-medium text-md-on-surface">{title}</div>
      {subtitle && (
        <div className="text-sm text-md-on-surface-variant mt-1 max-w-sm">{subtitle}</div>
      )}
      {action && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div>
      )}
    </div>
  );
}

/**
 * Reusable Material 3 Snackbar
 */
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
      aria-live="polite"
      key={message}
      className="fixed z-[70] bottom-4 left-4 right-4 sm:right-auto sm:bottom-6 sm:left-6 sm:max-w-md min-h-12 py-2.5 pl-4 pr-2 rounded-xl bg-md-on-surface text-md-surface shadow-(--md-elevation-3) flex items-center justify-between gap-4 text-sm font-medium md-anim-snackbar"
    >
      <span className="leading-5">{message}</span>
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
