"use client";
import { useEffect, useState } from "react";

type Platform = "ios" | "android" | "desktop" | "unknown";

function detect(): Platform {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Macintosh|Windows|Linux/i.test(ua)) return "desktop";
  return "unknown";
}

export default function InstallPage() {
  const [platform, setPlatform] = useState<Platform>("unknown");

  useEffect(() => {
    setPlatform(detect());
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Install Sabay</h1>
      <p className="text-sm text-slate-600">
        Installing puts Sabay on your home screen and lets it run full-screen
        with offline support.
      </p>

      <section className={panelCls(platform === "ios")}>
        <h2 className="font-semibold mb-2">iPhone / iPad (Safari)</h2>
        <ol className="list-decimal list-inside text-sm space-y-1">
          <li>Tap the Share button in Safari&apos;s toolbar.</li>
          <li>Scroll and tap &quot;Add to Home Screen&quot;.</li>
          <li>Confirm the name and tap Add.</li>
        </ol>
      </section>

      <section className={panelCls(platform === "android")}>
        <h2 className="font-semibold mb-2">Android (Chrome)</h2>
        <ol className="list-decimal list-inside text-sm space-y-1">
          <li>Open the menu (⋮) in Chrome.</li>
          <li>Tap &quot;Install app&quot; or &quot;Add to Home screen&quot;.</li>
          <li>Confirm to install.</li>
        </ol>
      </section>

      <section className={panelCls(platform === "desktop")}>
        <h2 className="font-semibold mb-2">Desktop (Chrome / Edge)</h2>
        <ol className="list-decimal list-inside text-sm space-y-1">
          <li>
            Look for the install icon in the URL bar (a small monitor with a
            down arrow).
          </li>
          <li>Click it and confirm &quot;Install&quot;.</li>
        </ol>
      </section>
    </div>
  );
}

function panelCls(highlight: boolean) {
  return `bg-white rounded-xl border p-4 ${
    highlight ? "border-brand-400 ring-2 ring-brand-200" : "border-slate-200"
  }`;
}
