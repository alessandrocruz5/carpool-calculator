"use client";
import { useState } from "react";
import dayjs from "dayjs";
import { useFillups } from "@/lib/hooks/useFillups";
import { useSettings } from "@/lib/hooks/useSettings";
import { rollingMileage } from "@/lib/mileage";
import { PHP } from "@/components/PHP";

export default function MileagePage() {
  const { fillups, add, remove, loading } = useFillups();
  const { raw, update } = useSettings();

  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [liters, setLiters] = useState("");
  const [total, setTotal] = useState("");
  const [odo, setOdo] = useState("");
  const [busy, setBusy] = useState(false);

  const rolling = rollingMileage(fillups);
  const override = raw?.mileage_kml_override ?? "";

  async function submit() {
    if (!liters || !total || !odo) return;
    setBusy(true);
    try {
      await add({
        date,
        liters: parseFloat(liters),
        totalPhp: parseFloat(total),
        odometerKm: parseFloat(odo),
      });
      setLiters("");
      setTotal("");
      setOdo("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Mileage</h1>

      <section className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-slate-500">Rolling avg (last 5)</span>
          <span className="font-medium">
            {rolling ? `${rolling.toFixed(2)} km/L` : "Need 2+ fill-ups"}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Manual override (km/L)</span>
          <input
            type="number"
            step="0.01"
            value={override}
            onChange={(e) =>
              update({
                mileage_kml_override: e.target.value ? parseFloat(e.target.value) : null,
              })
            }
            placeholder="auto"
            className="w-24 border border-slate-300 rounded px-2 py-0.5 text-right"
          />
        </div>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <h2 className="font-semibold">Log fill-up</h2>
        <label className="block text-sm">
          <span className="text-slate-600">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Liters</span>
          <input
            type="number"
            step="0.01"
            value={liters}
            onChange={(e) => setLiters(e.target.value)}
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Total ₱</span>
          <input
            type="number"
            step="0.01"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Odometer (km)</span>
          <input
            type="number"
            step="0.1"
            value={odo}
            onChange={(e) => setOdo(e.target.value)}
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2"
          />
        </label>
        <button
          onClick={submit}
          disabled={busy}
          className="w-full bg-brand-600 text-white rounded-lg px-3 py-2 font-medium disabled:opacity-50"
        >
          {busy ? "Saving…" : "Add fill-up"}
        </button>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-4">
        <h2 className="font-semibold mb-2">History</h2>
        {loading && <p className="text-sm text-slate-500">Loading…</p>}
        {!loading && fillups.length === 0 && (
          <p className="text-sm text-slate-500">No fill-ups logged.</p>
        )}
        <ul className="divide-y divide-slate-100">
          {fillups.map((f) => (
            <li key={f.id} className="py-2 text-sm flex justify-between items-center">
              <div>
                <div>{dayjs(f.date).format("MMM D")}</div>
                <div className="text-xs text-slate-500">
                  {f.liters}L · {f.odometerKm.toFixed(1)} km
                </div>
              </div>
              <div className="flex items-center gap-3">
                <PHP value={f.totalPhp} />
                <button
                  onClick={() => remove(f.id)}
                  className="text-xs text-red-600 underline"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
