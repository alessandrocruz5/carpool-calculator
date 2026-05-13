"use client";
import { useMemo, useState } from "react";
import dayjs from "dayjs";
import { useTrips } from "@/lib/store/trips";
import { useRoster } from "@/lib/store/roster";
import { useSettings } from "@/lib/store/settings";
import { calcDay, calcWeek } from "@/lib/calc";
import { weekStart, weekdays, isFriday } from "@/lib/week";
import { PHP } from "@/components/PHP";

export default function WeekPage() {
  const [weekRef, setWeekRef] = useState(weekStart());
  const { trips } = useTrips();
  const { passengers } = useRoster();
  const { settings } = useSettings();
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const days = weekdays(weekRef);
  const liveSettings = { ...settings, mileageKmPerL: settings.mileageKmPerL || 10.5 };

  const summary = useMemo(() => {
    const calcs = days
      .map((d) => trips.find((t) => t.date === d))
      .filter(Boolean)
      .map((t) =>
        calcDay(
          {
            date: t!.date,
            gasPricePhpPerL: t!.gasPrice,
            morning: t!.morning,
            evening: t!.evening,
          },
          liveSettings
        )
      );
    return calcWeek(calcs);
  }, [days, trips, liveSettings]);

  async function exportToSheets() {
    setExporting(true);
    setExportMsg(null);
    try {
      const res = await fetch("/api/sheets/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekStart: weekRef,
          trips: days
            .map((d) => trips.find((t) => t.date === d))
            .filter(Boolean),
          passengers,
          settings: liveSettings,
        }),
      });
      const json = await res.json();
      setExportMsg(res.ok ? `Exported ${json.rows} rows.` : `Error: ${json.error}`);
    } catch (e) {
      setExportMsg(`Error: ${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Week summary</h1>
        <div className="flex gap-1 text-sm">
          <button
            onClick={() =>
              setWeekRef(dayjs(weekRef).subtract(1, "week").format("YYYY-MM-DD"))
            }
            className="px-2 py-1 border border-slate-300 rounded"
          >
            ←
          </button>
          <button
            onClick={() => setWeekRef(weekStart())}
            className="px-2 py-1 border border-slate-300 rounded"
          >
            This week
          </button>
          <button
            onClick={() =>
              setWeekRef(dayjs(weekRef).add(1, "week").format("YYYY-MM-DD"))
            }
            className="px-2 py-1 border border-slate-300 rounded"
          >
            →
          </button>
        </div>
      </div>

      <p className="text-sm text-slate-500">
        {dayjs(days[0]).format("MMM D")} – {dayjs(days[4]).format("MMM D, YYYY")}
      </p>

      <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
        <h2 className="font-semibold mb-1">Totals</h2>
        <Row label="Driver collects" value={summary.driverTotal} bold />
        {Object.entries(summary.perPassenger).map(([id, amt]) => (
          <Row
            key={id}
            label={passengers.find((p) => p.id === id)?.name ?? id}
            value={amt}
          />
        ))}
        {Object.keys(summary.perPassenger).length === 0 && (
          <p className="text-sm text-slate-500">No trips logged this week yet.</p>
        )}
      </section>

      <button
        onClick={exportToSheets}
        disabled={exporting}
        className={
          "w-full rounded-lg px-3 py-2 font-medium " +
          (isFriday()
            ? "bg-brand-600 text-white"
            : "bg-white border border-slate-300 text-slate-700")
        }
      >
        {exporting ? "Exporting…" : "Export to Google Sheets"}
      </button>
      {exportMsg && <p className="text-xs text-slate-600 text-center">{exportMsg}</p>}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={"flex justify-between text-sm " + (bold ? "font-medium" : "")}>
      <span className={bold ? "" : "text-slate-500"}>{label}</span>
      <PHP value={value} />
    </div>
  );
}
