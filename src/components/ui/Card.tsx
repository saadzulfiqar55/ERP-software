"use client";

import React from "react";
import { StatusChip, StatusChipVariant } from "./Chip";

/**
 * Material 3 Expressive Card
 * Generous 28px corner radius (`rounded-[28px]`) with warm tonal elevation and spring lift.
 */
export function Card({
  children,
  className = "",
  variant = "outlined",
  interactive = false,
}: {
  children: React.ReactNode;
  className?: string;
  variant?: "outlined" | "tonal";
  interactive?: boolean;
}) {
  const surfaceClass =
    variant === "tonal"
      ? "border-0 bg-md-surface-container-low shadow-(--md-tonal-shadow)"
      : "border-0 bg-md-surface-container-lowest shadow-(--md-card-shadow)";

  const interactiveClass = interactive
    ? "hover:-translate-y-1 hover:scale-[1.012] hover:shadow-(--md-card-shadow-hover) active:scale-[0.99]"
    : "";

  return (
    <div
      className={`rounded-[26px] p-6 transition-all duration-300 ${surfaceClass} ${interactiveClass} ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Material 3 Expressive StatCard (Editorial KPI Tile)
 * Bold Bricolage Grotesque display numerals paired with expressive squircle icon badges.
 */
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
  const iconContainerClass = {
    success: "bg-md-success-container text-md-on-success-container",
    primary: "bg-md-primary-container text-md-on-primary-container",
    warning: "bg-md-warning-container text-md-on-warning-container",
    error: "bg-md-error-container text-md-on-error-container",
    neutral: "bg-md-tertiary-container text-md-on-tertiary-container",
  }[chipVariant];

  return (
    <Card interactive className="flex flex-col justify-between gap-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-md-on-surface-variant">
          {label}
        </span>
        <div
          className={`w-11 h-11 rounded-[16px] flex items-center justify-center shrink-0 shadow-2xs ${iconContainerClass}`}
        >
          {icon}
        </div>
      </div>

      <div className="font-display text-[32px] leading-[38px] font-bold text-md-on-surface tabular-nums tracking-[-0.03em]">
        {value}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <StatusChip label={chipLabel} variant={chipVariant} />
        {caption && (
          <span className="text-xs font-medium text-md-on-surface-variant">
            {caption}
          </span>
        )}
      </div>
    </Card>
  );
}
