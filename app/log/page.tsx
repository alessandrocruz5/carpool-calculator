"use client";
import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import Link from "next/link";
import { useTrips, type StoredTrip } from "@/lib/store/trips";
import { useRoster } from "@/lib/store/roster";
import { useSettings } from "@/lib/store/settings";
import { usePayments } from "@/lib/store/payments";
import { calcDay, calcWeek } from "@/lib/calc";
import { weekStart, weekdays, isFriday } from "@/lib/week";
import { PHP } from "@/components/PHP";
import { useToast } from "@/components/Toast";
import { useIsDriver } from "@/lib/auth/useIsDriver";
import { EmptyState } from "@/components/ui/EmptyState";
import { CalendarDays, Inbox } from "lucide-react";

export default function LogPage() {
  const { trips, remove, upsert } = useTrips();
  const { passengers } = useRoster();
  const { settings, gasPrice } = useSettings();
  const { payments, markPaid } = usePayments();
  const toast = useToast();
  const isDriver = useIsDriver();

  const [view, setView] = useState<"week" | "all">("week");
  const [weekRef, setWeekRef] = useState(weekStart());
  const [open, setOpen] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [exportConfigured, setExportConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/sheets/export")
      .then(async (r) => {
        if (r.status === 503) return { configured: false } as { configured: boolean };
        return (await r.json()) as { configured: boolean };
      })
      .then((j) => {
        if (!cancelled) setExportConfigured(Boolean(j.configured));
      })
      .catch(() => {
        if (!cancelled) setExportConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const liveSettings = { ...settings, mileageKmPerL: settings.mileageKmPerL || 10.5 };
  const days = weekdays(weekRef);

  const totalUnpaid = useMemo(
    () => payments.filter((p) => !p.paid).reduce((s, p) => s + p.amountPhp, 0),
    [payments]
  );

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

  const weekPayments = useMemo(
    () => payments.filter((p) => p.date != null && days.includes(p.date)),
    [payments, days]
  );

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

  const sorted = [...trips].sort((a, b) => (a.date < b.date ? 1 : -1));
  const mostRecent = sorted[0];
  const weekHasTrips = days.some((d) => trips.some((t) => t.date === d));

  async function copyYesterday() {
    if (!mostRecent) return;
    const today = dayjs().format("YYYY-MM-DD");
    const newTrip: StoredTrip = {
      ...mostRecent,
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}`,
      date: today,
      gasPrice,
    };
    try {
      await upsert(newTrip);
      toast.show({
        message: `Copied ${dayjs(mostRecent.date).format("MMM D")} → today`,
        variant: "success",
      });
    } catch {
      toast.show({
        message: "Couldn't copy trip. Please try again.",
        variant: "error",
      });
    }
  }

  async function handleDelete(t: StoredTrip) {
    const snapshot = t;
    try {
      await remove(t.id);
    } catch {
      toast.show({
        message: "Couldn't delete trip. Please try again.",
        variant: "error",
      });
      return;
    }
    toast.show({
      message: `Deleted trip for ${dayjs(snapshot.date).format("MMM D")}`,
      variant: "success",
      action: {
        label: "Undo",
        onClick: () => {
          upsert(snapshot);
        },
      },
      durationMs: 5000,
    });
  }

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
      if (res.status === 503) {
        setExportConfigured(false);
        setExportMsg(null);
        return;
      }
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
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">Trip log</h1>
          {totalUnpaid > 0 && (
            <Link
              href="/payments"
              className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200"
              title="Outstanding payments"
            >
              Unpaid <PHP value={totalUnpaid} />
            </Link>
          )}
        </div>
        <div className="flex gap-1 text-sm">
          <button
            onClick={() => setView("week")}
            className={
              "px-3 py-1 border rounded " +
              (view === "week"
                ? "bg-brand-600 text-white border-brand-600"
                : "border-slate-300 text-slate-700 bg-white")
            }
          >
            This week
          </button>
          <button
            onClick={() => setView("all")}
            className={
              "px-3 py-1 border rounded " +
              (view === "all"
                ? "bg-brand-600 text-white border-brand-600"
                : "border-slate-300 text-slate-700 bg-white")
            }
          >
            All time
          </button>
        </div>
      </div>

      {view === "week" && (
        <>
          <div className="flex items-center justify-between text-sm">
            <p className="text-slate-500">
              {dayjs(days[0]).format("MMM D")} – {dayjs(days[4]).format("MMM D, YYYY")}
            </p>
            <div className="flex gap-1">
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

          {!weekHasTrips ? (
            <EmptyState
              icon={CalendarDays}
              headline="No trips this week"
              cta={isDriver ? { label: "Log a trip", href: "/" } : undefined}
            />
          ) : (
            <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
              <h2 className="font-semibold mb-1">Totals</h2>
              <TotalsRow label="Driver collects" value={summary.driverTotal} bold />
              {Object.entries(summary.perPassenger).map(([id, amt]) => (
                <TotalsRow
                  key={id}
                  label={passengers.find((p) => p.id === id)?.name ?? id}
                  value={amt}
                />
              ))}
            </section>
          )}

          {byPassenger.size > 0 && (
            <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <h2 className="font-semibold">Payment status</h2>
              {Array.from(byPassenger.entries()).map(([passengerId, info]) => {
                const name =
                  passengers.find((p) => p.id === passengerId)?.name ?? passengerId;
                const sortedRows = [...info.rows].sort((a, b) =>
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
                      {sortedRows.map((p) => (
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
                  Only drivers can mark payments. Ask a driver to grant you driver
                  access from the Members admin page.
                </p>
              )}
            </section>
          )}

          {isDriver && (
            <>
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
              {exportConfigured === false && (
                <p className="text-xs text-slate-400 text-center">Sheets export not configured</p>
              )}
              {exportMsg && <p className="text-xs text-slate-600 text-center">{exportMsg}</p>}
            </>
          )}
        </>
      )}

      {view === "all" && (
        <>
          {isDriver && mostRecent && (
            <div className="flex justify-end">
              <button
                onClick={copyYesterday}
                className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              >
                Copy yesterday&apos;s trip
              </button>
            </div>
          )}
          {sorted.length === 0 && (
            <EmptyState
              icon={Inbox}
              headline="No trips logged yet"
              cta={isDriver ? { label: "Log your first trip", href: "/" } : undefined}
            />
          )}
          <ul className="space-y-2">
            {sorted.map((t) => {
              const day = calcDay(
                {
                  date: t.date,
                  gasPricePhpPerL: t.gasPrice,
                  morning: t.morning,
                  evening: t.evening,
                },
                liveSettings
              );
              const isOpen = open === t.id;
              return (
                <li key={t.id} className="bg-white rounded-xl border border-slate-200">
                  <button
                    onClick={() => setOpen(isOpen ? null : t.id)}
                    className="w-full px-4 py-3 flex justify-between items-center text-left"
                  >
                    <div>
                      <div className="font-medium">{dayjs(t.date).format("ddd, MMM D")}</div>
                      <div className="text-xs text-slate-500">
                        AM {t.morning.passengerIds.length}p · PM {t.evening.passengerIds.length}p
                      </div>
                    </div>
                    <PHP value={day.driverTotal + Object.values(day.perPassenger).reduce((a, b) => a + b, 0)} />
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 space-y-2 text-sm">
                      <DetailRow label="Driver collects" value={day.driverTotal} />
                      {Object.entries(day.perPassenger).map(([id, amt]) => (
                        <DetailRow
                          key={id}
                          label={passengers.find((p) => p.id === id)?.name ?? id}
                          value={amt}
                        />
                      ))}
                      <div className="text-xs text-slate-500 pt-2">
                        AM: {t.morning.route} · PM: {t.evening.route} · Gas <PHP value={t.gasPrice} />/L
                      </div>
                      {isDriver && (
                        <button
                          onClick={() => handleDelete(t)}
                          className="text-xs text-red-600 underline"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium"><PHP value={value} /></span>
    </div>
  );
}

function TotalsRow({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={"flex justify-between text-sm " + (bold ? "font-medium" : "")}>
      <span className={bold ? "" : "text-slate-500"}>{label}</span>
      <PHP value={value} />
    </div>
  );
}
