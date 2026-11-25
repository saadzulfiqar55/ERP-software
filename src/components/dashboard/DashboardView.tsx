"use client";

import React, { useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  Package,
  ShoppingBag,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  Button,
  Card,
  EmptyState,
  mapInvoiceStatusToChipVariant,
  PageHeader,
  ProgressBar,
  SegmentedButton,
  StatCard,
  StatusChip,
} from "@/components/ui/m3";
import {
  ERPInvoice,
  MonthlyRevenuePoint,
  StockLevelMonitorItem,
  WaitingTaskItem,
} from "@/lib/mock/erp-data";
import { Order, PartyAccount } from "@/lib/types";
import { formatIsoDate, formatMinorMoney } from "@/lib/format";

interface DashboardViewProps {
  orders: Order[];
  erpInvoices: ERPInvoice[];
  parties: PartyAccount[];
  tasks: WaitingTaskItem[];
  stockItems: StockLevelMonitorItem[];
  canViewLedger?: boolean;
  canAdjustStock?: boolean;
  onApproveTask: (task: WaitingTaskItem) => void;
  onReorderStock: (item: StockLevelMonitorItem) => void;
  onNavigate: (section: string) => void;
  onSelectOrderReceipt?: (order: Order) => void;
}

export default function DashboardView({
  orders,
  erpInvoices,
  parties,
  tasks,
  stockItems,
  canViewLedger = false,
  canAdjustStock = false,
  onApproveTask,
  onReorderStock,
  onNavigate,
  onSelectOrderReceipt,
}: DashboardViewProps) {
  const [range, setRange] = useState<"today" | "week" | "month" | "quarter">(
    "month"
  );
  const [hoveredMonth, setHoveredMonth] = useState<string | null>(null);

  const pendingTasks = useMemo(
    () =>
      tasks.filter((t) => {
        if (t.status !== "PENDING") return false;
        if (
          !canViewLedger &&
          (t.type === "OVERDUE_ALERT" || t.type === "PERIOD_CLOSE")
        ) {
          return false;
        }
        return true;
      }),
    [tasks, canViewLedger]
  );

  const rangeMultiplier =
    range === "today" ? 0.08 : range === "week" ? 0.28 : range === "quarter" ? 2.85 : 1;

  const liveOrdersRevenueMinor = useMemo(
    () =>
      orders.reduce((sum, o) => sum + Math.round(o.taxBreakdown.grandTotal * 100), 0),
    [orders]
  );
  const paidInvoicesRevenueMinor = useMemo(
    () =>
      erpInvoices
        .filter((inv) => inv.status === "PAID")
        .reduce((sum, inv) => sum + inv.amountMinor, 0),
    [erpInvoices]
  );
  const revenueMinor = Math.round(
    (liveOrdersRevenueMinor + paidInvoicesRevenueMinor) * rangeMultiplier
  );

  const openInvoices = useMemo(
    () =>
      erpInvoices.filter(
        (inv) => inv.status === "SENT" || inv.status === "OVERDUE" || inv.status === "DRAFT"
      ),
    [erpInvoices]
  );
  const overdueInvoices = useMemo(
    () => erpInvoices.filter((inv) => inv.status === "OVERDUE"),
    [erpInvoices]
  );
  const receivablesOutstandingMinor = useMemo(() => {
    const invoiceDueMinor = openInvoices.reduce(
      (sum, inv) => sum + inv.amountMinor,
      0
    );
    const partyReceivablesMinor = canViewLedger
      ? parties
          .filter((p) => p.type === "CUSTOMER" && p.currentBalance > 0)
          .reduce((sum, p) => sum + Math.round(p.currentBalance * 100), 0)
      : 0;
    return invoiceDueMinor + partyReceivablesMinor;
  }, [openInvoices, parties, canViewLedger]);

  const lowStockItems = useMemo(
    () => stockItems.filter((s) => s.reorderTarget > 0 && s.currentQty / s.reorderTarget < 0.35),
    [stockItems]
  );
  const criticalStockCount = useMemo(
    () => stockItems.filter((s) => s.reorderTarget > 0 && s.currentQty / s.reorderTarget < 0.15).length,
    [stockItems]
  );

  const now = new Date();
  const activeYear = now.getFullYear();
  const currentMonthIdx = now.getMonth();
  const currentMonthShort = now.toLocaleDateString("en-US", { month: "short" });
  const currentPeriodLabel = now.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const monthlyRevenue = useMemo<MonthlyRevenuePoint[]>(() => {
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const buckets = new Array<number>(12).fill(0);

    for (const ord of orders) {
      const d = new Date(ord.createdAt);
      if (!Number.isNaN(d.getTime()) && d.getFullYear() === activeYear) {
        buckets[d.getMonth()] += Math.round(ord.taxBreakdown.grandTotal * 100);
      }
    }
    for (const inv of erpInvoices) {
      if (inv.status !== "PAID") continue;
      const d = new Date(inv.issuedDate);
      if (!Number.isNaN(d.getTime()) && d.getFullYear() === activeYear) {
        buckets[d.getMonth()] += inv.amountMinor;
      }
    }

    return monthNames.map((month, idx) => ({
      month,
      revenueMinor: buckets[idx],
      isCurrent: idx === currentMonthIdx,
    }));
  }, [orders, erpInvoices, activeYear, currentMonthIdx]);

  const maxBarMinor = Math.max(
    1,
    ...monthlyRevenue.map((m) => m.revenueMinor)
  );
  const maxBarPkr = maxBarMinor / 100;
  const formatAxisTick = (pkr: number) => {
    if (pkr <= 0) return "0";
    if (pkr >= 1_000_000) return `${(pkr / 1_000_000).toFixed(1)}M`;
    if (pkr >= 1_000) return `${Math.round(pkr / 1_000)}k`;
    return `${Math.round(pkr)}`;
  };

  return (
    <div className="space-y-6">
      {/* 1. PageHeader with Right-Aligned SegmentedButton */}
      <PageHeader
        title="Dashboard"
        subtitle={`Business overview · ${currentPeriodLabel}`}
        actions={
          <SegmentedButton
            value={range}
            onChange={(next) => {
              setRange(next);
              if (typeof window !== "undefined") {
                const url = new URL(window.location.href);
                url.searchParams.set("range", next);
                window.history.replaceState({}, "", url.toString());
              }
            }}
            options={[
              { value: "today", label: "Today" },
              { value: "week", label: "Week" },
              { value: "month", label: "Month" },
              { value: "quarter", label: "Quarter" },
            ]}
          />
        }
      />

      {/* 2. KPI Row — 4 Material 3 StatCards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <StatCard
          label="Revenue (live ledger)"
          value={formatMinorMoney(revenueMinor, "PKR")}
          icon={<TrendingUp className="w-5 h-5" strokeWidth={1.8} />}
          chipLabel={`${orders.length} orders`}
          chipVariant="primary"
          caption="POS + paid invoices"
        />
        <StatCard
          label="Sales orders & open bills"
          value={`${orders.length + openInvoices.length}`}
          icon={<ShoppingBag className="w-5 h-5" strokeWidth={1.8} />}
          chipLabel={`${orders.length} POS`}
          chipVariant="primary"
          caption={`${openInvoices.length} open invoices`}
        />
        <StatCard
          label="Receivables outstanding"
          value={formatMinorMoney(receivablesOutstandingMinor, "PKR")}
          icon={<Wallet className="w-5 h-5" strokeWidth={1.8} />}
          chipLabel={`${overdueInvoices.length} overdue`}
          chipVariant={overdueInvoices.length > 0 ? "error" : "success"}
          caption="across invoices & Khata"
        />
        <StatCard
          label="Low-stock items"
          value={`${lowStockItems.length}`}
          icon={<Package className="w-5 h-5" strokeWidth={1.8} />}
          chipLabel={`${criticalStockCount} critical`}
          chipVariant={criticalStockCount > 0 ? "warning" : "success"}
          caption="below reorder threshold"
        />
      </div>

      {/* 3. Row 1 (2:1 split): 12-Month Revenue Bar Chart + "Waiting for you" Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left 8 Cols (2/3): 12-Month Revenue Bar Chart */}
        <Card className="lg:col-span-8 flex flex-col justify-between">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div>
              <h2 className="text-[22px] leading-[28px] font-normal text-md-on-surface">
                Revenue
              </h2>
              <p className="text-xs text-md-on-surface-variant mt-0.5">
                12-month fiscal performance (PKR, integer minor-unit ledger)
              </p>
            </div>

            {/* Chart Legend */}
            <div className="flex items-center gap-4 text-xs text-md-on-surface-variant">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-md-primary-container inline-block" />
                <span>Previous months</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-md-primary-strong inline-block" />
                <span>Current month ({currentMonthShort})</span>
              </div>
            </div>
          </div>

          {/* Interactive SVG / CSS Bar Chart with Y-Axis & Tooltip */}
          <div className="flex gap-4 items-end h-64 pt-6 pb-2">
            {/* Y-Axis Labels */}
            <div className="flex flex-col justify-between h-full text-xs font-mono text-md-on-surface-variant tabular-nums pr-2 select-none">
              <span>{maxBarMinor > 1 ? formatAxisTick(maxBarPkr) : "—"}</span>
              <span>{maxBarMinor > 1 ? formatAxisTick(maxBarPkr * 0.75) : "—"}</span>
              <span>{maxBarMinor > 1 ? formatAxisTick(maxBarPkr * 0.5) : "—"}</span>
              <span>{maxBarMinor > 1 ? formatAxisTick(maxBarPkr * 0.25) : "—"}</span>
              <span>0</span>
            </div>

            {/* 12 Bars */}
            <div className="flex-1 grid grid-cols-12 gap-2 sm:gap-3 items-end h-full border-b border-l border-md-divider pl-2 pb-1">
              {monthlyRevenue.map((point) => {
                const heightPct =
                  point.revenueMinor > 0
                    ? Math.max(4, Math.round((point.revenueMinor / maxBarMinor) * 100))
                    : 0;
                const isHovered = hoveredMonth === point.month;

                return (
                  <div
                    key={point.month}
                    onMouseEnter={() => setHoveredMonth(point.month)}
                    onMouseLeave={() => setHoveredMonth(null)}
                    className="relative flex flex-col items-center justify-end h-full group"
                  >
                    {/* Tooltip on hover */}
                    {isHovered && (
                      <div className="absolute -top-10 z-20 px-2.5 py-1 rounded-lg bg-md-on-surface text-md-surface text-[11px] font-mono whitespace-nowrap shadow-sm">
                        {point.month}: {formatMinorMoney(point.revenueMinor, "PKR")}
                      </div>
                    )}

                    <div
                      style={{ height: `${heightPct}%` }}
                      className={`w-full max-w-[36px] rounded-t-lg transition-all duration-200 ${
                        point.isCurrent
                          ? "bg-md-primary-strong"
                          : "bg-md-primary-container group-hover:bg-md-primary"
                      }`}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Month X-Axis Labels */}
          <div className="flex gap-4 pl-10 pt-2">
            <div className="flex-1 grid grid-cols-12 gap-2 sm:gap-3 text-center text-xs text-md-on-surface-variant font-medium">
              {monthlyRevenue.map((point) => (
                <span
                  key={point.month}
                  className={
                    point.isCurrent ? "font-semibold text-md-primary-strong" : ""
                  }
                >
                  {point.month}
                </span>
              ))}
            </div>
          </div>
        </Card>

        {/* Right 4 Cols (1/3): "Waiting for you" Actionable Card */}
        <Card className="lg:col-span-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[22px] leading-[28px] font-normal text-md-on-surface">
                Waiting for you
              </h2>
              <StatusChip
                label={`${pendingTasks.length} pending`}
                variant={pendingTasks.length > 0 ? "primary" : "success"}
              />
            </div>

            {pendingTasks.length === 0 ? (
              <EmptyState
                title="All caught up!"
                subtitle="No pending approvals or alerts waiting for you."
              />
            ) : (
              <div className="divide-y divide-md-divider">
                {pendingTasks.map((task) => {
                  const TaskIcon =
                    task.type === "PO_APPROVAL"
                      ? ClipboardCheck
                      : task.type === "OVERDUE_ALERT"
                      ? AlertCircle
                      : task.type === "LEAVE_REQUEST"
                      ? CalendarClock
                      : FileCheck2;

                  return (
                    <div key={task.id} className="py-3.5 first:pt-0 last:pb-0 space-y-2.5">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-md-secondary-container text-md-on-secondary-container flex items-center justify-center shrink-0">
                          <TaskIcon className="w-5 h-5" strokeWidth={1.8} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-md-on-surface leading-snug">
                            {task.title}
                          </div>
                          <div className="text-xs text-md-on-surface-variant mt-0.5">
                            {task.subtitle}
                          </div>
                          {task.amountLabel && (
                            <div className="text-xs font-mono font-medium text-md-primary mt-1">
                              {task.amountLabel}
                            </div>
                          )}
                        </div>
                      </div>

                      {(canAdjustStock || canViewLedger) && (
                        <div className="flex items-center gap-2 pl-13">
                          {(canViewLedger ||
                            (task.type !== "OVERDUE_ALERT" &&
                              task.type !== "PERIOD_CLOSE")) && (
                            <Button
                              variant="filled"
                              size="sm"
                              onClick={() => onApproveTask(task)}
                            >
                              Approve
                            </Button>
                          )}
                          <Button
                            variant="outlined"
                            size="sm"
                            onClick={() => {
                              if (task.type === "OVERDUE_ALERT") {
                                onNavigate("invoices");
                              } else if (canViewLedger) {
                                onNavigate(
                                  task.type === "PO_APPROVAL"
                                    ? "purchasing"
                                    : "accounting"
                                );
                              } else {
                                onNavigate("inventory");
                              }
                            }}
                          >
                            Review
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* 4. Row 2 (2:1 split): Recent Sales Orders Table + Stock Levels Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 8 Cols (2/3): Recent Sales Orders Table */}
        <Card className="lg:col-span-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[22px] leading-[28px] font-normal text-md-on-surface">
                Recent sales orders
              </h2>
              <p className="text-xs text-md-on-surface-variant mt-0.5">
                Latest POS & corporate invoices synchronized with PRA e-IMS
              </p>
            </div>
            <Button variant="text" onClick={() => onNavigate("sales")}>
              View all
            </Button>
          </div>

          {orders.length === 0 ? (
            <EmptyState
              title="No sales orders yet"
              subtitle="Completed POS transactions will appear here automatically."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-md-divider text-xs font-medium text-md-on-surface-variant">
                    <th className="py-3 pr-4">Order</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                    <th className="py-3 pl-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-md-divider">
                  {orders.slice(0, 6).map((ord) => (
                    <tr
                      key={ord.id}
                      onClick={() => onSelectOrderReceipt?.(ord)}
                      className="hover:bg-md-surface-container-low cursor-pointer transition"
                    >
                      <td className="py-3.5 pr-4 font-mono font-medium text-md-primary">
                        {ord.invoiceNumber}
                      </td>
                      <td className="py-3.5 px-4 text-md-on-surface">
                        {ord.customerName || "Walk-in Customer"}
                      </td>
                      <td className="py-3.5 px-4 text-md-on-surface-variant text-xs">
                        {formatIsoDate(ord.createdAt)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-medium tabular-nums text-md-on-surface">
                        PKR {ord.taxBreakdown.grandTotal.toLocaleString()}
                      </td>
                      <td className="py-3.5 pl-4 text-right">
                        <StatusChip
                          label={ord.praSyncStatus === "SYNCED" ? "Paid · PRA" : "Pending"}
                          variant={mapInvoiceStatusToChipVariant(ord.praSyncStatus)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Right 4 Cols (1/3): Stock Levels Card */}
        <Card className="lg:col-span-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[22px] leading-[28px] font-normal text-md-on-surface">
                Stock levels
              </h2>
              <p className="text-xs text-md-on-surface-variant mt-0.5">
                Quantity on hand vs reorder target
              </p>
            </div>
            <Button variant="text" size="sm" onClick={() => onNavigate("inventory")}>
              Inventory
            </Button>
          </div>

          {stockItems.length === 0 ? (
            <EmptyState
              title="No stock monitors configured"
              subtitle="Add retail inventory items to track stock thresholds here."
            />
          ) : (
            <div className="space-y-4">
              {stockItems.map((stk) => {
                const pct = stk.reorderTarget > 0
                  ? Math.round((stk.currentQty / stk.reorderTarget) * 100)
                  : 0;
                return (
                  <div key={stk.id} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium text-md-on-surface truncate">
                        {stk.name}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-mono tabular-nums text-md-on-surface-variant">
                          {stk.currentQty} / {stk.reorderTarget} {stk.unit} ({pct}%)
                        </span>
                        {pct < 35 && canAdjustStock && (
                          <Button
                            variant="text"
                            size="sm"
                            onClick={() => onReorderStock(stk)}
                            className="h-7! px-2! text-xs!"
                          >
                            Reorder
                          </Button>
                        )}
                      </div>
                    </div>
                    <ProgressBar value={stk.currentQty} max={stk.reorderTarget} />
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
