"use client";
import { useEffect, useState } from "react";
import {
  subscribe,
  subscribeFailures,
  retryFailed,
  discardFailed,
  setOutboxToast,
  type QueuedRequest,
} from "@/lib/outbox";
import { useToast } from "@/components/Toast";

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

export function SyncIssues() {
  const toast = useToast();
  const [failed, setFailed] = useState<QueuedRequest[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOutboxToast((msg) => toast.show({ message: msg }));
    const unsub = subscribeFailures(setFailed);
    return () => {
      unsub();
      setOutboxToast(null);
    };
  }, [toast]);

  // Status indicator only shows when there are failures.
  const [hasFailures, setHasFailures] = useState(false);
  useEffect(() => {
    const unsub = subscribe((s) => setHasFailures(s.failed > 0));
    return unsub;
  }, []);

  if (!hasFailures && !open) return null;

  return (
    <>
      {hasFailures && (
        <button
          onClick={() => setOpen(true)}
          className="fixed top-3 right-3 z-40 bg-red-100 text-red-900 border border-red-300 text-xs px-3 py-1 rounded-full shadow-sm hover:bg-red-200"
          aria-label="Show sync issues"
        >
          Sync issues ({failed.length})
        </button>
      )}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="font-semibold">Sync issues</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-slate-500 hover:text-slate-900 text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            {failed.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">
                No failed writes.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {failed.map((f) => (
                  <li key={f.id} className="p-4 space-y-2">
                    <div className="text-sm">
                      <div className="font-medium">
                        {f.description ?? `${f.method} ${f.url}`}
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatTime(f.ts)} · {f.attempts} attempt
                        {f.attempts === 1 ? "" : "s"}
                      </div>
                      {f.lastError && (
                        <div className="text-xs text-red-700 mt-1 break-words">
                          {f.lastError}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => retryFailed(f.id)}
                        className="bg-brand-600 text-white text-xs rounded px-3 py-1"
                      >
                        Retry
                      </button>
                      <button
                        onClick={() => {
                          if (
                            window.confirm(
                              "Discard this write? It will not be sent."
                            )
                          ) {
                            discardFailed(f.id);
                          }
                        }}
                        className="bg-slate-200 text-slate-800 text-xs rounded px-3 py-1"
                      >
                        Discard
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
