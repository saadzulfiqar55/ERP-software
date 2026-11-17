"use client";

import React, { useState } from "react";
import { Order, PRAConfig } from "@/lib/types";
import { buildPRAPayload } from "@/lib/pra-client";
import { CheckCircle2, Code2, Printer, Receipt, Utensils, X } from "lucide-react";
import { Button, SegmentedButton, StatusChip } from "@/components/ui/m3";

interface ReceiptModalProps {
  order: Order | null;
  praConfig: PRAConfig;
  onClose: () => void;
}

function PRAQrMatrix({ value }: { value: string }) {
  const size = 21;
  const cells: boolean[][] = [];

  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  const isFinderPattern = (r: number, c: number) => {
    const inTopLeft = r < 7 && c < 7;
    const inTopRight = r < 7 && c >= size - 7;
    const inBottomLeft = r >= size - 7 && c < 7;
    if (!inTopLeft && !inTopRight && !inBottomLeft) return null;

    const lr = inTopLeft ? r : inTopRight ? r : r - (size - 7);
    const lc = inTopLeft ? c : inTopRight ? c - (size - 7) : c;

    if (lr === 0 || lr === 6 || lc === 0 || lc === 6) return true;
    if (lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4) return true;
    return false;
  };

  for (let r = 0; r < size; r++) {
    cells[r] = [];
    for (let c = 0; c < size; c++) {
      const finder = isFinderPattern(r, c);
      if (finder !== null) {
        cells[r][c] = finder;
      } else {
        const seed =
          (r * 31 + c * 17 + Math.abs(hash) + value.charCodeAt((r + c) % value.length)) % 7;
        cells[r][c] = seed < 3;
      }
    }
  }

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="w-28 h-28 mx-auto border-2 border-md-on-surface p-1 bg-md-surface-container-lowest"
      shapeRendering="crispEdges"
    >
      {cells.map((row, rIdx) =>
        row.map((filled, cIdx) =>
          filled ? (
            <rect
              key={`${rIdx}-${cIdx}`}
              x={cIdx}
              y={rIdx}
              width={1}
              height={1}
              fill="currentColor"
            />
          ) : null
        )
      )}
    </svg>
  );
}

export default function ReceiptModal({ order, praConfig, onClose }: ReceiptModalProps) {
  const [activeView, setActiveView] = useState<"CUSTOMER_BILL" | "KOT" | "PRA_JSON">(
    "CUSTOMER_BILL"
  );

  if (!order) return null;

  const praPayload = buildPRAPayload(order, praConfig);

  const stationGroups = order.items.reduce<Record<string, typeof order.items>>((acc, item) => {
    const key = item.kitchenStation;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-md-on-surface/40 p-4"
    >
      <div className="bg-md-surface-container-lowest border border-md-outline-variant rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        {/* Top Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-md-surface-container-low border-b border-md-divider">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-md-primary-container text-md-on-primary-container flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" strokeWidth={1.8} />
            </div>
            <div>
              <div className="font-medium text-md-on-surface text-base flex items-center gap-2">
                <span>Invoice {order.invoiceNumber}</span>
                <StatusChip label="PRA Fiscalized" variant="success" />
              </div>
              <div className="text-xs font-mono text-md-on-surface-variant">
                PRA Fiscal Invoice #: {order.praInvoiceNumber}
              </div>
            </div>
          </div>
          <Button variant="icon" aria-label="Close dialog" onClick={onClose}>
            <X className="w-5 h-5" strokeWidth={1.8} />
          </Button>
        </div>

        {/* View Switcher */}
        <div className="flex items-center justify-between px-6 py-3 bg-md-surface-container-lowest border-b border-md-divider gap-2 flex-wrap">
          <SegmentedButton
            value={activeView}
            onChange={setActiveView}
            options={[
              { value: "CUSTOMER_BILL", label: "80mm Customer Receipt" },
              { value: "KOT", label: "Kitchen KOT Slip" },
              { value: "PRA_JSON", label: "PRA e-IMS JSON" },
            ]}
          />

          <Button
            variant="filled"
            icon={<Printer className="w-4 h-4" strokeWidth={1.8} />}
            onClick={() => window.print()}
          >
            Print 80mm Slip
          </Button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 flex justify-center bg-md-surface">
          {activeView === "CUSTOMER_BILL" && (
            <div
              id="printable-receipt"
              className="w-[340px] bg-md-surface-container-lowest text-md-on-surface p-5 rounded-2xl border border-md-outline-variant font-mono text-xs leading-relaxed"
            >
              <div className="text-center border-b-2 border-dashed border-md-on-surface pb-3">
                <div className="text-base font-bold tracking-tight">
                  {praConfig.restaurantName}
                </div>
                <div className="text-[11px] mt-1">{praConfig.branchName}</div>
                <div className="text-[11px] mt-1 font-medium">
                  NTN: {praConfig.ntn} | STRN: {praConfig.strn}
                </div>
                <div className="text-[11px]">PRA POS ID: {praConfig.posId}</div>
              </div>

              <div className="py-2.5 border-b border-dashed border-md-on-surface text-[11px] space-y-0.5">
                <div className="flex justify-between">
                  <span>INV #: {order.invoiceNumber}</span>
                  <span className="font-bold">{order.orderType.replace("_", " ")}</span>
                </div>
                <div className="flex justify-between">
                  <span>DATE: {new Date(order.createdAt).toLocaleDateString()}</span>
                  <span>TIME: {new Date(order.createdAt).toLocaleTimeString()}</span>
                </div>
                {order.tableNumber && (
                  <div className="flex justify-between">
                    <span>TABLE: {order.tableNumber}</span>
                    <span>SERVER: {order.waiterName || "Main Hall"}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>CUSTOMER: {order.customerName || "Walk-in"}</span>
                  <span>MODE: {order.paymentMethod}</span>
                </div>
              </div>

              <div className="py-2 border-b border-dashed border-md-on-surface">
                <div className="flex justify-between font-bold border-b border-md-on-surface pb-1 mb-1.5 text-[11px]">
                  <span>ITEM / PORTION</span>
                  <span>QTY x RATE = TOTAL</span>
                </div>
                <div className="space-y-2">
                  {order.items.map((item) => (
                    <div key={item.cartItemId} className="text-[11px]">
                      <div className="font-medium">{item.name}</div>
                      <div className="flex justify-between text-[10px]">
                        <span>[{item.variantName}]</span>
                        <span className="font-bold tabular-nums">
                          {item.quantity} x {item.unitPrice.toLocaleString()} ={" "}
                          {(item.quantity * item.unitPrice).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="py-2.5 border-b-2 border-dashed border-md-on-surface space-y-1 text-[11px] tabular-nums">
                <div className="flex justify-between">
                  <span>Gross Subtotal:</span>
                  <span>PKR {order.taxBreakdown.grossSubtotal.toLocaleString()}</span>
                </div>
                {order.discountAmount > 0 && (
                  <div className="flex justify-between">
                    <span>Discount:</span>
                    <span>- PKR {order.discountAmount.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Taxable Value:</span>
                  <span>PKR {order.taxBreakdown.taxableAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>PRA GST ({order.taxBreakdown.effectiveTaxRateLabel}):</span>
                  <span>PKR {order.taxBreakdown.totalSalesTax.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm font-bold border-t border-md-on-surface pt-1.5 mt-1">
                  <span>NET PAYABLE:</span>
                  <span>PKR {order.taxBreakdown.grandTotal.toLocaleString()}</span>
                </div>
              </div>

              <div className="pt-3 text-center space-y-1.5">
                <div className="text-[11px] font-bold uppercase">
                  Punjab Revenue Authority (e-IMS)
                </div>
                <div className="bg-md-primary-container text-md-on-primary-container py-1 px-2 font-bold text-[11px] rounded">
                  PRA INV #: {order.praInvoiceNumber}
                </div>
                <div className="py-1.5">
                  <PRAQrMatrix value={order.praQrPayload} />
                </div>
                <div className="text-[10px]">Verify invoice online at e.pra.punjab.gov.pk</div>
              </div>
            </div>
          )}

          {activeView === "KOT" && (
            <div
              id="printable-receipt"
              className="w-[340px] bg-md-surface-container-lowest text-md-on-surface p-5 rounded-2xl border border-md-outline-variant font-mono text-xs"
            >
              <div className="text-center border-b-2 border-md-on-surface pb-2 mb-3">
                <div className="text-base font-bold">KITCHEN ORDER TICKET (KOT)</div>
                <div className="text-xs font-bold mt-0.5">
                  {order.orderType} — {order.tableNumber || "Counter"}
                </div>
                <div className="text-[11px]">
                  Order: {order.invoiceNumber} | Time:{" "}
                  {new Date(order.createdAt).toLocaleTimeString()}
                </div>
              </div>

              <div className="space-y-4">
                {Object.entries(stationGroups).map(([station, items]) => (
                  <div
                    key={station}
                    className="border border-md-outline-variant p-2.5 rounded-xl"
                  >
                    <div className="bg-md-secondary-container text-md-on-secondary-container px-2.5 py-1 font-bold text-[11px] rounded mb-2">
                      STATION: {station.replace("_", " ")}
                    </div>
                    <div className="space-y-2">
                      {items.map((item) => (
                        <div
                          key={item.cartItemId}
                          className="border-b border-dashed border-md-outline-variant pb-1 last:border-b-0"
                        >
                          <div className="flex justify-between font-bold text-xs">
                            <span>
                              {item.quantity}x {item.name}
                            </span>
                            <span>[{item.variantName}]</span>
                          </div>
                          {item.notes && (
                            <div className="text-[11px] font-medium bg-md-warning-container text-md-on-warning-container px-2 py-0.5 rounded mt-1">
                              * CHEF NOTE: {item.notes}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeView === "PRA_JSON" && (
            <div className="w-full space-y-3">
              <div className="p-3.5 rounded-2xl bg-md-surface-container-lowest border border-md-outline-variant text-xs text-md-on-surface flex items-center justify-between">
                <div>
                  <span className="font-medium">Endpoint:</span>{" "}
                  <code className="text-md-primary bg-md-primary-container/40 px-2 py-0.5 rounded font-mono">
                    {praConfig.imsEndpointUrl}
                  </code>
                </div>
                <StatusChip label="HTTP 200 (Code 100)" variant="success" />
              </div>
              <pre className="bg-md-surface-container-low text-md-on-surface border border-md-outline-variant rounded-2xl p-4 text-xs font-mono overflow-x-auto">
                {JSON.stringify(praPayload, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
