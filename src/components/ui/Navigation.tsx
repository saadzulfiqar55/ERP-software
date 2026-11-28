"use client";

import React from "react";
import { Search, X } from "lucide-react";

/**
 * Material 3 Expressive Navigation Item (Bold active apricot pill with spring press morph)
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
          className={`w-14 h-8 rounded-full flex items-center justify-center ${
            active
              ? "bg-md-primary-container text-md-on-primary-container shadow-[0_2px_8px_rgba(255,91,31,0.18)] scale-[1.03]"
              : "text-md-on-surface-variant group-hover:bg-md-surface-container-high group-hover:text-md-on-surface"
          }`}
        >
          {icon}
        </div>
        <span
          className={`text-[11px] leading-tight ${
            active
              ? "font-bold text-md-on-surface"
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
      className={`w-full h-12 px-4 rounded-full active:rounded-[16px] flex items-center justify-between active:scale-[0.985] ${
        active
          ? "bg-md-primary-container text-md-on-primary-container font-bold shadow-[0_2px_10px_rgba(255,91,31,0.14)]"
          : "text-md-on-surface-variant hover:bg-md-surface-container-high/85 hover:text-md-on-surface font-medium"
      }`}
    >
      <div className="flex items-center gap-3.5 min-w-0">
        <span
          className={`shrink-0 ${
            active ? "text-md-primary" : ""
          }`}
        >
          {icon}
        </span>
        <span className="text-sm truncate">{label}</span>
      </div>
      {badgeCount !== undefined && badgeCount > 0 && (
        <span
          className={`text-xs font-mono font-bold tabular-nums px-2.5 py-0.5 rounded-full ${
            active
              ? "bg-md-primary text-md-on-primary"
              : "bg-md-surface-container-lowest text-md-on-surface-variant border border-md-outline-variant/80"
          }`}
        >
          {badgeCount}
        </span>
      )}
    </button>
  );
}

/**
 * Material 3 Expressive Pill SearchBar
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
      className="h-11 sm:h-12 w-full min-w-0 max-w-xl rounded-full bg-md-surface-container-low hover:bg-md-surface-container-high/80 border border-md-outline-variant/75 hover:border-md-primary/40 px-4 sm:px-5 flex items-center justify-between gap-3 text-md-on-surface-variant shadow-[inset_0_1px_2px_rgba(14,27,61,0.03)]"
    >
      <div className="flex items-center gap-3.5 flex-1 min-w-0">
        <Search
          className="w-5 h-5 shrink-0 text-md-primary"
          strokeWidth={2}
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
      <kbd className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-full bg-md-surface-container-lowest text-md-on-surface border border-md-outline-variant text-[11px] font-mono font-bold">
        Ctrl K
      </kbd>
    </div>
  );
}

/**
 * Material 3 Expressive Linear ProgressBar (8px thick pill with StackLyra Mint / Sun / Orange thresholds)
 */
export function ProgressBar({ value, max }: { value: number; max: number }) {
  const ratio = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const barColor =
    ratio < 15
      ? "bg-md-error"
      : ratio < 40
      ? "bg-md-warning"
      : ratio >= 80
      ? "bg-md-success"
      : "bg-md-primary";

  return (
    <div className="w-full h-2 rounded-full bg-md-surface-container-high overflow-hidden p-[1px]">
      <div
        className={`h-full rounded-full transition-all duration-300 ${barColor}`}
        style={{ width: `${ratio}%` }}
      />
    </div>
  );
}

/**
 * Material 3 Expressive PageHeader (Bold Bricolage Grotesque display title)
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
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        <h1 className="font-display text-[30px] sm:text-[34px] leading-[1.15] font-extrabold text-md-on-surface tracking-[-0.03em]">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-md-on-surface-variant mt-1.5 max-w-2xl">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2.5 flex-wrap">{actions}</div>
      )}
    </div>
  );
}

/**
 * Material 3 Expressive Squircle Avatar
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
  const sizeClass =
    size === "sm"
      ? "w-8 h-8 text-xs rounded-[11px]"
      : "w-10 h-10 text-sm rounded-[14px]";
  const colorClass =
    variant === "tertiary"
      ? "bg-md-on-surface text-md-surface"
      : "bg-md-primary text-md-on-primary shadow-[0_3px_10px_rgba(255,91,31,0.28)]";

  return (
    <div
      className={`font-display font-bold flex items-center justify-center shrink-0 select-none ${sizeClass} ${colorClass}`}
    >
      {initials}
    </div>
  );
}

/**
 * Material 3 Expressive EmptyState
 */
export function EmptyState({
  title,
  subtitle,
  icon,
  action,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="py-12 px-4 text-center flex flex-col items-center md-anim-fade">
      {icon && (
        <div className="w-16 h-16 rounded-[22px] bg-md-primary-container text-md-primary flex items-center justify-center mb-4 shadow-xs">
          {icon}
        </div>
      )}
      <div className="font-display text-lg font-bold text-md-on-surface">
        {title}
      </div>
      {subtitle && (
        <div className="text-sm text-md-on-surface-variant mt-1.5 max-w-sm">
          {subtitle}
        </div>
      )}
      {action && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          {action}
        </div>
      )}
    </div>
  );
}

/**
 * Material 3 Expressive Floating Pill Snackbar (Deep Navy in Light, Ivory in Dark)
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
      className="fixed z-[70] bottom-4 left-4 right-4 sm:right-auto sm:bottom-6 sm:left-6 sm:max-w-md min-h-12 py-2.5 pl-5 pr-2.5 rounded-2xl bg-md-on-surface text-md-surface shadow-(--md-elevation-3) flex items-center justify-between gap-4 text-sm font-medium md-anim-snackbar"
    >
      <span className="leading-5 flex items-center gap-2.5">
        <span className="w-2 h-2 rounded-full bg-md-primary shrink-0" />
        <span>{message}</span>
      </span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss notification"
        className="p-1.5 rounded-full hover:bg-md-surface/15 text-md-surface"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
