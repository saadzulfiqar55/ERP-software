"use client";

import React from "react";
import { Check } from "lucide-react";

/**
 * Reusable Material Design 3 Switch (52x32px track, growing thumb with check icon)
 */
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
    <div className="flex items-center justify-between gap-4 py-2">
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
        className={`w-[52px] h-[32px] rounded-full p-1 flex items-center transition-all duration-200 shrink-0 ${
          checked
            ? "bg-md-primary justify-end shadow-[inset_0_1px_2px_rgba(0,0,0,0.15)]"
            : "bg-md-surface-container-high border border-md-outline-variant justify-start hover:border-md-outline"
        }`}
      >
        <span
          className={`rounded-full flex items-center justify-center transition-all duration-200 ${
            checked
              ? "w-6 h-6 bg-md-on-primary text-md-primary shadow-xs"
              : "w-4 h-4 bg-md-on-surface-variant/70 ml-1"
          }`}
        >
          {checked && <Check className="w-3.5 h-3.5" strokeWidth={2.5} />}
        </span>
      </button>
    </div>
  );
}

/**
 * Reusable Material Design 3 Checkbox
 */
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
      className={`w-[18px] h-[18px] rounded-[4px] flex items-center justify-center transition-all duration-150 ${
        checked
          ? "bg-md-primary text-md-on-primary shadow-2xs"
          : "border border-md-outline-variant bg-md-surface-container-lowest hover:border-md-primary"
      }`}
    >
      {checked && <Check className="w-3.5 h-3.5" strokeWidth={2.5} />}
    </button>
  );
}
