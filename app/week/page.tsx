"use client";
import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { useTrips } from "@/lib/store/trips";
import { useRoster } from "@/lib/store/roster";
import { useSettings } from "@/lib/store/settings";
import { usePayments } from "@/lib/store/payments";
import { calcDay, calcWeek } from "@/lib/calc";
import { weekStart, weekdays, isFriday } from "@/lib/week";
import { PHP } from "@/components/PHP";
import { getDriverKey } from "@/lib/auth/clientDriverKey";

export default function WeekPage() {
  const [weekRef, setWeekRef] = useState(weekStart());
  const { trips } = useTrips();
  const { passengers } = useRoster();
  const { settings } = useSettings();
  const { payments, markPaid } = usePayments();
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [exportConfigured, setExportConfigured] = useState<boolean | null>(null);
  const [isDriver, setIsDriver] = useState(false);

  useEffect(() => {
    setIsDriver(Boolean(getDriverKey()));
    let cancelled = false;
    fetch("/api/sheets/export")
      .then((r) => r.json())
      .then((j: { configured: boolean }) => {
        if (!cancelled) setExportConfigured(Boolean(j.configured));
      })
      .catch(() => {
        if (!cancelled) setExportConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  // Build per-passenger breakdown of this week's unpaid days from payments store.
  const weekPayments = useMemo(() => {
    const inWeek = (d: string | null) =>
      d != null && days.includes(d);
    return payments.filter((p) => inWeek(p.date));
  }, [payments, days]);

  const byPassenger = useMemo(() => {
    const m = new Map<
      string,
      { unpaid: number; paid: number; rows: typeof weekPayments }
    >();
    for (const p of weekPayments) {
      const cur = m.get(p.passengerId) ?? { unpaid: 0, paid: 0, rows: [] };
      cur.rows.push(p);
      if (p.paid) cur.paid += p.amountPhp;
      else cur.unpaid += p.amountPhp;
      m.set(p.passengerId, cur);
    }
    return m;
  }, [weekPayments]);

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

      {byPassenger.size > 0 && (
        <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <h2 className="font-semibold">Payment status</h2>
          {Array.from(byPassenger.entries()).map(([passengerId, info]) => {
            const name =
              passengers.find((p) => p.id === passengerId)?.name ?? passengerId;
            const sorted = [...info.rows].sort((a, b) =>
              (a.date ?? "").localeCompare(b.date ?? "")
            );
            return (
              <div key={passengerId} className="space-y-1">
                <div className="flex justify-between text-sm font-medium">
                  <span>{name}</span>
                  <span className="text-slate-700">
                    Unpaid: <PHP value={info.unpaid} />
                  </span>
                </div>
                <ul className="text-xs divide-y divide-slate-100">
                  {sorted.map((p) => (
                    <li
                      key={`${p.tripId}-${p.passengerId}`}
                      className="flex items-center justify-between py-1.5"
                    >
                      <span className="text-slate-600">
                        {p.date ? dayjs(p.date).format("ddd, MMM D") : "—"}
                      </span>
                      <span className="flex items-center gap-2">
                        <PHP value={p.amountPhp} />
                        {p.paid ? (
                          <span className="text-emerald-600 text-[11px]">
                            paid{p.paidAt ? ` ${dayjs(p.paidAt).format("MMM D")}` : ""}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">unpaid</span>
                        )}
                        {isDriver && (
                          <button
                            onClick={() => markPaid(p.tripId, p.passengerId, !p.paid)}
                            className={
                              "ml-1 px-2 py-0.5 rounded border text-[11px] " +
                              (p.paid
                                ? "border-slate-300 text-slate-600"
                                : "bg-brand-600 text-white border-brand-600")
                            }
                          >
                            {p.paid ? "Undo" : "Mark paid"}
                          </button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {!isDriver && (
            <p className="text-[11px] text-slate-500">
              Open the app with <code>?key=…</code> to mark payments.
            </p>
          )}
        </section>
      )}

      <button
        onClick={exportToSheets}
        disabled={exporting || exportConfigured === false}
        title={
          exportConfigured === false
            ? "Set GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, and GOOGLE_SHEET_ID to enable."
            : undefined
        }
        className={
          "w-full rounded-lg px-3 py-2 font-medium disabled:opacity-50 " +
          (isFriday() && exportConfigured !== false
            ? "bg-brand-600 text-white"
            : "bg-white border border-slate-300 text-slate-700")
        }
      >
        {exporting
          ? "Exporting…"
          : exportConfigured === false
          ? "Export to Google Sheets (not configured)"
          : "Export to Google Sheets (includes payment status)"}
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
