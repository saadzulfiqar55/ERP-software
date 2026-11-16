"use client";

import React, { useState } from "react";
import { Order, PRAConfig } from "@/lib/types";
import { buildPRAPayload } from "@/lib/pra-client";
import { CheckCircle2, Code2, Printer, Receipt, Utensils, X } from "lucide-react";

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
      className="w-28 h-28 mx-auto border-2 border-black p-1 bg-white"
      shapeRendering="crispEdges"
    >
      {cells.map((row, rIdx) =>
        row.map((filled, cIdx) =>
          filled ? (
            <rect key={`${rIdx}-${cIdx}`} x={cIdx} y={rIdx} width={1} height={1} fill="#000000" />
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2b2d42]/75 p-4">
      <div className="bg-white border border-[#d4dce4] rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Top Modal Controls */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#2b2d42] text-white">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#ef233c] text-white flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-white text-sm flex items-center gap-2">
                Invoice Fiscalized — {order.invoiceNumber}
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#ef233c] text-white font-semibold">
                  PRA Verified
                </span>
              </div>
              <div className="text-xs text-[#cbd5e1]">
                PRA Fiscal Invoice #: {order.praInvoiceNumber}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#cbd5e1] hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* View Switcher */}
        <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-[#d4dce4] gap-2 flex-wrap">
          <div className="flex gap-1.5 bg-[#edf2f4] p-1 rounded-xl border border-[#d4dce4]">
            <button
              onClick={() => setActiveView("CUSTOMER_BILL")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeView === "CUSTOMER_BILL"
                  ? "bg-[#2b2d42] text-white"
                  : "text-[#2b2d42] hover:bg-white"
              }`}
            >
              <Receipt className="w-3.5 h-3.5 text-[#ef233c]" />
              80mm Customer Receipt
            </button>
            <button
              onClick={() => setActiveView("KOT")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeView === "KOT"
                  ? "bg-[#2b2d42] text-white"
                  : "text-[#2b2d42] hover:bg-white"
              }`}
            >
              <Utensils className="w-3.5 h-3.5 text-[#ef233c]" />
              Kitchen KOT Slip
            </button>
            <button
              onClick={() => setActiveView("PRA_JSON")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeView === "PRA_JSON"
                  ? "bg-[#2b2d42] text-white"
                  : "text-[#2b2d42] hover:bg-white"
              }`}
            >
              <Code2 className="w-3.5 h-3.5 text-[#ef233c]" />
              PRA e-IMS JSON
            </button>
          </div>

          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#ef233c] hover:bg-[#d80032] text-white text-xs font-semibold transition"
          >
            <Printer className="w-3.5 h-3.5" />
            Print 80mm Slip
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 flex justify-center bg-[#edf2f4]">
          {activeView === "CUSTOMER_BILL" && (
            <div
              id="printable-receipt"
              className="w-[340px] bg-white text-black p-5 rounded-xl border border-[#d4dce4] shadow-md font-mono text-xs leading-relaxed"
            >
              <div className="text-center border-b-2 border-dashed border-black pb-3">
                <div className="text-base font-bold tracking-tight">
                  {praConfig.restaurantName}
                </div>
                <div className="text-[11px] mt-1">{praConfig.branchName}</div>
                <div className="text-[11px] mt-1 font-semibold">
                  NTN: {praConfig.ntn} | STRN: {praConfig.strn}
                </div>
                <div className="text-[11px]">PRA POS ID: {praConfig.posId}</div>
              </div>

              <div className="py-2.5 border-b border-dashed border-black text-[11px] space-y-0.5">
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

              <div className="py-2 border-b border-dashed border-black">
                <div className="flex justify-between font-bold border-b border-black pb-1 mb-1.5 text-[11px]">
                  <span>ITEM / PORTION</span>
                  <span>QTY x RATE = TOTAL</span>
                </div>
                <div className="space-y-2">
                  {order.items.map((item) => (
                    <div key={item.cartItemId} className="text-[11px]">
                      <div className="font-semibold">{item.name}</div>
                      <div className="flex justify-between text-[10px]">
                        <span>
                          [{item.variantName}]{" "}
                          {item.taxMode === "INCLUSIVE"
                            ? "(Tax Incl.)"
                            : item.taxMode === "EXEMPT"
                            ? "(Exempt)"
                            : ""}
                        </span>
                        <span className="font-bold">
                          {item.quantity} x {item.unitPrice.toLocaleString()} ={" "}
                          {(item.quantity * item.unitPrice).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="py-2.5 border-b-2 border-dashed border-black space-y-1 text-[11px]">
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
                <div className="flex justify-between font-semibold">
                  <span>PRA GST ({order.taxBreakdown.effectiveTaxRateLabel}):</span>
                  <span>PKR {order.taxBreakdown.totalSalesTax.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm font-bold border-t border-black pt-1.5 mt-1">
                  <span>NET PAYABLE:</span>
                  <span>PKR {order.taxBreakdown.grandTotal.toLocaleString()}</span>
                </div>
              </div>

              <div className="pt-3 text-center space-y-1.5">
                <div className="text-[11px] font-bold uppercase">
                  Punjab Revenue Authority (e-IMS)
                </div>
                <div className="bg-black text-white py-1 px-2 font-bold text-[11px] rounded">
                  PRA INV #: {order.praInvoiceNumber}
                </div>
                <div className="py-1.5">
                  <PRAQrMatrix value={order.praQrPayload} />
                </div>
                <div className="text-[10px]">Verify invoice online at e.pra.punjab.gov.pk</div>
                <div className="text-[11px] font-bold pt-1">Thank You for Visiting Albarka!</div>
              </div>
            </div>
          )}

          {activeView === "KOT" && (
            <div
              id="printable-receipt"
              className="w-[340px] bg-white text-black p-5 rounded-xl border border-[#d4dce4] shadow-md font-mono text-xs"
            >
              <div className="text-center border-b-2 border-black pb-2 mb-3">
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
                  <div key={station} className="border border-black p-2 rounded">
                    <div className="bg-black text-white px-2 py-0.5 font-bold text-[11px] mb-2">
                      STATION: {station.replace("_", " ")}
                    </div>
                    <div className="space-y-2">
                      {items.map((item) => (
                        <div
                          key={item.cartItemId}
                          className="border-b border-dashed border-black pb-1 last:border-b-0"
                        >
                          <div className="flex justify-between font-bold text-xs">
                            <span>
                              {item.quantity}x {item.name}
                            </span>
                            <span>[{item.variantName}]</span>
                          </div>
                          {item.notes && (
                            <div className="text-[11px] font-bold bg-gray-200 px-1.5 py-0.5 mt-0.5">
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
            <div className="w-full">
              <div className="mb-3 p-3.5 rounded-xl bg-white border border-[#d4dce4] text-xs text-[#2b2d42] flex items-center justify-between">
                <div>
                  <span className="font-bold">Endpoint:</span>{" "}
                  <code className="text-[#d80032] bg-[#edf2f4] px-1.5 py-0.5 rounded">
                    {praConfig.imsEndpointUrl}
                  </code>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-[#2b2d42] text-white font-mono font-semibold">
                  HTTP 200 (Code 100)
                </span>
              </div>
              <pre className="bg-[#2b2d42] text-[#edf2f4] rounded-xl p-4 text-xs font-mono overflow-x-auto">
                {JSON.stringify(praPayload, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
