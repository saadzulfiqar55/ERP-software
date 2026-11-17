"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  FileText,
  LayoutDashboard,
  Package,
  Receipt,
  Search,
  Users,
  X,
} from "lucide-react";
import { Button, StatusChip } from "@/components/ui/m3";
import { Order, PartyAccount, Product } from "@/lib/types";
import { ERP_NAVIGATION_ITEMS } from "@/lib/nav";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (key: string) => void;
  products: Product[];
  orders: Order[];
  parties: PartyAccount[];
}

export default function CommandPalette({
  open,
  onClose,
  onNavigate,
  products,
  orders,
  parties,
}: CommandPaletteProps) {
  const [query, setQuery] = useState<string>("");

  // Listen for Ctrl+K / Cmd+K globally
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) {
          onClose();
        }
      } else if (e.key === "Escape" && open) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matchedNav = ERP_NAVIGATION_ITEMS.filter(
      (n) => !q || n.label.toLowerCase().includes(q)
    ).slice(0, 4);

    const matchedProducts = products
      .filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q)
      )
      .slice(0, 4);

    const matchedParties = parties
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .slice(0, 3);

    const matchedOrders = orders
      .filter(
        (o) =>
          !q ||
          o.invoiceNumber.toLowerCase().includes(q) ||
          (o.customerName && o.customerName.toLowerCase().includes(q))
      )
      .slice(0, 3);

    return { matchedNav, matchedProducts, matchedParties, matchedOrders };
  }, [query, products, parties, orders]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Global search command palette"
      className="fixed inset-0 z-50 flex items-start justify-center bg-md-on-surface/40 pt-20 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl bg-md-surface-container-lowest border border-md-outline-variant shadow-xl overflow-hidden"
      >
        {/* Top Search Input */}
        <div className="h-14 px-5 flex items-center gap-3 border-b border-md-divider bg-md-surface-container-low">
          <Search
            className="w-5 h-5 text-md-on-surface-variant shrink-0"
            strokeWidth={1.8}
          />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search orders, invoices, customers, products, or jump to module…"
            className="w-full bg-transparent text-sm text-md-on-surface placeholder:text-md-on-surface-variant outline-none"
          />
          <Button variant="icon" aria-label="Close palette" onClick={onClose} className="w-9! h-9!">
            <X className="w-4 h-4" strokeWidth={1.8} />
          </Button>
        </div>

        {/* Results Body */}
        <div className="max-h-[65vh] overflow-y-auto p-4 space-y-5 text-sm">
          {/* Modules */}
          {results.matchedNav.length > 0 && (
            <div className="space-y-1.5">
              <div className="px-3 text-xs font-medium text-md-on-surface-variant">
                Modules & pages
              </div>
              {results.matchedNav.map((nav) => (
                <button
                  key={nav.key}
                  type="button"
                  onClick={() => {
                    onNavigate(nav.key);
                    onClose();
                  }}
                  className="w-full px-3 py-2.5 rounded-xl hover:bg-md-secondary-container text-md-on-surface flex items-center justify-between transition"
                >
                  <div className="flex items-center gap-3">
                    <LayoutDashboard
                      className="w-4 h-4 text-md-primary"
                      strokeWidth={1.8}
                    />
                    <span className="font-medium">{nav.label}</span>
                  </div>
                  <span className="text-xs text-md-on-surface-variant">
                    Jump to page →
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Products */}
          {results.matchedProducts.length > 0 && (
            <div className="space-y-1.5">
              <div className="px-3 text-xs font-medium text-md-on-surface-variant">
                Products & menu catalogue
              </div>
              {results.matchedProducts.map((prod) => (
                <button
                  key={prod.id}
                  type="button"
                  onClick={() => {
                    onNavigate("inventory");
                    onClose();
                  }}
                  className="w-full px-3 py-2.5 rounded-xl hover:bg-md-surface-container-low text-md-on-surface flex items-center justify-between transition"
                >
                  <div className="flex items-center gap-3">
                    <Package
                      className="w-4 h-4 text-md-primary"
                      strokeWidth={1.8}
                    />
                    <span>{prod.name}</span>
                    <span className="font-mono text-xs text-md-on-surface-variant">
                      #{prod.code}
                    </span>
                  </div>
                  <StatusChip
                    label={`PKR ${prod.variants[0]?.price.toLocaleString()}`}
                    variant="primary"
                  />
                </button>
              ))}
            </div>
          )}

          {/* Customers & Suppliers */}
          {results.matchedParties.length > 0 && (
            <div className="space-y-1.5">
              <div className="px-3 text-xs font-medium text-md-on-surface-variant">
                Customers & suppliers
              </div>
              {results.matchedParties.map((party) => (
                <button
                  key={party.id}
                  type="button"
                  onClick={() => {
                    onNavigate("accounting");
                    onClose();
                  }}
                  className="w-full px-3 py-2.5 rounded-xl hover:bg-md-surface-container-low text-md-on-surface flex items-center justify-between transition"
                >
                  <div className="flex items-center gap-3">
                    <Users
                      className="w-4 h-4 text-md-primary"
                      strokeWidth={1.8}
                    />
                    <span>{party.name}</span>
                  </div>
                  <span className="font-mono text-xs text-md-on-surface-variant">
                    {party.type}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Orders / Invoices */}
          {results.matchedOrders.length > 0 && (
            <div className="space-y-1.5">
              <div className="px-3 text-xs font-medium text-md-on-surface-variant">
                Orders & fiscal invoices
              </div>
              {results.matchedOrders.map((ord) => (
                <button
                  key={ord.id}
                  type="button"
                  onClick={() => {
                    onNavigate("sales");
                    onClose();
                  }}
                  className="w-full px-3 py-2.5 rounded-xl hover:bg-md-surface-container-low text-md-on-surface flex items-center justify-between transition"
                >
                  <div className="flex items-center gap-3">
                    <Receipt
                      className="w-4 h-4 text-md-primary"
                      strokeWidth={1.8}
                    />
                    <span className="font-mono font-medium">
                      {ord.invoiceNumber}
                    </span>
                    <span className="text-xs text-md-on-surface-variant">
                      {ord.customerName}
                    </span>
                  </div>
                  <span className="font-mono text-xs font-medium tabular-nums">
                    PKR {ord.taxBreakdown.grandTotal.toLocaleString()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
