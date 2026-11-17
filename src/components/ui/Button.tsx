"use client";

import React from "react";

export interface M3ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "filled" | "tonal" | "outlined" | "text" | "icon";
  size?: "sm" | "md" | "lg";
  icon?: React.ReactNode;
}

/**
 * Reusable Material Design 3 Button
 * Edit this single file to customize button shape, elevation, state layers, and typography across the entire ERP.
 */
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
      ? "w-11 h-11 rounded-full justify-center p-0"
      : size === "sm"
      ? "h-9 px-4 text-xs gap-1.5 rounded-full"
      : size === "lg"
      ? "h-12 px-6 text-sm gap-2.5 rounded-full"
      : "h-10 px-5 text-sm gap-2 rounded-full";

  const variantStyles = {
    filled:
      "bg-md-primary text-md-on-primary font-medium tracking-[0.01em] shadow-[0_1px_2px_rgba(25,28,32,0.08),inset_0_1px_0_rgba(255,255,255,0.18)] hover:bg-md-primary-strong hover:shadow-[0_4px_12px_rgba(54,97,142,0.24)] active:scale-[0.985] disabled:opacity-40 disabled:pointer-events-none",
    tonal:
      "bg-md-secondary-container text-md-on-secondary-container font-medium tracking-[0.01em] hover:bg-md-primary-container hover:text-md-on-primary-container hover:shadow-[0_2px_8px_rgba(16,28,43,0.08)] active:scale-[0.985] disabled:opacity-40 disabled:pointer-events-none",
    outlined:
      "bg-md-surface-container-lowest border border-md-outline-variant/90 text-md-on-surface font-medium tracking-[0.01em] shadow-[0_1px_2px_rgba(25,28,32,0.03)] hover:border-md-primary/60 hover:bg-md-primary-container/25 hover:text-md-primary-strong active:scale-[0.985] disabled:opacity-40 disabled:pointer-events-none",
    text: "bg-transparent text-md-primary font-medium tracking-[0.01em] px-3.5 hover:bg-md-primary-container/35 active:bg-md-primary-container/55 disabled:opacity-40 disabled:pointer-events-none",
    icon: "bg-transparent text-md-on-surface-variant hover:bg-md-surface-container-high hover:text-md-on-surface active:scale-95",
  }[variant];

  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center transition-all duration-200 select-none ${sizeStyles} ${variantStyles} ${className}`}
      {...props}
    >
      {icon && <span className="shrink-0 flex items-center">{icon}</span>}
      {children}
    </button>
  );
}

/**
 * Reusable Material Design 3 Extended FAB (Primary Action Button in Navigation Drawer)
 */
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
      className={`h-14 rounded-2xl bg-md-primary-container text-md-on-primary-container font-medium text-sm tracking-[0.01em] shadow-[0_2px_6px_rgba(0,29,54,0.10),inset_0_1px_0_rgba(255,255,255,0.45)] hover:bg-md-secondary-container hover:shadow-[0_6px_16px_rgba(0,29,54,0.14)] active:scale-[0.985] inline-flex items-center transition-all duration-200 ${
        collapsed ? "w-14 justify-center p-0" : "px-5 gap-3 w-full"
      }`}
    >
      <span className="shrink-0 flex items-center">{icon}</span>
      {!collapsed && <span>{label}</span>}
    </button>
  );
}
