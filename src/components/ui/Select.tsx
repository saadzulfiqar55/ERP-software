"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export interface M3SelectOption {
  value: string;
  label: string;
}

interface MenuCoords {
  top: number;
  left: number;
  width: number;
  openUpward: boolean;
}

function useDropdownPosition(
  open: boolean,
  triggerRef: React.RefObject<HTMLElement | null>,
  minWidth?: number
) {
  const [coords, setCoords] = useState<MenuCoords | null>(null);

  useEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }

    const updatePosition = () => {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const estimatedMenuHeight = 256;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpward =
        spaceBelow < estimatedMenuHeight && rect.top > spaceBelow;
      const width = Math.max(rect.width, minWidth ?? 0);
      const maxLeft = Math.max(8, window.innerWidth - width - 8);
      const left = Math.min(Math.max(8, rect.left), maxLeft);

      setCoords({
        top: openUpward ? rect.top - 6 : rect.bottom + 6,
        left,
        width,
        openUpward,
      });
    };

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, triggerRef, minWidth]);

  return coords;
}

/**
 * Shared floating Material 3 Menu Portal so dropdowns inside scroll containers
 * (e.g., POS cart, modals, tables) never clip.
 */
function SelectMenuPortal({
  open,
  coords,
  menuRef,
  options,
  selectedValue,
  highlightedIndex,
  onSelect,
  onHoverIndex,
  listboxId,
  mono,
  placeholderOption,
}: {
  open: boolean;
  coords: MenuCoords | null;
  menuRef: React.RefObject<HTMLDivElement | null>;
  options: M3SelectOption[];
  selectedValue: string;
  highlightedIndex: number;
  onSelect: (val: string) => void;
  onHoverIndex: (idx: number) => void;
  listboxId: string;
  mono?: boolean;
  placeholderOption?: string;
}) {
  if (!open || !coords || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={menuRef}
      id={listboxId}
      role="listbox"
      style={{
        position: "fixed",
        top: coords.top,
        left: coords.left,
        width: coords.width,
        transform: coords.openUpward ? "translateY(-100%)" : undefined,
      }}
      className="z-50 rounded-2xl overflow-hidden bg-md-surface-container-lowest p-1.5 border border-md-outline-variant/40 shadow-(--md-card-shadow-hover)"
    >
      <div className="max-h-60 overflow-y-auto pr-0.5 space-y-0.5">
        {placeholderOption && (
          <div className="px-3 py-1.5 text-[11px] font-medium text-md-on-surface-variant select-none">
            {placeholderOption}
          </div>
        )}
        {options.length === 0 ? (
          <div className="px-3 py-2 text-xs text-md-on-surface-variant">
            No options available
          </div>
        ) : (
          options.map((opt, idx) => {
            const isSelected = opt.value === selectedValue;
            const isHighlighted = idx === highlightedIndex;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => onHoverIndex(idx)}
                onClick={() => onSelect(opt.value)}
                className={`border-0 w-full px-3 py-2 rounded-xl text-left text-sm flex items-center justify-between gap-2 transition-colors duration-150 ${
                  mono ? "font-mono text-xs" : ""
                } ${
                  isSelected
                    ? "bg-md-secondary-container text-md-on-secondary-container font-medium"
                    : isHighlighted
                    ? "bg-md-surface-container-high/75 text-md-on-surface"
                    : "bg-transparent text-md-on-surface hover:bg-md-surface-container-low"
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && (
                  <Check
                    className="w-4 h-4 shrink-0 text-md-primary"
                    strokeWidth={2.2}
                  />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>,
    document.body
  );
}

/**
 * Reusable Material 3 Select input (used inside OutlinedTextField and standalone forms)
 */
export function M3Select({
  value,
  options,
  onChange,
  disabled = false,
  mono = false,
  placeholder = "Select an option…",
  minMenuWidth,
  triggerClassName = "",
  ariaLabel,
}: {
  value: string | number;
  options: M3SelectOption[];
  onChange?: (val: string) => void;
  disabled?: boolean;
  mono?: boolean;
  placeholder?: string;
  minMenuWidth?: number;
  triggerClassName?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();
  const stringValue = String(value);

  const selectedOption = options.find((o) => o.value === stringValue);
  const coords = useDropdownPosition(open, triggerRef, minMenuWidth);

  useEffect(() => {
    if (!open) return;
    const idx = options.findIndex((o) => o.value === stringValue);
    setHighlightedIndex(idx >= 0 ? idx : 0);

    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          options.length ? (prev + 1) % options.length : -1
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          options.length ? (prev - 1 + options.length) % options.length : -1
        );
      } else if (e.key === "Enter" && highlightedIndex >= 0) {
        e.preventDefault();
        const chosen = options[highlightedIndex];
        if (chosen) {
          onChange?.(chosen.value);
          setOpen(false);
          triggerRef.current?.focus();
        }
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, options, stringValue, highlightedIndex, onChange]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => {
          if (!disabled) setOpen((prev) => !prev);
        }}
        className={`border-0 w-full h-12 pl-3.5 pr-3 bg-transparent text-left text-sm flex items-center justify-between gap-2 outline-none ${
          mono ? "font-mono" : ""
        } ${
          disabled
            ? "text-md-on-surface-variant cursor-not-allowed"
            : "text-md-on-surface"
        } ${triggerClassName}`}
      >
        <span
          className={`truncate ${
            selectedOption ? "" : "text-md-on-surface-variant"
          }`}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 text-md-on-surface-variant transition-transform duration-200 ${
            open ? "rotate-180 text-md-primary" : ""
          }`}
          strokeWidth={1.8}
        />
      </button>

      <SelectMenuPortal
        open={open}
        coords={coords}
        menuRef={menuRef}
        options={options}
        selectedValue={stringValue}
        highlightedIndex={highlightedIndex}
        onHoverIndex={setHighlightedIndex}
        onSelect={(val) => {
          onChange?.(val);
          setOpen(false);
          triggerRef.current?.focus();
        }}
        listboxId={listboxId}
        mono={mono}
      />
    </>
  );
}

/**
 * Compact Material 3 Dropdown Button for toolbars, filters, and quick-pickers
 * (replaces generic browser <select> elements).
 */
export function CompactSelect({
  value,
  options,
  onChange,
  placeholder = "Choose…",
  variant = "tonal",
  minMenuWidth = 220,
  prefixLabel,
  ariaLabel,
  className = "",
}: {
  value: string;
  options: M3SelectOption[];
  onChange: (val: string) => void;
  placeholder?: string;
  variant?: "tonal" | "chip" | "subtle";
  minMenuWidth?: number;
  prefixLabel?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();

  const selectedOption = options.find((o) => o.value === value);
  const coords = useDropdownPosition(open, triggerRef, minMenuWidth);

  useEffect(() => {
    if (!open) return;
    const idx = options.findIndex((o) => o.value === value);
    setHighlightedIndex(idx >= 0 ? idx : 0);

    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          options.length ? (prev + 1) % options.length : -1
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          options.length ? (prev - 1 + options.length) % options.length : -1
        );
      } else if (e.key === "Enter" && highlightedIndex >= 0) {
        e.preventDefault();
        const chosen = options[highlightedIndex];
        if (chosen) {
          onChange(chosen.value);
          setOpen(false);
          triggerRef.current?.focus();
        }
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, options, value, highlightedIndex, onChange]);

  const variantClasses: Record<"tonal" | "chip" | "subtle", string> = {
    tonal:
      "h-9 px-3.5 rounded-full bg-md-secondary-container/80 hover:bg-md-secondary-container text-md-on-secondary-container font-medium text-xs",
    chip:
      value && value !== "ALL"
        ? "h-8 px-3 rounded-lg bg-md-secondary-container text-md-on-secondary-container font-medium text-xs"
        : "h-8 px-3 rounded-lg bg-md-surface-container-low hover:bg-md-surface-container-high text-md-on-surface-variant hover:text-md-on-surface font-medium text-xs",
    subtle:
      "h-7 px-2.5 rounded-lg bg-md-surface-container-lowest hover:bg-md-secondary-container/70 text-md-on-surface text-xs shadow-xs",
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        onClick={() => setOpen((prev) => !prev)}
        className={`border-0 inline-flex items-center justify-between gap-2 transition-all duration-200 select-none ${variantClasses[variant]} ${className}`}
      >
        <span className="truncate">
          {prefixLabel ? `${prefixLabel}: ` : ""}
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${
            open ? "rotate-180 text-md-primary" : "opacity-75"
          }`}
          strokeWidth={1.9}
        />
      </button>

      <SelectMenuPortal
        open={open}
        coords={coords}
        menuRef={menuRef}
        options={options}
        selectedValue={value}
        highlightedIndex={highlightedIndex}
        onHoverIndex={setHighlightedIndex}
        onSelect={(val) => {
          onChange(val);
          setOpen(false);
          triggerRef.current?.focus();
        }}
        listboxId={listboxId}
      />
    </>
  );
}
