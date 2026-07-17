"use client";
import { useState } from "react";

export function ArchiveTripsPanel() {
  const [days, setDays] = useState(365);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onArchive() {
    if (!confirm(`Archive trips older than ${days} days?`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/archive-trips", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ olderThanDays: days }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { archived } = (await res.json()) as { archived: number };
      setMsg(`Archived ${archived} trip(s).`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border rounded p-4 space-y-3">
      <h2 className="text-lg font-medium">Archive old trips</h2>
      <p className="text-sm text-slate-600">
        Archived trips are hidden from /week, /payments, and /log. They
        still count in historical mileage rollups.
      </p>
      <div className="flex items-end gap-3">
        <label className="text-sm">
          Older than
          <input
            type="text" inputMode="decimal"
            min={1}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="block border rounded px-2 py-1 w-24"
          />
        </label>
        <span className="text-sm pb-1">days</span>
        <button
          onClick={onArchive}
          disabled={busy || days < 1}
          className="border rounded px-3 py-1 text-sm disabled:opacity-50"
        >
          {busy ? "Archiving…" : "Archive"}
        </button>
      </div>
      {msg && <p className="text-sm">{msg}</p>}
    </section>
  );
}
