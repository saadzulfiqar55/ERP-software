"use client";

import React from "react";
import { StatusChip, StatusChipVariant } from "./Chip";

/**
 * Reusable Material Design 3 Card
 * Borderless tonal surface (`border-0`). Set `interactive` on clickable cards (e.g. menu items)
 * to enable a subtle hover lift and scale transition.
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
    ? "transition-all duration-200 ease-out hover:translate-y-[-2px] hover:scale-[1.01] hover:shadow-(--md-card-shadow-hover)"
    : "";

  return (
    <div
      className={`rounded-2xl p-6 ${surfaceClass} ${interactiveClass} ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Reusable Material Design 3 StatCard (KPI Tile)
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
