import { appendAuditLog, DEFAULT_BRANCH_ID } from "@/core/audit";
import {
  assertTenantFeature,
  assertTenantProductQuota,
  assertTenantWriteActive,
} from "@/core/saas/entitlements";
import { DatabaseSchema } from "@/lib/db";
import { CartItem, Product, UserProfile } from "@/lib/types";

export class InsufficientStockError extends Error {
  constructor(productName: string, available: number, requested: number) {
    super(
      `Atomic Stock Guard: Insufficient stock for "${productName}" (Available: ${available}, Requested: ${requested}).`
    );
    this.name = "InsufficientStockError";
  }
}

export const InventoryService = {
  /**
   * Returns active (non-archived) products scoped to the active tenant
   */
  listActiveProducts(db: DatabaseSchema): Product[] {
    return db.products.filter((p) => !p.isArchived);
  },

  /**
   * Atomic Anti-Overselling Inventory Deduction
   */
  deductStockAtomic(
    txDb: DatabaseSchema,
    items: CartItem[],
    actor: UserProfile
  ): void {
    const tenantId = txDb.tenant.id;
    const qtyByProduct = new Map<string, number>();
    for (const item of items) {
      qtyByProduct.set(
        item.productId,
        (qtyByProduct.get(item.productId) || 0) + item.quantity
      );
    }

    for (const [productId, requestedQty] of qtyByProduct.entries()) {
      const product = txDb.products.find(
        (p) => p.id === productId && !p.isArchived
      );
      if (!product) continue;

      if (product.segment === "RETAIL" && product.stockQty < requestedQty) {
        throw new InsufficientStockError(
          product.name,
          product.stockQty,
          requestedQty
        );
      }
    }

    txDb.products = txDb.products.map((product) => {
      const requestedQty = qtyByProduct.get(product.id) || 0;
      if (requestedQty > 0 && product.segment === "RETAIL") {
        const nextStock = product.stockQty - requestedQty;
        appendAuditLog(txDb, {
          tenantId,
          actorId: actor.id,
          actorName: actor.name,
          actorRole: actor.role,
          module: "INVENTORY",
          action: "UPDATE",
          entityType: "ProductStock",
          entityId: product.id,
          summary: `Atomically deducted ${requestedQty} ${product.unit} of "${product.name}" (${product.stockQty} -> ${nextStock}).`,
        });
        return {
          ...product,
          tenantId,
          stockQty: nextStock,
        };
      }
      return product;
    });
  },

  /**
   * Creates or updates a product in the tenant's catalog with plan quota enforcement
   */
  upsertProduct(
    txDb: DatabaseSchema,
    product: Product,
    isEdit: boolean,
    actor: UserProfile
  ): void {
    assertTenantFeature(
      txDb.tenant,
      "inventory_catalog",
      "Inventory & Menu Catalog"
    );

    const tenantId = txDb.tenant.id;
    if (!isEdit) {
      const activeCount = txDb.products.filter((p) => !p.isArchived).length;
      assertTenantProductQuota(txDb.tenant, activeCount);
    }

    const enriched: Product = {
      ...product,
      tenantId,
      branchId: actor.branchId || DEFAULT_BRANCH_ID,
      isArchived: false,
    };

    if (isEdit) {
      txDb.products = txDb.products.map((p) =>
        p.id === enriched.id ? enriched : p
      );
      appendAuditLog(txDb, {
        tenantId,
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        module: "INVENTORY",
        action: "UPDATE",
        entityType: "Product",
        entityId: enriched.id,
        summary: `Updated menu item "${enriched.name}" (#${enriched.code}).`,
      });
    } else {
      txDb.products = [enriched, ...txDb.products];
      appendAuditLog(txDb, {
        tenantId,
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        module: "INVENTORY",
        action: "CREATE",
        entityType: "Product",
        entityId: enriched.id,
        summary: `Created menu item "${enriched.name}" (#${enriched.code}).`,
      });
    }
  },

  /**
   * Soft-Archives a product (`isArchived: true`)
   */
  archiveProductSoft(
    txDb: DatabaseSchema,
    productId: string,
    actor: UserProfile
  ): void {
    assertTenantWriteActive(txDb.tenant);
    const tenantId = txDb.tenant.id;
    const target = txDb.products.find((p) => p.id === productId);
    if (!target) return;

    txDb.products = txDb.products.map((p) =>
      p.id === productId
        ? { ...p, isArchived: true, archivedAt: new Date().toISOString() }
        : p
    );

    appendAuditLog(txDb, {
      tenantId,
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      module: "INVENTORY",
      action: "SOFT_ARCHIVE",
      entityType: "Product",
      entityId: productId,
      summary: `Soft-archived menu item "${target.name}" (#${target.code}). Historical order references preserved.`,
    });
  },
};
