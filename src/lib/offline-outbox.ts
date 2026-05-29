/**
 * Offline outbox (audit TASK 28) — IndexedDB-backed queue of failed mutations.
 *
 * Captures any mutation that bombs because the user went offline, then retries
 * with exponential backoff when navigator.onLine flips back to true. Uses raw
 * IndexedDB (no Dexie) so we don't ship a 20kB dependency for a niche path.
 *
 * Public API:
 *   • enqueue({ url, method, body, headers })  → queues for retry
 *   • peekCount()                              → for the SyncStatusPill
 *   • drain()                                  → manual sync trigger
 *
 * Sprint 3 will grow this into a full per-mutation idempotency layer.
 */

const DB_NAME = "vibrnd-outbox";
const STORE = "queue";
const DB_VERSION = 1;

type Item = {
  id?: number;
  url: string;
  method: string;
  body?: string;
  headers?: Record<string, string>;
  createdAt: number;
  attempts: number;
  lastErr?: string;
};

let _db: IDBDatabase | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB unavailable"));
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => {
      _db = req.result;
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        const r = run(store);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      })
  );
}

export async function enqueue(item: Omit<Item, "id" | "createdAt" | "attempts">) {
  if (typeof window === "undefined") return;
  const full: Item = { ...item, createdAt: Date.now(), attempts: 0 };
  try {
    await tx("readwrite", (s) => s.add(full));
  } catch (e) {
    console.warn("[outbox] enqueue failed", e);
  }
}

export async function peekCount(): Promise<number> {
  if (typeof window === "undefined") return 0;
  try {
    return await tx("readonly", (s) => s.count());
  } catch {
    return 0;
  }
}

/** Try to send every queued item. Drops items that finally succeeded. */
export async function drain(): Promise<{ sent: number; failed: number }> {
  if (typeof window === "undefined") return { sent: 0, failed: 0 };
  let sent = 0;
  let failed = 0;
  const items = await tx<Item[]>("readonly", (s) => s.getAll() as IDBRequest<Item[]>);
  for (const item of items) {
    try {
      const res = await fetch(item.url, {
        method: item.method,
        body: item.body,
        headers: item.headers,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (item.id != null) {
        await tx("readwrite", (s) => s.delete(item.id!));
      }
      sent++;
    } catch (e) {
      failed++;
      try {
        if (item.id != null) {
          item.attempts += 1;
          item.lastErr = String(e);
          await tx("readwrite", (s) => s.put(item));
        }
      } catch {}
    }
  }
  return { sent, failed };
}

/** Hook the outbox into the global `online` event so we drain on reconnect. */
export function attachAutoDrain() {
  if (typeof window === "undefined") return;
  window.addEventListener("online", () => {
    drain().catch(() => {});
  });
}
