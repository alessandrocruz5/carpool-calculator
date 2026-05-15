"use client";
import { openDB, type IDBPDatabase } from "idb";

interface QueuedRequest {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  ts: number;
}

const DB_NAME = "carpool-outbox";
const STORE = "requests";

let dbPromise: Promise<IDBPDatabase> | null = null;
function db() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE)) {
          d.createObjectStore(STORE, { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

const listeners = new Set<(size: number) => void>();
let cachedSize = 0;
let draining = false;

async function refreshSize() {
  try {
    const d = await db();
    cachedSize = await d.count(STORE);
  } catch {
    cachedSize = 0;
  }
  for (const l of listeners) l(cachedSize);
}

export function subscribe(listener: (size: number) => void): () => void {
  listeners.add(listener);
  listener(cachedSize);
  // Kick a refresh on first subscribe so the cached size catches up to disk.
  refreshSize();
  return () => {
    listeners.delete(listener);
  };
}

export function getQueueSize(): number {
  return cachedSize;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function enqueue(req: QueuedRequest): Promise<void> {
  const d = await db();
  await d.put(STORE, req);
  await refreshSize();
}

export async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    const d = await db();
    const all = (await d.getAll(STORE)) as QueuedRequest[];
    all.sort((a, b) => a.ts - b.ts);
    for (const item of all) {
      try {
        const res = await fetch(item.url, {
          method: item.method,
          headers: item.headers,
          body: item.body,
        });
        if (res.status >= 200 && res.status < 300) {
          await d.delete(STORE, item.id);
        } else {
          // Non-2xx that isn't a network error: leave in queue and stop to preserve order.
          break;
        }
      } catch {
        // Still offline / network error: stop draining; will retry on next online.
        break;
      }
    }
    await refreshSize();
  } finally {
    draining = false;
  }
}

async function serializeRequest(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<QueuedRequest> {
  const url = typeof input === "string" || input instanceof URL ? input.toString() : input.url;
  const method = (init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET")).toUpperCase();
  const headersInit = init?.headers ?? (typeof input === "object" && "headers" in input ? input.headers : undefined);
  const headers: Record<string, string> = {};
  if (headersInit) {
    new Headers(headersInit).forEach((v, k) => {
      headers[k] = v;
    });
  }
  let body: string | null = null;
  if (init?.body != null) {
    body = typeof init.body === "string" ? init.body : await new Response(init.body as BodyInit).text();
  }
  return { id: newId(), url, method, headers, body, ts: Date.now() };
}

function syntheticAccepted(): Response {
  return new Response(JSON.stringify({ queued: true }), {
    status: 202,
    headers: { "content-type": "application/json" },
  });
}

export async function resilientFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    try {
      const q = await serializeRequest(input, init);
      await enqueue(q);
    } catch (e) {
      console.error("outbox.enqueue failed", e);
    }
    return syntheticAccepted();
  }
  try {
    return await fetch(input, init);
  } catch (err) {
    try {
      const q = await serializeRequest(input, init);
      await enqueue(q);
    } catch (e) {
      console.error("outbox.enqueue failed", e);
      throw err;
    }
    return syntheticAccepted();
  }
}

let installed = false;
export function installOutbox() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("online", () => {
    drain();
  });
  // Initial size sync + opportunistic drain if we boot online with a backlog.
  refreshSize().then(() => {
    if (navigator.onLine) drain();
  });
}
