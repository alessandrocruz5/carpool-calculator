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

type Perm = "granted" | "denied" | "default" | "unsupported";

export function NotificationsToggle() {
  const [perm, setPerm] = useState<Perm>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      setPerm("unsupported");
      return;
    }
    setPerm(Notification.permission as Perm);
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setSubscribed(!!sub);
    });
  }, []);

  async function enable() {
    setError(null);
    const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapid) {
      setError("Push not configured.");
      return;
    }
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      setPerm(permission as Perm);
      if (permission !== "granted") return;
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
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setSubscribed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to enable");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
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
      setSubscribed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to disable");
    } finally {
      setBusy(false);
    }
  }

  if (perm === "unsupported") {
    return (
      <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
        <h2 className="font-semibold">Notifications</h2>
        <p className="text-sm text-slate-500">
          This browser doesn&apos;t support push notifications.
        </p>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
      <h2 className="font-semibold">Notifications</h2>
      <div className="text-sm text-slate-600">
        Status: <span className="font-medium">{perm}</span>
        {subscribed && perm === "granted" && " · subscribed"}
      </div>

      {perm === "denied" && (
        <div className="text-sm text-slate-700 space-y-1">
          <p>
            Notifications are blocked. To re-enable, open your browser&apos;s
            site settings:
          </p>
          <ul className="list-disc list-inside text-xs text-slate-600 space-y-1">
            <li>
              <span className="font-medium">Chrome / Edge:</span> click the
              padlock in the URL bar → Site settings → Notifications → Allow.
            </li>
            <li>
              <span className="font-medium">Safari (macOS):</span> Safari →
              Settings → Websites → Notifications → set this site to Allow.
            </li>
            <li>
              <span className="font-medium">iOS:</span> Settings → Notifications
              → Sabay → Allow Notifications.
            </li>
            <li>
              <span className="font-medium">Firefox:</span> click the padlock →
              Connection secure → More info → Permissions → Receive
              notifications.
            </li>
          </ul>
        </div>
      )}

      {perm === "default" && (
        <button
          onClick={enable}
          disabled={busy}
          className="bg-brand-600 text-white text-sm rounded-lg px-3 py-2 disabled:opacity-60"
        >
          {busy ? "Enabling…" : "Enable notifications"}
        </button>
      )}

      {perm === "granted" && (
        <div className="flex gap-2">
          {subscribed ? (
            <button
              onClick={disable}
              disabled={busy}
              className="bg-slate-200 text-slate-800 text-sm rounded-lg px-3 py-2 disabled:opacity-60"
            >
              {busy ? "Disabling…" : "Disable"}
            </button>
          ) : (
            <button
              onClick={enable}
              disabled={busy}
              className="bg-brand-600 text-white text-sm rounded-lg px-3 py-2 disabled:opacity-60"
            >
              {busy ? "Subscribing…" : "Subscribe"}
            </button>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
