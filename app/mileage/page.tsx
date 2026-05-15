"use client";
import { useState } from "react";
import dayjs from "dayjs";
import { useFillups } from "@/lib/store/fillups";
import { useSettings } from "@/lib/store/settings";
import { rollingMileage } from "@/lib/mileage";
import { PHP } from "@/components/PHP";

function Sparkline({
  values,
  className,
  width = 160,
  height = 32,
}: {
  values: number[];
  className?: string;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = width / (values.length - 1);
  const points = values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / span) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      role="img"
      aria-label="rolling mileage trend"
      data-testid="mileage-sparkline"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        className="text-brand-600"
        points={points}
      />
    </svg>
  );
}

export default function MileagePage() {
  const { fillups, add, remove } = useFillups();
  const { settings, setSettings } = useSettings();

  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [liters, setLiters] = useState("");
  const [total, setTotal] = useState("");
  const [odo, setOdo] = useState("");

  const rolling = rollingMileage(fillups);

  // Build a series of rolling MPG values to plot a small sparkline.
  // Each point is the rolling avg up to (and including) that fill-up.
  const sortedFillups = [...fillups].sort((a, b) => a.odometerKm - b.odometerKm);
  const series: number[] = [];
  for (let i = 1; i < sortedFillups.length; i++) {
    const slice = sortedFillups.slice(0, i + 1);
    const v = rollingMileage(slice);
    if (v != null) series.push(v);
  }

  const override = settings.mileageKmPerL;
  const divergencePct =
    rolling && override
      ? Math.abs(override - rolling) / rolling
      : null;
  const overrideOff = divergencePct != null && divergencePct > 0.15;

  function submit() {
    if (!liters || !total || !odo) return;
    add({
      date,
      liters: parseFloat(liters),
      totalPhp: parseFloat(total),
      odometerKm: parseFloat(odo),
    });
    setLiters("");
    setTotal("");
    setOdo("");
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
        {series.length >= 2 && (
          <Sparkline values={series} className="mt-1 mb-2" />
        )}
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Manual override</span>
          <input
            type="number"
            step="0.01"
            value={settings.mileageKmPerL}
            onChange={(e) =>
              setSettings({ mileageKmPerL: parseFloat(e.target.value) || 0 })
            }
            className="w-24 border border-slate-300 rounded px-2 py-0.5 text-right"
          />
        </div>
        {overrideOff && (
          <div
            role="alert"
            data-testid="mileage-override-warning"
            className="mt-2 flex items-start justify-between gap-3 rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm text-yellow-900"
          >
            <span>
              Manual override is {(divergencePct! * 100).toFixed(0)}% off the rolling
              average ({rolling!.toFixed(2)} km/L). Consider updating it.
            </span>
          </div>
        )}
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
          className="w-full bg-brand-600 text-white rounded-lg px-3 py-2 font-medium"
        >
          Add fill-up
        </button>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-4">
        <h2 className="font-semibold mb-2">History</h2>
        {fillups.length === 0 && (
          <p className="text-sm text-slate-500">No fill-ups logged.</p>
        )}
        <ul className="divide-y divide-slate-100">
          {[...fillups]
            .sort((a, b) => b.odometerKm - a.odometerKm)
            .map((f) => (
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
