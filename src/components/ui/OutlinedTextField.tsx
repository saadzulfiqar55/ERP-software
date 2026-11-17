"use client";

import React from "react";
import { ChevronDown } from "lucide-react";

export interface OutlinedTextFieldProps {
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
  className?: string;
}

/**
 * Reusable Material Design 3 OutlinedTextField
 * Features a soft resting border (`outline-variant`), floating notched top label,
 * custom select chevron, and a smooth primary focus ring instead of harsh outlines.
 */
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
  className = "",
}: OutlinedTextFieldProps) {
  const hasError = Boolean(errorText);

  const containerStateStyles = hasError
    ? "border-md-error ring-2 ring-md-error/15"
    : readOnly
    ? "border-md-outline-variant/60 bg-md-surface-container-low/50"
    : "border-md-outline-variant/85 hover:border-md-outline/70 focus-within:border-md-primary focus-within:ring-3 focus-within:ring-md-primary/12";

  const labelColorStyles = hasError
    ? "text-md-error"
    : "text-md-on-surface-variant group-focus-within:text-md-primary font-medium";

  return (
    <div className={`group flex flex-col ${className}`}>
      <div
        className={`relative rounded-[10px] bg-md-surface-container-lowest border transition-all duration-200 ${containerStateStyles}`}
      >
        <label
          className={`absolute -top-2.5 left-3 px-1.5 rounded bg-md-surface-container-lowest text-[11px] leading-tight tracking-[0.01em] transition-colors duration-200 select-none pointer-events-none ${labelColorStyles}`}
        >
          {label}
          {required ? " *" : ""}
        </label>

        {options ? (
          <div className="relative flex items-center">
            <select
              value={value}
              disabled={readOnly}
              onChange={(e) => onChange?.(e.target.value)}
              className={`w-full h-12 pl-3.5 pr-9 pt-0.5 bg-transparent text-sm text-md-on-surface appearance-none outline-none ${
                mono ? "font-mono" : ""
              }`}
            >
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronDown
              className="w-4 h-4 text-md-on-surface-variant absolute right-3 pointer-events-none transition-transform group-focus-within:text-md-primary"
              strokeWidth={1.8}
            />
          </div>
        ) : multiline ? (
          <textarea
            rows={rows}
            value={value}
            readOnly={readOnly}
            placeholder={placeholder}
            onChange={(e) => onChange?.(e.target.value)}
            className="w-full px-3.5 py-3 bg-transparent text-sm text-md-on-surface placeholder:text-md-on-surface-variant/60 outline-none resize-y"
          />
        ) : (
          <input
            type={type}
            value={value}
            readOnly={readOnly}
            placeholder={placeholder}
            onChange={(e) => onChange?.(e.target.value)}
            className={`w-full h-12 px-3.5 pt-0.5 bg-transparent text-sm text-md-on-surface placeholder:text-md-on-surface-variant/60 outline-none ${
              mono ? "font-mono" : ""
            } ${readOnly ? "text-md-on-surface-variant" : ""}`}
          />
        )}
      </div>

      {(errorText || helperText) && (
        <span
          className={`mt-1.5 px-3 text-xs leading-snug ${
            hasError ? "text-md-error font-medium" : "text-md-on-surface-variant"
          }`}
        >
          {errorText || helperText}
        </span>
      )}
    </div>
  );
}

/**
 * Compact Table / Toolbar Input (Soft border, smooth focus glow, no notched label)
 * Used inside editable line-item tables, search bars, and compact toolbars.
 */
export function CompactField({
  value,
  onChange,
  type = "text",
  placeholder,
  mono = false,
  min,
  max,
  className = "",
}: {
  value: string | number;
  onChange: (val: string) => void;
  type?: "text" | "number";
  placeholder?: string;
  mono?: boolean;
  min?: number;
  max?: number;
  className?: string;
}) {
  return (
    <input
      type={type}
      min={min}
      max={max}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`h-10 px-3.5 rounded-[10px] bg-md-surface-container-lowest border border-md-outline-variant/80 hover:border-md-outline/70 focus:border-md-primary focus:ring-3 focus:ring-md-primary/12 text-sm text-md-on-surface placeholder:text-md-on-surface-variant/65 outline-none transition-all duration-200 ${
        mono ? "font-mono tabular-nums" : ""
      } ${className}`}
    />
  );
}
