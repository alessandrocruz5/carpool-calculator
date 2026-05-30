"use client";
import { openDB, type IDBPDatabase } from "idb";

export interface QueuedRequest {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  ts: number;
  attempts: number;
  lastError?: string;
  lastTriedAt?: number;
  failed?: boolean;
  description?: string;
}

const DB_NAME = "carpool-outbox";
const STORE = "requests";
const MAX_ATTEMPTS = 5;

let dbPromise: Promise<IDBPDatabase> | null = null;
function db() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 2, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE)) {
          d.createObjectStore(STORE, { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

export interface OutboxStatus {
  pending: number;
  failed: number;
}

const listeners = new Set<(status: OutboxStatus) => void>();
const failureListeners = new Set<(reqs: QueuedRequest[]) => void>();
let cachedStatus: OutboxStatus = { pending: 0, failed: 0 };
let draining = false;

async function loadAll(): Promise<QueuedRequest[]> {
  try {
    const d = await db();
    const rows = (await d.getAll(STORE)) as QueuedRequest[];
    return rows.map((r) => ({ ...r, attempts: r.attempts ?? 0 }));
  } catch {
    return [];
  }
}

async function refreshStatus() {
  const all = await loadAll();
  cachedStatus = {
    pending: all.filter((r) => !r.failed).length,
    failed: all.filter((r) => r.failed).length,
  };
  for (const l of listeners) l(cachedStatus);
  if (failureListeners.size > 0) {
    const failed = all.filter((r) => r.failed).sort((a, b) => b.ts - a.ts);
    for (const l of failureListeners) l(failed);
  }
}

export function subscribe(listener: (status: OutboxStatus) => void): () => void {
  listeners.add(listener);
  listener(cachedStatus);
  refreshStatus();
  return () => {
    listeners.delete(listener);
  };
}

export function subscribeFailures(
  listener: (reqs: QueuedRequest[]) => void
): () => void {
  failureListeners.add(listener);
  loadAll().then((all) =>
    listener(all.filter((r) => r.failed).sort((a, b) => b.ts - a.ts))
  );
  return () => {
    failureListeners.delete(listener);
  };
}

export function getStatus(): OutboxStatus {
  return cachedStatus;
}

// Back-compat: existing callers used getQueueSize() for total queued items.
export function getQueueSize(): number {
  return cachedStatus.pending + cachedStatus.failed;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function describeRequest(url: string, method: string): string {
  try {
    const u = new URL(
      url,
      typeof window !== "undefined" ? window.location.origin : "http://x"
    );
    return `${method} ${u.pathname}`;
  } catch {
    return `${method} ${url}`;
  }
}

async function enqueue(req: QueuedRequest): Promise<void> {
  const d = await db();
  await d.put(STORE, req);
  await refreshStatus();
}

let toastFn: ((msg: string) => void) | null = null;
export function setOutboxToast(fn: ((msg: string) => void) | null) {
  toastFn = fn;
}

export async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    const d = await db();
    const all = (await d.getAll(STORE)) as QueuedRequest[];
    const eligible = all
      .filter((r) => !r.failed)
      .sort((a, b) => a.ts - b.ts);
    for (const item of eligible) {
      const attempts = (item.attempts ?? 0) + 1;
      try {
        const res = await fetch(item.url, {
          method: item.method,
          headers: item.headers,
          body: item.body,
        });
        if (res.status >= 200 && res.status < 300) {
          await d.delete(STORE, item.id);
          continue;
        }
        const errText = `HTTP ${res.status}`;
        if (res.status >= 400 && res.status < 500) {
          await d.put(STORE, {
            ...item,
            attempts,
            lastError: errText,
            lastTriedAt: Date.now(),
            failed: true,
          });
          toastFn?.(
            `Sync failed: ${item.description ?? describeRequest(item.url, item.method)}`
          );
          continue;
        }
        if (attempts >= MAX_ATTEMPTS) {
          await d.put(STORE, {
            ...item,
            attempts,
            lastError: errText,
            lastTriedAt: Date.now(),
            failed: true,
          });
          toastFn?.(
            `Sync failed after ${attempts} tries: ${item.description ?? describeRequest(item.url, item.method)}`
          );
        } else {
          await d.put(STORE, {
            ...item,
            attempts,
            lastError: errText,
            lastTriedAt: Date.now(),
          });
        }
        break;
      } catch (err) {
        const errText = err instanceof Error ? err.message : "network error";
        if (attempts >= MAX_ATTEMPTS) {
          await d.put(STORE, {
            ...item,
            attempts,
            lastError: errText,
            lastTriedAt: Date.now(),
            failed: true,
          });
          toastFn?.(
            `Sync failed after ${attempts} tries: ${item.description ?? describeRequest(item.url, item.method)}`
          );
        } else {
          await d.put(STORE, {
            ...item,
            attempts,
            lastError: errText,
            lastTriedAt: Date.now(),
          });
        }
        break;
      }
    }
    await refreshStatus();
  } finally {
    draining = false;
  }
}

export async function retryFailed(id: string): Promise<void> {
  const d = await db();
  const item = (await d.get(STORE, id)) as QueuedRequest | undefined;
  if (!item) return;
  await d.put(STORE, {
    ...item,
    failed: false,
    attempts: 0,
    lastError: undefined,
  });
  await refreshStatus();
  await drain();
}

export async function retryAll(): Promise<void> {
  const d = await db();
  const all = (await d.getAll(STORE)) as QueuedRequest[];
  for (const item of all) {
    if (item.failed) {
      await d.put(STORE, {
        ...item,
        failed: false,
        attempts: 0,
        lastError: undefined,
      });
    }
  }
  await refreshStatus();
  await drain();
}

export async function discardFailed(id: string): Promise<void> {
  const d = await db();
  await d.delete(STORE, id);
  await refreshStatus();
}

async function serializeRequest(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<QueuedRequest> {
  const url =
    typeof input === "string" || input instanceof URL
      ? input.toString()
      : input.url;
  const method = (
    init?.method ??
    (typeof input === "object" && "method" in input ? input.method : "GET")
  ).toUpperCase();
  const headersInit =
    init?.headers ??
    (typeof input === "object" && "headers" in input ? input.headers : undefined);
  const headers: Record<string, string> = {};
  if (headersInit) {
    new Headers(headersInit).forEach((v, k) => {
      headers[k] = v;
    });
  }
  let body: string | null = null;
  if (init?.body != null) {
    body =
      typeof init.body === "string"
        ? init.body
        : await new Response(init.body as BodyInit).text();
  }
  return {
    id: newId(),
    url,
    method,
    headers,
    body,
    ts: Date.now(),
    attempts: 0,
    description: describeRequest(url, method),
  };
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
  refreshStatus().then(() => {
    if (navigator.onLine) drain();
  });
}
