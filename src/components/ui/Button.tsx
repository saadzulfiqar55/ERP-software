"use client";

import React from "react";

export interface M3ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "filled" | "tonal" | "outlined" | "text" | "icon";
  size?: "sm" | "md" | "lg";
  icon?: React.ReactNode;
}

/**
 * Material 3 Expressive Button
 * Signature M3 Expressive tactile shape-morphing: full pill at rest, morphing to a
 * crisp squircle (`active:rounded-[14px]`) on press with spring scale and StackLyra Flame Orange energy.
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
      ? "w-11 h-11 rounded-full active:rounded-[14px] justify-center p-0"
      : size === "sm"
      ? "h-9 px-4 text-xs gap-1.5 rounded-full active:rounded-[12px]"
      : size === "lg"
      ? "h-12 px-7 text-sm gap-2.5 rounded-full active:rounded-[16px]"
      : "h-10.5 px-5 text-sm gap-2 rounded-full active:rounded-[14px]";

  const variantStyles = {
    filled:
      "border-0 bg-md-primary text-md-on-primary font-semibold tracking-[0.005em] shadow-[0_3px_10px_rgba(255,91,31,0.28)] hover:bg-md-primary-strong hover:-translate-y-0.5 hover:scale-[1.015] hover:shadow-[0_10px_24px_-4px_rgba(255,91,31,0.40)] active:translate-y-0 active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none",
    tonal:
      "border-0 bg-md-primary-container text-md-on-primary-container font-semibold tracking-[0.005em] hover:bg-md-primary hover:text-md-on-primary hover:-translate-y-0.5 hover:scale-[1.015] hover:shadow-[0_6px_16px_rgba(255,91,31,0.22)] active:translate-y-0 active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none",
    outlined:
      "border border-md-outline-variant bg-md-surface-container-lowest text-md-on-surface font-semibold tracking-[0.005em] shadow-[0_1px_3px_rgba(14,27,61,0.05)] hover:bg-md-secondary-container hover:border-transparent hover:text-md-on-secondary-container hover:-translate-y-0.5 hover:scale-[1.01] hover:shadow-[0_6px_16px_rgba(14,27,61,0.09)] active:translate-y-0 active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none",
    text: "border-0 bg-transparent text-md-primary font-semibold tracking-[0.005em] px-3.5 hover:bg-md-primary-container/60 hover:-translate-y-px active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none",
    icon: "border-0 bg-transparent text-md-on-surface-variant hover:bg-md-surface-container-high hover:text-md-on-surface hover:scale-[1.06] active:scale-[0.92]",
  }[variant];

  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center select-none ${sizeStyles} ${variantStyles} ${className}`}
      {...props}
    >
      {icon && <span className="shrink-0 flex items-center">{icon}</span>}
      {children}
    </button>
  );
}

/**
 * Material 3 Expressive Extended FAB (Primary Action Anchor in Navigation Drawer)
 * Vibrant StackLyra Flame Orange squircle with expressive corner morph on press.
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
      className={`border-0 h-14 rounded-[20px] active:rounded-[14px] bg-md-primary text-md-on-primary font-display font-bold text-sm tracking-[-0.01em] shadow-[0_6px_18px_-2px_rgba(255,91,31,0.38)] hover:bg-md-primary-strong hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-4px_rgba(255,91,31,0.48)] active:translate-y-0 active:scale-[0.97] inline-flex items-center ${
        collapsed ? "w-14 justify-center p-0" : "px-5 gap-3 w-full"
      }`}
    >
      <span className="shrink-0 flex items-center">{icon}</span>
      {!collapsed && <span>{label}</span>}
    </button>
  );
}
