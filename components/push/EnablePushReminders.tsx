"use client";
import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i += 1) view[i] = raw.charCodeAt(i);
  return buf;
}

type Status = "idle" | "subscribing" | "subscribed" | "denied" | "unsupported";

export function EnablePushReminders() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      if (sub) setStatus("subscribed");
    });
  }, []);

  async function enable() {
    setError(null);
    const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapid) {
      setError("Push not configured (missing VAPID public key).");
      return;
    }
    setStatus("subscribing");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "idle");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      const sub =
        existing ||
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapid),
        }));
      const json = sub.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setStatus("subscribed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to subscribe");
      setStatus("idle");
    }
  }

  async function disable() {
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setStatus("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to unsubscribe");
    }
  }

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
      <h2 className="font-semibold">Reminders</h2>
      <p className="text-sm text-slate-600">
        Get a push notification on Tuesday morning if the gas price hasn&apos;t
        been refreshed in a week.
      </p>
      {status === "unsupported" ? (
        <p className="text-sm text-slate-500">
          This browser doesn&apos;t support push notifications.
        </p>
      ) : status === "denied" ? (
        <p className="text-sm text-red-600">
          Notifications are blocked. Enable them in your browser settings.
        </p>
      ) : status === "subscribed" ? (
        <button
          onClick={disable}
          className="bg-slate-200 text-slate-800 text-sm rounded-lg px-3 py-2"
        >
          Disable reminders
        </button>
      ) : (
        <button
          onClick={enable}
          disabled={status === "subscribing"}
          className="bg-brand-600 text-white text-sm rounded-lg px-3 py-2 disabled:opacity-60"
        >
          {status === "subscribing" ? "Enabling…" : "Enable reminders"}
        </button>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
