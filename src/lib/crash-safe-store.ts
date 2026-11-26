/**
 * Multi-Tenant Browser Crash-Safe Durability & Write-Ahead Outbox Store (`v0.7.0`)
 *
 * Dual-writes critical client state (active POS draft, invoice draft, workspace cache,
 * and pending outbox mutations) to IndexedDB (`stacklyra_crash_safe_db`) alongside a
 * synchronous `localStorage` mirror, strictly namespaced by `tenantId` so switching
 * SaaS workspaces on a shared terminal never mixes cached data or queued mutations.
 */

import type { CartItem, OrderType, PaymentMethod } from "./types";

export const WORKSPACE_CACHE_KEY = "stacklyra_workspace_cache_v1";
export const SYNC_QUEUE_KEY = "stacklyra_sync_queue_v1";
export const POS_DRAFT_KEY = "stacklyra_pos_draft_v1";
export const INVOICE_DRAFT_KEY = "stacklyra_invoice_draft_v1";

export function getTenantScopedKey(baseKey: string, tenantId?: string | null): string {
  const cleanTenant = (tenantId || "ten-stacklyra")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_");
  return `${baseKey}::${cleanTenant}`;
}

export interface QueuedMutation {
  id: string;
  tenantId?: string;
  url: string;
  method: "POST" | "PUT";
  payload: Record<string, unknown>;
  createdAt: string;
  label?: string;
}

export interface PosDraftSnapshot {
  tenantId?: string;
  cart: CartItem[];
  orderType: OrderType;
  tableNumber: string;
  waiterName: string;
  customerName: string;
  customerPhone: string;
  selectedKhataId: string;
  discountAmount: number;
  paymentMethod: PaymentMethod;
  splitCashRatio: number;
  cashTendered: string;
  updatedAt: string;
}

const IDB_NAME = "stacklyra_crash_safe_db";
const IDB_VERSION = 1;
const STORE_KV = "kv";
const STORE_OUTBOX = "outbox";

function openCrashSafeIdb(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_KV)) {
          db.createObjectStore(STORE_KV);
        }
        if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
          db.createObjectStore(STORE_OUTBOX, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbPutKv(key: string, value: unknown): Promise<void> {
  const db = await openCrashSafeIdb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_KV, "readwrite");
      tx.objectStore(STORE_KV).put(value, key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

async function idbGetKv<T>(key: string): Promise<T | null> {
  const db = await openCrashSafeIdb();
  if (!db) return null;
  return new Promise<T | null>((resolve) => {
    try {
      const tx = db.transaction(STORE_KV, "readonly");
      const req = tx.objectStore(STORE_KV).get(key);
      req.onsuccess = () => {
        db.close();
        resolve((req.result as T) ?? null);
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

async function idbSyncOutbox(
  items: QueuedMutation[],
  tenantId?: string | null
): Promise<void> {
  const db = await openCrashSafeIdb();
  if (!db) return;
  const scopedKey = getTenantScopedKey(SYNC_QUEUE_KEY, tenantId);
  await idbPutKv(scopedKey, items);
}

async function idbListOutbox(
  tenantId?: string | null
): Promise<QueuedMutation[]> {
  const scopedKey = getTenantScopedKey(SYNC_QUEUE_KEY, tenantId);
  const rows = await idbGetKv<QueuedMutation[]>(scopedKey);
  if (Array.isArray(rows)) {
    return [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  return [];
}

export function readSyncJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeDurableSnapshot(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Fallback strictly to IndexedDB when localStorage quota is tight
  }
  void idbPutKv(key, value);
}

export function clearDurableSnapshot(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore
  }
  void idbPutKv(key, null);
}

export async function readDurableSnapshotAsync<T>(key: string): Promise<T | null> {
  const idbVal = await idbGetKv<T>(key);
  if (idbVal !== null && idbVal !== undefined) return idbVal;
  return readSyncJson<T>(key);
}

export function writeDurableOutbox(
  items: QueuedMutation[],
  tenantId?: string | null
): void {
  const scopedKey = getTenantScopedKey(SYNC_QUEUE_KEY, tenantId);
  try {
    localStorage.setItem(scopedKey, JSON.stringify(items));
  } catch {
    // Fallback to IndexedDB
  }
  void idbSyncOutbox(items, tenantId);
}

export async function readDurableOutboxAsync(
  tenantId?: string | null
): Promise<QueuedMutation[]> {
  const idbItems = await idbListOutbox(tenantId);
  if (idbItems.length > 0) return idbItems;
  const scopedKey = getTenantScopedKey(SYNC_QUEUE_KEY, tenantId);
  const lsItems = readSyncJson<QueuedMutation[]>(scopedKey);
  return Array.isArray(lsItems) ? lsItems : [];
}
