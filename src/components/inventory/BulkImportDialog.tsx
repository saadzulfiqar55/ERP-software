"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardPaste,
  Download,
  FileSpreadsheet,
  Upload,
} from "lucide-react";
import { Button, Dialog, StatusChip, Switch } from "@/components/ui/m3";
import type { BusinessSegment, Product } from "@/lib/types";
import type { StockLevelMonitorItem } from "@/lib/mock/erp-data";
import {
  ImportIssue,
  ImportKind,
  MAX_IMPORT_ROWS,
  parseProductImport,
  parseStockImport,
  productTemplateCsv,
  stockTemplateCsv,
} from "@/modules/inventory/bulk-import";

export interface BulkImportResult {
  created: number;
  updated: number;
  skipped: number;
  products?: Product[];
  stockMonitor?: StockLevelMonitorItem[];
}

type Source = "file" | "paste";

const PREVIEW_LIMIT = 60;

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const pkr = (n: number) => `PKR ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;

function IssueList({ issues, tone }: { issues: ImportIssue[]; tone: "error" | "warning" }) {
  const [expanded, setExpanded] = useState(false);
  if (issues.length === 0) return null;
  const shown = expanded ? issues : issues.slice(0, 5);
  return (
    <div
      className={`rounded-2xl p-4 text-sm ${
        tone === "error"
          ? "bg-md-error-container text-md-on-error-container"
          : "bg-md-warning-container text-md-on-warning-container"
      }`}
      role={tone === "error" ? "alert" : undefined}
    >
      <div className="flex items-center gap-2 font-medium mb-2">
        <AlertTriangle className="w-4 h-4" />
        {tone === "error"
          ? `${plural(issues.length, "row")} ${issues.length === 1 ? "needs" : "need"} fixing before you can import`
          : `${issues.length} note${issues.length === 1 ? "" : "s"} (import will still work)`}
      </div>
      <ul className="space-y-1 text-[13px]">
        {shown.map((i, idx) => (
          <li key={`${i.line}-${idx}`}>
            <span className="font-mono opacity-80">Line {i.line}:</span> {i.message}
          </li>
        ))}
      </ul>
      {issues.length > 5 && (
        <button
          type="button"
          className="mt-2 text-xs font-medium underline underline-offset-2"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Show fewer" : `Show all ${issues.length}`}
        </button>
      )}
    </div>
  );
}

/**
 * Three-step bulk import: pick a CSV (or paste cells from Excel / Google Sheets), check the
 * preview with per-row errors, then import. The server re-validates the same text and either
 * imports every row or none.
 */
export function BulkImportDialog({
  open,
  onClose,
  kind,
  defaultSegment,
  existingProducts,
  existingStock,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  kind: ImportKind;
  defaultSegment: BusinessSegment;
  existingProducts: Product[];
  existingStock: StockLevelMonitorItem[];
  onImported: (result: BulkImportResult) => void;
}) {
  const [source, setSource] = useState<Source>("file");
  const [text, setText] = useState("");
  const [draft, setDraft] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");
  const [serverIssues, setServerIssues] = useState<ImportIssue[]>([]);
  const [done, setDone] = useState<BulkImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const label = kind === "products" ? (defaultSegment === "RETAIL" ? "products" : "menu items") : "materials";

  const parsed = useMemo(() => {
    if (!text.trim()) return null;
    return kind === "products"
      ? parseProductImport(text, { segment: defaultSegment })
      : parseStockImport(text);
  }, [text, kind, defaultSegment]);

  // Which preview rows match something already in the catalog (they will be updated / skipped).
  const matches = useMemo(() => {
    const set = new Set<number>();
    if (!parsed) return set;
    if (kind === "products") {
      const codes = new Set(existingProducts.map((p) => p.code.toLowerCase()));
      const names = new Set(existingProducts.map((p) => p.name.toLowerCase()));
      (parsed.rows as ReturnType<typeof parseProductImport>["rows"]).forEach((r) => {
        if (r.code ? codes.has(r.code.toLowerCase()) : names.has(r.name.toLowerCase())) set.add(r.line);
      });
    } else {
      const skus = new Set(existingStock.map((s) => s.sku.toLowerCase()));
      const names = new Set(existingStock.map((s) => s.name.toLowerCase()));
      (parsed.rows as ReturnType<typeof parseStockImport>["rows"]).forEach((r) => {
        if (r.sku ? skus.has(r.sku.toLowerCase()) : names.has(r.name.toLowerCase())) set.add(r.line);
      });
    }
    return set;
  }, [parsed, kind, existingProducts, existingStock]);

  function reset() {
    setText("");
    setDraft("");
    setFileName("");
    setFileError("");
    setServerError("");
    setServerIssues([]);
    setDone(null);
  }

  function close() {
    if (submitting) return;
    reset();
    onClose();
  }

  async function readFile(file: File) {
    setFileError("");
    setServerError("");
    setServerIssues([]);
    const lower = file.name.toLowerCase();
    if (/\.(xlsx|xls|ods|numbers)$/.test(lower)) {
      setFileError(
        "Spreadsheet files can't be read directly. In Excel choose File → Save As → CSV, or select the cells, copy them and use “Paste from Excel”."
      );
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setFileError("This file is larger than 2 MB. Split it into smaller files.");
      return;
    }
    const content = await file.text();
    setFileName(file.name);
    setText(content);
  }

  async function submit() {
    if (!parsed || parsed.errors.length || parsed.rows.length === 0) return;
    setSubmitting(true);
    setServerError("");
    setServerIssues([]);
    try {
      const res = await fetch("/api/inventory/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, text, updateExisting, defaultSegment }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setServerError(data.error || "Import failed. Nothing was changed.");
        setServerIssues(Array.isArray(data.errors) ? data.errors : []);
        return;
      }
      setDone(data as BulkImportResult);
      onImported(data as BulkImportResult);
    } catch {
      setServerError("No connection. Check your internet and try again — nothing was imported.");
    } finally {
      setSubmitting(false);
    }
  }

  const rows = parsed?.rows ?? [];
  const errors = parsed?.errors ?? [];
  const warnings = parsed?.warnings ?? [];
  const matchCount = matches.size;
  const newCount = rows.length - matchCount;
  const canImport = !!parsed && errors.length === 0 && rows.length > 0 && !submitting;

  const footer = done ? (
    <>
      <Button variant="text" onClick={reset}>
        Import another file
      </Button>
      <Button onClick={close}>Done</Button>
    </>
  ) : (
    <>
      <Button variant="text" onClick={close} disabled={submitting}>
        Cancel
      </Button>
      {parsed && (
        <Button
          variant="outlined"
          onClick={() => {
            if (source === "paste") {
              setText("");
              setServerError("");
              setServerIssues([]);
            } else {
              reset();
            }
          }}
          disabled={submitting}
        >
          {source === "paste" ? "Edit pasted rows" : "Choose a different file"}
        </Button>
      )}
      <Button onClick={submit} disabled={!canImport} icon={<Upload className="w-4 h-4" />}>
        {submitting
          ? "Importing…"
          : rows.length
          ? `Import ${rows.length.toLocaleString()} ${label}`
          : "Import"}
      </Button>
    </>
  );

  return (
    <Dialog
      open={open}
      onClose={close}
      dismissible={!submitting}
      size="lg"
      icon={<FileSpreadsheet className="w-5 h-5" />}
      title={kind === "products" ? `Import ${label}` : "Import material stock"}
      description={
        done
          ? undefined
          : `Add or update many ${label} at once from a CSV file or cells copied from Excel / Google Sheets. Up to ${MAX_IMPORT_ROWS.toLocaleString()} rows per import.`
      }
      footer={footer}
    >
      {done ? (
        <div className="py-8 text-center md-anim-rise">
          <div className="w-14 h-14 mx-auto rounded-full bg-md-success-container text-md-on-success-container flex items-center justify-center mb-4">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <div className="text-lg text-md-on-surface">Import complete</div>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <StatusChip label={`${done.created} added`} variant="success" />
            <StatusChip label={`${done.updated} updated`} variant="primary" />
            {done.skipped > 0 && <StatusChip label={`${done.skipped} skipped`} variant="neutral" />}
          </div>
          <p className="text-sm text-md-on-surface-variant mt-4">
            {kind === "products"
              ? "New items are on the POS screen right away. Add photos from the item list whenever you like."
              : "Stock levels are updated. Items below their reorder level show in the stock monitor."}
          </p>
        </div>
      ) : !parsed ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div className="inline-flex rounded-full p-1 bg-md-surface-container-low" role="tablist">
              {(
                [
                  ["file", "Upload CSV", Upload],
                  ["paste", "Paste from Excel", ClipboardPaste],
                ] as const
              ).map(([value, text, Icon]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={source === value}
                  onClick={() => setSource(value)}
                  className={`h-9 px-4 rounded-full text-xs font-medium inline-flex items-center gap-1.5 ${
                    source === value
                      ? "bg-md-secondary-container text-md-on-secondary-container shadow-(--md-elevation-1)"
                      : "text-md-on-surface-variant hover:text-md-on-surface"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {text}
                </button>
              ))}
            </div>
            <Button
              variant="text"
              size="sm"
              icon={<Download className="w-4 h-4" />}
              onClick={() =>
                downloadText(
                  kind === "products"
                    ? `stacklyra-${defaultSegment === "RETAIL" ? "products" : "menu"}-template.csv`
                    : "stacklyra-material-stock-template.csv",
                  kind === "products" ? productTemplateCsv(defaultSegment) : stockTemplateCsv()
                )
              }
            >
              Download template
            </Button>
          </div>

          {source === "file" ? (
            <div
              className="md-dropzone rounded-2xl bg-md-surface-container-low px-6 py-10 text-center"
              data-active={dragActive}
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                const f = e.dataTransfer.files?.[0];
                if (f) void readFile(f);
              }}
            >
              <div className="w-12 h-12 mx-auto rounded-full bg-md-primary-container text-md-on-primary-container flex items-center justify-center mb-3">
                <Upload className="w-5 h-5" />
              </div>
              <div className="text-sm font-medium text-md-on-surface">
                Drag a CSV file here
              </div>
              <div className="text-xs text-md-on-surface-variant mt-1 mb-4">
                or pick one from your computer or phone
              </div>
              <Button variant="tonal" onClick={() => inputRef.current?.click()}>
                Choose file
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.tsv,.txt,text/csv,text/plain"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void readFile(f);
                  e.target.value = "";
                }}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <label htmlFor="bulk-paste" className="text-xs font-medium text-md-on-surface-variant">
                Select the cells in Excel or Google Sheets (including the header row), copy, and paste here
              </label>
              <textarea
                id="bulk-paste"
                rows={9}
                placeholder={
                  kind === "products"
                    ? "Code\tName\tCategory\tPrice\n101\tChicken Karahi\tKarahi & Handi\t2600"
                    : "SKU\tName\tQuantity\tReorder Level\tUnit\nMAT-001\tChicken\t25\t10\tkg"
                }
                className="w-full rounded-2xl bg-md-surface-container-low px-4 py-3 font-mono text-xs text-md-on-surface placeholder:text-md-on-surface-variant/60 border-0 focus:outline-2 focus:outline-md-primary"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onPaste={(e) => {
                  const pasted = e.clipboardData.getData("text");
                  // A multi-row paste into an empty box goes straight to the preview.
                  if (pasted.includes("\n") && !draft.trim()) {
                    e.preventDefault();
                    setDraft(pasted);
                    setFileName("Pasted cells");
                    setText(pasted);
                  }
                }}
              />
              <div className="flex justify-end">
                <Button
                  variant="tonal"
                  size="sm"
                  disabled={!draft.trim()}
                  onClick={() => {
                    setFileName("Pasted cells");
                    setText(draft);
                  }}
                >
                  Check rows
                </Button>
              </div>
            </div>
          )}

          {fileError && (
            <div className="rounded-2xl p-4 text-sm bg-md-warning-container text-md-on-warning-container" role="alert">
              {fileError}
            </div>
          )}

          <div className="rounded-2xl bg-md-surface-container-low p-4 text-xs text-md-on-surface-variant space-y-1.5">
            <div className="font-medium text-md-on-surface text-sm mb-1">Tips</div>
            {kind === "products" ? (
              <>
                <p>
                  <b>Required:</b> Name and Price. Optional: Code, Category, Variant, Cost, Stock, Unit,
                  Barcode, Tax Mode, Station, Type (Restaurant / Retail), Popular, Image URL.
                </p>
                <p>
                  Rows with the same <b>Code</b> become sizes of one item — e.g. “Half” and “Full”
                  Chicken Karahi.
                </p>
                <p>Items whose Code already exists are updated, so you can re-import a corrected price list.</p>
              </>
            ) : (
              <>
                <p>
                  <b>Required:</b> Name. Optional: SKU, Quantity, Reorder Level, Unit.
                </p>
                <p>Materials whose SKU (or name) already exists get their quantity and reorder level updated.</p>
              </>
            )}
            <p>Column names are flexible — “Rate”, “Selling Price” and “Price” all work.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4 md-anim-rise">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-md-on-surface font-medium truncate max-w-[16rem]">{fileName}</span>
            <StatusChip label={`${rows.length.toLocaleString()} ready`} variant={rows.length ? "success" : "neutral"} />
            {rows.length > 0 && <StatusChip label={`${newCount} new`} variant="primary" />}
            {matchCount > 0 && (
              <StatusChip label={`${matchCount} already exist`} variant="neutral" />
            )}
            {errors.length > 0 && <StatusChip label={plural(errors.length, "error")} variant="error" />}
          </div>

          {serverError && (
            <div className="rounded-2xl p-4 text-sm bg-md-error-container text-md-on-error-container" role="alert">
              {serverError}
            </div>
          )}
          <IssueList issues={serverIssues.length ? serverIssues : errors} tone="error" />
          <IssueList issues={warnings} tone="warning" />

          {parsed.ignoredColumns.length > 0 && (
            <p className="text-xs text-md-on-surface-variant">
              Ignored columns: {parsed.ignoredColumns.join(", ")}
            </p>
          )}

          {matchCount > 0 && (
            <div className="rounded-2xl bg-md-surface-container-low px-4">
              <Switch
                checked={updateExisting}
                onChange={setUpdateExisting}
                label={`Update the ${matchCount} ${label} that already exist`}
                helperText={
                  updateExisting
                    ? "Their name, prices and details will be replaced with the values in this file."
                    : "They will be left as they are; only new rows are added."
                }
              />
            </div>
          )}

          {rows.length > 0 && (
            <div className="rounded-2xl overflow-hidden bg-md-surface-container-lowest shadow-(--md-elevation-1)">
              <div className="max-h-[42vh] overflow-auto">
                <table className="md-table w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-md-on-surface-variant">
                      <th className="py-2.5 px-3 font-medium">Line</th>
                      {kind === "products" ? (
                        <>
                          <th className="py-2.5 px-3 font-medium">Item</th>
                          <th className="py-2.5 px-3 font-medium hidden sm:table-cell">Category</th>
                          <th className="py-2.5 px-3 font-medium text-right">Price</th>
                        </>
                      ) : (
                        <>
                          <th className="py-2.5 px-3 font-medium">Material</th>
                          <th className="py-2.5 px-3 font-medium text-right">Qty</th>
                          <th className="py-2.5 px-3 font-medium text-right hidden sm:table-cell">Reorder at</th>
                        </>
                      )}
                      <th className="py-2.5 px-3 font-medium text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-md-divider">
                    {rows.slice(0, PREVIEW_LIMIT).map((r) => {
                      const exists = matches.has(r.line);
                      const status = exists ? (updateExisting ? "Update" : "Skip") : "New";
                      return (
                        <tr key={r.line}>
                          <td className="py-2 px-3 font-mono text-xs text-md-on-surface-variant">{r.line}</td>
                          {"variants" in r ? (
                            <>
                              <td className="py-2 px-3">
                                <div className="text-md-on-surface">{r.name}</div>
                                <div className="text-xs text-md-on-surface-variant">
                                  {r.code ? `#${r.code} · ` : ""}
                                  {r.segment === "RETAIL" ? "Retail" : "Menu"}
                                  {r.variants.length > 1 ? ` · ${r.variants.length} sizes` : ""}
                                </div>
                              </td>
                              <td className="py-2 px-3 text-md-on-surface-variant hidden sm:table-cell">{r.category}</td>
                              <td className="py-2 px-3 text-right tabular-nums">
                                {r.variants.length > 1
                                  ? `${pkr(Math.min(...r.variants.map((v) => v.price)))} – ${pkr(Math.max(...r.variants.map((v) => v.price)))}`
                                  : pkr(r.variants[0].price)}
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="py-2 px-3">
                                <div className="text-md-on-surface">{r.name}</div>
                                {r.sku && <div className="text-xs text-md-on-surface-variant font-mono">{r.sku}</div>}
                              </td>
                              <td className="py-2 px-3 text-right tabular-nums">
                                {r.currentQty} {r.unit}
                              </td>
                              <td className="py-2 px-3 text-right tabular-nums hidden sm:table-cell">{r.reorderTarget}</td>
                            </>
                          )}
                          <td className="py-2 px-3 text-right">
                            <StatusChip
                              label={status}
                              variant={status === "New" ? "success" : status === "Update" ? "primary" : "neutral"}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {rows.length > PREVIEW_LIMIT && (
                <div className="px-3 py-2 text-xs text-md-on-surface-variant border-t border-md-divider">
                  Showing the first {PREVIEW_LIMIT} of {rows.length.toLocaleString()} rows. All of them will be imported.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
