"use client";
import { useEffect, useState } from "react";
import { subscribe, type OutboxStatus } from "@/lib/outbox";

const DISMISS_KEY = "carpool.connection-banner.dismissed";

export function ConnectionStatus() {
  const [online, setOnline] = useState(true);
  const [status, setStatus] = useState<OutboxStatus>({ pending: 0, failed: 0 });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setOnline(navigator.onLine);
    setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
    const goOn = () => setOnline(true);
    const goOff = () => setOnline(false);
    window.addEventListener("online", goOn);
    window.addEventListener("offline", goOff);
    return () => {
      window.removeEventListener("online", goOn);
      window.removeEventListener("offline", goOff);
    };
  }, []);

  useEffect(() => {
    const unsub = subscribe(setStatus);
    return unsub;
  }, []);

  if (dismissed) return null;

  let mode: "offline" | "syncing" | null = null;
  if (!online) mode = "offline";
  else if (status.pending > 0) mode = "syncing";

  if (!mode) return null;

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  const classes =
    mode === "offline"
      ? "bg-red-600 text-white"
      : "bg-amber-400 text-slate-900";
  const message =
    mode === "offline"
      ? "Offline — changes will sync later"
      : `Syncing ${status.pending} change${status.pending === 1 ? "" : "s"}…`;

  return (
    <div
      role="status"
      className={`${classes} text-xs px-3 py-1.5 flex items-center justify-between gap-3`}
    >
      <span>{message}</span>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="text-current/80 hover:opacity-100 opacity-80 text-base leading-none px-1"
      >
        ×
      </button>
    </div>
  );
}
