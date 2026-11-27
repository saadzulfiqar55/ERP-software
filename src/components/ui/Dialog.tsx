"use client";

import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * Reusable Material 3 Dialog.
 * Centered card on tablet/desktop, bottom sheet on phones. Closes on Escape and on a click on
 * the scrim, keeps keyboard focus inside while open, returns focus to the opener on close, and
 * locks page scroll behind it.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  icon,
  children,
  footer,
  size = "md",
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  /** false while work is in flight so a stray click cannot abandon it */
  dismissible?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const dismissRef = useRef(dismissible);
  dismissRef.current = dismissible;

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusables = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) || []
      );
    const first = focusables()[0];
    (first || panelRef.current)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissRef.current) {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, [open]);

  // Rendered at the document root: an animated (transformed) ancestor would otherwise become
  // the containing block for `position: fixed` and trap the scrim inside the page content.
  if (!open || typeof document === "undefined") return null;

  const width = {
    sm: "sm:max-w-md",
    md: "sm:max-w-xl",
    lg: "sm:max-w-3xl",
    xl: "sm:max-w-5xl",
  }[size];

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-6 bg-(--md-scrim) backdrop-blur-[2px] md-anim-fade"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && dismissible) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="md-dialog-title"
        tabIndex={-1}
        className={`w-full ${width} max-h-[92dvh] sm:max-h-[88vh] flex flex-col overflow-hidden bg-md-surface-container-lowest rounded-t-[28px] sm:rounded-[28px] shadow-(--md-elevation-3) outline-none md-anim-sheet`}
      >
        <div className="sm:hidden flex justify-center pt-3" aria-hidden>
          <span className="w-8 h-1 rounded-full bg-md-outline-variant" />
        </div>
        <div className="flex items-start gap-4 px-6 pt-5 pb-4">
          {icon && (
            <div className="w-10 h-10 rounded-full bg-md-primary-container text-md-on-primary-container flex items-center justify-center shrink-0">
              {icon}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2
              id="md-dialog-title"
              className="text-xl leading-7 font-normal text-md-on-surface"
            >
              {title}
            </h2>
            {description && (
              <p className="text-sm text-md-on-surface-variant mt-1">
                {description}
              </p>
            )}
          </div>
          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-10 h-10 -mr-2 -mt-1 rounded-full flex items-center justify-center text-md-on-surface-variant hover:bg-md-surface-container-high hover:text-md-on-surface"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
        {children ? (
          <div className="flex-1 overflow-y-auto px-6 pt-2 pb-5">{children}</div>
        ) : null}
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 px-6 py-4 border-t border-md-divider bg-md-surface-container-low/60">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
