/**
 * Browser Crash-Safe Durability & Write-Ahead Outbox Store (`v0.6.0`)
 *
 * Dual-writes critical client state (active POS draft, invoice draft, workspace cache,
 * and pending outbox mutations) to IndexedDB (`stacklyra_crash_safe_db`) alongside a
 * synchronous `localStorage` mirror so hard power-offs, browser crashes, or dropped Wi-Fi
 * never lose in-progress carts or unconfirmed transactions.
 */

import type { CartItem, OrderType, PaymentMethod } from "./types";

export const WORKSPACE_CACHE_KEY = "stacklyra_workspace_cache_v1";
export const SYNC_QUEUE_KEY = "stacklyra_sync_queue_v1";
export const POS_DRAFT_KEY = "stacklyra_pos_draft_v1";
export const INVOICE_DRAFT_KEY = "stacklyra_invoice_draft_v1";

export interface QueuedMutation {
  id: string;
  url: string;
  method: "POST" | "PUT";
  payload: Record<string, unknown>;
  createdAt: string;
  label?: string;
}

export interface PosDraftSnapshot {
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

async function idbSyncOutbox(items: QueuedMutation[]): Promise<void> {
  const db = await openCrashSafeIdb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_OUTBOX, "readwrite");
      const store = tx.objectStore(STORE_OUTBOX);
      store.clear();
      for (const item of items) {
        store.put(item);
      }
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

async function idbListOutbox(): Promise<QueuedMutation[]> {
  const db = await openCrashSafeIdb();
  if (!db) return [];
  return new Promise<QueuedMutation[]>((resolve) => {
    try {
      const tx = db.transaction(STORE_OUTBOX, "readonly");
      const req = tx.objectStore(STORE_OUTBOX).getAll();
      req.onsuccess = () => {
        db.close();
        const rows = (req.result as QueuedMutation[]) || [];
        rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        resolve(rows);
      };
      req.onerror = () => {
        db.close();
        resolve([]);
      };
    } catch {
      db.close();
      resolve([]);
    }
  });
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

export function writeDurableOutbox(items: QueuedMutation[]): void {
  try {
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(items));
  } catch {
    // Fallback to IndexedDB
  }
  void idbSyncOutbox(items);
}

export async function readDurableOutboxAsync(): Promise<QueuedMutation[]> {
  const idbItems = await idbListOutbox();
  if (idbItems.length > 0) return idbItems;
  const lsItems = readSyncJson<QueuedMutation[]>(SYNC_QUEUE_KEY);
  return Array.isArray(lsItems) ? lsItems : [];
}
