"use client";

import React from "react";
import { StatusChip, StatusChipVariant } from "./Chip";

/**
 * Reusable Material Design 3 Card
 * Flat tonal or soft-outlined surface (`outline-variant/75`).
 */
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
      ? "bg-md-surface-container-low border border-md-outline-variant/40"
      : "bg-md-surface-container-lowest border border-md-outline-variant/75 shadow-[0_1px_3px_rgba(25,28,32,0.03)]";

  return (
    <div className={`rounded-2xl p-6 transition-all duration-200 ${surfaceClass} ${className}`}>
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
    <Card className="flex flex-col justify-between gap-4 hover:border-md-primary/40">
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
