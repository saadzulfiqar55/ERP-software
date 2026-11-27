import { NextResponse } from "next/server";
import { appendAuditLog, DEFAULT_BRANCH_ID } from "@/core/audit";
import { assertActorPermission } from "@/core/auth";
import { mapDataLayerError, withTransaction } from "@/core/db";
import {
  assertTenantFeature,
  assertTenantProductQuota,
  assertTenantWriteActive,
  SaaSEntitlementError,
} from "@/core/saas/entitlements";
import { Product } from "@/lib/types";
import type { StockLevelMonitorItem } from "@/lib/mock/erp-data";
import {
  ImportIssue,
  parseProductImport,
  parseStockImport,
} from "@/modules/inventory/bulk-import";

export const dynamic = "force-dynamic";

const MAX_TEXT_BYTES = 2 * 1024 * 1024;

interface ImportOutcome {
  created: number;
  updated: number;
  skipped: number;
  errors: ImportIssue[];
  warnings: ImportIssue[];
  products?: Product[];
  stockMonitor?: StockLevelMonitorItem[];
}

const rid = (prefix: string, i: number) =>
  `${prefix}-${Date.now().toString(36)}-${i.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/**
 * POST /api/inventory/import
 * Body: { kind: "products" | "stock", text: string, updateExisting?: boolean, defaultSegment? }
 *
 * The raw CSV / pasted text is parsed again here with the same parser the preview uses.
 * Any row error rejects the whole import (nothing is written), so a file is never half-imported.
 * Existing items are matched by code / SKU (then by name) and updated when updateExisting is
 * true, otherwise skipped. Runs in one tenant transaction and writes one audit entry.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      kind?: string;
      text?: unknown;
      updateExisting?: boolean;
      defaultSegment?: string;
    } | null;
    if (!body || (body.kind !== "products" && body.kind !== "stock")) {
      return NextResponse.json({ error: 'kind must be "products" or "stock".' }, { status: 400 });
    }
    if (typeof body.text !== "string" || !body.text.trim()) {
      return NextResponse.json({ error: "The file is empty." }, { status: 400 });
    }
    if (body.text.length > MAX_TEXT_BYTES) {
      return NextResponse.json({ error: "The file is larger than 2 MB. Split it into smaller files." }, { status: 413 });
    }
    const text = body.text;
    const updateExisting = body.updateExisting !== false;
    const kind = body.kind;

    const { result } = await withTransaction<ImportOutcome>(
      async (txDb) => {
        const actor = await assertActorPermission(txDb, "inventory:adjust");
        assertTenantWriteActive(txDb.tenant);
        const tenantId = txDb.tenant.id;
        const now = new Date().toISOString();

        if (kind === "stock") {
          assertTenantFeature(txDb.tenant, "material_stock", "Material Stock Tracking");
          const parsed = parseStockImport(text);
          if (parsed.errors.length) {
            return { created: 0, updated: 0, skipped: 0, errors: parsed.errors, warnings: parsed.warnings };
          }
          const current = [...(txDb.stockMonitor || [])];
          let created = 0, updated = 0, skipped = 0;
          const fresh: StockLevelMonitorItem[] = [];
          parsed.rows.forEach((row, i) => {
            const idx = current.findIndex((s) =>
              row.sku
                ? s.sku.toLowerCase() === row.sku.toLowerCase()
                : s.name.toLowerCase() === row.name.toLowerCase()
            );
            if (idx >= 0) {
              if (!updateExisting) { skipped++; return; }
              current[idx] = {
                ...current[idx],
                name: row.name,
                currentQty: row.currentQty,
                reorderTarget: row.reorderTarget,
                unit: row.unit,
              };
              updated++;
            } else {
              fresh.push({
                id: rid("stk", i),
                name: row.name,
                sku: row.sku || `MAT-${(current.length + fresh.length + 1).toString().padStart(4, "0")}`,
                currentQty: row.currentQty,
                reorderTarget: row.reorderTarget,
                unit: row.unit,
              });
              created++;
            }
          });
          txDb.stockMonitor = [...fresh, ...current];
          appendAuditLog(txDb, {
            tenantId,
            actorId: actor.id,
            actorName: actor.name,
            actorRole: actor.role,
            module: "INVENTORY",
            action: "CREATE",
            entityType: "MaterialStockImport",
            entityId: `import-${Date.now()}`,
            summary: `Bulk-imported material stock: ${created} added, ${updated} updated, ${skipped} skipped.`,
          });
          return { created, updated, skipped, errors: [], warnings: parsed.warnings, stockMonitor: txDb.stockMonitor };
        }

        assertTenantFeature(txDb.tenant, "inventory_catalog", "Inventory & Menu Catalog");
        const defaultSegment = body.defaultSegment === "RETAIL" ? "RETAIL" : "RESTAURANT";
        const parsed = parseProductImport(text, { segment: defaultSegment });
        if (parsed.errors.length) {
          return { created: 0, updated: 0, skipped: 0, errors: parsed.errors, warnings: parsed.warnings };
        }

        const products = [...txDb.products];
        const active = products.filter((p) => !p.isArchived);
        const findExisting = (code: string, name: string) =>
          products.findIndex(
            (p) =>
              !p.isArchived &&
              (code ? p.code.toLowerCase() === code.toLowerCase() : p.name.toLowerCase() === name.toLowerCase())
          );

        const usedCodes = new Set(active.map((p) => p.code.toLowerCase()));
        let nextCode = 101 + active.length;
        const allocateCode = () => {
          while (usedCodes.has(String(nextCode))) nextCode++;
          usedCodes.add(String(nextCode));
          return String(nextCode++);
        };

        let created = 0, updated = 0, skipped = 0;
        const fresh: Product[] = [];
        parsed.rows.forEach((row, i) => {
          const idx = findExisting(row.code, row.name);
          if (idx >= 0) {
            if (!updateExisting) { skipped++; return; }
            const prev = products[idx];
            products[idx] = {
              ...prev,
              name: row.name,
              nameUrdu: row.nameUrdu || prev.nameUrdu,
              category: row.category,
              segment: row.segment,
              kitchenStation: row.kitchenStation,
              taxMode: row.taxMode,
              stockQty: row.stockQty ?? prev.stockQty,
              unit: row.unit,
              barcode: row.barcode || prev.barcode,
              imageUrl: row.imageUrl || prev.imageUrl,
              popular: row.popular || prev.popular,
              // Keep variant ids stable where the name matches so open carts still resolve.
              variants: row.variants.map((v, vi) => {
                const match = prev.variants.find((pv) => pv.name.toLowerCase() === v.name.toLowerCase());
                return { id: match?.id || `v-${Date.now().toString(36)}-${i}-${vi}`, name: v.name, price: v.price, costPrice: v.costPrice };
              }),
            };
            updated++;
          } else {
            const code = row.code || allocateCode();
            usedCodes.add(code.toLowerCase());
            fresh.push({
              id: rid("prod", i),
              tenantId,
              branchId: actor.branchId || DEFAULT_BRANCH_ID,
              code,
              barcode: row.barcode || undefined,
              name: row.name,
              nameUrdu: row.nameUrdu,
              segment: row.segment,
              category: row.category,
              kitchenStation: row.kitchenStation,
              taxMode: row.taxMode,
              stockQty: row.stockQty ?? 0,
              unit: row.unit,
              imageUrl: row.imageUrl || undefined,
              popular: row.popular || undefined,
              isArchived: false,
              variants: row.variants.map((v, vi) => ({
                id: `v-${Date.now().toString(36)}-${i}-${vi}`,
                name: v.name,
                price: v.price,
                costPrice: v.costPrice,
              })),
            });
            created++;
          }
        });

        if (created > 0) {
          // Throws 402 with the plan's limit if the import would exceed it.
          assertTenantProductQuota(txDb.tenant, active.length + created - 1);
        }
        txDb.products = [...fresh, ...products];
        appendAuditLog(txDb, {
          tenantId,
          actorId: actor.id,
          actorName: actor.name,
          actorRole: actor.role,
          module: "INVENTORY",
          action: "CREATE",
          entityType: "ProductImport",
          entityId: `import-${Date.now()}`,
          summary: `Bulk-imported catalog at ${now}: ${created} added, ${updated} updated, ${skipped} skipped.`,
        });
        return {
          created,
          updated,
          skipped,
          errors: [],
          warnings: parsed.warnings,
          products: txDb.products.filter((p) => !p.isArchived),
        };
      },
      undefined,
      undefined,
      { readBack: false }
    );

    if (result.errors.length) {
      return NextResponse.json(
        { error: `Fix ${result.errors.length} row${result.errors.length === 1 ? "" : "s"} and try again. Nothing was imported.`, ...result },
        { status: 422 }
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof SaaSEntitlementError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    const dataLayer = mapDataLayerError(err);
    if (dataLayer) return NextResponse.json(dataLayer.body, { status: dataLayer.status });
    const message = err instanceof Error ? err.message : "Import failed.";
    const status = message.includes("Access Denied") ? 403 : message.includes("Authentication required") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

