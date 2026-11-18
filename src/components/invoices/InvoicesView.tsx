"use client";

import React, { useMemo, useState } from "react";
import {
  ArrowLeft,
  Download,
  MoreVertical,
  Plus,
  Send,
  Trash2,
  Upload,
} from "lucide-react";
import {
  Avatar,
  Button,
  Card,
  Checkbox,
  CompactField,
  CompactSelect,
  EmptyState,
  FilterChip,
  mapInvoiceStatusToChipVariant,
  OutlinedTextField,
  PageHeader,
  StatusChip,
  Switch,
} from "@/components/ui/m3";
import {
  ERPInvoice,
  ERPInvoiceLineItem,
  InvoiceStatus,
} from "@/lib/mock/erp-data";
import {
  calculateDueDate,
  formatIsoDate,
  formatMinorMoney,
} from "@/lib/format";
import { PartyAccount, Product } from "@/lib/types";

interface InvoicesViewProps {
  initialMode?: "LIST" | "NEW";
  parties: PartyAccount[];
  products: Product[];
  invoices?: ERPInvoice[];
  onInvoicesChange?: React.Dispatch<React.SetStateAction<ERPInvoice[]>>;
  canDeleteInvoices?: boolean;
  onShowSnackbar: (msg: string) => void;
}

export default function InvoicesView({
  initialMode = "LIST",
  parties,
  products,
  invoices: controlledInvoices,
  onInvoicesChange,
  canDeleteInvoices = false,
  onShowSnackbar,
}: InvoicesViewProps) {
  const [viewMode, setViewMode] = useState<"LIST" | "NEW">(initialMode);
  const [internalInvoices, setInternalInvoices] =
    useState<ERPInvoice[]>([]);
  const invoices = controlledInvoices ?? internalInvoices;
  const setInvoices = onInvoicesChange ?? setInternalInvoices;

  // List Filter & Pagination State
  const [statusFilter, setStatusFilter] = useState<"ALL" | InvoiceStatus>("ALL");
  const [customerFilter, setCustomerFilter] = useState<string>("ALL");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [voidConfirmInvoice, setVoidConfirmInvoice] =
    useState<{ invoice: ERPInvoice; mode: "VOID" | "DELETE" } | null>(null);

  async function syncInvoiceMutation(
    payload: Record<string, unknown>,
    successMsg: string
  ) {
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        onShowSnackbar(data.error || "Permission denied");
        return false;
      }
      if (data.erpInvoices) {
        setInvoices(data.erpInvoices);
      }
      onShowSnackbar(successMsg);
      return true;
    } catch {
      onShowSnackbar("Network error syncing invoice update.");
      return false;
    }
  }
  const [page, setPage] = useState<number>(1);
  const rowsPerPage = 10;

  // New Invoice Form State (Section 5.3)
  const [customerName, setCustomerName] = useState<string>(
    parties[0]?.name || "Chaudhry Textile Mills"
  );
  const [billingEmail, setBillingEmail] = useState<string>(
    "accounts@chaudhrytextiles.pk"
  );
  const [issueDate, setIssueDate] = useState<string>("2026-11-17");
  const [paymentTerms, setPaymentTerms] = useState<
    "NET_30" | "NET_15" | "DUE_ON_RECEIPT"
  >("NET_30");
  const [currency, setCurrency] = useState<"PKR" | "USD">("PKR");
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [noteToCustomer, setNoteToCustomer] = useState<string>(
    "Thank you for your business. Please remit payment referencing the invoice number above."
  );
  const [attachmentName, setAttachmentName] = useState<string>("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Switches & Payment Chips (Right Sticky Column)
  const [paymentReminders, setPaymentReminders] = useState<boolean>(true);
  const [attachPdfCopy, setAttachPdfCopy] = useState<boolean>(true);
  const [allowPartialPayments, setAllowPartialPayments] = useState<boolean>(true);
  const [acceptMethods, setAcceptMethods] = useState<string[]>([
    "Bank transfer",
    "Card",
  ]);

  // Editable Line Items (calculated in integer minor units)
  const [lineItems, setLineItems] = useState<ERPInvoiceLineItem[]>([
    {
      id: "new-li-1",
      description: "Albarka Special Mutton Karahi (Full 1 Kg)",
      quantity: 4,
      unitPriceMinor: 380000, // PKR 3,800
      taxPercent: 16,
    },
    {
      id: "new-li-2",
      description: "Desi Ghee Habshi Halwa 1Kg Gift Box",
      quantity: 5,
      unitPriceMinor: 185000, // PKR 1,850
      taxPercent: 16,
    },
  ]);

  // Summary Tile Totals (in minor units)
  const summaryStats = useMemo(() => {
    const draft = invoices.filter((i) => i.status === "DRAFT");
    const sent = invoices.filter((i) => i.status === "SENT");
    const overdue = invoices.filter((i) => i.status === "OVERDUE");
    const paid = invoices.filter((i) => i.status === "PAID");

    const sumMinor = (arr: ERPInvoice[]) =>
      arr.reduce((acc, item) => acc + item.amountMinor, 0);

    return {
      draft: { count: draft.length, totalMinor: sumMinor(draft) },
      sent: { count: sent.length, totalMinor: sumMinor(sent) },
      overdue: { count: overdue.length, totalMinor: sumMinor(overdue) },
      paid: { count: paid.length, totalMinor: sumMinor(paid) },
    };
  }, [invoices]);

  // Filtered Invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (statusFilter !== "ALL" && inv.status !== statusFilter) return false;
      if (customerFilter !== "ALL" && inv.customerName !== customerFilter)
        return false;
      return true;
    });
  }, [invoices, statusFilter, customerFilter]);

  const paginatedInvoices = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return filteredInvoices.slice(start, start + rowsPerPage);
  }, [filteredInvoices, page]);

  // Live New Invoice Totals in Minor Units (Cents/Paisa)
  const newInvoiceTotals = useMemo(() => {
    let subtotalMinor = 0;
    let rawTaxMinor = 0;

    for (const item of lineItems) {
      const lineNetMinor = Math.round(item.quantity * item.unitPriceMinor);
      const lineTaxMinor = Math.round((lineNetMinor * item.taxPercent) / 100);
      subtotalMinor += lineNetMinor;
      rawTaxMinor += lineTaxMinor;
    }

    const safeDiscPct = Math.min(100, Math.max(0, discountPercent));
    const discountMinor = Math.round((subtotalMinor * safeDiscPct) / 100);
    const taxAfterDiscountMinor = Math.round(
      rawTaxMinor * (1 - safeDiscPct / 100)
    );
    const totalDueMinor =
      subtotalMinor - discountMinor + taxAfterDiscountMinor;

    return {
      subtotalMinor,
      discountMinor,
      taxMinor: taxAfterDiscountMinor,
      totalDueMinor,
    };
  }, [lineItems, discountPercent]);

  const nextAutoInvoiceNumber = `INV-2026-${String(
    invoices.length + 101
  ).padStart(4, "0")}`;

  function toggleRowSelection(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleAcceptMethod(method: string) {
    setAcceptMethods((prev) =>
      prev.includes(method)
        ? prev.filter((m) => m !== method)
        : [...prev, method]
    );
  }

  function addLineItem() {
    setLineItems((prev) => [
      ...prev,
      {
        id: `li-${Date.now()}`,
        description: "",
        quantity: 1,
        unitPriceMinor: 100000,
        taxPercent: 16,
      },
    ]);
  }

  function updateLineItem(
    id: string,
    patch: Partial<ERPInvoiceLineItem>
  ) {
    setLineItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  function removeLineItem(id: string) {
    setLineItems((prev) => prev.filter((item) => item.id !== id));
  }

  function handleSaveOrSendInvoice(targetStatus: "DRAFT" | "SENT") {
    const errors: Record<string, string> = {};
    if (!customerName.trim()) {
      errors.customerName = "Customer is required";
    }
    if (!billingEmail.includes("@")) {
      errors.billingEmail = "Enter a valid billing email address";
    }
    if (lineItems.length === 0 || lineItems.some((l) => !l.description.trim())) {
      errors.lineItems = "Every line item must have a description";
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setFormErrors({});
    const initials = customerName
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

    const created: ERPInvoice = {
      id: `inv-${Date.now()}`,
      invoiceNumber: nextAutoInvoiceNumber,
      customerId: `cust-${Date.now()}`,
      customerName: customerName.trim(),
      customerInitials: initials || "CU",
      customerEmail: billingEmail.trim(),
      issuedDate: issueDate,
      dueDate: calculateDueDate(issueDate, paymentTerms),
      paymentTerms,
      currency,
      status: targetStatus,
      discountPercent,
      amountMinor: newInvoiceTotals.totalDueMinor,
      notes: noteToCustomer,
      paymentMethodsAllowed: acceptMethods,
      settings: {
        paymentReminders,
        attachPdfCopy,
        allowPartialPayments,
      },
      items: lineItems,
    };

    setInvoices((prev) => [created, ...prev]);
    setViewMode("LIST");
    void syncInvoiceMutation(
      { action: "CREATE", invoice: created },
      targetStatus === "SENT"
        ? `Sent invoice ${created.invoiceNumber} to ${created.customerName}`
        : `Saved draft invoice ${created.invoiceNumber}`
    );
    onShowSnackbar(
      targetStatus === "SENT"
        ? `Invoice ${created.invoiceNumber} sent to ${created.customerEmail}`
        : `Draft ${created.invoiceNumber} saved`
    );
  }

  /* ======================================================================== */
  /* RENDER MODE: NEW INVOICE (Section 5.3)                                   */
  /* ======================================================================== */
  if (viewMode === "NEW") {
    const calculatedDue = calculateDueDate(issueDate, paymentTerms);

    return (
      <div className="space-y-6">
        {/* 1. Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant="icon"
              aria-label="Back to invoices"
              onClick={() => setViewMode("LIST")}
            >
              <ArrowLeft className="w-5 h-5" strokeWidth={1.8} />
            </Button>
            <div>
              <h1 className="text-[32px] leading-[40px] font-normal text-md-on-surface">
                New invoice
              </h1>
              <p className="text-xs text-md-on-surface-variant">
                Draft · autosaved just now
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outlined"
              onClick={() => handleSaveOrSendInvoice("DRAFT")}
            >
              Save draft
            </Button>
            <Button
              variant="filled"
              icon={<Send className="w-4 h-4" strokeWidth={1.8} />}
              onClick={() => handleSaveOrSendInvoice("SENT")}
            >
              Send invoice
            </Button>
          </div>
        </div>

        {/* 2. Two-Column Layout (2:1, stacks on mobile) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT 8 COLS: FORM CARDS */}
          <div className="lg:col-span-8 space-y-6">
            {/* Card 1: Customer & details */}
            <Card className="space-y-5">
              <h2 className="text-base font-semibold text-md-on-surface">
                Customer & details
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <OutlinedTextField
                  label="Customer"
                  required
                  value={customerName}
                  onChange={setCustomerName}
                  errorText={formErrors.customerName}
                  helperText="Select or type corporate customer account"
                />

                <OutlinedTextField
                  label="Billing email"
                  type="email"
                  required
                  value={billingEmail}
                  onChange={setBillingEmail}
                  errorText={formErrors.billingEmail}
                />

                <OutlinedTextField
                  label="Invoice number"
                  value={nextAutoInvoiceNumber}
                  readOnly
                  mono
                  helperText="Assigned automatically from atomic counter"
                />

                <OutlinedTextField
                  label="Issue date"
                  type="date"
                  value={issueDate}
                  onChange={setIssueDate}
                />

                <OutlinedTextField
                  label="Payment terms"
                  value={paymentTerms}
                  onChange={(v) =>
                    setPaymentTerms(v as "NET_30" | "NET_15" | "DUE_ON_RECEIPT")
                  }
                  options={[
                    { value: "NET_30", label: "Net 30" },
                    { value: "NET_15", label: "Net 15" },
                    { value: "DUE_ON_RECEIPT", label: "Due on receipt" },
                  ]}
                  helperText={`Calculated due date: ${formatIsoDate(calculatedDue)}`}
                />

                <OutlinedTextField
                  label="Currency"
                  value={currency}
                  onChange={(v) => setCurrency(v as "PKR" | "USD")}
                  options={[
                    { value: "PKR", label: "PKR — Pakistani Rupee" },
                    { value: "USD", label: "USD — US Dollar" },
                  ]}
                />
              </div>
            </Card>

            {/* Card 2: Line items */}
            <Card className="space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="text-base font-semibold text-md-on-surface">
                  Line items
                </h2>

                {/* Quick Pick from Product Catalog */}
                <CompactSelect
                  variant="tonal"
                  minMenuWidth={280}
                  value=""
                  placeholder="+ Pick from product catalogue…"
                  ariaLabel="Pick from product catalogue"
                  onChange={(val) => {
                    const prod = products.find((p) => p.id === val);
                    if (prod && prod.variants[0]) {
                      setLineItems((prev) => [
                        ...prev,
                        {
                          id: `li-${Date.now()}`,
                          productId: prod.id,
                          description: `${prod.name} (${prod.variants[0].name})`,
                          quantity: 1,
                          unitPriceMinor: prod.variants[0].price * 100,
                          taxPercent: prod.taxMode === "EXEMPT" ? 0 : 16,
                        },
                      ]);
                    }
                  }}
                  options={products.map((p) => ({
                    value: p.id,
                    label: `#${p.code} · ${p.name} (PKR ${p.variants[0]?.price})`,
                  }))}
                />
              </div>

              {formErrors.lineItems && (
                <div className="text-xs text-md-error font-medium">
                  {formErrors.lineItems}
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-md-divider text-xs font-medium text-md-on-surface-variant">
                      <th className="py-2.5 pr-3">Description</th>
                      <th className="py-2.5 px-2 w-24">Qty</th>
                      <th className="py-2.5 px-2 w-32">Unit price</th>
                      <th className="py-2.5 px-2 w-24">Tax %</th>
                      <th className="py-2.5 px-2 text-right w-32">Amount</th>
                      <th className="py-2.5 pl-2 w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-md-divider">
                    {lineItems.map((item) => {
                      const lineTotalMinor = Math.round(
                        item.quantity *
                          item.unitPriceMinor *
                          (1 + item.taxPercent / 100)
                      );

                      return (
                        <tr key={item.id}>
                          <td className="py-3 pr-3">
                            <CompactField
                              value={item.description}
                              onChange={(val) =>
                                updateLineItem(item.id, {
                                  description: val,
                                })
                              }
                              placeholder="Item or service description"
                              className="w-full"
                            />
                          </td>
                          <td className="py-3 px-2">
                            <CompactField
                              type="number"
                              min={1}
                              mono
                              value={item.quantity}
                              onChange={(val) =>
                                updateLineItem(item.id, {
                                  quantity: Math.max(1, Number(val) || 1),
                                })
                              }
                              className="w-full"
                            />
                          </td>
                          <td className="py-3 px-2">
                            <CompactField
                              type="number"
                              min={0}
                              mono
                              value={Math.round(item.unitPriceMinor / 100)}
                              onChange={(val) =>
                                updateLineItem(item.id, {
                                  unitPriceMinor: Math.max(
                                    0,
                                    Math.round((Number(val) || 0) * 100)
                                  ),
                                })
                              }
                              className="w-full"
                            />
                          </td>
                          <td className="py-3 px-2">
                            <CompactField
                              type="number"
                              min={0}
                              max={100}
                              mono
                              value={item.taxPercent}
                              onChange={(val) =>
                                updateLineItem(item.id, {
                                  taxPercent: Math.max(0, Number(val) || 0),
                                })
                              }
                              className="w-full"
                            />
                          </td>
                          <td className="py-3 px-2 text-right font-mono font-medium tabular-nums text-md-on-surface">
                            {formatMinorMoney(lineTotalMinor, currency)}
                          </td>
                          <td className="py-3 pl-2 text-right">
                            <Button
                              variant="icon"
                              aria-label="Remove line item"
                              onClick={() => removeLineItem(item.id)}
                              className="w-9! h-9!"
                            >
                              <Trash2 className="w-4 h-4 text-md-on-surface-variant" strokeWidth={1.8} />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <Button
                variant="text"
                icon={<Plus className="w-4 h-4" strokeWidth={1.8} />}
                onClick={addLineItem}
              >
                + Add line item
              </Button>
            </Card>

            {/* Card 3: Notes & attachments */}
            <Card className="space-y-5">
              <h2 className="text-base font-semibold text-md-on-surface">
                Notes & attachments
              </h2>

              <OutlinedTextField
                label="Note to customer"
                multiline
                rows={3}
                value={noteToCustomer}
                onChange={setNoteToCustomer}
              />

              <label className="border-2 border-dashed border-md-outline-variant hover:border-md-primary rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer bg-md-surface-container-low/50 transition">
                <Upload className="w-6 h-6 text-md-primary mb-2" strokeWidth={1.8} />
                <span className="text-sm font-medium text-md-on-surface">
                  {attachmentName ||
                    "Upload a file or drag it here · PDF, PNG or JPG · up to 10 MB"}
                </span>
                <span className="text-xs text-md-on-surface-variant mt-1">
                  Encrypted pre-signed upload ready
                </span>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setAttachmentName(`Attached: ${f.name}`);
                      onShowSnackbar(`Staged attachment "${f.name}"`);
                    }
                  }}
                />
              </label>
            </Card>
          </div>

          {/* RIGHT 4 COLS (Sticky on desktop): SUMMARY + M3 SWITCHES + CHIPS */}
          <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-24">
            {/* Summary Card (surface-container-low) */}
            <Card variant="tonal" className="space-y-3">
              <h2 className="text-base font-semibold text-md-on-surface">
                Invoice summary
              </h2>

              <div className="space-y-2 text-sm tabular-nums">
                <div className="flex justify-between text-md-on-surface-variant">
                  <span>Subtotal</span>
                  <span className="font-mono text-md-on-surface">
                    {formatMinorMoney(newInvoiceTotals.subtotalMinor, currency)}
                  </span>
                </div>

                <div className="flex justify-between text-md-on-surface-variant">
                  <span>Tax</span>
                  <span className="font-mono text-md-on-surface">
                    {formatMinorMoney(newInvoiceTotals.taxMinor, currency)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3 pt-1">
                  <span className="text-md-on-surface-variant">Discount %</span>
                  <CompactField
                    type="number"
                    min={0}
                    max={100}
                    mono
                    value={discountPercent}
                    onChange={(val) =>
                      setDiscountPercent(
                        Math.min(100, Math.max(0, Number(val) || 0))
                      )
                    }
                    className="w-20 text-right"
                  />
                </div>
              </div>

              <div className="border-t border-md-divider pt-3 flex items-baseline justify-between">
                <span className="text-base font-semibold text-md-on-surface">
                  Total due
                </span>
                <span className="text-[28px] leading-[36px] font-medium font-mono tabular-nums text-md-primary-strong">
                  {formatMinorMoney(newInvoiceTotals.totalDueMinor, currency)}
                </span>
              </div>
            </Card>

            {/* Settings Card with 3 M3 Switches */}
            <Card className="space-y-4">
              <h2 className="text-base font-semibold text-md-on-surface">
                Invoice settings
              </h2>

              <div className="divide-y divide-md-divider">
                <Switch
                  checked={paymentReminders}
                  onChange={setPaymentReminders}
                  label="Payment reminders"
                  helperText="Automatically email 3 days before and after due date"
                />
                <Switch
                  checked={attachPdfCopy}
                  onChange={setAttachPdfCopy}
                  label="Attach PDF copy"
                  helperText="Include PRA-verified PDF invoice in email"
                />
                <Switch
                  checked={allowPartialPayments}
                  onChange={setAllowPartialPayments}
                  label="Allow partial payments"
                  helperText="Let customer settle invoice in multiple installments"
                />
              </div>

              <div className="pt-2 border-t border-md-divider space-y-2.5">
                <div className="text-xs font-medium text-md-on-surface-variant">
                  Accept payment by
                </div>
                <div className="flex flex-wrap gap-2">
                  {["Bank transfer", "Card", "Cheque"].map((method) => (
                    <FilterChip
                      key={method}
                      label={method}
                      selected={acceptMethods.includes(method)}
                      onClick={() => toggleAcceptMethod(method)}
                    />
                  ))}
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  /* ======================================================================== */
  /* RENDER MODE: INVOICES LIST (Section 5.2)                                 */
  /* ======================================================================== */
  return (
    <div className="space-y-6">
      {/* 1. PageHeader */}
      <PageHeader
        title="Invoices"
        subtitle="Manage customer billing, PRA fiscalization, and receivables"
        actions={
          <>
            <Button
              variant="outlined"
              icon={<Download className="w-4 h-4" strokeWidth={1.8} />}
              onClick={() =>
                onShowSnackbar(`Exported ${filteredInvoices.length} invoices to CSV`)
              }
            >
              Export
            </Button>
            <Button
              variant="filled"
              icon={<Plus className="w-4 h-4" strokeWidth={1.8} />}
              onClick={() => setViewMode("NEW")}
            >
              New invoice
            </Button>
          </>
        }
      />

      {/* 2. Totals Row: 4 Tonal Summary Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl p-5 bg-md-surface-container-low space-y-1">
          <div className="text-xs font-medium text-md-on-surface-variant">
            Draft ({summaryStats.draft.count})
          </div>
          <div className="text-[22px] leading-[28px] font-normal tabular-nums text-md-on-surface">
            {formatMinorMoney(summaryStats.draft.totalMinor, "PKR")}
          </div>
        </div>

        <div className="rounded-2xl p-5 bg-md-primary-container text-md-on-primary-container space-y-1">
          <div className="text-xs font-medium opacity-85">
            Awaiting payment ({summaryStats.sent.count})
          </div>
          <div className="text-[22px] leading-[28px] font-normal tabular-nums">
            {formatMinorMoney(summaryStats.sent.totalMinor, "PKR")}
          </div>
        </div>

        <div className="rounded-2xl p-5 bg-md-error-container text-md-on-error-container space-y-1">
          <div className="text-xs font-medium opacity-90">
            Overdue ({summaryStats.overdue.count})
          </div>
          <div className="text-[22px] leading-[28px] font-normal tabular-nums">
            {formatMinorMoney(summaryStats.overdue.totalMinor, "PKR")}
          </div>
        </div>

        <div className="rounded-2xl p-5 bg-md-success-container text-md-on-success-container space-y-1">
          <div className="text-xs font-medium opacity-90">
            Paid this month ({summaryStats.paid.count})
          </div>
          <div className="text-[22px] leading-[28px] font-normal tabular-nums">
            {formatMinorMoney(summaryStats.paid.totalMinor, "PKR")}
          </div>
        </div>
      </div>

      {/* 3. Table Card */}
      <Card className="p-0! overflow-hidden">
        {/* Filter Toolbar */}
        <div className="p-4 border-b border-md-divider flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {(
              [
                { id: "ALL", label: "All", count: invoices.length },
                { id: "DRAFT", label: "Draft", count: summaryStats.draft.count },
                { id: "SENT", label: "Sent", count: summaryStats.sent.count },
                {
                  id: "OVERDUE",
                  label: "Overdue",
                  count: summaryStats.overdue.count,
                },
                { id: "PAID", label: "Paid", count: summaryStats.paid.count },
              ] as const
            ).map((chip) => (
              <FilterChip
                key={chip.id}
                label={chip.label}
                count={chip.count}
                selected={statusFilter === chip.id}
                onClick={() => {
                  setStatusFilter(chip.id);
                  setPage(1);
                }}
              />
            ))}

            <div className="h-6 w-px bg-md-divider mx-1 hidden sm:block" />

            {/* Customer Dropdown Chip */}
            <CompactSelect
              variant="chip"
              minMenuWidth={240}
              value={customerFilter}
              prefixLabel="Customer"
              ariaLabel="Filter by customer"
              onChange={(val) => {
                setCustomerFilter(val);
                setPage(1);
              }}
              options={[
                { value: "ALL", label: "All" },
                ...Array.from(new Set(invoices.map((i) => i.customerName))).map(
                  (cName) => ({
                    value: cName,
                    label: cName,
                  })
                ),
              ]}
            />

            <span className="border-0 h-8 px-3 rounded-lg bg-md-surface-container-low inline-flex items-center text-xs font-medium text-md-on-surface-variant">
              Issue date: Last 90 days
            </span>
          </div>
        </div>

        {/* Contextual Action Bar when rows are selected */}
        {selectedIds.length > 0 && (
          <div className="px-6 py-3 bg-md-secondary-container text-md-on-secondary-container flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-medium">
              {selectedIds.length} invoice{selectedIds.length > 1 ? "s" : ""}{" "}
              selected
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="tonal"
                size="sm"
                onClick={() => {
                  onShowSnackbar(
                    `Sent payment reminders for ${selectedIds.length} invoices`
                  );
                  setSelectedIds([]);
                }}
              >
                Send reminders
              </Button>
              <Button
                variant="outlined"
                size="sm"
                onClick={() => {
                  const ids = [...selectedIds];
                  setInvoices((prev) =>
                    prev.map((inv) =>
                      ids.includes(inv.id) ? { ...inv, status: "SENT" } : inv
                    )
                  );
                  setSelectedIds([]);
                  void syncInvoiceMutation(
                    { action: "BULK_MARK_SENT", invoiceIds: ids },
                    `Marked ${ids.length} invoices as Sent`
                  );
                }}
              >
                Mark as sent
              </Button>
            </div>
          </div>
        )}

        {/* DataTable */}
        {paginatedInvoices.length === 0 ? (
          <EmptyState
            title="No invoices match this filter."
            subtitle="Try clearing your filter chips or create a new invoice."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-md-divider bg-md-surface-container-low/50 text-xs font-medium text-md-on-surface-variant">
                  <th className="py-3.5 pl-6 pr-3 w-10">
                    <Checkbox
                      ariaLabel="Select all invoices"
                      checked={
                        paginatedInvoices.length > 0 &&
                        paginatedInvoices.every((i) =>
                          selectedIds.includes(i.id)
                        )
                      }
                      onChange={(checked) =>
                        setSelectedIds(
                          checked ? paginatedInvoices.map((i) => i.id) : []
                        )
                      }
                    />
                  </th>
                  <th className="py-3.5 px-3">Invoice #</th>
                  <th className="py-3.5 px-3">Customer</th>
                  <th className="py-3.5 px-3">Issued</th>
                  <th className="py-3.5 px-3">Due</th>
                  <th className="py-3.5 px-3 text-right">Amount</th>
                  <th className="py-3.5 px-3">Status</th>
                  <th className="py-3.5 pl-3 pr-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-md-divider">
                {paginatedInvoices.map((inv) => {
                  const isSelected = selectedIds.includes(inv.id);
                  const isOverdue = inv.status === "OVERDUE";

                  return (
                    <tr
                      key={inv.id}
                      className={`hover:bg-md-surface-container-low transition ${
                        isSelected ? "bg-md-primary-container/20" : ""
                      }`}
                    >
                      <td className="py-3.5 pl-6 pr-3">
                        <Checkbox
                          checked={isSelected}
                          onChange={() => toggleRowSelection(inv.id)}
                        />
                      </td>
                      <td className="py-3.5 px-3 font-mono font-medium text-md-primary">
                        {inv.invoiceNumber}
                      </td>
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar initials={inv.customerInitials} size="sm" />
                          <span className="font-medium text-md-on-surface">
                            {inv.customerName}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-3 text-md-on-surface-variant text-xs">
                        {formatIsoDate(inv.issuedDate)}
                      </td>
                      <td
                        className={`py-3.5 px-3 text-xs ${
                          isOverdue
                            ? "text-md-error font-semibold"
                            : "text-md-on-surface-variant"
                        }`}
                      >
                        {formatIsoDate(inv.dueDate)}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono font-medium tabular-nums text-md-on-surface">
                        {formatMinorMoney(inv.amountMinor, inv.currency)}
                      </td>
                      <td className="py-3.5 px-3">
                        <StatusChip
                          label={inv.status}
                          variant={mapInvoiceStatusToChipVariant(inv.status)}
                        />
                      </td>
                      <td className="py-3.5 pl-3 pr-6 text-right relative">
                        <Button
                          variant="icon"
                          aria-label="Invoice actions"
                          onClick={() =>
                            setOpenMenuId(openMenuId === inv.id ? null : inv.id)
                          }
                          className="w-9! h-9!"
                        >
                          <MoreVertical className="w-4 h-4" strokeWidth={1.8} />
                        </Button>

                        {openMenuId === inv.id && (
                          <div className="absolute right-6 top-12 z-30 w-44 rounded-2xl bg-md-surface-container-lowest border border-md-outline-variant shadow-lg py-1.5 text-left text-xs">
                            <button
                              type="button"
                              onClick={() => {
                                setInvoices((prev) =>
                                  prev.map((x) =>
                                    x.id === inv.id ? { ...x, status: "PAID" } : x
                                  )
                                );
                                setOpenMenuId(null);
                                void syncInvoiceMutation(
                                  { action: "MARK_PAID", invoiceId: inv.id },
                                  `Recorded payment for ${inv.invoiceNumber}`
                                );
                              }}
                              className="w-full px-4 py-2 hover:bg-md-surface-container-low text-md-on-surface font-medium"
                            >
                              Record payment
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const dup: ERPInvoice = {
                                  ...inv,
                                  id: `inv-${Date.now()}`,
                                  invoiceNumber: `${inv.invoiceNumber}-COPY`,
                                  status: "DRAFT",
                                };
                                setInvoices((prev) => [dup, ...prev]);
                                setOpenMenuId(null);
                                void syncInvoiceMutation(
                                  { action: "DUPLICATE", invoice: dup },
                                  `Duplicated ${inv.invoiceNumber}`
                                );
                              }}
                              className="w-full px-4 py-2 hover:bg-md-surface-container-low text-md-on-surface"
                            >
                              Duplicate
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuId(null);
                                onShowSnackbar(
                                  `Reminder emailed to ${inv.customerEmail}`
                                );
                              }}
                              className="w-full px-4 py-2 hover:bg-md-surface-container-low text-md-on-surface"
                            >
                              Send reminder
                            </button>
                            {canDeleteInvoices && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    setVoidConfirmInvoice({
                                      invoice: inv,
                                      mode: "VOID",
                                    });
                                  }}
                                  className="w-full px-4 py-2 hover:bg-md-error-container text-md-error font-medium"
                                >
                                  Void invoice
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    setVoidConfirmInvoice({
                                      invoice: inv,
                                      mode: "DELETE",
                                    });
                                  }}
                                  className="w-full px-4 py-2 hover:bg-md-error-container text-md-error font-semibold"
                                >
                                  Delete invoice
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        <div className="px-6 py-3.5 border-t border-md-divider flex flex-wrap items-center justify-between gap-4 text-xs text-md-on-surface-variant">
          <span>Rows per page: {rowsPerPage}</span>
          <div className="flex items-center gap-4">
            <span className="tabular-nums">
              {filteredInvoices.length === 0
                ? "0 of 0"
                : `${(page - 1) * rowsPerPage + 1}–${Math.min(
                    page * rowsPerPage,
                    filteredInvoices.length
                  )} of ${filteredInvoices.length}`}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Previous page"
                className="w-8 h-8 rounded-full hover:bg-md-surface-container-high disabled:opacity-40 flex items-center justify-center text-sm"
              >
                ‹
              </button>
              <button
                type="button"
                disabled={page * rowsPerPage >= filteredInvoices.length}
                onClick={() => setPage((p) => p + 1)}
                aria-label="Next page"
                className="w-8 h-8 rounded-full hover:bg-md-surface-container-high disabled:opacity-40 flex items-center justify-center text-sm"
              >
                ›
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Confirmation Dialog for Voiding / Deleting an Invoice (Super Admin Only) */}
      {voidConfirmInvoice && canDeleteInvoices && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-md-on-surface/40 p-4"
        >
          <Card className="max-w-md w-full space-y-4">
            <h3 className="text-[22px] leading-[28px] font-normal text-md-on-surface">
              {voidConfirmInvoice.mode === "DELETE" ? "Delete" : "Void"}{" "}
              {voidConfirmInvoice.invoice.invoiceNumber}?
            </h3>
            <p className="text-sm text-md-on-surface-variant">
              {voidConfirmInvoice.mode === "DELETE" ? (
                <>
                  This will permanently remove invoice{" "}
                  <strong className="font-mono text-md-on-surface">
                    {voidConfirmInvoice.invoice.invoiceNumber}
                  </strong>{" "}
                  for {voidConfirmInvoice.invoice.customerName} from the active
                  register and record the deletion in the audit log.
                </>
              ) : (
                <>
                  This will mark invoice{" "}
                  <strong className="font-mono text-md-on-surface">
                    {voidConfirmInvoice.invoice.invoiceNumber}
                  </strong>{" "}
                  for {voidConfirmInvoice.invoice.customerName} as
                  Cancelled/Voided in the immutable audit register.
                </>
              )}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="text"
                onClick={() => setVoidConfirmInvoice(null)}
              >
                Cancel
              </Button>
              <Button
                variant="filled"
                onClick={async () => {
                  const target = voidConfirmInvoice;
                  setVoidConfirmInvoice(null);
                  await syncInvoiceMutation(
                    {
                      action: target.mode,
                      invoiceId: target.invoice.id,
                    },
                    target.mode === "DELETE"
                      ? `Deleted invoice ${target.invoice.invoiceNumber}`
                      : `Voided invoice ${target.invoice.invoiceNumber}`
                  );
                }}
              >
                {voidConfirmInvoice.mode === "DELETE"
                  ? "Confirm delete"
                  : "Confirm void"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
